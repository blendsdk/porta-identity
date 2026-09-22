/**
 * Token and introspection endpoint rate limiter middleware.
 *
 * Protects the OAuth token endpoint (`POST /:orgSlug/token`) and
 * token introspection endpoint (`POST /:orgSlug/token/introspection`)
 * against abuse: client-credentials flooding, authorization-code
 * brute-forcing, token enumeration, and general endpoint spam.
 *
 * Rate limiting is per-IP + per-client_id composite key. The client
 * identifier is read from the parsed body or from HTTP Basic credentials;
 * when neither is present (unauthenticated spam) the key falls back to
 * `unknown`, so all such requests from the same IP share one counter.
 *
 * Reuses the existing `checkRateLimit()` infrastructure from
 * `src/auth/rate-limiter.ts` which provides Redis INCR+EXPIRE sliding
 * window and graceful degradation on Redis failure.
 *
 * Placement: mounted on the OIDC router **after** the request body parser so
 * the client identifier is available, and before the provider callback. The
 * path regex ensures only the token and introspection endpoints are limited —
 * every other path passes through untouched.
 *
 * @module middleware/token-rate-limiter
 */

import type { Context, Middleware } from 'koa';
import { checkRateLimit } from '../auth/rate-limiter.js';
import type { RateLimitConfig } from '../auth/rate-limiter.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Constants — exported for test assertions and documentation
// ---------------------------------------------------------------------------

/**
 * Regex matching the OIDC token endpoint path.
 *
 * Pattern: `/<orgSlug>/token` where orgSlug starts with a
 * lowercase alphanumeric character followed by zero or more lowercase
 * alphanumeric or hyphen characters.
 *
 * Matches:  `/acme/token`, `/my-org/token`
 * Rejects:  `/api/admin/something`, `/acme/token/extra`
 */
export const TOKEN_PATH_REGEX = /^\/[a-z0-9][a-z0-9-]*\/token$/;

/**
 * Extract the presented OAuth client identifier for rate-limit bucketing.
 *
 * The identifier is read from the parsed form body (`client_secret_post`) or
 * from HTTP Basic credentials (`client_secret_basic`). It is a public value
 * used only to give each client its own counter, so reading it before the
 * provider authenticates the client is safe. When neither form is present the
 * key falls back to `unknown`, so unauthenticated spam from one address shares
 * a single budget.
 *
 * @param ctx - Koa context whose parsed body and Authorization header are read
 * @returns The presented client identifier, or `unknown` when none is present
 */
export function presentedClientId(ctx: Context): string {
  const body = ctx.request.body as Record<string, unknown> | undefined;
  const bodyClientId = body?.['client_id'];
  if (typeof bodyClientId === 'string' && bodyClientId.length > 0) {
    return bodyClientId;
  }
  const authorization = ctx.headers.authorization;
  if (authorization !== undefined && authorization.startsWith('Basic ')) {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator > 0) return decoded.slice(0, separator);
  }
  return 'unknown';
}

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

    const clientKey = presentedClientId(ctx);

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

// ---------------------------------------------------------------------------
// Introspection endpoint rate limiter
// ---------------------------------------------------------------------------

/**
 * Regex matching the OIDC token introspection endpoint path.
 *
 * Pattern: `/<orgSlug>/token/introspection` where orgSlug uses
 * the same slug format as TOKEN_PATH_REGEX.
 *
 * Matches:  `/acme/token/introspection`, `/my-org/token/introspection`
 * Rejects:  `/acme/token`, `/api/admin/introspection`
 */
export const INTROSPECTION_PATH_REGEX = /^\/[a-z0-9][a-z0-9-]*\/token\/introspection$/;

/**
 * Rate limit configuration for the introspection endpoint.
 *
 * 100 requests per 60-second window — higher than the token endpoint
 * because introspection is used by resource servers to validate tokens
 * on every API call.  The higher limit accommodates legitimate traffic
 * while still preventing token enumeration attacks.
 */
export const INTROSPECTION_RATE_LIMIT: RateLimitConfig = {
  max: 100,
  windowSeconds: 60,
};

/**
 * Create the introspection endpoint rate limiter middleware.
 *
 * Only intercepts `POST` requests to paths matching
 * `INTROSPECTION_PATH_REGEX`.  Sets informational `X-RateLimit-*`
 * headers and returns a `429` with an OAuth-format error body when
 * the limit is exceeded.
 *
 * Key format: `ratelimit:introspect:{ip}:{clientId}` — composite key
 * per-IP + per-client_id for granular rate limiting.
 *
 * @returns Koa middleware that rate-limits the OIDC introspection endpoint
 */
export function introspectionRateLimiter(): Middleware {
  return async function introspectionRateLimiterMiddleware(ctx, next) {
    // Only rate-limit POST to the introspection endpoint.
    if (ctx.method !== 'POST' || !INTROSPECTION_PATH_REGEX.test(ctx.path)) {
      return next();
    }

    const clientKey = presentedClientId(ctx);

    // Composite key: per-IP + per-client_id — separate namespace from
    // the token endpoint to keep counters independent.
    const key = `ratelimit:introspect:${ctx.ip}:${clientKey}`;

    const result = await checkRateLimit(key, INTROSPECTION_RATE_LIMIT);

    // Informational headers on all matched responses.
    ctx.set('X-RateLimit-Limit', String(INTROSPECTION_RATE_LIMIT.max));
    ctx.set('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      logger.warn(
        {
          action: 'introspection_rate_limit_exceeded',
          ip: ctx.ip,
          clientId: clientKey,
          path: ctx.path,
        },
        'Introspection endpoint rate limit exceeded',
      );

      ctx.status = 429;
      ctx.set('Retry-After', String(result.retryAfter));
      // OAuth 2.0 error format — resource servers parsing introspection
      // errors can handle this structured response.
      ctx.body = {
        error: 'rate_limit_exceeded',
        error_description:
          'Too many introspection requests. Please try again later.',
        retry_after: result.retryAfter,
      };
      return;
    }

    return next();
  };
}

