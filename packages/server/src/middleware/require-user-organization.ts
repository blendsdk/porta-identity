/**
 * Organization-membership guard for user-specific administrative routes.
 *
 * This middleware must run after authentication and permission checks. Returning the same 404 for
 * an absent user, an invalid identifier, and a user owned by another organization prevents the
 * organization-prefixed API from becoming a cross-tenant object lookup or membership oracle.
 */

import type { Middleware } from 'koa';
import { z } from 'zod';

import { findUserById } from '../users/repository.js';
import { recordSecurityDecision, recordSecurityReference } from '../security/decision-context.js';

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
      recordSecurityDecision(ctx, {
        decisionPoint: 'resource',
        reasonCode: 'resource-not-found',
        outcome: 'deny',
        detail: { resourceType: 'user' },
      });
      ctx.status = 404;
      ctx.body = { error: 'User not found' };
      return;
    }

    // Authorization must use the live row. A cache miss inside a mutation transaction would
    // otherwise register a post-commit cache write for a user the same request may delete.
    const user = await findUserById(parsed.data.userId);
    if (user === null || user.organizationId !== parsed.data.orgId) {
      recordSecurityDecision(ctx, {
        decisionPoint: 'resource',
        reasonCode: 'resource-not-found',
        outcome: 'deny',
        detail: { resourceType: 'user' },
      });
      ctx.status = 404;
      ctx.body = { error: 'User not found' };
      return;
    }

    recordSecurityReference(ctx, 'resource', parsed.data.userId);

    await next();
  };
}
