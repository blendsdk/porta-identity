/**
 * Two-factor authentication route handlers.
 *
 * Handles the 2FA challenge during OIDC login interactions:
 *   GET  /interaction/:uid/two-factor         → showTwoFactor (render verification page)
 *   POST /interaction/:uid/two-factor         → verifyTwoFactor (verify code + finish login)
 *   POST /interaction/:uid/two-factor/resend  → resendOtpCode (rate-limited OTP resend)
 *   GET  /interaction/:uid/two-factor/setup   → showTwoFactorSetup (TOTP enrollment)
 *   POST /interaction/:uid/two-factor/setup   → processTwoFactorSetup (confirm enrollment)
 *
 * Security features:
 *   - CSRF protection on all POST endpoints
 *   - Rate limiting on verification and resend
 *   - Recovery code fallback support
 *   - Audit logging for all 2FA events
 *
 * @module routes/two-factor
 */

import Router from '@koa/router';
import type { Context } from 'koa';
import type Provider from 'oidc-provider';
import {
  generateCsrfToken,
  verifyCsrfToken,
  setCsrfCookie,
  getCsrfFromCookie,
} from '../auth/csrf.js';
import { checkRateLimit, buildRateLimitKey, type RateLimitConfig } from '../auth/rate-limiter.js';
import { resolveLocale, getTranslationFunction } from '../auth/i18n.js';
import { renderPage } from '../auth/template-engine.js';
import type { TemplateContext } from '../auth/template-engine.js';
import { resolveEffectiveBranding } from '../auth/effective-branding.js';
import { sendOtpCodeEmail } from '../auth/email-service.js';
import { recordLogin } from '../users/service.js';
import { findUserById } from '../users/repository.js';
import {
  verifyOtp,
  verifyTotp,
  verifyRecoveryCode as verifyRecoveryCodeService,
  sendOtpCode,
  setupTotp,
  getPendingTotpSetupInfo,
  setupEmailOtp,
  confirmTotpSetup,
  resolveTwoFactorPlan,
  completeEmailFactorMigration,
} from '../two-factor/service.js';
import { UnsupportedTotpConfigurationError } from '../two-factor/errors.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { logger } from '../lib/logger.js';
import type { Organization } from '../organizations/types.js';
import { resolveOrganizationForInteraction } from './interactions.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extended Koa context with organization from tenant resolver. */
interface TwoFactorContext extends Context {
  state: {
    organization: Organization;
    [key: string]: unknown;
  };
}

/** Pending 2FA state stored in the OIDC interaction result. */
interface PendingTwoFactor {
  pendingAccountId: string;
  method: 'email' | 'totp';
  email: string;
  /** Trusted interaction purpose; legacy states without one are rejected. */
  purpose: 'challenge' | 'enrollment' | 'migration';
  /** Required target factor for policy migration. */
  requiredMethod?: 'email' | 'totp';
  /** Set only after the existing factor was successfully proven. */
  challengeVerified?: boolean;
  /** Keep the previous TOTP row until the new email factor is proven. */
  preserveTotp?: boolean;
}

