/**
 * Admin API rate limiter middleware.
 *
 * Protects state-changing admin endpoints (POST/PUT/PATCH/DELETE on
 * `/api/admin/*`) against brute-force attacks and automated abuse.
 * GET requests are read-only and pass through without rate limiting.
 *
 * Key format: `ratelimit:admin:{ip}` — per-IP only since admin-auth
 * already restricts access to authenticated super-admin users.  There
 * is no per-user key because the IP-based counter is sufficient:
 * legitimate admins won't make 60 write requests per minute, and
 * attackers from the same IP are blocked regardless of identity.
 *
 * Limit: 60 requests / 60 seconds (sliding window).
 *
 * Reuses `checkRateLimit()` from `src/auth/rate-limiter.ts` which
 * provides Redis INCR+EXPIRE sliding window and graceful degradation
 * on Redis failure (allows request + logs warning).
 *
 * Placement: mount as global middleware in `src/server.ts` before the
 * admin route routers.  The path + method check ensures only write
 * requests to `/api/admin/*` are counted.
 *
 * @module middleware/admin-rate-limiter
 */

import type { Middleware } from 'koa';
import { checkRateLimit } from '../auth/rate-limiter.js';
import type { RateLimitConfig } from '../auth/rate-limiter.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Constants — exported for test assertions and documentation
// ---------------------------------------------------------------------------

/** Path prefix for admin API routes. */
export const ADMIN_PATH_PREFIX = '/api/admin/';

/**
 * HTTP methods that are considered state-changing (write operations).
 * Only these methods are rate-limited; GET/HEAD/OPTIONS pass through.
 */
export const ADMIN_WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Rate limit configuration for admin API write operations.
 *
 * 60 requests per 60-second window — generous enough for admin
 * workflows (bulk operations, rapid CRUD during setup) while catching
 * automated abuse or runaway scripts.
 */
export const ADMIN_RATE_LIMIT: RateLimitConfig = {
  max: 60,
  windowSeconds: 60,
};

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create the admin API rate limiter middleware.
 *
 * Only intercepts requests that match ALL of:
 *   - Path starts with `/api/admin/`
 *   - Method is POST, PUT, PATCH, or DELETE
 *
 * Sets informational `X-RateLimit-*` headers on every matched response
 * and returns `429` with a JSON error body when the limit is exceeded.
 *
 * @returns Koa middleware that rate-limits admin API write operations
 */
export function adminRateLimiter(): Middleware {
  return async function adminRateLimiterMiddleware(ctx, next) {
    // Only rate-limit write methods on admin API paths — GETs and
    // non-admin paths pass through immediately without touching Redis.
    if (!ctx.path.startsWith(ADMIN_PATH_PREFIX) || !ADMIN_WRITE_METHODS.has(ctx.method)) {
      return next();
    }

    // Per-IP key — no user identifier needed since admin-auth already
    // filters out unauthenticated requests, and legitimate admins
    // won't hit 60 writes/minute under normal conditions.
    const key = `ratelimit:admin:${ctx.ip}`;

    const result = await checkRateLimit(key, ADMIN_RATE_LIMIT);

    // Informational headers on all matched responses — helps admin
    // clients (CLI, dashboards) monitor their usage.
    ctx.set('X-RateLimit-Limit', String(ADMIN_RATE_LIMIT.max));
    ctx.set('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      logger.warn(
        {
          action: 'admin_rate_limit_exceeded',
          ip: ctx.ip,
          path: ctx.path,
          method: ctx.method,
        },
        'Admin API rate limit exceeded',
      );

      ctx.status = 429;
      ctx.set('Retry-After', String(result.retryAfter));
      ctx.body = {
        error: 'Too Many Requests',
        message: 'Admin API rate limit exceeded. Please try again later.',
        retry_after: result.retryAfter,
      };
      return;
    }

    return next();
  };
}
