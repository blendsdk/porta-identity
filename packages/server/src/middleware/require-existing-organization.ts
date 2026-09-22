/**
 * Organization-existence guard for organization-prefixed administrative routes.
 *
 * A route value that is not a canonical UUID, or that names no organization, must produce one
 * non-enumerating not-found response. Without this guard the identifier reaches the database and a
 * malformed value surfaces as an internal error instead of a client-visible rejection.
 *
 * Place this middleware after `requirePermission(...)` so a caller without the operation's
 * permission still receives the permission denial before any organization lookup.
 */

import type { Middleware } from 'koa';
import { z } from 'zod';

import { getOrganizationById } from '../organizations/service.js';
import { recordSecurityDecision } from '../security/decision-context.js';

const organizationParamSchema = z.object({ orgId: z.string().uuid() });

/**
 * Require the organization named in the route path to exist.
 *
 * @returns Koa middleware that continues only for an existing organization.
 */
export function requireExistingOrganization(): Middleware {
  return async function requireExistingOrganizationMiddleware(ctx, next) {
    const parsed = organizationParamSchema.safeParse(ctx.params);
    const organization = parsed.success ? await getOrganizationById(parsed.data.orgId) : null;
    if (organization === null) {
      recordSecurityDecision(ctx, {
        decisionPoint: 'resource',
        reasonCode: 'resource-not-found',
        outcome: 'deny',
        detail: { resourceType: 'organization' },
      });
      ctx.status = 404;
      ctx.body = { error: 'Organization not found' };
      return;
    }
    await next();
  };
}
