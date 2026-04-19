/**
 * Interaction route handlers for the OIDC login, consent, and logout flows.
 *
 * These routes handle the `/interaction/:uid` path where the UID is a
 * node-oidc-provider interaction identifier. The provider redirects users
 * here during the OIDC authorization flow for login and consent prompts.
 *
 * Route structure:
 *   GET  /interaction/:uid              → showLogin or showConsent (based on prompt)
 *   POST /interaction/:uid/login        → processLogin (password auth)
 *   POST /interaction/:uid/magic-link   → sendMagicLink (passwordless auth)
 *   GET  /interaction/:uid/consent      → showConsent
 *   POST /interaction/:uid/confirm      → processConsent (approve/deny)
 *   GET  /interaction/:uid/abort        → abortInteraction
 *
 * Security features:
 *   - CSRF protection on all POST endpoints
 *   - Rate limiting on login and magic link endpoints
 *   - User enumeration prevention (generic error messages)
 *   - Audit logging for all auth events
 */

import Router from '@koa/router';
import type { Context } from 'koa';
import type Provider from 'oidc-provider';
import { generateCsrfToken, verifyCsrfToken, setCsrfCookie, getCsrfFromCookie } from '../auth/csrf.js';
import {
  checkRateLimit,
  resetRateLimit,
  buildLoginRateLimitKey,
  buildMagicLinkRateLimitKey,
  loadLoginRateLimitConfig,
  loadMagicLinkRateLimitConfig,
} from '../auth/rate-limiter.js';
import { generateToken } from '../auth/tokens.js';
import { insertToken, invalidateUserTokens } from '../auth/token-repository.js';
import { sendMagicLinkEmail, sendOtpCodeEmail } from '../auth/email-service.js';
import { resolveLocale, getTranslationFunction } from '../auth/i18n.js';
import { renderPage } from '../auth/template-engine.js';
import type { TemplateContext } from '../auth/template-engine.js';
import { getUserByEmail, verifyUserPassword, recordLogin } from '../users/service.js';
import {
  requiresTwoFactor,
  determineTwoFactorMethod,
  sendOtpCode,
} from '../two-factor/service.js';
import { getSystemConfigNumber } from '../lib/system-config.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { logger } from '../lib/logger.js';
import { config } from '../config/index.js';
import { getClientByClientId } from '../clients/service.js';
import { getOrganizationById } from '../organizations/service.js';
import type { Organization } from '../organizations/types.js';
import {
  hasMagicLinkSession,
  consumeMagicLinkSession,
} from '../auth/magic-link-session.js';
import { resolveLoginMethods } from '../clients/resolve-login-methods.js';
import type { LoginMethod } from '../clients/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Extended Koa context with organization from tenant resolver.
 * The tenant resolver middleware sets ctx.state.organization.
 */
