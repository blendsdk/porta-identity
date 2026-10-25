/**
 * Tenant user write and delete rate limiters.
 *
 * The limiter runs after tenant authentication so the counter is keyed by the
 * authenticated organization and service client. Reads are not limited in this
 * slice; writes and permanent deletes have separate budgets.
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

/** Permanent-delete budget for one client and organization per hour. */
export const TENANT_USER_DELETE_RATE_LIMIT: RateLimitConfig = {
  max: 60,
  windowSeconds: 3600,
};

/** Build the Redis key for one limiter bucket. */
function rateLimitKey(
  bucket: 'write' | 'delete',
  actor: Extract<TenantActor, { kind: 'service' | 'user' }>,
): string {
  return actor.kind === 'service'
    ? `ratelimit:tenant-user:${bucket}:${actor.organizationId}:${actor.clientId}`
    : `ratelimit:tenant-user:${bucket}:${actor.organizationId}:user:${actor.userId}`;
}

/** Create one tenant user limiter for the requested bucket. */
function createLimiter(bucket: 'write' | 'delete', config: RateLimitConfig): Middleware {
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

/** Limit permanent tenant user deletes. */
export function tenantUserDeleteRateLimiter(): Middleware {
  return createLimiter('delete', TENANT_USER_DELETE_RATE_LIMIT);
}
