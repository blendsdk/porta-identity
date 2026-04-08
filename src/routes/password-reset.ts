/**
 * Password reset route handlers.
 *
 * Handles the forgot-password and reset-password flows:
 *   - Forgot password: user submits email, receives reset link
 *   - Reset password: user clicks reset link, sets new password
 *
 * Route structure:
 *   GET  /:orgSlug/auth/forgot-password          → showForgotPassword
 *   POST /:orgSlug/auth/forgot-password          → processForgotPassword
 *   GET  /:orgSlug/auth/reset-password/:token    → showResetPassword
 *   POST /:orgSlug/auth/reset-password/:token    → processResetPassword
 *
 * Security features:
 *   - User enumeration prevention (always shows "check your email")
 *   - Rate limiting on forgot-password requests
 *   - CSRF protection on all POST endpoints
 *   - Token single-use (marked as used after password reset)
 *   - Password validation (NIST SP 800-63B compliant)
 *   - Audit logging for all password reset events
 */

import Router from '@koa/router';
import type { Context } from 'koa';
import { generateCsrfToken, verifyCsrfToken } from '../auth/csrf.js';
import {
  checkRateLimit,
  buildPasswordResetRateLimitKey,
  loadPasswordResetRateLimitConfig,
} from '../auth/rate-limiter.js';
import { generateToken, hashToken } from '../auth/tokens.js';
import { insertToken, findValidToken, markTokenUsed, invalidateUserTokens } from '../auth/token-repository.js';
import { sendPasswordResetEmail, sendPasswordChangedEmail } from '../auth/email-service.js';
import { resolveLocale, getTranslationFunction } from '../auth/i18n.js';
import { renderPage } from '../auth/template-engine.js';
import type { TemplateContext } from '../auth/template-engine.js';
import { getUserByEmail, getUserById, setUserPassword } from '../users/service.js';
import { validatePassword } from '../users/password.js';
import { getSystemConfigNumber } from '../lib/system-config.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { logger } from '../lib/logger.js';
import { config } from '../config/index.js';
import type { Organization } from '../organizations/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extended Koa context with organization from tenant resolver */
interface AuthContext extends Context {
  state: {
    organization: Organization;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build branding context from organization data.
 *
 * @param org - Organization with branding fields
 * @returns Branding context for templates
 */
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
 * Render an HTML page and send it as the response.
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

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the password reset auth router.
 *
 * Handles forgot-password and reset-password flows at
 * /:orgSlug/auth/forgot-password and /:orgSlug/auth/reset-password/:token.
 *
 * @returns Koa router with password reset routes
 */
export function createPasswordResetRouter(): Router {
  const router = new Router();

  // GET /:orgSlug/auth/forgot-password — Show forgot password form
  router.get('/:orgSlug/auth/forgot-password', async (ctx) => {
    await showForgotPassword(ctx as AuthContext);
  });

  // POST /:orgSlug/auth/forgot-password — Process forgot password request
  router.post('/:orgSlug/auth/forgot-password', async (ctx) => {
    await processForgotPassword(ctx as AuthContext);
  });

  // GET /:orgSlug/auth/reset-password/:token — Show reset password form
  router.get('/:orgSlug/auth/reset-password/:token', async (ctx) => {
    await showResetPassword(ctx as AuthContext);
  });

  // POST /:orgSlug/auth/reset-password/:token — Process password reset
  router.post('/:orgSlug/auth/reset-password/:token', async (ctx) => {
    await processResetPassword(ctx as AuthContext);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * Show the forgot-password form.
 *
 * Renders the forgot-password page with a CSRF token for form protection.
 *
 * @param ctx - Koa context with organization state
 */
async function showForgotPassword(ctx: AuthContext): Promise<void> {
  const org = ctx.state.organization;
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

  await renderAndRespond(ctx, 'forgot-password', context);
}

/**
 * Process a forgot-password form submission.
 *
 * Always shows the "check your email" confirmation page regardless of
 * whether the email exists — this prevents user enumeration attacks.
 * If the user is found, generates a reset token and sends the email.
 *
 * 1. Verify CSRF token
 * 2. Extract email from form body
 * 3. Check rate limit (per email)
 * 4. Always show "check your email" page
 * 5. If user found: generate token, send email, audit log
 *
 * @param ctx - Koa context with organization state
 */
async function processForgotPassword(ctx: AuthContext): Promise<void> {
  const org = ctx.state.organization;
  const body = ctx.request.body as Record<string, string>;
  const email = (body.email ?? '').trim().toLowerCase();
  const submittedCsrf = body._csrf ?? '';
  const storedCsrf = body._csrfStored ?? '';

  const locale = await resolveLocale(
    undefined,
    ctx.get('Accept-Language') || undefined,
    org.defaultLocale,
  );
  const t = getTranslationFunction(locale, org.slug);

  // Step 1: Verify CSRF token
  if (!verifyCsrfToken(storedCsrf, submittedCsrf)) {
    logger.warn('CSRF token mismatch on forgot-password');
    const csrfToken = generateCsrfToken();
    const context: TemplateContext = {
      branding: buildBrandingFromOrg(org),
      locale,
      t,
      csrfToken,
      orgSlug: org.slug,
      flash: { error: t('errors.csrf_invalid') },
    };
    await renderAndRespond(ctx, 'forgot-password', context, 403);
    return;
  }

  // Step 2: Check rate limit
  const rateLimitKey = buildPasswordResetRateLimitKey(org.id, email);
  const rateLimitConfig = await loadPasswordResetRateLimitConfig();
  const rateLimitResult = await checkRateLimit(rateLimitKey, rateLimitConfig);

  if (!rateLimitResult.allowed) {
    ctx.set('Retry-After', String(rateLimitResult.retryAfter));

    writeAuditLog({
      organizationId: org.id,
      eventType: 'rate_limit.password_reset',
      eventCategory: 'security',
      description: `Password reset rate limit exceeded for ${email}`,
      ipAddress: ctx.ip,
    });

    const csrfToken = generateCsrfToken();
    const context: TemplateContext = {
      branding: buildBrandingFromOrg(org),
      locale,
      t,
      csrfToken,
      orgSlug: org.slug,
      flash: { error: t('errors.rate_limit_exceeded') },
    };
    await renderAndRespond(ctx, 'forgot-password', context, 429);
    return;
  }

  // Step 3: Look up user (silently — never reveal whether the user exists)
  const user = await getUserByEmail(org.id, email);

  if (user) {
    try {
      // Invalidate existing password reset tokens for this user
      await invalidateUserTokens('password_reset_tokens', user.id);

      // Generate new token
      const { plaintext, hash } = generateToken();

      // Load TTL from system_config (default: 1 hour = 3600s)
      const ttlSeconds = await getSystemConfigNumber('password_reset_ttl', 3600);
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      // Store token hash in database
      await insertToken('password_reset_tokens', user.id, hash, expiresAt);

      // Build reset URL
      const resetUrl = `${config.issuerBaseUrl}/${org.slug}/auth/reset-password/${plaintext}`;

      // Send password reset email (fire-and-forget)
      sendPasswordResetEmail(
        { id: user.id, email: user.email, givenName: user.givenName, familyName: user.familyName },
        { id: org.id, slug: org.slug, brandingLogoUrl: org.brandingLogoUrl, brandingPrimaryColor: org.brandingPrimaryColor, brandingCompanyName: org.brandingCompanyName },
        resetUrl,
        locale,
      );

      // Audit: password reset requested
      writeAuditLog({
        organizationId: org.id,
        userId: user.id,
        eventType: 'user.password_reset.requested',
        eventCategory: 'security',
        description: `Password reset requested for ${email}`,
        ipAddress: ctx.ip,
      });
    } catch (error) {
      // Log the error but still show the "check your email" page
      logger.error({ error, email }, 'Failed to process password reset token');
    }
  }

  // Step 4: Always show "check your email" page — prevents user enumeration
  const csrfToken = generateCsrfToken();
  const context: TemplateContext = {
    branding: buildBrandingFromOrg(org),
    locale,
    t,
    csrfToken,
    orgSlug: org.slug,
    email,
    flash: { success: t('forgot-password.check_email') },
  };

  await renderAndRespond(ctx, 'forgot-password', context);
}

/**
 * Show the reset-password form.
 *
 * Validates the token before showing the form. If the token is invalid
 * or expired, renders an error page instead.
 *
 * @param ctx - Koa context with organization state
 */
async function showResetPassword(ctx: AuthContext): Promise<void> {
  const org = ctx.state.organization;
  const tokenPlaintext = ctx.params.token;

  const locale = await resolveLocale(
    undefined,
    ctx.get('Accept-Language') || undefined,
    org.defaultLocale,
  );
  const t = getTranslationFunction(locale, org.slug);

  // Validate the token
  const tokenHash = hashToken(tokenPlaintext);
  const tokenRecord = await findValidToken('password_reset_tokens', tokenHash);

  if (!tokenRecord) {
    writeAuditLog({
      organizationId: org.id,
      eventType: 'user.password_reset.failed',
      eventCategory: 'security',
      description: 'Password reset failed: invalid or expired token',
      ipAddress: ctx.ip,
    });

    await renderErrorPageForAuth(ctx, org, locale, t, t('errors.reset_link_expired'));
    return;
  }

  // Token is valid — show the reset password form
  const csrfToken = generateCsrfToken();
  const context: TemplateContext = {
    branding: buildBrandingFromOrg(org),
    locale,
    t,
    csrfToken,
    orgSlug: org.slug,
    token: tokenPlaintext,
  };

  await renderAndRespond(ctx, 'reset-password', context);
}

/**
 * Process a password reset form submission.
 *
 * 1. Verify CSRF token
 * 2. Re-validate the reset token (may have expired since form was shown)
 * 3. Validate the new password (NIST SP 800-63B length checks)
 * 4. Set the new password via user service
 * 5. Mark the token as used
 * 6. Send password-changed confirmation email
 * 7. Audit log the completion
 * 8. Render success page
 *
 * @param ctx - Koa context with organization state
 */
async function processResetPassword(ctx: AuthContext): Promise<void> {
  const org = ctx.state.organization;
  const tokenPlaintext = ctx.params.token;
  const body = ctx.request.body as Record<string, string>;
  const password = body.password ?? '';
  const confirmPassword = body.confirmPassword ?? '';
  const submittedCsrf = body._csrf ?? '';
  const storedCsrf = body._csrfStored ?? '';

  const locale = await resolveLocale(
    undefined,
    ctx.get('Accept-Language') || undefined,
    org.defaultLocale,
  );
  const t = getTranslationFunction(locale, org.slug);

  // Step 1: Verify CSRF token
  if (!verifyCsrfToken(storedCsrf, submittedCsrf)) {
    logger.warn('CSRF token mismatch on reset-password');
    await renderResetFormWithError(ctx, org, locale, t, tokenPlaintext, t('errors.csrf_invalid'), 403);
    return;
  }

  // Step 2: Re-validate the token
  const tokenHash = hashToken(tokenPlaintext);
  const tokenRecord = await findValidToken('password_reset_tokens', tokenHash);

  if (!tokenRecord) {
    writeAuditLog({
      organizationId: org.id,
      eventType: 'user.password_reset.failed',
      eventCategory: 'security',
      description: 'Password reset failed: token expired during submission',
      ipAddress: ctx.ip,
    });

    await renderErrorPageForAuth(ctx, org, locale, t, t('errors.reset_link_expired'));
    return;
  }

  // Step 3: Validate passwords match
  if (password !== confirmPassword) {
    await renderResetFormWithError(ctx, org, locale, t, tokenPlaintext, t('reset-password.error_mismatch'));
    return;
  }

  // Step 4: Validate password strength (NIST SP 800-63B)
  const validation = validatePassword(password);
  if (!validation.isValid) {
    await renderResetFormWithError(ctx, org, locale, t, tokenPlaintext, validation.error!);
    return;
  }

  try {
    // Step 5: Set the new password
    await setUserPassword(tokenRecord.userId, password);

    // Step 6: Mark token as used (single-use)
    await markTokenUsed('password_reset_tokens', tokenRecord.id);

    // Step 7: Send password-changed confirmation email
    const user = await getUserById(tokenRecord.userId);
    if (user) {
      sendPasswordChangedEmail(
        { id: user.id, email: user.email, givenName: user.givenName, familyName: user.familyName },
        { id: org.id, slug: org.slug, brandingLogoUrl: org.brandingLogoUrl, brandingPrimaryColor: org.brandingPrimaryColor, brandingCompanyName: org.brandingCompanyName },
        locale,
      );
    }

    // Step 8: Audit log
    writeAuditLog({
      organizationId: org.id,
      userId: tokenRecord.userId,
      eventType: 'user.password_reset.completed',
      eventCategory: 'security',
      description: 'Password reset completed successfully',
      ipAddress: ctx.ip,
    });

    // Step 9: Render success page
    const csrfToken = generateCsrfToken();
    const context: TemplateContext = {
      branding: buildBrandingFromOrg(org),
      locale,
      t,
      csrfToken,
      orgSlug: org.slug,
      flash: { success: t('reset-password.success') },
    };

    await renderAndRespond(ctx, 'reset-success', context);
  } catch (error) {
    logger.error({ error }, 'Failed to process password reset');
    await renderResetFormWithError(ctx, org, locale, t, tokenPlaintext, t('errors.generic'));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render the reset password form with an error flash message.
 *
 * @param ctx - Koa context
 * @param org - Organization for branding
 * @param locale - Resolved locale
 * @param t - Translation function
 * @param token - Reset token (to re-embed in the form)
 * @param errorMessage - Error message to display
 * @param statusCode - HTTP status code (default: 200)
 */
async function renderResetFormWithError(
  ctx: Context,
  org: Organization,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string,
  token: string,
  errorMessage: string,
  statusCode = 200,
): Promise<void> {
  const csrfToken = generateCsrfToken();
  const context: TemplateContext = {
    branding: buildBrandingFromOrg(org),
    locale,
    t,
    csrfToken,
    orgSlug: org.slug,
    token,
    flash: { error: errorMessage },
  };

  await renderAndRespond(ctx, 'reset-password', context, statusCode);
}

/**
 * Render an error page for auth routes.
 *
 * @param ctx - Koa context
 * @param org - Organization for branding
 * @param locale - Resolved locale
 * @param t - Translation function
 * @param errorMessage - Error message to display
 */
async function renderErrorPageForAuth(
  ctx: Context,
  org: Organization,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string,
  errorMessage: string,
): Promise<void> {
  try {
    const csrfToken = generateCsrfToken();
    const context: TemplateContext = {
      branding: buildBrandingFromOrg(org),
      locale,
      t,
      csrfToken,
      orgSlug: org.slug,
      errorMessage,
    };

    const html = await renderPage('error', context);
    ctx.status = 400;
    ctx.type = 'text/html';
    ctx.body = html;
  } catch (renderError) {
    logger.error({ renderError }, 'Failed to render auth error page');
    ctx.status = 500;
    ctx.body = 'An error occurred';
  }
}