/** Trusted setup authority derived from current policy and persisted enrollment. */
interface SetupAuthority {
  methods: readonly ('email' | 'totp')[];
  target: 'email' | 'totp' | null;
  allowReplaceExisting: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Rate limit config for 2FA verification attempts: 5 per 5 min */
const VERIFY_RATE_LIMIT: RateLimitConfig = { max: 5, windowSeconds: 300 };

/** Rate limit config for OTP resend: 3 per 5 min */
const RESEND_RATE_LIMIT: RateLimitConfig = { max: 3, windowSeconds: 300 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a base template context for 2FA pages.
 *
 * @param ctx - Koa context with organization state
 * @param locale - Resolved locale
 * @param csrfToken - CSRF token for form protection
 * @param orgSlug - Organization slug
 * @returns Base template context.
 */
async function buildBaseContext(
  ctx: TwoFactorContext,
  locale: string,
  csrfToken: string,
  orgSlug: string,
) {
  return {
    branding: await resolveEffectiveBranding(ctx.state.organization),
    locale,
    csrfToken,
    orgSlug,
  };
}

/**
 * Render a page template and send as response.
 *
 * @param ctx - Koa context
 * @param pageName - Template name
 * @param context - Template context
 * @param statusCode - HTTP status (default: 200)
 */
async function renderAndRespond(
  ctx: Context,
  pageName: string,
  context: TemplateContext,
  statusCode = 200,
): Promise<void> {
  ctx.state.brandingImageSources = context.branding.imageSources;
  const html = await renderPage(pageName, context);
  ctx.status = statusCode;
  ctx.type = 'text/html';
  ctx.body = html;
}

/**
 * Mask an email address for display (e.g., "u***r@test.com").
 * Shows first char, last char before @, and full domain.
 *
 * @param email - Full email address
 * @returns Masked email string
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Extract the pending 2FA state from an interaction result.
 * Returns null if no pending 2FA exists (interaction expired or invalid).
 *
 * @param interaction - OIDC interaction details
 * @returns Pending 2FA state, or null
 */
function getPendingTwoFactor(interaction: {
  result?: Record<string, unknown>;
}): PendingTwoFactor | null {
  const result = interaction.result;
  if (!result?.twoFactor) return null;
  const tf = result.twoFactor as PendingTwoFactor;
  if (!tf.pendingAccountId || !tf.method || !tf.email) return null;
  if (tf.purpose !== 'challenge' && tf.purpose !== 'enrollment' && tf.purpose !== 'migration') {
    // Legacy in-flight interactions have no trusted purpose. Restarting is safer than inferring
    // enrollment authority from an old URL or method.
    return null;
  }
  return tf;
}

/**
 * Derive setup authority from the current policy and persisted user state.
 *
 * Existing-factor migration is only reachable after the challenge was proven. An enrollment is
 * limited to the policy's required method, or to either method for `required_any`.
 *
 * @param org - Organization with the current policy.
 * @param user - Persisted user state.
 * @param pending - Trusted interaction state.
 * @returns Allowed setup methods, or null when setup is not authorized.
 */
async function resolveSetupAuthority(
  org: Organization,
  pending: PendingTwoFactor,
): Promise<{ authority: SetupAuthority; user: NonNullable<Awaited<ReturnType<typeof findUserById>>> } | null> {
  const user = await findUserById(pending.pendingAccountId);
  if (!user) return null;
  const plan = resolveTwoFactorPlan(org, user);

  if (plan.action === 'challenge') {
    if (plan.requiredMethod === null) return null;
    if (pending.purpose !== 'migration' || pending.challengeVerified !== true) return null;
    return {
      user,
      authority: {
        methods: [plan.requiredMethod],
        target: plan.requiredMethod,
        allowReplaceExisting: true,
      },
    };
  }

  if (plan.action === 'enroll') {
    if (pending.purpose !== 'enrollment') return null;
    const methods = plan.requiredMethod ? [plan.requiredMethod] : (['email', 'totp'] as const);
    return {
      user,
      authority: { methods, target: plan.requiredMethod, allowReplaceExisting: false },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the two-factor authentication router.
 *
 * Mounts 2FA verification, resend, and setup routes under /interaction/:uid/two-factor.
 * Requires a Provider instance to read/write interaction state.
 *
 * @param provider - node-oidc-provider instance
 * @returns Koa router with 2FA routes
 */
export function createTwoFactorRouter(provider: Provider): Router {
  const router = new Router({ prefix: '/interaction' });

  // GET /interaction/:uid/two-factor — Show 2FA verification page
  router.get('/:uid/two-factor', async (ctx) => {
    await showTwoFactor(ctx as TwoFactorContext, provider);
  });

  // POST /interaction/:uid/two-factor — Verify 2FA code
  router.post('/:uid/two-factor', async (ctx) => {
    await verifyTwoFactor(ctx as TwoFactorContext, provider);
  });

  // POST /interaction/:uid/two-factor/resend — Resend OTP code
  router.post('/:uid/two-factor/resend', async (ctx) => {
    await resendOtpCode(ctx as TwoFactorContext, provider);
  });

  // GET /interaction/:uid/two-factor/setup — Show 2FA setup page
  router.get('/:uid/two-factor/setup', async (ctx) => {
    await showTwoFactorSetup(ctx as TwoFactorContext, provider);
  });

  // POST /interaction/:uid/two-factor/setup — Process 2FA setup
  router.post('/:uid/two-factor/setup', async (ctx) => {
    await processTwoFactorSetup(ctx as TwoFactorContext, provider);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/** Return whether current persisted enrollment still satisfies the pending challenge. */
async function currentChallengeIsValid(
  org: Organization,
  pending: PendingTwoFactor,
): Promise<boolean> {
  const current = await findUserById(pending.pendingAccountId);
  if (!current || current.status !== 'active') return false;
  const plan = resolveTwoFactorPlan(org, current);
  if (plan.action !== 'challenge' || plan.challengeMethod !== pending.method) return false;
  if (pending.requiredMethod && pending.requiredMethod !== pending.method) {
    return plan.requiredMethod === pending.requiredMethod;
  }
  return plan.requiredMethod === null || plan.requiredMethod === pending.method;
}

/**
 * Show the 2FA verification page.
 *
 * Reads the pending 2FA state from the interaction session.
 * Renders the two-factor-verify page with method info and masked email.
 *
 * @param ctx - Koa context
 * @param provider - OIDC provider instance
 */
async function showTwoFactor(ctx: TwoFactorContext, provider: Provider): Promise<void> {
  try {
    const interaction = await provider.interactionDetails(ctx.req, ctx.res);

    // Resolve organization from the interaction's client_id.
    // 2FA routes don't go through the tenant resolver middleware,
    // so we resolve the org from the client → organization chain.
    await resolveOrganizationForInteraction(
      ctx,
      interaction.params.client_id as string,
      interaction.uid,
    );

    const pending = getPendingTwoFactor(interaction);

    if (!pending) {
      // No pending 2FA — redirect back to login
      ctx.redirect(`/interaction/${interaction.uid}`);
      return;
    }
    if (pending.purpose !== 'challenge') {
      // Enrollment and verified migration are completed on the setup page.
      ctx.redirect(`/interaction/${interaction.uid}/two-factor/setup`);
      return;
    }

    const org = ctx.state.organization;
    const locale = await resolveLocale(
      undefined,
      ctx.get('Accept-Language') || undefined,
      org.defaultLocale,
    );
    const t = getTranslationFunction(locale, org.slug);
    const csrfToken = generateCsrfToken();
    setCsrfCookie(ctx, csrfToken);

    const context: TemplateContext = {
      ...(await buildBaseContext(ctx, locale, csrfToken, org.slug)),
      t,
      interaction: {
        uid: interaction.uid,
        prompt: 'two-factor',
        params: {} as Record<string, unknown>,
        client: { clientName: '' },
      },
      method: pending.method,
      maskedEmail: maskEmail(pending.email),
      showResend: pending.method === 'email',
      showRecoveryLink: true,
    };

    await renderAndRespond(ctx, 'two-factor-verify', context);
  } catch {
    logger.error({ event: 'two-factor-page-failed' }, 'Two-factor page rendering failed');
    ctx.status = 400;
    ctx.body = 'Interaction expired';
  }
}

/**
 * Verify a 2FA code submission.
 *
 * Supports OTP (email), TOTP (authenticator), and recovery codes.
 * On success: records login and finishes the OIDC interaction.
 * On failure: re-renders the verification page with an error.
 *
 * @param ctx - Koa context
 * @param provider - OIDC provider instance
 */
async function verifyTwoFactor(ctx: TwoFactorContext, provider: Provider): Promise<void> {
  const body = ctx.request.body as Record<string, string>;
  const code = (body.code ?? '').trim();
  const submittedCodeType = body.codeType;
  const codeType =
    submittedCodeType === 'totp' || submittedCodeType === 'recovery' || submittedCodeType === 'otp'
      ? submittedCodeType
      : 'otp';
  const submittedCsrf = body._csrf ?? '';
  const storedCsrf = getCsrfFromCookie(ctx) ?? '';

  try {
    const interaction = await provider.interactionDetails(ctx.req, ctx.res);

    // Resolve organization from the interaction's client_id.
    // 2FA routes don't go through the tenant resolver middleware.
    await resolveOrganizationForInteraction(
      ctx,
      interaction.params.client_id as string,
      interaction.uid,
    );
    const org = ctx.state.organization;

    const pending = getPendingTwoFactor(interaction);

    if (!pending) {
      ctx.redirect(`/interaction/${interaction.uid}`);
      return;
    }
    if (pending.purpose !== 'challenge') {
      // A first enrollment or a verified migration is completed on the setup page. A challenge
      // submission must never finish login for either purpose.
      ctx.redirect(`/interaction/${interaction.uid}/two-factor/setup`);
      return;
    }

    const locale = await resolveLocale(
      undefined,
      ctx.get('Accept-Language') || undefined,
      org.defaultLocale,
    );
    const t = getTranslationFunction(locale, org.slug);

    // Verify CSRF token (cookie vs form field)
    if (!verifyCsrfToken(storedCsrf, submittedCsrf)) {
      logger.warn({ event: 'two-factor-csrf-rejected' }, 'Two-factor CSRF validation failed');
      await renderTwoFactorWithError(
        ctx,
        interaction.uid,
        pending,
        locale,
        t,
        t('errors.csrf_invalid'),
      );
      return;
    }

    // Rate limit check — prevent brute force
    const rateLimitKey = buildRateLimitKey('2fa_verify', org.id, pending.pendingAccountId);
    const rateLimitResult = await checkRateLimit(rateLimitKey, VERIFY_RATE_LIMIT);

    if (!rateLimitResult.allowed) {
      ctx.set('Retry-After', String(rateLimitResult.retryAfter));
      writeAuditLog({
        organizationId: org.id,
        userId: pending.pendingAccountId,
        eventType: 'rate_limit.2fa_verify',
        eventCategory: 'security',
        description: '2FA verification rate limit exceeded',
        ipAddress: ctx.ip,
      });
      await renderTwoFactorWithError(
        ctx,
        interaction.uid,
        pending,
        locale,
        t,
        t('errors.rate_limit_exceeded'),
        429,
      );
      return;
    }

    // Validate code is not empty
    if (!code) {
      await renderTwoFactorWithError(
        ctx,
        interaction.uid,
        pending,
        locale,
        t,
        t('two-factor.error_code_required'),
      );
      return;
    }

    // Attempt verification based on code type
    let verified = false;
    try {
      if (codeType === 'recovery') {
        verified = await verifyRecoveryCodeService(pending.pendingAccountId, code);
      } else if (pending.method === 'totp') {
        verified = await verifyTotp(pending.pendingAccountId, code);
      } else {
        // Email OTP
        verified = await verifyOtp(pending.pendingAccountId, code);
      }
    } catch (error) {
      if (error instanceof UnsupportedTotpConfigurationError) {
        logUnsupportedTotpConfiguration();
        await renderTwoFactorWithError(
          ctx,
          interaction.uid,
          pending,
          locale,
          t,
          t('errors.two_factor_unavailable'),
          503,
        );
        return;
      }

      // Verification service threw an error (invalid code, expired, exhausted, etc.)
      logger.debug({ event: 'two-factor-code-rejected', codeType }, 'Two-factor code rejected');
      verified = false;
    }

    if (!verified) {
      writeAuditLog({
        organizationId: org.id,
        userId: pending.pendingAccountId,
        eventType: '2fa.verify.failed',
        eventCategory: 'security',
        description: `2FA verification failed (${codeType})`,
        ipAddress: ctx.ip,
      });
      await renderTwoFactorWithError(
        ctx,
        interaction.uid,
        pending,
        locale,
        t,
        t('two-factor.error_invalid_code'),
      );
      return;
    }

    // An enrolled factor that no longer satisfies policy was proven above. Do not finish login:
    // the required method must be enrolled and proven first. Revalidate current persisted state
    // so an administrative reset or policy change during the challenge cannot be bypassed.
    const stillValid = await currentChallengeIsValid(org, pending);
    if (!stillValid) {
      writeAuditLog({
        organizationId: org.id,
        userId: pending.pendingAccountId,
        eventType: '2fa.verify.stale',
        eventCategory: 'security',
        description: 'Two-factor challenge no longer matches current enrollment or policy',
        ipAddress: ctx.ip,
      });
      ctx.status = 400;
      ctx.body = 'Interaction expired';
      return;
    }

    if (pending.requiredMethod && pending.method !== pending.requiredMethod) {
      await provider.interactionResult(
        ctx.req,
        ctx.res,
        {
          twoFactor: {
            ...pending,
            purpose: 'migration',
            method: pending.requiredMethod,
            challengeVerified: true,
          },
        },
        { mergeWithLastSubmission: true },
      );
      writeAuditLog({
        organizationId: org.id,
        userId: pending.pendingAccountId,
        eventType: '2fa.challenge.migration_required',
        eventCategory: 'security',
        description: 'Existing factor verified; required method enrollment pending',
        ipAddress: ctx.ip,
      });
      ctx.redirect(`/interaction/${interaction.uid}/two-factor/setup`);
      return;
    }

    // 2FA verified successfully — finish any deferred factor cleanup, then complete login.
    if (pending.preserveTotp) {
      try {
        await completeEmailFactorMigration(pending.pendingAccountId);
      } catch {
        // The old TOTP row does not authorize login while the email method is active.
        logger.warn(
          { event: 'email-factor-migration-cleanup-failed' },
          'Deferred TOTP cleanup failed',
        );
      }
    }
    await recordLogin(pending.pendingAccountId);

    writeAuditLog({
      organizationId: org.id,
      userId: pending.pendingAccountId,
      eventType: '2fa.verify.success',
      eventCategory: 'authentication',
      description: `2FA verification successful (${codeType})`,
      ipAddress: ctx.ip,
    });

    // Finish the OIDC interaction with the verified user
    await provider.interactionFinished(
      ctx.req,
      ctx.res,
      {
        login: { accountId: pending.pendingAccountId },
      },
      { mergeWithLastSubmission: false },
    );
  } catch {
    logger.error({ event: 'two-factor-verification-failed' }, 'Two-factor verification failed');
    ctx.status = 400;
    ctx.body = 'Interaction expired';
  }
}

/**
 * Resend an OTP code via email (rate-limited).
 *
 * Only available for the 'email' 2FA method. Generates a new code
 * and sends it, then redirects back to the verification page.
 *
 * @param ctx - Koa context
 * @param provider - OIDC provider instance
 */
async function resendOtpCode(ctx: TwoFactorContext, provider: Provider): Promise<void> {
  try {
    const interaction = await provider.interactionDetails(ctx.req, ctx.res);

    // Resolve organization from the interaction's client_id.
    // 2FA routes don't go through the tenant resolver middleware.
    await resolveOrganizationForInteraction(
      ctx,
      interaction.params.client_id as string,
      interaction.uid,
    );
    const org = ctx.state.organization;

    const pending = getPendingTwoFactor(interaction);

    if (!pending || pending.purpose !== 'challenge' || pending.method !== 'email') {
      ctx.redirect(`/interaction/${interaction.uid}/two-factor`);
      return;
    }

    // Rate limit check for resend
    const rateLimitKey = buildRateLimitKey('2fa_resend', org.id, pending.pendingAccountId);
    const rateLimitResult = await checkRateLimit(rateLimitKey, RESEND_RATE_LIMIT);

    if (!rateLimitResult.allowed) {
      ctx.set('Retry-After', String(rateLimitResult.retryAfter));
      // Redirect back — the page will show the rate limit naturally
      ctx.redirect(`/interaction/${interaction.uid}/two-factor`);
      return;
    }

    const locale = await resolveLocale(
      undefined,
      ctx.get('Accept-Language') || undefined,
      org.defaultLocale,
    );

    // Generate and send new OTP code
    try {
      const otpCode = await sendOtpCode(pending.pendingAccountId, pending.email, org.id);
      const user = await findUserById(pending.pendingAccountId);
      sendOtpCodeEmail(
        {
          id: pending.pendingAccountId,
          email: pending.email,
          givenName: user?.givenName,
          familyName: user?.familyName,
        },
        org,
        otpCode,
        10,
        locale,
      );
    } catch {
      logger.warn({ event: 'two-factor-otp-resend-failed' }, 'OTP resend failed');
    }

    writeAuditLog({
      organizationId: org.id,
      userId: pending.pendingAccountId,
      eventType: '2fa.otp.resent',
      eventCategory: 'authentication',
      description: 'OTP code resent',
      ipAddress: ctx.ip,
    });

    ctx.redirect(`/interaction/${interaction.uid}/two-factor`);
  } catch {
    logger.error({ event: 'two-factor-resend-failed' }, 'Two-factor resend failed');
    ctx.status = 400;
    ctx.body = 'Interaction expired';
  }
}

/**
 * Show the 2FA setup page (for users who need to enroll).
 *
 * When an org requires 2FA but the user hasn't enrolled, this page
 * shows the TOTP QR code or email OTP setup option.
 *
 * @param ctx - Koa context
 * @param provider - OIDC provider instance
 */
async function showTwoFactorSetup(ctx: TwoFactorContext, provider: Provider): Promise<void> {
  try {
    const interaction = await provider.interactionDetails(ctx.req, ctx.res);

    // Resolve organization from the interaction's client_id.
    // 2FA routes don't go through the tenant resolver middleware.
    await resolveOrganizationForInteraction(
      ctx,
      interaction.params.client_id as string,
      interaction.uid,
    );

    const pending = getPendingTwoFactor(interaction);

    if (!pending) {
      ctx.redirect(`/interaction/${interaction.uid}`);
      return;
    }

    const org = ctx.state.organization;
    const locale = await resolveLocale(
      undefined,
      ctx.get('Accept-Language') || undefined,
      org.defaultLocale,
    );
    const t = getTranslationFunction(locale, org.slug);
    const csrfToken = generateCsrfToken();
    setCsrfCookie(ctx, csrfToken);

    const resolved = await resolveSetupAuthority(org, pending);
    if (!resolved) {
      // Challenge first, or restart an interaction whose policy no longer needs setup.
      ctx.redirect(`/interaction/${interaction.uid}/two-factor`);
      return;
    }
    const { authority: setup, user } = resolved;
    const allowTotp = setup.methods.includes('totp');
    const allowEmail = setup.methods.includes('email');

    let qrCodeDataUri: string | undefined;
    let totpSecret: string | undefined;
    let recoveryCodes: string[] | undefined;

    if (allowTotp) {
      const existingSetup = await getPendingTotpSetupInfo(
        user.id,
        pending.email,
        org.slug,
        { allowReplaceExisting: setup.allowReplaceExisting },
      );

      if (existingSetup) {
        // Reuse existing pending setup — don't regenerate the secret
        qrCodeDataUri = existingSetup.qrCodeDataUri;
        totpSecret = existingSetup.totpUri?.split('secret=')[1]?.split('&')[0] ?? '';
      } else {
        // No pending setup — generate a fresh one
        const setupResult = await setupTotp(user.id, pending.email, org.slug, {
          allowReplaceExisting: setup.allowReplaceExisting,
        });
        qrCodeDataUri = setupResult.qrCodeDataUri!;
        totpSecret = setupResult.totpUri?.split('secret=')[1]?.split('&')[0] ?? '';
        recoveryCodes = setupResult.recoveryCodes;
      }
    }

    // Check for error indicator from failed verification redirect
    const errorParam = (ctx.query.error as string) ?? '';

    const context: TemplateContext = {
      ...(await buildBaseContext(ctx, locale, csrfToken, org.slug)),
      t,
      interaction: {
        uid: interaction.uid,
        prompt: 'two-factor-setup',
        params: {} as Record<string, unknown>,
        client: { clientName: '' },
      },
      method: setup.target ?? 'totp',
      allowTotp,
      allowEmail,
      qrCodeDataUri,
      totpSecret,
      recoveryCodes,
      flash:
        errorParam === 'invalid_code' ? { error: t('two-factor.error_invalid_code') } : undefined,
    };

    await renderAndRespond(ctx, 'two-factor-setup', context);
  } catch {
    logger.error({ event: 'two-factor-setup-page-failed' }, 'Two-factor setup page failed');
    ctx.status = 400;
    ctx.body = 'Interaction expired';
  }
}

/**
 * Process 2FA setup confirmation.
 *
 * Verifies the user's first TOTP code to confirm enrollment.
 * On success: enables 2FA and completes the login.
 * On failure: re-renders the setup page with an error.
 *
 * @param ctx - Koa context
 * @param provider - OIDC provider instance
 */
async function processTwoFactorSetup(ctx: TwoFactorContext, provider: Provider): Promise<void> {
  const body = ctx.request.body as Record<string, string>;
  const code = (body.code ?? '').trim();
  const submittedCsrf = body._csrf ?? '';
  const storedCsrf = getCsrfFromCookie(ctx) ?? '';

  try {
    const interaction = await provider.interactionDetails(ctx.req, ctx.res);

    // Resolve organization from the interaction's client_id.
    // 2FA routes don't go through the tenant resolver middleware.
    await resolveOrganizationForInteraction(
      ctx,
      interaction.params.client_id as string,
      interaction.uid,
    );
    const org = ctx.state.organization;

    const pending = getPendingTwoFactor(interaction);

    if (!pending) {
      ctx.redirect(`/interaction/${interaction.uid}`);
      return;
    }

    const locale = await resolveLocale(
      undefined,
      ctx.get('Accept-Language') || undefined,
      org.defaultLocale,
    );

    // Verify CSRF token
    if (!verifyCsrfToken(storedCsrf, submittedCsrf)) {
      logger.warn({ event: 'two-factor-setup-csrf-rejected' }, 'Two-factor setup CSRF failed');
      // Redirect back to setup to try again
      ctx.redirect(`/interaction/${interaction.uid}/two-factor/setup`);
      return;
    }

    const resolved = await resolveSetupAuthority(org, pending);
    if (!resolved) {
      ctx.redirect(`/interaction/${interaction.uid}/two-factor`);
      return;
    }
    const { authority: setup, user } = resolved;
    const requestedMethod = body.setupMethod;
    const setupMethod =
      requestedMethod === 'email' || requestedMethod === 'totp'
        ? requestedMethod
        : (setup.target ?? 'totp');
    if (!setup.methods.includes(setupMethod)) {
      ctx.status = 400;
      ctx.body = 'Two-factor setup method is not allowed';
      return;
    }

    if (setupMethod === 'email') {
      // Email OTP setup — enable it, then prove the mailbox. A migration keeps the previous
      // verified TOTP row until the mailbox is proven, so a delivery failure cannot lock the
      // user out of their existing factor.
      const preserveTotp = setup.allowReplaceExisting;
      await setupEmailOtp(user.id, org.id, {
        allowReplaceExisting: setup.allowReplaceExisting,
        preserveExistingTotp: preserveTotp,
      });

      writeAuditLog({
        organizationId: org.id,
        userId: user.id,
        eventType: '2fa.setup.email.complete',
        eventCategory: 'authentication',
        description: '2FA email OTP setup completed during login',
        ipAddress: ctx.ip,
      });

      // Now send the first OTP and redirect to verification
      try {
        const otpCode = await sendOtpCode(user.id, pending.email, org.id);
        sendOtpCodeEmail(
          {
            id: user.id,
            email: pending.email,
            givenName: user.givenName,
            familyName: user.familyName,
          },
          org,
          otpCode,
          10,
          locale,
        );
      } catch {
        logger.warn({ event: 'two-factor-setup-otp-failed' }, 'Setup OTP delivery failed');
      }

      // The mailbox factor is now the challenge; login completes only after OTP verification.
      await provider.interactionResult(
        ctx.req,
        ctx.res,
        {
          twoFactor: {
            ...pending,
            purpose: 'challenge',
            method: 'email',
            requiredMethod: 'email',
            challengeVerified: true,
            ...(preserveTotp ? { preserveTotp: true } : {}),
          },
        },
        { mergeWithLastSubmission: true },
      );

      ctx.redirect(`/interaction/${interaction.uid}/two-factor`);
      return;
    }

    // TOTP confirmation uses the same attempt budget as normal 2FA verification.
    // Email setup returns above because it does not verify a user-entered code.
    const rateLimitKey = buildRateLimitKey('2fa_verify', org.id, pending.pendingAccountId);
    const rateLimitResult = await checkRateLimit(rateLimitKey, VERIFY_RATE_LIMIT);

    if (!rateLimitResult.allowed) {
      ctx.set('Retry-After', String(rateLimitResult.retryAfter));
      writeAuditLog({
        organizationId: org.id,
        userId: pending.pendingAccountId,
        eventType: 'rate_limit.2fa_verify',
        eventCategory: 'security',
        description: 'TOTP setup verification rate limit exceeded',
        ipAddress: ctx.ip,
      });
      const t = getTranslationFunction(locale, org.slug);
      await renderTotpSetupWithError(
        ctx,
        interaction.uid,
        pending,
        locale,
        t,
        t('errors.rate_limit_exceeded'),
        429,
      );
      return;
    }

    // TOTP setup confirmation — verify the code from authenticator app
    if (!code) {
      ctx.redirect(`/interaction/${interaction.uid}/two-factor/setup`);
      return;
    }

    let confirmed: boolean;
    try {
      confirmed = await confirmTotpSetup(user.id, code, {
        allowReplaceExisting: setup.allowReplaceExisting,
      });
    } catch (error) {
      if (error instanceof UnsupportedTotpConfigurationError) {
        logUnsupportedTotpConfiguration();
        const t = getTranslationFunction(locale, org.slug);
        await renderTotpSetupWithError(
          ctx,
          interaction.uid,
          pending,
          locale,
          t,
          t('errors.two_factor_unavailable'),
          503,
        );
        return;
      }
      throw error;
    }

    if (!confirmed) {
      writeAuditLog({
        organizationId: org.id,
        userId: pending.pendingAccountId,
        eventType: '2fa.setup.totp.failed',
        eventCategory: 'security',
        description: 'TOTP setup confirmation failed — invalid code',
        ipAddress: ctx.ip,
      });
      // Redirect back to setup with error indicator
      ctx.redirect(`/interaction/${interaction.uid}/two-factor/setup?error=invalid_code`);
      return;
    }

    // Revalidate current persisted enrollment and policy before completing login. A concurrent
    // administrative reset or policy change must not be satisfied by the stale interaction.
    const currentUser = await findUserById(user.id);
    const currentPlan = currentUser ? resolveTwoFactorPlan(org, currentUser) : null;
    if (
      !currentPlan ||
      !currentUser ||
      currentPlan.action !== 'challenge' ||
      currentPlan.requiredMethod !== null ||
      currentPlan.challengeMethod !== currentUser.twoFactorMethod
    ) {
      writeAuditLog({
        organizationId: org.id,
        userId: user.id,
        eventType: '2fa.setup.stale',
        eventCategory: 'security',
        description: 'Two-factor setup no longer matches current enrollment or policy',
        ipAddress: ctx.ip,
      });
      ctx.status = 400;
      ctx.body = 'Interaction expired';
      return;
    }

    // TOTP setup confirmed — complete login
    await recordLogin(pending.pendingAccountId);

    writeAuditLog({
      organizationId: org.id,
      userId: pending.pendingAccountId,
      eventType: '2fa.setup.totp.complete',
      eventCategory: 'authentication',
      description: '2FA TOTP setup and login completed',
      ipAddress: ctx.ip,
    });

    await provider.interactionFinished(
      ctx.req,
      ctx.res,
      {
        login: { accountId: pending.pendingAccountId },
      },
      { mergeWithLastSubmission: false },
    );
  } catch {
    logger.error({ event: 'two-factor-setup-failed' }, 'Two-factor setup failed');
    ctx.status = 400;
    ctx.body = 'Interaction expired';
  }
}

/** Record the fixed diagnostic for unsupported persisted TOTP parameters. */
function logUnsupportedTotpConfiguration(): void {
  logger.error({ event: 'totp-configuration-unsupported' }, 'TOTP configuration is unsupported');
}

/**
 * Render pending TOTP enrollment data with an error without creating new secrets.
 *
 * @param ctx - Koa context
 * @param uid - Interaction UID
 * @param pending - Pending two-factor state
 * @param locale - Resolved locale
 * @param t - Translation function
 * @param errorMessage - Error to display
 * @param statusCode - HTTP response status
 * @throws Error when the pending enrollment record no longer exists
 */
async function renderTotpSetupWithError(
  ctx: TwoFactorContext,
  uid: string,
  pending: PendingTwoFactor,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string,
  errorMessage: string,
  statusCode: number,
): Promise<void> {
  const setup = await getPendingTotpSetupInfo(
    pending.pendingAccountId,
    pending.email,
    ctx.state.organization.slug,
    { allowReplaceExisting: pending.purpose === 'migration' },
  );
  if (!setup) {
    throw new Error('Pending TOTP setup is unavailable');
  }

  const csrfToken = generateCsrfToken();
  setCsrfCookie(ctx, csrfToken);
  const context: TemplateContext = {
    ...(await buildBaseContext(ctx, locale, csrfToken, ctx.state.organization.slug)),
    t,
    interaction: {
      uid,
      prompt: 'two-factor-setup',
      params: {} as Record<string, unknown>,
      client: { clientName: '' },
    },
    method: 'totp',
    allowTotp: true,
    allowEmail: false,
    qrCodeDataUri: setup.qrCodeDataUri,
    totpSecret: setup.totpSecret,
    flash: { error: errorMessage },
  };

  await renderAndRespond(ctx, 'two-factor-setup', context, statusCode);
}

// ---------------------------------------------------------------------------
// Helper: render 2FA verify page with error
// ---------------------------------------------------------------------------

/**
 * Render the 2FA verification page with an error flash message.
 *
 * @param ctx - Koa context
 * @param uid - Interaction UID
 * @param pending - Pending 2FA state
 * @param locale - Resolved locale
 * @param t - Translation function
 * @param errorMessage - Error to display
 * @param statusCode - HTTP status (default: 200)
 */
async function renderTwoFactorWithError(
  ctx: TwoFactorContext,
  uid: string,
  pending: PendingTwoFactor,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string,
  errorMessage: string,
  statusCode = 200,
): Promise<void> {
  const csrfToken = generateCsrfToken();
  setCsrfCookie(ctx, csrfToken);

  const context: TemplateContext = {
    ...(await buildBaseContext(ctx, locale, csrfToken, ctx.state.organization.slug)),
    t,
    interaction: {
      uid,
      prompt: 'two-factor',
      params: {} as Record<string, unknown>,
      client: { clientName: '' },
    },
    method: pending.method,
    maskedEmail: maskEmail(pending.email),
    showResend: pending.method === 'email',
    showRecoveryLink: true,
    flash: { error: errorMessage },
  };

  await renderAndRespond(ctx, 'two-factor-verify', context, statusCode);
}
