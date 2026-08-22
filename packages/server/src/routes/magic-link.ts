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
import { consumeAuthorizedMagicLink } from '../auth/token-repository.js';
import { resolveLocale, getTranslationFunction } from '../auth/i18n.js';
import { renderPage } from '../auth/template-engine.js';
import type { TemplateContext } from '../auth/template-engine.js';
import { generateCsrfToken } from '../auth/csrf.js';
import { invalidateUserCache } from '../users/cache.js';
import { createMagicLinkSession } from '../auth/magic-link-session.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { logger } from '../lib/logger.js';
import type { Organization } from '../organizations/types.js';
import {
  createInteractionAuthorityResolver,
  type InteractionAuthorityProvider,
} from '../auth/interaction-authority.js';
import {
  buildMagicLinkCallbackRateLimitKey,
  checkRateLimitStrict,
  loadMagicLinkRateLimitConfig,
} from '../auth/rate-limiter.js';
import { magicLinkCallbackArtifactDigest } from '../auth/recovery-crypto.js';

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

/** Parsed interaction query whose validity is kept separate from standalone authority. */
interface PresentedInteraction {
  /** Whether the query can participate in an authority decision. */
  readonly valid: boolean;
  /** Exact supplied identifier, or null only when the query was absent. */
  readonly value: string | null;
}

/** Dependency boundary for the security-critical callback limit. */
export interface MagicLinkRouteDependencies {
  /** Fail-closed counter used before live authority and artifact lookup. */
  readonly checkCallbackRateLimit: typeof checkRateLimitStrict;
}

/** Production dependencies used unless a test owns an explicit failure boundary. */
const DEFAULT_MAGIC_LINK_ROUTE_DEPENDENCIES: MagicLinkRouteDependencies = {
  checkCallbackRateLimit: checkRateLimitStrict,
};

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
 * Parse the optional interaction query without normalizing malformed input into standalone use.
 *
 * @param value - Raw Koa query value.
 * @returns Exact bounded interaction authority and a fail-closed validity discriminator.
 */
function parsePresentedInteraction(value: unknown): PresentedInteraction {
  if (value === undefined) return { valid: true, value: null };
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) {
    return { valid: false, value: null };
  }
  return { valid: true, value };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the magic link auth router.
 *
 * Handles magic link token verification at /:orgSlug/auth/magic-link/:token. Interaction-bound
 * callbacks resolve their current client through the provider before durable authority is used.
 *
 * @param provider - Provider-owned live interaction model. Omit only for standalone callbacks.
 * @param dependencies - Fail-closed callback-limiter boundary.
 * @returns Koa router with magic link routes
 */
export function createMagicLinkRouter(
  provider?: InteractionAuthorityProvider,
  dependencies: MagicLinkRouteDependencies = DEFAULT_MAGIC_LINK_ROUTE_DEPENDENCIES,
): Router {
  const router = new Router();
  const interactionAuthority = provider ? createInteractionAuthorityResolver(provider) : null;

  // Tenant resolver — resolves orgSlug to organization and sets ctx.state.organization.
  // Applied at route level because this router is mounted directly on the Koa app
  // (not under the OIDC catch-all router which has its own tenant resolver).
  const resolve = tenantResolver();

  // GET /:orgSlug/auth/magic-link/:token — Verify magic link
  router.get('/:orgSlug/auth/magic-link/:token', resolve, async (ctx) => {
    await verifyMagicLink(ctx as AuthContext, interactionAuthority, dependencies);
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
 * 2. Locks and validates the token, route tenant, account, and persisted interaction authority
 * 3. If invalid/expired: renders error page with "link expired" message
 * 4. If valid:
 *    a. Atomically consumes the token, updates the user, and writes the successful audit row
 *    e. Creates `_ml_session` in Redis (5-min TTL, single-use)
 *    f. Redirects to `/interaction/{uid}` where the interaction handler
 *       detects the session cookie and completes the OIDC flow (same
 *       browser) or shows a "return to original browser" page (different
 *       browser)
 *
 * @param ctx - Koa context with organization state
 */
async function verifyMagicLink(
  ctx: AuthContext,
  interactionAuthority: ReturnType<typeof createInteractionAuthorityResolver> | null,
  dependencies: MagicLinkRouteDependencies,
): Promise<void> {
  const org = ctx.state.organization;
  const tokenPlaintext = ctx.params.token;
  const presentedInteraction = parsePresentedInteraction(ctx.query.interaction);

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

    const socketPeer = ctx.req.socket.remoteAddress ?? 'unavailable';
    const rateLimitKey = buildMagicLinkCallbackRateLimitKey(
      org.id,
      socketPeer,
      magicLinkCallbackArtifactDigest(tokenPlaintext),
    );
    const rateLimit = await dependencies.checkCallbackRateLimit(
      rateLimitKey,
      await loadMagicLinkRateLimitConfig(),
    );
    if (!rateLimit.allowed) {
      await rejectMagicLink(ctx, org, locale, t);
      return;
    }

    const liveAuthority =
      presentedInteraction.valid && presentedInteraction.value !== null && interactionAuthority
        ? await interactionAuthority.resolve(presentedInteraction.value)
        : null;
    const interactionAccepted =
      presentedInteraction.valid &&
      (presentedInteraction.value === null ||
        (liveAuthority !== null && liveAuthority.interactionUid === presentedInteraction.value));

    // Step 2: Lock and validate all durable authority before any successful mutation.
    const authority = interactionAccepted
      ? await consumeAuthorizedMagicLink({
          tokenHash,
          organizationId: org.id,
          interactionUid: presentedInteraction.value,
          clientId: liveAuthority?.clientId ?? null,
          ipAddress: ctx.ip,
        })
      : null;

    if (!authority) {
      await rejectMagicLink(ctx, org, locale, t);
      return;
    }

    // The durable transaction has committed. Remove any stale cached account representation.
    await invalidateUserCache(authority.userId);

    // Step 8: Complete the OIDC flow via _ml_session cookie.
    //
    // Create a magic link session and redirect to the interaction handler.
    // The interaction handler will detect the session cookie and complete
    // the OIDC flow (same browser) or show a success page (different browser).
    if (authority.interactionUid) {
      await createMagicLinkSession(ctx, {
        userId: authority.userId,
        interactionUid: authority.interactionUid,
        organizationId: org.id,
      });
      ctx.redirect(`/interaction/${authority.interactionUid}`);
      return;
    }

    // No interaction UID — magic link opened outside an OIDC flow.
    // Show the magic link success page (standalone authentication confirmation).
    logger.info(
      { userId: authority.userId },
      'Magic link verified without interaction UID — showing success page',
    );
    await renderSuccessPageForAuth(ctx, org, locale, t);
  } catch (error) {
    logger.error({ error }, 'Failed to verify magic link');
    await renderErrorPageForAuth(ctx, org, locale, t, t('errors.generic'));
  }
}

/** Render and audit the one generic callback rejection without retaining bearer authority. */
async function rejectMagicLink(
  ctx: AuthContext,
  org: Organization,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): Promise<void> {
  writeAuditLog({
    organizationId: org.id,
    eventType: 'user.magic_link.failed',
    eventCategory: 'security',
    description: 'Magic link verification failed: invalid or expired token',
    ipAddress: ctx.ip,
  });
  await renderErrorPageForAuth(ctx, org, locale, t, t('errors.magic_link_expired'));
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
