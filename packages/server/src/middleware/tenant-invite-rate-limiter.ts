/**
 * Tenant invitation rate limiter.
 *
 * Sits after tenant invitation authentication so the counter can be keyed by
 * the authenticated user or service client instead of a shared IP address.
 * The limit is intentionally small because invitations send email and create
 * durable invitation records.
 *
 * @module middleware/tenant-invite-rate-limiter
 */

import type { Middleware } from 'koa';
import { checkRateLimit } from '../auth/rate-limiter.js';
import type { RateLimitConfig } from '../auth/rate-limiter.js';
import { logger } from '../lib/logger.js';

/** Invitation limit per actor and organization. */
export const TENANT_INVITE_RATE_LIMIT: RateLimitConfig = {
  max: 30,
  windowSeconds: 3600,
};

/**
 * Create the tenant invitation rate limiter.
 *
 * @returns Koa middleware that limits authenticated invitation requests
 */
export function tenantInviteRateLimiter(): Middleware {
  return async function tenantInviteRateLimiterMiddleware(ctx, next) {
    const actor = ctx.state.tenantInviteActor;
    if (!actor) return next();

    const key =
      actor.kind === 'user'
        ? `ratelimit:tenant-invite:user:${actor.organizationId}:${actor.userId}`
        : `ratelimit:tenant-invite:client:${actor.organizationId}:${actor.clientId}`;

    const result = await checkRateLimit(key, TENANT_INVITE_RATE_LIMIT);
    ctx.set('X-RateLimit-Limit', String(TENANT_INVITE_RATE_LIMIT.max));
    ctx.set('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      logger.warn(
        {
          action: 'tenant_invite_rate_limit_exceeded',
          actorKind: actor.kind,
        },
        'Tenant invitation rate limit exceeded',
      );
      ctx.status = 429;
      ctx.set('Retry-After', String(result.retryAfter));
      ctx.body = {
        error: 'Too Many Requests',
        message: 'Invitation rate limit exceeded. Please try again later.',
        retry_after: result.retryAfter,
      };
      return;
    }

    return next();
  };
}
