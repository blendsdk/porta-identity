/**
 * Tenant-scoped user invitation route.
 *
 * This is the BFF-facing companion to `/api/admin/organizations/:orgId/users`.
 * It accepts either a tenant service client-credentials token or a tenant
 * user's access token, and it only allows roles and claims owned by the token
 * client's application.
 *
 * @module routes/tenant-invitations
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireTenantInviteAuth } from '../middleware/tenant-invite-auth.js';
import type { TenantInviteTokenProvider } from '../middleware/tenant-invite-auth.js';
import { tenantInviteRateLimiter } from '../middleware/tenant-invite-rate-limiter.js';
import { RoleDelegationError, RoleNotFoundError } from '../rbac/errors.js';
import {
  InviteConflictError,
  InviteOrganizationNotFoundError,
  InvitePreAssignmentError,
  InviteUserExistsError,
  inviteUser,
  inviteUserSchema,
} from '../users/invite-service.js';
import type { InviteActor } from '../users/invite-service.js';

/**
 * Map invitation domain errors to sanitized HTTP responses.
 *
 * @param ctx - Koa context
 * @param error - Unknown caught value
 */
function handleInviteError(
  ctx: { status: number; body: unknown; throw: (status: number, message: string) => never },
  error: unknown,
): never {
  if (error instanceof z.ZodError) {
    ctx.status = 400;
    ctx.body = { error: 'User request is invalid' };
    return undefined as never;
  }
  if (error instanceof InviteOrganizationNotFoundError) {
    ctx.throw(404, 'Organization not found');
  }
  if (error instanceof InviteUserExistsError) {
    ctx.status = 409;
    ctx.body = { error: 'User already exists in this organization' };
    return undefined as never;
  }
  if (error instanceof InviteConflictError) {
    ctx.status = 409;
    ctx.body = { error: 'A live invitation already exists for this email' };
    return undefined as never;
  }
  if (error instanceof InvitePreAssignmentError) {
    ctx.status = 400;
    ctx.body = { error: 'User request is invalid' };
    return undefined as never;
  }
  if (error instanceof RoleDelegationError) {
    ctx.status = 403;
    ctx.body = { error: 'Forbidden', message: 'The requested operation is not permitted' };
    return undefined as never;
  }
  if (error instanceof RoleNotFoundError) {
    ctx.status = 400;
    ctx.body = { error: 'User request is invalid' };
    return undefined as never;
  }
  throw error;
}

/**
 * Create the tenant invitation router.
 *
 * @param provider - OIDC provider token models used by the auth middleware
 * @returns Configured Koa router
 */
export function createTenantInviteRouter(provider?: TenantInviteTokenProvider): Router {
  const router = new Router({ prefix: '/api/organizations/:orgId/users' });

  router.use(requireTenantInviteAuth(provider));

  router.post('/invite', tenantInviteRateLimiter(), async (ctx) => {
    try {
      const body = inviteUserSchema.parse(ctx.request.body);
      if (body.claims?.length) {
        // Role assignment is the supported tenant workflow in this iteration.
        // Custom claim pre-assignment remains a control-plane capability.
        ctx.status = 400;
        ctx.body = { error: 'User request is invalid' };
        return;
      }

      const actor = ctx.state.tenantInviteActor;
      if (!actor) {
        ctx.status = 401;
        ctx.body = { error: 'Authentication required' };
        return;
      }

      const inviteActor: InviteActor =
        actor.kind === 'service'
          ? {
              kind: 'service',
              clientId: actor.clientId,
              displayName: actor.displayName,
            }
          : {
              kind: 'user',
              userId: actor.userId,
              displayName: actor.displayName,
              permissions: actor.permissions,
            };

      const result = await inviteUser({
        organizationId: ctx.params.orgId,
        input: body,
        actor: inviteActor,
        allowedApplicationId: actor.applicationId,
      });

      ctx.status = 201;
      ctx.body = { data: result };
    } catch (error) {
      handleInviteError(ctx, error);
    }
  });

  return router;
}
