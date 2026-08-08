/**
 * Magic link verification route handler.
 *
 * Handles the callback when a user clicks the magic link in their email.
 * Verifies the token, marks the user's email as verified, records the login,
 * and creates a short-lived `_ml_session` in Redis. Then redirects to the
 * interaction login page where the session cookie is detected and either:
 *   - **Same browser**: OIDC flow completes seamlessly via interactionFinished()
 *   - **Different browser**: success page shown ("return to original browser")
 *
 * Route structure:
 *   GET /:orgSlug/auth/magic-link/:token → verifyMagicLink
 *
 * The tenant resolver middleware runs before this route, ensuring
 * ctx.state.organization is populated with the resolved organization.
 *
 * Security features:
 *   - Token is hashed (SHA-256) before DB lookup — plaintext never stored
 *   - Token is single-use (marked as used after verification)
 *   - Expired/used tokens show a generic error page
 *   - `_ml_session` is HttpOnly, 5-min TTL, single-use (Redis-backed)
 *   - Audit logging for all magic link events
 */

import Router from '@koa/router';
import type { Context } from 'koa';
import { tenantResolver } from '../middleware/tenant-resolver.js';
import { hashToken } from '../auth/tokens.js';
import { findValidToken, markTokenUsed } from '../auth/token-repository.js';
import { resolveLocale, getTranslationFunction } from '../auth/i18n.js';
import { renderPage } from '../auth/template-engine.js';
import type { TemplateContext } from '../auth/template-engine.js';
import { generateCsrfToken } from '../auth/csrf.js';
import { getUserById, recordLogin, markEmailVerified } from '../users/service.js';
import {
  createMagicLinkSession,
} from '../auth/magic-link-session.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { logger } from '../lib/logger.js';
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

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the magic link auth router.
 *
 * Handles magic link token verification at /:orgSlug/auth/magic-link/:token.
 * No longer requires a Provider instance — authentication is completed via
 * the `_ml_session` cookie and the interaction login handler.
 *
 * @returns Koa router with magic link routes
 */
