/**
 * Token endpoint rate limiter middleware.
 *
 * Protects the OAuth token endpoint (`POST /:orgSlug/oidc/token`) against
 * abuse: client-credentials flooding, authorization-code brute-forcing,
 * and general token endpoint spam.
 *
 * Rate limiting is per-IP + per-client_id composite key.  If `client_id`
 * is not present in the request body (e.g. `client_secret_basic` auth
 * sends credentials in the `Authorization` header), the key falls back
 * to `unknown` — all such requests from the same IP share one counter.
 *
 * Reuses the existing `checkRateLimit()` infrastructure from
 * `src/auth/rate-limiter.ts` which provides Redis INCR+EXPIRE sliding
 * window and graceful degradation on Redis failure.
 *
 * Placement: mount as global middleware **before** the OIDC provider
 * router in `src/server.ts`.  The path regex ensures only token-endpoint
 * requests are rate-limited — all other paths pass through untouched.
 *
 * @module middleware/token-rate-limiter
 */

import type { Middleware } from 'koa';
import { checkRateLimit } from '../auth/rate-limiter.js';
import type { RateLimitConfig } from '../auth/rate-limiter.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Constants — exported for test assertions and documentation
// ---------------------------------------------------------------------------

/**
 * Regex matching the OIDC token endpoint path.
 *
 * Pattern: `/<orgSlug>/oidc/token` where orgSlug starts with a
 * lowercase alphanumeric character followed by zero or more lowercase
 * alphanumeric or hyphen characters.
 *
 * Matches:  `/acme/oidc/token`, `/my-org/oidc/token`
 * Rejects:  `/api/admin/something`, `/acme/oidc/token/extra`
 */
export const TOKEN_PATH_REGEX = /^\/[a-z0-9][a-z0-9-]*\/oidc\/token$/;

/**
 * Rate limit configuration for the token endpoint.
 *
 * 30 requests per 5-minute window — generous enough for legitimate
 * applications (SPAs refreshing tokens, server-side token exchanges)
 * while catching automated abuse.
 */
export const TOKEN_RATE_LIMIT: RateLimitConfig = {
  max: 30,
  windowSeconds: 300,
};

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create the token endpoint rate limiter middleware.
 *
 * Only intercepts `POST` requests to paths matching `TOKEN_PATH_REGEX`.
 * Sets informational `X-RateLimit-*` headers on every token response
 * and returns a `429` with an OAuth-format error body when the limit
 * is exceeded.
 *
 * @returns Koa middleware that rate-limits the OIDC token endpoint
 */
export function tokenRateLimiter(): Middleware {
  return async function tokenRateLimiterMiddleware(ctx, next) {
    // Only rate-limit POST to the token endpoint — GET, OPTIONS, etc.
    // and all non-token paths pass through immediately.
    if (ctx.method !== 'POST' || !TOKEN_PATH_REGEX.test(ctx.path)) {
      return next();
    }

    // Extract client_id from the parsed request body if available.
    // The selective bodyParser in server.ts excludes OIDC routes, so
    // ctx.request.body may be empty when this middleware runs.
    // Fall back to 'unknown' — all unidentified clients from the same
    // IP share a single rate limit counter, which is acceptable.
    const body = ctx.request.body as Record<string, unknown> | undefined;
    const clientId = body?.client_id;
    const clientKey =
      typeof clientId === 'string' && clientId.length > 0
        ? clientId
        : 'unknown';

    // Composite key: per-IP + per-client_id for granular rate limiting
    const key = `ratelimit:token:${ctx.ip}:${clientKey}`;

    const result = await checkRateLimit(key, TOKEN_RATE_LIMIT);

    // Informational headers on all responses — helps legitimate clients
    // monitor their usage and implement backoff strategies.
    ctx.set('X-RateLimit-Limit', String(TOKEN_RATE_LIMIT.max));
    ctx.set('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      logger.warn(
        {
          action: 'token_rate_limit_exceeded',
          ip: ctx.ip,
          clientId: clientKey,
          path: ctx.path,
        },
        'Token endpoint rate limit exceeded',
      );

      ctx.status = 429;
      ctx.set('Retry-After', String(result.retryAfter));
      // OAuth 2.0 error format — clients that parse token endpoint
      // errors can handle this structured response.
      ctx.body = {
        error: 'rate_limit_exceeded',
        error_description:
          'Too many token requests. Please try again later.',
        retry_after: result.retryAfter,
      };
      return;
    }

    return next();
  };
}
