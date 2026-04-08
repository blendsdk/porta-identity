/**
 * Super-admin authorization middleware.
 *
 * Requires the requesting organization (resolved by the tenant resolver)
 * to be the super-admin organization. Rejects non-super-admin requests
 * with HTTP 403.
 *
 * For RD-04, this checks ctx.state.organization.isSuperAdmin.
 * In future RDs (RD-07), this will also verify the authenticated
 * user's permissions within the super-admin org.
 *
 * Must be applied AFTER tenant resolver has set ctx.state.organization.
 */

import type { Middleware } from 'koa';

/**
 * Create middleware that requires super-admin organization access.
 *
 * @returns Koa middleware that rejects non-super-admin requests with 403
 */
export function requireSuperAdmin(): Middleware {
  return async (ctx, next) => {
    const org = ctx.state.organization;

    if (!org || !org.isSuperAdmin) {
      ctx.throw(403, 'Super-admin access required');
    }

    await next();
  };
}