interface InteractionContext extends Context {
  state: {
    organization: Organization;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a branding context object from organization data.
 * Used to populate template context with org-specific branding.
 *
 * @param org - Organization with branding fields
 * @returns Branding context for templates
 */
/**
 * Resolve the effective login methods for an OIDC provider Client.
 *
 * Reads the raw `urn:porta:login_methods` metadata (set by {@link findForOidc}
 * on the clients service) and applies the inheritance rule via
 * {@link resolveLoginMethods}:
 *   - `null` / missing / malformed  → inherit `org.defaultLoginMethods`
 *   - explicit non-empty array       → use it verbatim
 *
 * Malformed metadata (e.g., from a misconfigured adapter) is treated as
 * `null` to match the safe-fallback semantics of the raw resolver — the
 * organization default governs in that case rather than failing closed,
 * which would break all logins if a single client's metadata were corrupt.
 *
 * @param client - OIDC provider Client instance (or null/undefined — safe fallback)
 * @param org - Organization owning the client (read for `defaultLoginMethods`)
 * @returns Resolved `LoginMethod[]` (always non-empty, matches resolver contract)
 */
function resolveLoginMethodsFromOidcClient(
  client: unknown,
  org: Pick<Organization, 'defaultLoginMethods'>,
): LoginMethod[] {
  // oidc-provider's Client objects expose metadata() → Record<string, unknown>.
  // Missing client or missing metadata function → treat as fully inherited.
  const metadata = (client as { metadata?: () => Record<string, unknown> } | null | undefined)
    ?.metadata?.();
  const raw = metadata?.['urn:porta:login_methods'];
  // Defensive: accept only null or string[]; treat anything else as null.
  const normalized: LoginMethod[] | null = Array.isArray(raw)
    ? (raw as LoginMethod[])
    : null;
  return resolveLoginMethods(org, { loginMethods: normalized });
}

function buildBrandingFromOrg(org: Organization) {
  return {
    logoUrl: org.brandingLogoUrl,
    faviconUrl: org.brandingFaviconUrl,
    primaryColor: org.brandingPrimaryColor ?? '#3B82F6',
    companyName: org.brandingCompanyName ?? org.name,
    customCss: org.brandingCustomCss,
  };
}

/**
 * Build a base template context from an interaction context.
 * Shared across all interaction route handlers to provide consistent
 * branding, locale, and CSRF state.
 *
 * @param ctx - Koa context with organization state
 * @param locale - Resolved locale string
 * @param csrfToken - CSRF token for form protection
 * @param orgSlug - Organization slug for template resolution
 * @returns Base template context (without the `t` translation function)
 */
function buildBaseContext(
  ctx: InteractionContext,
  locale: string,
  csrfToken: string,
  orgSlug: string,
) {
  return {
    branding: buildBrandingFromOrg(ctx.state.organization),
    locale,
    csrfToken,
    orgSlug,
  };
}

/**
 * Render an HTML page and send it as the response.
 * Sets Content-Type to text/html and assigns the rendered body to ctx.body.
 *
 * @param ctx - Koa context
 * @param pageName - Page template name
 * @param context - Full template context
 * @param statusCode - HTTP status code (default: 200)
 */
async function renderAndRespond(
  ctx: Context,
  pageName: string,
  context: TemplateContext,
  statusCode = 200,
): Promise<void> {
  const html = await renderPage(pageName, context);
  ctx.status = statusCode;
  ctx.type = 'text/html';
  ctx.body = html;
}

/**
 * Resolve the organization from the OIDC interaction's client_id.
 *
 * Interaction routes (`/interaction/:uid`) don't go through the tenant
 * resolver middleware, so `ctx.state.organization` is not set automatically.
 * This helper resolves the org by looking up the client → organization chain
 * from the interaction's `client_id` parameter, and sets `ctx.state.organization`.
 *
 * Also used by two-factor routes which share the same `/interaction` prefix
 * and likewise don't go through the tenant resolver middleware.
 *
 * @param ctx - Koa context to populate with organization
 * @param clientId - OIDC client_id from the interaction params
 * @throws Error if client or organization cannot be found
 */
export async function resolveOrganizationForInteraction(
  ctx: InteractionContext,
  clientId: string,
): Promise<void> {
  // If already resolved (e.g., by tenant resolver), skip
  if (ctx.state.organization) return;

  const client = await getClientByClientId(clientId);
  if (!client) {
    throw new Error(`Client not found for interaction: ${clientId}`);
  }

  const org = await getOrganizationById(client.organizationId);
  if (!org) {
    throw new Error(`Organization not found for client: ${client.organizationId}`);
  }

  ctx.state.organization = org;
}

/**
 * Resolve a human-readable client name from the OIDC provider metadata.
 *
 * Looks up the client by client_id and returns the `client_name` from
 * its metadata. Falls back to the raw client_id if the client is not
 * found or has no `client_name` set.
 *
 * @param provider - OIDC provider instance
 * @param clientId - The client_id to look up
 * @returns Human-readable client name, or the raw client_id as fallback
 */
async function resolveClientName(provider: Provider, clientId: string): Promise<string> {
  try {
    const client = await provider.Client.find(clientId);
    return (client?.metadata()?.client_name as string) ?? clientId;
  } catch {
    // If lookup fails (e.g., client deleted), fall back to client_id
    return clientId;
  }
}

/**
 * Get an error message for a user status that prevents login.
 * Returns undefined if the status allows login (i.e., 'active').
 *
 * @param status - User status value
 * @param t - Translation function
 * @returns Error message string, or undefined if status allows login
 */
function getStatusErrorMessage(
  status: string,
  t: (key: string) => string,
): string | undefined {
  switch (status) {
    case 'inactive':
      return t('login.error_account_inactive');
    case 'suspended':
      return t('login.error_account_suspended');
    case 'locked':
      return t('login.error_account_locked');
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the interaction router with all OIDC interaction handlers.
 *
 * The router handles login, consent, magic link, and abort flows.
 * Requires a Provider instance to interact with the OIDC session state.
 *
 * @param provider - node-oidc-provider instance for interaction management
 * @returns Koa router with interaction routes mounted at /interaction
 */
export function createInteractionRouter(provider: Provider): Router {
  const router = new Router({ prefix: '/interaction' });

  // -------------------------------------------------------------------------
  // GET /interaction/:uid — Show login or consent page
  // -------------------------------------------------------------------------
  router.get('/:uid', async (ctx) => {
    await showLogin(ctx as InteractionContext, provider);
  });

  // -------------------------------------------------------------------------
  // POST /interaction/:uid/login — Process password login
  // -------------------------------------------------------------------------
  router.post('/:uid/login', async (ctx) => {
    await processLogin(ctx as InteractionContext, provider);
  });

  // -------------------------------------------------------------------------
  // POST /interaction/:uid/magic-link — Send magic link email
  // -------------------------------------------------------------------------
  router.post('/:uid/magic-link', async (ctx) => {
    await handleSendMagicLink(ctx as InteractionContext, provider);
  });

  // -------------------------------------------------------------------------
  // GET /interaction/:uid/consent — Show consent page
  // -------------------------------------------------------------------------
  router.get('/:uid/consent', async (ctx) => {
    await showConsent(ctx as InteractionContext, provider);
  });

  // -------------------------------------------------------------------------
  // POST /interaction/:uid/confirm — Process consent (approve/deny)
  // -------------------------------------------------------------------------
  router.post('/:uid/confirm', async (ctx) => {
    await processConsent(ctx as InteractionContext, provider);
  });

  // -------------------------------------------------------------------------
  // GET /interaction/:uid/abort — Abort the interaction
  // -------------------------------------------------------------------------
  router.get('/:uid/abort', async (ctx) => {
    await abortInteraction(ctx as InteractionContext, provider);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * Show the login page for an OIDC interaction.
 *
 * Checks for a `_ml_session` cookie first (set by the magic link handler).
 * If present, consumes the session and either:
 *   - Completes the OIDC flow via interactionFinished() (same browser)
 *   - Shows a "You're signed in" success page (different browser)
 *
 * If no magic link session, falls through to the normal login flow:
 * 1. Loads the interaction details from the provider
 * 2. If the prompt is "consent", redirects to the consent page
 * 3. Resolves the locale from OIDC params, Accept-Language, and org default
 * 4. Generates a CSRF token for form protection
 * 5. Renders the login page with branding, i18n, and interaction data
 *
 * @param ctx - Koa context with organization state
 * @param provider - OIDC provider instance
 */
async function showLogin(ctx: InteractionContext, provider: Provider): Promise<void> {
  // -----------------------------------------------------------------------
  // Magic link session detection
  // -----------------------------------------------------------------------
  if (hasMagicLinkSession(ctx)) {
    const session = await consumeMagicLinkSession(ctx);

    if (session) {
      // Resolve organization from the session data for branding
      const org = await getOrganizationById(session.organizationId);

      // Try to complete the OIDC flow (same browser — interaction cookies present)
      try {
        const result = {
          login: { accountId: session.userId },
        };

        await provider.interactionFinished(ctx.req, ctx.res, result, {
          mergeWithLastSubmission: false,
        });
        return; // Success! Browser redirected to callback with code
      } catch {
        // Different browser — interaction cookies not present, or interaction expired.
        // Show the magic link success page instead.
        logger.info(
          { uid: session.interactionUid, userId: session.userId },
          'Magic link: interaction cookies not present — showing success page (cross-browser)',
        );

        if (org) {
          await renderMagicLinkSuccessPage(ctx, org);
        } else {
          // Fallback: org not found (shouldn't happen, but be safe)
          await renderErrorPage(ctx, 'errors.generic');
        }
        return;
      }
    }
    // Invalid/expired session — fall through to normal login
  }

  // -----------------------------------------------------------------------
  // Normal login flow
  // -----------------------------------------------------------------------
  try {
    const interaction = await provider.interactionDetails(ctx.req, ctx.res);
    const { prompt, params } = interaction;

    // Resolve organization from the interaction's client_id.
    // Interaction routes don't go through the tenant resolver middleware,
    // so we resolve the org from the client → organization chain.
    await resolveOrganizationForInteraction(ctx, params.client_id as string);

    // If the prompt is consent, handle it directly (no redirect).
    // Redirecting to /consent as a separate request can lose the interaction
    // cookie in some flows (e.g., pre-auth magic link), because the cookie
    // was set by the provider on the redirect chain and a Koa redirect
    // doesn't carry it forward reliably.
    if (prompt.name === 'consent') {
      await showConsent(ctx, provider);
      return;
    }

    const org = ctx.state.organization;

    // Resolve locale from OIDC ui_locales, Accept-Language, and org default
    const uiLocales = params.ui_locales as string | undefined;
    const acceptLanguage = ctx.get('Accept-Language') || undefined;
    const locale = await resolveLocale(uiLocales, acceptLanguage, org.defaultLocale);

    // Get translation function with org-specific overrides
    const t = getTranslationFunction(locale, org.slug);

    // Generate CSRF token for form protection
    const csrfToken = generateCsrfToken();
    setCsrfCookie(ctx, csrfToken);

    // Pre-fill email from login_hint if provided.
    //
    // login_hint comes from the client-supplied authorization URL — OIDC spec
    // allows any opaque identifier, not just emails, so we do NOT validate
    // format. We DO defensively trim and length-cap at RFC 5321 max (320 chars)
    // to avoid pathological template renders. Handlebars HTML-escapes on
    // interpolation, which blocks XSS via the value="" attribute.
    const rawHint = typeof params.login_hint === 'string'
      ? params.login_hint.trim().slice(0, 320)
      : '';
    const emailHint = rawHint.length > 0 ? rawHint : undefined;

    // Resolve human-readable client name from OIDC provider metadata.
    // Falls back to the raw client_id if not found.
    const oidcClient = await provider.Client.find(params.client_id as string);
    const clientName = (oidcClient?.metadata()?.client_name as string) ?? (params.client_id as string);

    // Resolve the effective login methods from the client's OIDC metadata.
    // When no client is found (edge case — client deleted mid-flow), fall back
    // to the org default methods so the user sees SOMETHING actionable instead
    // of a blank page.
    const effectiveMethods = oidcClient
      ? resolveLoginMethodsFromOidcClient(oidcClient, org)
      : org.defaultLoginMethods;

    const showPassword = effectiveMethods.includes('password');
    const showMagicLink = effectiveMethods.includes('magic_link');

    const context: TemplateContext = {
      ...buildBaseContext(ctx, locale, csrfToken, org.slug),
      t,
      interaction: {
        uid: interaction.uid,
        prompt: prompt.name,
        params: params as Record<string, unknown>,
        client: { clientName },
      },
      email: emailHint ?? '',
      emailHint,
      // Login method rendering flags — consumed by login.hbs
      showPassword,
      showMagicLink,
      showDivider: showPassword && showMagicLink,
      loginMethods: effectiveMethods,
    };

    // Render the login page with CSRF token in both cookie and hidden field
    await renderAndRespond(ctx, 'login', context);
  } catch (error) {
    logger.error({ error, uid: ctx.params.uid }, 'Failed to show login page');
    await renderErrorPage(ctx, 'errors.interaction_expired');
  }
}

/**
 * Render the magic link success page — "You're signed in".
 *
 * Shown when a magic link is opened in a different browser than the one
 * that started the OIDC authorization flow. The OIDC flow can't be
 * completed (no interaction cookies), but the user IS authenticated.
 *
 * Security guard: this function is ONLY called when a valid `_ml_session`
 * was present and successfully consumed. The `_ml_session` is single-use
 * (Redis key deleted), so this page cannot be shown twice or by URL crafting.
 *
 * @param ctx - Koa context
 * @param org - Organization for branding
 */
async function renderMagicLinkSuccessPage(
  ctx: InteractionContext,
  org: Organization,
): Promise<void> {
  const locale = await resolveLocale(
    undefined,
    ctx.get('Accept-Language') || undefined,
    org.defaultLocale,
  );
  const t = getTranslationFunction(locale, org.slug);
  const csrfToken = generateCsrfToken();

  const context: TemplateContext = {
    branding: buildBrandingFromOrg(org),
    locale,
    t,
    csrfToken,
    orgSlug: org.slug,
  };

  await renderAndRespond(ctx, 'magic-link-success', context);
}

/**
 * Process a password-based login attempt.
 *
 * 1. Verifies CSRF token from form submission
 * 2. Extracts email + password from the request body
 * 3. Checks rate limits (per IP+email combination)
 * 4. Looks up user by org + email
 * 5. Verifies password and checks user status
 * 6. On success: records login, resets rate limit, finishes interaction
 * 7. On failure: renders login page with generic error (prevents enumeration)
 *
 * @param ctx - Koa context with organization state
 * @param provider - OIDC provider instance
 */
async function processLogin(ctx: InteractionContext, provider: Provider): Promise<void> {
  const body = ctx.request.body as Record<string, string>;
  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  const submittedCsrf = body._csrf ?? '';
  const storedCsrf = getCsrfFromCookie(ctx) ?? '';

  try {
    const interaction = await provider.interactionDetails(ctx.req, ctx.res);

    // Resolve organization from the interaction's client_id
    await resolveOrganizationForInteraction(ctx, interaction.params.client_id as string);
    const org = ctx.state.organization;

    // Resolve locale for error messages
    const locale = await resolveLocale(undefined, ctx.get('Accept-Language') || undefined, org.defaultLocale);
    const t = getTranslationFunction(locale, org.slug);

    // Step 1: Verify CSRF token (cookie vs form field)
    if (!verifyCsrfToken(storedCsrf, submittedCsrf)) {
      logger.warn({ uid: interaction.uid }, 'CSRF token mismatch on login');
      await renderLoginWithError(ctx, provider, interaction, t, locale, email, t('errors.csrf_invalid'));
      return;
    }

    // Step 1.5: Enforce login method — 'password' must be allowed for this client.
    //
    // This check protects against three scenarios:
    //   1. User submits the password form after an admin switched the client
    //      to magic-link-only (stale form cached in the browser).
    //   2. Adversary crafts a direct POST to bypass the UI guard (the template
    //      hides the password form, but a raw POST from curl/Postman still
    //      reaches this handler).
    //   3. Browser back button resurrects the form after login method change.
    //
    // Rendering the login page (not a raw 403) preserves CSRF/state and gives
    // the user a clear, actionable error message.
    const oidcClientForLogin = await provider.Client.find(interaction.params.client_id as string);
    const effectiveLoginMethods = oidcClientForLogin
      ? resolveLoginMethodsFromOidcClient(oidcClientForLogin, org)
      : org.defaultLoginMethods;

    if (!effectiveLoginMethods.includes('password')) {
      logger.warn(
        { uid: interaction.uid, email, clientId: interaction.params.client_id },
        'Password login attempted for client where method is disabled',
      );

      writeAuditLog({
        organizationId: org.id,
        eventType: 'security.login_method_disabled',
        eventCategory: 'security',
        description: `Password login attempted on client where method is disabled (${email})`,
        ipAddress: ctx.ip,
        metadata: {
          clientId: interaction.params.client_id,
          attemptedMethod: 'password',
          effectiveMethods: effectiveLoginMethods,
        },
      });

      await renderLoginWithError(
        ctx, provider, interaction, t, locale, email,
        t('errors.login_method_disabled'),
        403,
      );
      return;
    }

    // Step 2: Check rate limit
    const rateLimitKey = buildLoginRateLimitKey(org.id, ctx.ip, email);
    const rateLimitConfig = await loadLoginRateLimitConfig();
    const rateLimitResult = await checkRateLimit(rateLimitKey, rateLimitConfig);

    if (!rateLimitResult.allowed) {
      ctx.set('Retry-After', String(rateLimitResult.retryAfter));

      // Audit: rate limit exceeded
      writeAuditLog({
        organizationId: org.id,
        eventType: 'rate_limit.login',
        eventCategory: 'security',
        description: `Login rate limit exceeded for ${email}`,
        ipAddress: ctx.ip,
      });

      await renderLoginWithError(
        ctx, provider, interaction, t, locale, email,
        t('errors.rate_limit_exceeded'),
        429,
      );
      return;
    }

    // Step 3: Look up user by org + email
    const user = await getUserByEmail(org.id, email);

    if (!user) {
      // Generic error — prevent user enumeration
      writeAuditLog({
        organizationId: org.id,
        eventType: 'user.login.password.failed',
        eventCategory: 'security',
        description: `Login failed: user not found (${email})`,
        ipAddress: ctx.ip,
      });

      await renderLoginWithError(ctx, provider, interaction, t, locale, email, t('login.error_invalid'));
      return;
    }

    // Step 4: Check user status — only active users can log in
    const statusError = getStatusErrorMessage(user.status, t);
    if (statusError) {
      writeAuditLog({
        organizationId: org.id,
        userId: user.id,
        eventType: 'user.login.password.failed',
        eventCategory: 'security',
        description: `Login failed: account ${user.status} (${email})`,
        ipAddress: ctx.ip,
      });

      await renderLoginWithError(ctx, provider, interaction, t, locale, email, statusError);
      return;
    }

    // Step 5: Verify password
    const passwordValid = await verifyUserPassword(user.id, password);

    if (!passwordValid) {
      writeAuditLog({
        organizationId: org.id,
        userId: user.id,
        eventType: 'user.login.password.failed',
        eventCategory: 'security',
        description: `Login failed: wrong password (${email})`,
        ipAddress: ctx.ip,
      });

      await renderLoginWithError(ctx, provider, interaction, t, locale, email, t('login.error_invalid'));
      return;
    }

    // Step 6: Password valid — check if 2FA is required
    await resetRateLimit(rateLimitKey);

    // Determine 2FA requirements based on org policy and user state
    const twoFactorRequired = user.twoFactorEnabled || requiresTwoFactor(org, user);
    const twoFactorMethod = determineTwoFactorMethod(org, user);

    if (twoFactorRequired) {
      // Store pending login in the interaction session — user must complete 2FA
      await provider.interactionResult(ctx.req, ctx.res, {
        twoFactor: {
          pendingAccountId: user.id,
          method: twoFactorMethod ?? 'email',
          email: user.email,
        },
      }, { mergeWithLastSubmission: true });

      // If method is email, auto-send the first OTP code
      if (twoFactorMethod === 'email' || (!user.twoFactorEnabled && !twoFactorMethod)) {
        try {
          const otpCode = await sendOtpCode(user.id, user.email, org.id);
          // Send the OTP code via email (fire-and-forget)
          sendOtpCodeEmail(
            { id: user.id, email: user.email, givenName: user.givenName, familyName: user.familyName },
            { id: org.id, slug: org.slug, brandingLogoUrl: org.brandingLogoUrl, brandingPrimaryColor: org.brandingPrimaryColor, brandingCompanyName: org.brandingCompanyName },
            otpCode,
            10,
            locale,
          );
        } catch (otpErr) {
          logger.warn({ otpErr, userId: user.id }, 'Failed to send initial OTP code');
        }
      }

      writeAuditLog({
        organizationId: org.id,
        userId: user.id,
        eventType: '2fa.challenge.started',
        eventCategory: 'authentication',
        description: `2FA challenge initiated for ${email} (method: ${twoFactorMethod ?? 'setup_required'})`,
        ipAddress: ctx.ip,
      });

      // Redirect to the 2FA verification page (or setup page if not enrolled)
      if (user.twoFactorEnabled) {
        ctx.redirect(`/interaction/${interaction.uid}/two-factor`);
      } else {
        // User needs to set up 2FA first (org requires it but user hasn't enrolled)
        ctx.redirect(`/interaction/${interaction.uid}/two-factor/setup`);
      }
      return;
    }

    // No 2FA required — complete login normally
    await recordLogin(user.id);

    // Audit: successful login (no 2FA)
    writeAuditLog({
      organizationId: org.id,
      userId: user.id,
      eventType: 'user.login.password',
      eventCategory: 'authentication',
      description: `Password login successful (${email})`,
      ipAddress: ctx.ip,
    });

    // Finish the OIDC interaction with the logged-in user
    const result = {
      login: { accountId: user.id },
    };

    await provider.interactionFinished(ctx.req, ctx.res, result, {
      mergeWithLastSubmission: false,
    });
  } catch (error) {
    logger.error({ error, email }, 'Failed to process login');
    await renderErrorPage(ctx, 'errors.interaction_expired');
  }
}

/**
 * Send a magic link email for passwordless authentication.
 *
 * Always shows the "check your email" page regardless of whether the
 * user exists — this prevents user enumeration attacks. If the user is
 * found and active, generates a token, stores it, and sends the email.
 *
 * @param ctx - Koa context with organization state
 * @param provider - OIDC provider instance
 */
async function handleSendMagicLink(ctx: InteractionContext, provider: Provider): Promise<void> {
  const body = ctx.request.body as Record<string, string>;
  const email = (body.email ?? '').trim().toLowerCase();
  const submittedCsrf = body._csrf ?? '';
  const storedCsrf = getCsrfFromCookie(ctx) ?? '';

  try {
    const interaction = await provider.interactionDetails(ctx.req, ctx.res);

    // Resolve organization from the interaction's client_id
    await resolveOrganizationForInteraction(ctx, interaction.params.client_id as string);
    const org = ctx.state.organization;

    // Resolve locale for page rendering
    const locale = await resolveLocale(undefined, ctx.get('Accept-Language') || undefined, org.defaultLocale);
    const t = getTranslationFunction(locale, org.slug);

    // Verify CSRF token (cookie vs form field)
    if (!verifyCsrfToken(storedCsrf, submittedCsrf)) {
      logger.warn({ uid: interaction.uid }, 'CSRF token mismatch on magic link');
      await renderLoginWithError(ctx, provider, interaction, t, locale, email, t('errors.csrf_invalid'));
      return;
    }

    // Enforce login method — 'magic_link' must be allowed for this client.
    // Mirror of the password-login enforcement above. Same rationale: backend
    // is the authoritative guard; the template hiding the button is cosmetic.
    const oidcClientForMagicLink = await provider.Client.find(
      interaction.params.client_id as string,
    );
    const effectiveMagicLinkMethods = oidcClientForMagicLink
      ? resolveLoginMethodsFromOidcClient(oidcClientForMagicLink, org)
      : org.defaultLoginMethods;

    if (!effectiveMagicLinkMethods.includes('magic_link')) {
      logger.warn(
        { uid: interaction.uid, email, clientId: interaction.params.client_id },
        'Magic link attempted for client where method is disabled',
      );

      writeAuditLog({
        organizationId: org.id,
        eventType: 'security.login_method_disabled',
        eventCategory: 'security',
        description: `Magic link attempted on client where method is disabled (${email})`,
        ipAddress: ctx.ip,
        metadata: {
          clientId: interaction.params.client_id,
          attemptedMethod: 'magic_link',
          effectiveMethods: effectiveMagicLinkMethods,
        },
      });

      await renderLoginWithError(
        ctx, provider, interaction, t, locale, email,
        t('errors.login_method_disabled'),
        403,
      );
      return;
    }

    // Check rate limit for magic link requests
    const rateLimitKey = buildMagicLinkRateLimitKey(org.id, email);
    const rateLimitConfig = await loadMagicLinkRateLimitConfig();
    const rateLimitResult = await checkRateLimit(rateLimitKey, rateLimitConfig);

    if (!rateLimitResult.allowed) {
      ctx.set('Retry-After', String(rateLimitResult.retryAfter));

      writeAuditLog({
        organizationId: org.id,
        eventType: 'rate_limit.magic_link',
        eventCategory: 'security',
        description: `Magic link rate limit exceeded for ${email}`,
        ipAddress: ctx.ip,
      });

      await renderLoginWithError(
        ctx, provider, interaction, t, locale, email,
        t('errors.rate_limit_exceeded'),
        429,
      );
      return;
    }

    // Look up user — but ALWAYS show the same "check your email" page
    const user = await getUserByEmail(org.id, email);

    if (user && user.status === 'active') {
      // Invalidate any existing magic link tokens for this user
      await invalidateUserTokens('magic_link_tokens', user.id);

      // Generate new token
      const { plaintext, hash } = generateToken();

      // Load TTL from system_config (default: 15 minutes = 900s)
      const ttlSeconds = await getSystemConfigNumber('magic_link_ttl', 900);
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      // Store token hash in database
      await insertToken('magic_link_tokens', user.id, hash, expiresAt);

      // Build the magic link URL with the interaction UID for flow resumption
      const magicLinkUrl = `${config.issuerBaseUrl}/${org.slug}/auth/magic-link/${plaintext}?interaction=${interaction.uid}`;

      // Send the magic link email (fire-and-forget)
      sendMagicLinkEmail(
        { id: user.id, email: user.email, givenName: user.givenName, familyName: user.familyName },
        { id: org.id, slug: org.slug, brandingLogoUrl: org.brandingLogoUrl, brandingPrimaryColor: org.brandingPrimaryColor, brandingCompanyName: org.brandingCompanyName },
        magicLinkUrl,
        locale,
      );

      // Audit: magic link sent
      writeAuditLog({
        organizationId: org.id,
        userId: user.id,
        eventType: 'user.magic_link.sent',
        eventCategory: 'authentication',
        description: `Magic link sent to ${email}`,
        ipAddress: ctx.ip,
      });
    }

    // Always render the "check your email" page — prevents user enumeration
    const csrfToken = generateCsrfToken();
    const context: TemplateContext = {
      ...buildBaseContext(ctx, locale, csrfToken, org.slug),
      t,
      email,
      loginUrl: `/interaction/${interaction.uid}`,
    };

    await renderAndRespond(ctx, 'magic-link-sent', context);
  } catch (error) {
    logger.error({ error, email }, 'Failed to send magic link');
    await renderErrorPage(ctx, 'errors.interaction_expired');
  }
}

/**
 * Show the consent page for an OIDC interaction.
 *
 * If the client belongs to the same organization (first-party app),
 * auto-consents by immediately finishing the interaction. Otherwise,
 * renders the consent page with requested scopes and client info.
 *
 * @param ctx - Koa context with organization state
 * @param provider - OIDC provider instance
 */
async function showConsent(ctx: InteractionContext, provider: Provider): Promise<void> {
  try {
    const interaction = await provider.interactionDetails(ctx.req, ctx.res);
    const { prompt, params } = interaction;

    // Resolve organization from the interaction's client_id
    await resolveOrganizationForInteraction(ctx, params.client_id as string);
    const org = ctx.state.organization;

    // Resolve locale for the consent page
    const uiLocales = params.ui_locales as string | undefined;
    const acceptLanguage = ctx.get('Accept-Language') || undefined;
    const locale = await resolveLocale(uiLocales, acceptLanguage, org.defaultLocale);
    const t = getTranslationFunction(locale, org.slug);

    // Auto-consent for first-party apps: if the client metadata includes
    // the org ID matching the current tenant, skip the consent screen
    const clientId = params.client_id as string;
    const client = await provider.Client.find(clientId);

    if (client) {
      // Check if this is a first-party client (belongs to the same org)
      const clientOrgId = client.metadata()?.organizationId as string | undefined;
      if (clientOrgId && clientOrgId === org.id) {
        // Auto-consent: finish interaction immediately with consent grant
        const grant = new provider.Grant({ accountId: interaction.session?.accountId, clientId });

        // Use prompt.details to grant exactly what the provider requires
        const details = prompt.details as Record<string, unknown>;

        if (details.missingOIDCScope) {
          const scopes = details.missingOIDCScope as Iterable<string>;
          grant.addOIDCScope([...scopes].join(' '));
        }
        if (details.missingOIDCClaims) {
          const claims = details.missingOIDCClaims as Iterable<string>;
          grant.addOIDCClaims([...claims]);
        }
        if (details.missingResourceScopes) {
          for (const [indicator, scopes] of Object.entries(
            details.missingResourceScopes as Record<string, Iterable<string>>
          )) {
            grant.addResourceScope(indicator, [...scopes].join(' '));
          }
        }

        // Explicitly grant offline_access if requested — node-oidc-provider
        // treats it as a consent signal and may not include it in missingOIDCScope,
        // but the Grant must include it for a refresh_token to be issued.
        const requestedScope = (params.scope as string) ?? '';
        if (requestedScope.includes('offline_access')) {
          grant.addOIDCScope('offline_access');
        }

        const grantId = await grant.save();

        const result = {
          consent: { grantId },
        };

        writeAuditLog({
          organizationId: org.id,
          userId: interaction.session?.accountId,
          eventType: 'user.consent.granted',
          eventCategory: 'authentication',
          description: `Auto-consent granted for first-party client ${clientId}`,
        });

        await provider.interactionFinished(ctx.req, ctx.res, result, {
          mergeWithLastSubmission: true,
        });
        return;
      }
    }

    // Third-party client: show the consent page
    const csrfToken = generateCsrfToken();
    setCsrfCookie(ctx, csrfToken);
    const requestedScopes = ((params.scope as string) ?? '').split(' ').filter(Boolean);

    const context: TemplateContext = {
      ...buildBaseContext(ctx, locale, csrfToken, org.slug),
      t,
      interaction: {
        uid: interaction.uid,
        prompt: prompt.name,
        params: params as Record<string, unknown>,
        client: { clientName: client?.metadata()?.client_name as string ?? clientId },
      },
      scopes: requestedScopes,
      clientName: client?.metadata()?.client_name as string ?? clientId,
    };

    await renderAndRespond(ctx, 'consent', context);
  } catch (error) {
    logger.error({ error, uid: ctx.params.uid }, 'Failed to show consent page');
    await renderErrorPage(ctx, 'errors.interaction_expired');
  }
}

/**
 * Process a consent decision (approve or deny).
 *
 * Reads the decision from the form body. On approval, creates a Grant
 * with the requested scopes. On denial, finishes the interaction with
 * an access_denied error.
 *
 * @param ctx - Koa context with organization state
 * @param provider - OIDC provider instance
 */
async function processConsent(ctx: InteractionContext, provider: Provider): Promise<void> {
  const body = ctx.request.body as Record<string, string>;
  const submittedCsrf = body._csrf ?? '';
  const storedCsrf = getCsrfFromCookie(ctx) ?? '';
  const decision = body.decision; // 'approve' or 'deny'

  try {
    const interaction = await provider.interactionDetails(ctx.req, ctx.res);

    // Resolve organization from the interaction's client_id
    await resolveOrganizationForInteraction(ctx, interaction.params.client_id as string);
    const org = ctx.state.organization;

    // Verify CSRF token
    if (!verifyCsrfToken(storedCsrf, submittedCsrf)) {
      logger.warn({ uid: interaction.uid }, 'CSRF token mismatch on consent');
      ctx.status = 403;
      ctx.body = 'Invalid CSRF token';
      return;
    }

    if (decision === 'approve') {
      // Create a grant for the approved scopes and claims
      const clientId = interaction.params.client_id as string;
      const grant = new provider.Grant({
        accountId: interaction.session?.accountId,
        clientId,
      });

      // Use prompt.details to grant exactly what the provider requires
      const details = interaction.prompt.details as Record<string, unknown>;

      // Grant missing OIDC scopes
      if (details.missingOIDCScope) {
        const scopes = details.missingOIDCScope as Iterable<string>;
        grant.addOIDCScope([...scopes].join(' '));
      }

      // Grant missing OIDC claims
      if (details.missingOIDCClaims) {
        const claims = details.missingOIDCClaims as Iterable<string>;
        grant.addOIDCClaims([...claims]);
      }

      // Grant missing resource scopes
      if (details.missingResourceScopes) {
        for (const [indicator, scopes] of Object.entries(
          details.missingResourceScopes as Record<string, Iterable<string>>
        )) {
          grant.addResourceScope(indicator, [...scopes].join(' '));
        }
      }

      // Explicitly grant offline_access if requested (see showConsent for details)
      const requestedScope = (interaction.params.scope as string) ?? '';
      if (requestedScope.includes('offline_access')) {
        grant.addOIDCScope('offline_access');
      }

      const grantId = await grant.save();

      writeAuditLog({
        organizationId: org.id,
        userId: interaction.session?.accountId,
        eventType: 'user.consent.granted',
        eventCategory: 'authentication',
        description: `Consent granted for client ${clientId}`,
      });

      const result = {
        consent: { grantId },
      };

      await provider.interactionFinished(ctx.req, ctx.res, result, {
        mergeWithLastSubmission: true,
      });
    } else {
      // Deny consent
      writeAuditLog({
        organizationId: org.id,
        userId: interaction.session?.accountId,
        eventType: 'user.consent.denied',
        eventCategory: 'authentication',
        description: `Consent denied for client ${interaction.params.client_id}`,
      });

      const result = {
        error: 'access_denied',
        error_description: 'User denied consent',
      };

      await provider.interactionFinished(ctx.req, ctx.res, result, {
        mergeWithLastSubmission: false,
      });
    }
  } catch (error) {
    logger.error({ error, uid: ctx.params.uid }, 'Failed to process consent');
    await renderErrorPage(ctx, 'errors.interaction_expired');
  }
}

/**
 * Abort an OIDC interaction.
 *
 * Finishes the interaction with an access_denied error, effectively
 * cancelling the authorization flow and redirecting back to the client.
 *
 * @param ctx - Koa context with organization state
 * @param provider - OIDC provider instance
 */
async function abortInteraction(ctx: InteractionContext, provider: Provider): Promise<void> {
  try {
    const interaction = await provider.interactionDetails(ctx.req, ctx.res);

    // Resolve organization from the interaction's client_id
    await resolveOrganizationForInteraction(ctx, interaction.params.client_id as string);
    const org = ctx.state.organization;

    writeAuditLog({
      organizationId: org.id,
      userId: interaction.session?.accountId,
      eventType: 'user.consent.denied',
      eventCategory: 'authentication',
      description: 'Interaction aborted by user',
    });

    const result = {
      error: 'access_denied',
      error_description: 'User aborted the interaction',
    };

    await provider.interactionFinished(ctx.req, ctx.res, result, {
      mergeWithLastSubmission: false,
    });
  } catch (error) {
    logger.error({ error, uid: ctx.params.uid }, 'Failed to abort interaction');
    await renderErrorPage(ctx, 'errors.interaction_expired');
  }
}

// ---------------------------------------------------------------------------
// Helper: render login page with error
// ---------------------------------------------------------------------------

/**
 * Render the login page with an error flash message.
 * Used when login fails (wrong password, rate limited, CSRF mismatch, etc.).
 *
 * @param ctx - Koa context
 * @param provider - OIDC provider instance (used to resolve human-readable client name)
 * @param interaction - OIDC interaction details
 * @param t - Translation function
 * @param locale - Resolved locale
 * @param email - Pre-filled email value
 * @param errorMessage - Error message to display
 * @param statusCode - HTTP status code (default: 200)
 */
async function renderLoginWithError(
  ctx: InteractionContext,
  provider: Provider,
  interaction: { uid: string; prompt: { name: string }; params: Record<string, unknown> },
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string,
  email: string,
  errorMessage: string,
  statusCode = 200,
): Promise<void> {
  const org = ctx.state.organization;
  const csrfToken = generateCsrfToken();
  setCsrfCookie(ctx, csrfToken);

  // Resolve human-readable client name from provider metadata.
  // Falls back to raw client_id if the client is not found.
  const clientId = (interaction.params.client_id as string) ?? '';
  const clientName = await resolveClientName(provider, clientId);

  const context: TemplateContext = {
    ...buildBaseContext(ctx, locale, csrfToken, org.slug),
    t,
    interaction: {
      uid: interaction.uid,
      prompt: interaction.prompt.name,
      params: interaction.params as Record<string, unknown>,
      client: { clientName },
    },
    email,
    flash: { error: errorMessage },
  };

  await renderAndRespond(ctx, 'login', context, statusCode);
}

// ---------------------------------------------------------------------------
// Helper: render error page
// ---------------------------------------------------------------------------

/**
 * Render a generic error page when the interaction cannot be loaded.
 * Used as a fallback when the interaction has expired or is invalid.
 *
 * @param ctx - Koa context
 * @param errorKey - Translation key for the error message
 */
async function renderErrorPage(ctx: Context, errorKey: string): Promise<void> {
  try {
    const org = (ctx.state as { organization?: Organization }).organization;
    const orgSlug = org?.slug ?? 'default';
    const locale = org
      ? await resolveLocale(undefined, ctx.get('Accept-Language') || undefined, org.defaultLocale)
      : 'en';
    const t = getTranslationFunction(locale, orgSlug);
    const csrfToken = generateCsrfToken();

    const context: TemplateContext = {
      branding: org
        ? buildBrandingFromOrg(org)
        : { logoUrl: null, faviconUrl: null, primaryColor: '#3B82F6', companyName: 'Porta', customCss: null },
      locale,
      t,
      csrfToken,
      orgSlug,
      errorMessage: t(errorKey),
    };

    await renderAndRespond(ctx, 'error', context, 400);
  } catch (renderError) {
    // Last resort: if even the error page fails, send plain text
    logger.error({ renderError }, 'Failed to render error page');
    ctx.status = 500;
    ctx.body = 'An error occurred';
  }
}
