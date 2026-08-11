/**
 * Organization-membership guard for user-specific administrative routes.
 *
 * This middleware must run after authentication and permission checks. Returning the same 404 for
 * an absent user, an invalid identifier, and a user owned by another organization prevents the
 * organization-prefixed API from becoming a cross-tenant object lookup or membership oracle.
 */

import type { Middleware } from 'koa';
import { z } from 'zod';

import { getUserById } from '../users/service.js';

const organizationUserParamsSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
});

/**
 * Requires the route's user to belong to the organization named in the same path.
 *
 * Place this middleware after `requirePermission(...)`. Callers without the operation's permission
 * must receive the permission denial before Porta performs or reveals a tenant-membership lookup.
 *
 * @returns Koa middleware that continues only for a matching organization and user.
 */
export function requireUserOrganization(): Middleware {
  return async function requireUserOrganizationMiddleware(ctx, next) {
    const parsed = organizationUserParamsSchema.safeParse(ctx.params);
    if (!parsed.success) {
      ctx.status = 404;
      ctx.body = { error: 'User not found' };
      return;
    }

    const user = await getUserById(parsed.data.userId);
    if (user === null || user.organizationId !== parsed.data.orgId) {
      ctx.status = 404;
      ctx.body = { error: 'User not found' };
      return;
    }

    await next();
  };
}
