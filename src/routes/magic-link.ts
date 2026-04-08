/**
 * Magic link verification route handler.
 *
 * Handles the callback when a user clicks the magic link in their email.
 * Verifies the token, marks the user's email as verified, records the login,
 * and resumes the OIDC interaction flow.
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
 *   - Audit logging for all magic link events
 */

import Router from '@koa/router';
import type { Context } from 'koa';
import type Provider from 'oidc-provider';
import { hashToken } from '../auth/tokens.js';
import { findValidToken, markTokenUsed } from '../auth/token-repository.js';
import { resolveLocale, getTranslationFunction } from '../auth/i18n.js';
import { renderPage } from '../auth/template-engine.js';
import type { TemplateContext } from '../auth/template-engine.js';
import { generateCsrfToken } from '../auth/csrf.js';
import { getUserById, recordLogin, markEmailVerified } from '../users/service.js';
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
 * Requires a Provider instance to resume the OIDC interaction after
 * successful magic link authentication.
 *
 * @param provider - node-oidc-provider instance
 * @returns Koa router with magic link routes
 */
export function createMagicLinkRouter(provider: Provider): Router {
  const router = new Router();

  // GET /:orgSlug/auth/magic-link/:token — Verify magic link
  router.get('/:orgSlug/auth/magic-link/:token', async (ctx) => {
    await verifyMagicLink(ctx as AuthContext, provider);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Verify a magic link token and complete the authentication flow.
 *
 * 1. Hashes the token from URL params for DB lookup
 * 2. Finds the valid (unused, non-expired) token record
 * 3. If invalid/expired: renders error page with "link expired" message
 * 4. If valid:
 *    a. Marks the token as used (single-use)
 *    b. Marks the user's email as verified
 *    c. Records the login (increments login count)
 *    d. Writes audit log for magic link login
 *    e. Resumes the OIDC flow via provider.interactionFinished()
 *
 * @param ctx - Koa context with organization state
 * @param provider - OIDC provider instance
 */
async function verifyMagicLink(ctx: AuthContext, provider: Provider): Promise<void> {
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

    // Step 8: Resume OIDC flow if interaction UID is provided
    if (interactionUid) {
      try {
        const result = {
          login: { accountId: user.id },
        };

        await provider.interactionFinished(ctx.req, ctx.res, result, {
          mergeWithLastSubmission: false,
        });
        return;
      } catch (interactionError) {
        // Interaction may have expired — log and show success page instead
        logger.warn(
          { error: interactionError, uid: interactionUid },
          'Failed to resume OIDC interaction after magic link — interaction may have expired',
        );
      }
    }

    // If no interaction UID or interaction expired, redirect to login
    // with a success flash message
    ctx.redirect(`/${org.slug}/auth/forgot-password?flash=magic_link_success`);
  } catch (error) {
    logger.error({ error }, 'Failed to verify magic link');
    await renderErrorPageForAuth(ctx, org, locale, t, t('errors.generic'));
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
