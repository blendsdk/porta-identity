/**
 * Tenant user write and delete rate limiters.
 *
 * The limiter runs after tenant authentication so the counter is keyed by the
 * authenticated organization and service client. Reads are not limited in this
 * slice; create, update, and lifecycle writes share the write budget.
 *
 * @module middleware/tenant-user-rate-limiter
 */

import type { Middleware } from 'koa';
import { checkRateLimit } from '../auth/rate-limiter.js';
import type { RateLimitConfig } from '../auth/rate-limiter.js';
import { logger } from '../lib/logger.js';
import type { TenantActor } from './tenant-user-auth.js';

/** Write budget for one client and organization per hour. */
export const TENANT_USER_WRITE_RATE_LIMIT: RateLimitConfig = {
  max: 300,
  windowSeconds: 3600,
};

/** Build the Redis key for one limiter bucket. */
function rateLimitKey(
  bucket: 'write',
  actor: Extract<TenantActor, { kind: 'service' | 'user' }>,
): string {
  return actor.kind === 'service'
    ? `ratelimit:tenant-user:${bucket}:${actor.organizationId}:${actor.clientId}`
    : `ratelimit:tenant-user:${bucket}:${actor.organizationId}:user:${actor.userId}`;
}

/** Create one tenant user limiter for the requested bucket. */
function createLimiter(bucket: 'write', config: RateLimitConfig): Middleware {
  return async function tenantUserRateLimiterMiddleware(ctx, next) {
    const actor = ctx.state.tenantActor;
    if (!actor) return next();

    const key = rateLimitKey(bucket, actor);
    const result = await checkRateLimit(key, config);
    ctx.set('X-RateLimit-Limit', String(config.max));
    ctx.set('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      logger.warn(
        { action: `tenant_user_${bucket}_rate_limit_exceeded`, actorKind: actor.kind },
        'Tenant user rate limit exceeded',
      );
      ctx.status = 429;
      ctx.set('Retry-After', String(result.retryAfter));
      ctx.body = {
        error: 'Too Many Requests',
        message: 'Tenant user rate limit exceeded. Please try again later.',
        retry_after: result.retryAfter,
      };
      return;
    }

    return next();
  };
}

/** Limit tenant user create, update, lifecycle, and role writes. */
export function tenantUserWriteRateLimiter(): Middleware {
  return createLimiter('write', TENANT_USER_WRITE_RATE_LIMIT);
}