export function createMagicLinkRouter(): Router {
  const router = new Router();

  // Tenant resolver — resolves orgSlug to organization and sets ctx.state.organization.
  // Applied at route level because this router is mounted directly on the Koa app
  // (not under the OIDC catch-all router which has its own tenant resolver).
  const resolve = tenantResolver();

  // GET /:orgSlug/auth/magic-link/:token — Verify magic link
  router.get('/:orgSlug/auth/magic-link/:token', resolve, async (ctx) => {
    await verifyMagicLink(ctx as AuthContext);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Verify a magic link token and set up the `_ml_session` for flow completion.
 *
 * 1. Hashes the token from URL params for DB lookup
 * 2. Finds the valid (unused, non-expired) token record
 * 3. If invalid/expired: renders error page with "link expired" message
 * 4. If valid:
 *    a. Marks the token as used (single-use)
 *    b. Marks the user's email as verified
 *    c. Records the login (increments login count)
 *    d. Writes audit log for magic link login
 *    e. Creates `_ml_session` in Redis (5-min TTL, single-use)
 *    f. Redirects to `/interaction/{uid}` where the interaction handler
 *       detects the session cookie and completes the OIDC flow (same
 *       browser) or shows a "return to original browser" page (different
 *       browser)
 *
 * @param ctx - Koa context with organization state
 */
async function verifyMagicLink(ctx: AuthContext): Promise<void> {
  const org = ctx.state.organization;
  const tokenPlaintext = ctx.params.token;
  const interactionUid = (ctx.query.interaction as string) ?? '';

  // Resolve locale for error pages
  const locale = await resolveLocale(
    undefined,
    ctx.get('Accept-Language') || undefined,
    org.defaultLocale,
  );
  const t = getTranslationFunction(locale, org.slug);

  try {
    // Step 1: Hash the token for DB lookup
    const tokenHash = hashToken(tokenPlaintext);

    // Step 2: Find valid token
    const tokenRecord = await findValidToken('magic_link_tokens', tokenHash);

    if (!tokenRecord) {
      // Token is invalid, expired, or already used
      writeAuditLog({
        organizationId: org.id,
        eventType: 'user.magic_link.failed',
        eventCategory: 'security',
        description: 'Magic link verification failed: invalid or expired token',
        ipAddress: ctx.ip,
      });

      await renderErrorPageForAuth(ctx, org, locale, t, t('errors.magic_link_expired'));
      return;
    }

    // Step 3: Verify the user still exists and is active
    const user = await getUserById(tokenRecord.userId);

    if (!user || user.status !== 'active') {
      writeAuditLog({
        organizationId: org.id,
        userId: tokenRecord.userId,
        eventType: 'user.magic_link.failed',
        eventCategory: 'security',
        description: 'Magic link verification failed: user not found or inactive',
        ipAddress: ctx.ip,
      });

      await renderErrorPageForAuth(ctx, org, locale, t, t('errors.magic_link_expired'));
      return;
    }

    // Step 4: Mark token as used (single-use)
    await markTokenUsed('magic_link_tokens', tokenRecord.id);

    // Step 5: Mark email as verified (clicking magic link proves email ownership)
    await markEmailVerified(user.id);

    // Step 6: Record login
    await recordLogin(user.id);

    // Step 7: Audit log
    writeAuditLog({
      organizationId: org.id,
      userId: user.id,
      eventType: 'user.login.magic_link',
      eventCategory: 'authentication',
      description: `Magic link login successful (${user.email})`,
      ipAddress: ctx.ip,
    });

    // Step 8: Complete the OIDC flow via _ml_session cookie.
    //
    // Create a magic link session and redirect to the interaction handler.
    // The interaction handler will detect the session cookie and complete
    // the OIDC flow (same browser) or show a success page (different browser).
    if (interactionUid) {
      await createMagicLinkSession(ctx, {
        userId: user.id,
        interactionUid,
        organizationId: org.id,
      });
      ctx.redirect(`/interaction/${interactionUid}`);
      return;
    }

    // No interaction UID — magic link opened outside an OIDC flow.
    // Show the magic link success page (standalone authentication confirmation).
    logger.info(
      { userId: user.id },
      'Magic link verified without interaction UID — showing success page',
    );
    await renderSuccessPageForAuth(ctx, org, locale, t);
  } catch (error) {
    logger.error({ error }, 'Failed to verify magic link');
    await renderErrorPageForAuth(ctx, org, locale, t, t('errors.generic'));
  }
}

// ---------------------------------------------------------------------------
// Helper: render success page for auth routes
// ---------------------------------------------------------------------------

/**
 * Render a success page when a magic link is verified outside an OIDC flow.
 *
 * This handles the edge case where a magic link URL doesn't have an
 * interaction UID (e.g., link was malformed or interaction expired).
 * Shows a generic "email verified" confirmation instead of redirecting
 * to the forgot-password page.
 *
 * @param ctx - Koa context
 * @param org - Organization for branding
 * @param locale - Resolved locale
 * @param t - Translation function
 */
async function renderSuccessPageForAuth(
  ctx: Context,
  org: Organization,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): Promise<void> {
  try {
    const csrfToken = generateCsrfToken();
    const context: TemplateContext = {
      branding: buildBrandingFromOrg(org),
      locale,
      t,
      csrfToken,
      orgSlug: org.slug,
    };

    const html = await renderPage('magic-link-success', context);
    ctx.status = 200;
    ctx.type = 'text/html';
    ctx.body = html;
  } catch (renderError) {
    logger.error({ renderError }, 'Failed to render magic link success page');
    ctx.status = 200;
    ctx.body = 'Your email has been verified. You may close this tab.';
  }
}

// ---------------------------------------------------------------------------
// Helper: render error page for auth routes
// ---------------------------------------------------------------------------

/**
 * Render an error page for auth routes (outside OIDC interaction flow).
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
