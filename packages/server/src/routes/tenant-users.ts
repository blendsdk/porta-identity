/**
 * Tenant-scoped user API.
 *
 * This router is the BFF-facing companion to the control-plane Admin API.
 * It accepts tenant service clients for user management and either a service
 * client or a tenant user for invitation. Every route applies its own actor,
 * scope, and boundary policy.
 *
 * @module routes/tenant-users
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireTenantActorAuth } from '../middleware/tenant-user-auth.js';
import type { TenantTokenProvider } from '../middleware/tenant-user-auth.js';
import { tenantInviteRateLimiter } from '../middleware/tenant-invite-rate-limiter.js';
import { TENANT_INVITE_PERMISSION, TENANT_INVITE_SCOPE } from '../oidc/scopes.js';
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
 * Create the tenant user router.
 *
 * @param provider - OIDC provider token models used by the auth middleware
 * @returns Configured Koa router
 */
export function createTenantUsersRouter(provider?: TenantTokenProvider): Router {
  const router = new Router({ prefix: '/api/organizations/:orgId/users' });

  router.post(
    '/invite',
    requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service', 'user'],
      requiredScope: TENANT_INVITE_SCOPE,
      requiredPermission: TENANT_INVITE_PERMISSION,
    }),
    tenantInviteRateLimiter(),
    async (ctx) => {
      try {
        const body = inviteUserSchema.parse(ctx.request.body);
        if (body.claims?.length) {
          // Role assignment is the supported tenant workflow in this iteration.
          // Custom claim pre-assignment remains a control-plane capability.
          ctx.status = 400;
          ctx.body = { error: 'User request is invalid' };
          return;
        }

        const actor = ctx.state.tenantActor;
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
          organizationId: actor.organizationId,
          input: body,
          actor: inviteActor,
          allowedApplicationId: actor.applicationId,
        });

        ctx.status = 201;
        ctx.body = { data: result };
      } catch (error) {
        handleInviteError(ctx, error);
      }
    },
  );

  return router;
}
