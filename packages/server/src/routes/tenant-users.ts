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
import type { Context } from 'koa';
import {
  auditActorColumns,
  tenantActorToAuditActor,
  writeAuditLog,
} from '../lib/audit-log.js';
import type { AuditRequestContext } from '../lib/audit-log.js';
import { checkIfMatch, setETagHeader } from '../lib/etag.js';
import { requireExistingOrganization } from '../middleware/require-existing-organization.js';
import { requireTenantActorAuth } from '../middleware/tenant-user-auth.js';
import type { TenantActor, TenantTokenProvider } from '../middleware/tenant-user-auth.js';
import { requireUserOrganization } from '../middleware/require-user-organization.js';
import { tenantInviteRateLimiter } from '../middleware/tenant-invite-rate-limiter.js';
import {
  tenantUserDeleteRateLimiter,
  tenantUserWriteRateLimiter,
} from '../middleware/tenant-user-rate-limiter.js';
import {
  TENANT_INVITE_PERMISSION,
  TENANT_INVITE_SCOPE,
  TENANT_USER_DELETE_SCOPE,
  TENANT_USER_READ_SCOPE,
  TENANT_USER_WRITE_SCOPE,
} from '../oidc/scopes.js';
import {
  assignRolesToUser,
  getUserPermissions,
  getUserRoles,
  removeRolesFromUser,
} from '../rbac/user-role-service.js';
import { UserValidationError } from '../users/errors.js';
import { inviteUser, inviteUserSchema } from '../users/invite-service.js';
import type { InviteActor } from '../users/invite-service.js';
import {
  activateUser,
  createUser,
  deactivateUser,
  deleteUser,
  getUserById,
  listUsersByOrganization,
  listUsersCursor,
  updateUser,
} from '../users/service.js';
import {
  listUsersCursorSchema,
  listUsersSchema,
  roleIdsSchema,
  tenantCreateUserSchema,
  tenantUpdateUserSchema,
} from '../users/schemas.js';
import { handleUserRouteError } from './user-error-handler.js';

/** Capture trusted request metadata for mutation and read audit. */
function auditContext(ctx: Context): AuditRequestContext {
  const userAgent = ctx.get('user-agent');
  return {
    ...(ctx.ip ? { ipAddress: ctx.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}

/** Return the authenticated service actor, or write the fixed missing-auth response. */
function serviceActor(
  ctx: Context,
): Extract<TenantActor, { kind: 'service' }> | undefined {
  const actor = ctx.state.tenantActor;
  if (!actor || actor.kind !== 'service') {
    ctx.status = 401;
    ctx.body = { error: 'Authentication required' };
    return undefined;
  }
  return actor;
}

/** Map tenant user/role/invite errors with the tenant duplicate-email policy. */
function handleTenantError(ctx: Context, error: unknown): never {
  return handleUserRouteError(ctx, error, { duplicateEmailStatus: 409 });
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
    '/',
    requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service'],
      requiredScope: TENANT_USER_WRITE_SCOPE,
    }),
    requireExistingOrganization(),
    tenantUserWriteRateLimiter(),
    async (ctx) => {
      try {
        const body = tenantCreateUserSchema.parse(ctx.request.body);
        const actor = serviceActor(ctx);
        if (!actor) return;

        const user = await createUser(
          { ...body, organizationId: ctx.params.orgId },
          tenantActorToAuditActor(actor),
          auditContext(ctx),
        );
        setETagHeader(ctx, 'user', user.id, user.updatedAt);
        ctx.status = 201;
        ctx.body = { data: user };
      } catch (error) {
        handleTenantError(ctx, error);
      }
    },
  );

  router.get(
    '/',
    requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service'],
      requiredScope: TENANT_USER_READ_SCOPE,
    }),
    requireExistingOrganization(),
    async (ctx) => {
      try {
        const actor = serviceActor(ctx);
        if (!actor) return;

        if (ctx.query.cursor !== undefined || ctx.query.limit !== undefined) {
          const query = listUsersCursorSchema.parse(ctx.query);
          const result = await listUsersCursor({ organizationId: ctx.params.orgId, ...query });
          await writeAuditLog({
            organizationId: ctx.params.orgId,
            ...auditActorColumns(tenantActorToAuditActor(actor)),
            eventType: 'user.listed',
            eventCategory: 'security',
            metadata: {
              source: 'tenant-user-api',
              limit: query.limit,
              search: query.search ?? null,
              status: query.status ?? null,
              sortBy: query.sortBy,
              sortOrder: query.sortOrder,
              resultCount: result.data.length,
            },
            ...auditContext(ctx),
          });
          ctx.body = result;
          return;
        }

        const query = listUsersSchema.parse(ctx.query);
        const result = await listUsersByOrganization({
          organizationId: ctx.params.orgId,
          ...query,
        });
        await writeAuditLog({
          organizationId: ctx.params.orgId,
          ...auditActorColumns(tenantActorToAuditActor(actor)),
          eventType: 'user.listed',
          eventCategory: 'security',
          metadata: {
            source: 'tenant-user-api',
            page: query.page,
            pageSize: query.pageSize,
            search: query.search ?? null,
            status: query.status ?? null,
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
            resultCount: result.data.length,
          },
          ...auditContext(ctx),
        });
        ctx.body = result;
      } catch (error) {
        handleTenantError(ctx, error);
      }
    },
  );

  router.get(
    '/:userId',
    requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service'],
      requiredScope: TENANT_USER_READ_SCOPE,
    }),
    requireUserOrganization(),
    async (ctx) => {
      try {
        const actor = serviceActor(ctx);
        if (!actor) return;

        const user = await getUserById(ctx.params.userId);
        if (!user) {
          ctx.status = 404;
          ctx.body = { error: 'User not found' };
          return;
        }

        setETagHeader(ctx, 'user', user.id, user.updatedAt);
        await writeAuditLog({
          organizationId: ctx.params.orgId,
          userId: user.id,
          ...auditActorColumns(tenantActorToAuditActor(actor)),
          eventType: 'user.read',
          eventCategory: 'security',
          metadata: { source: 'tenant-user-api' },
          ...auditContext(ctx),
        });
        ctx.body = { data: user };
      } catch (error) {
        handleTenantError(ctx, error);
      }
    },
  );

  router.put(
    '/:userId',
    requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service'],
      requiredScope: TENANT_USER_WRITE_SCOPE,
    }),
    requireUserOrganization(),
    tenantUserWriteRateLimiter(),
    async (ctx) => {
      try {
        const body = tenantUpdateUserSchema.parse(ctx.request.body);
        const actor = serviceActor(ctx);
        if (!actor) return;

        const current = await getUserById(ctx.params.userId);
        if (!current) {
          ctx.status = 404;
          ctx.body = { error: 'User not found' };
          return;
        }
        if (!checkIfMatch(ctx, 'user', current.id, current.updatedAt, current)) return;

        const effectivePhone =
          body.phoneNumber !== undefined ? body.phoneNumber : current.phoneNumber;
        const effectiveVerified =
          body.phoneNumberVerified !== undefined
            ? body.phoneNumberVerified
            : current.phoneNumberVerified;
        if (effectiveVerified && !effectivePhone) {
          throw new UserValidationError('A phone number is required when phoneNumberVerified is true');
        }

        const input = { ...body, address: body.address ?? undefined };
        const user = await updateUser(
          ctx.params.userId,
          input,
          tenantActorToAuditActor(actor),
          auditContext(ctx),
        );
        setETagHeader(ctx, 'user', user.id, user.updatedAt);
        ctx.body = { data: user };
      } catch (error) {
        handleTenantError(ctx, error);
      }
    },
  );

  router.post(
    '/:userId/deactivate',
    requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service'],
      requiredScope: TENANT_USER_WRITE_SCOPE,
    }),
    requireUserOrganization(),
    tenantUserWriteRateLimiter(),
    async (ctx) => {
      try {
        const actor = serviceActor(ctx);
        if (!actor) return;
        await deactivateUser(
          ctx.params.userId,
          tenantActorToAuditActor(actor),
          auditContext(ctx),
        );
        ctx.status = 204;
      } catch (error) {
        handleTenantError(ctx, error);
      }
    },
  );

  router.post(
    '/:userId/activate',
    requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service'],
      requiredScope: TENANT_USER_WRITE_SCOPE,
    }),
    requireUserOrganization(),
    tenantUserWriteRateLimiter(),
    async (ctx) => {
      try {
        const actor = serviceActor(ctx);
        if (!actor) return;
        await activateUser(
          ctx.params.userId,
          tenantActorToAuditActor(actor),
          auditContext(ctx),
        );
        ctx.status = 204;
      } catch (error) {
        handleTenantError(ctx, error);
      }
    },
  );

  router.delete(
    '/:userId',
    requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service'],
      requiredScope: TENANT_USER_DELETE_SCOPE,
    }),
    requireUserOrganization(),
    tenantUserDeleteRateLimiter(),
    async (ctx) => {
      try {
        const actor = serviceActor(ctx);
        if (!actor) return;
        await deleteUser(
          ctx.params.orgId,
          ctx.params.userId,
          tenantActorToAuditActor(actor),
          auditContext(ctx),
        );
        ctx.status = 204;
      } catch (error) {
        handleTenantError(ctx, error);
      }
    },
  );

  router.get(
    '/:userId/roles',
    requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service'],
      requiredScope: TENANT_USER_READ_SCOPE,
    }),
    requireUserOrganization(),
    async (ctx) => {
      try {
        const actor = serviceActor(ctx);
        if (!actor) return;
        const roles = await getUserRoles(
          ctx.params.orgId,
          ctx.params.userId,
          actor.applicationId,
        );
        ctx.body = { data: roles };
      } catch (error) {
        handleTenantError(ctx, error);
      }
    },
  );

  router.get(
    '/:userId/roles/permissions',
    requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service'],
      requiredScope: TENANT_USER_READ_SCOPE,
    }),
    requireUserOrganization(),
    async (ctx) => {
      try {
        const actor = serviceActor(ctx);
        if (!actor) return;
        const permissions = await getUserPermissions(
          ctx.params.orgId,
          ctx.params.userId,
          actor.applicationId,
        );
        ctx.body = { data: permissions };
      } catch (error) {
        handleTenantError(ctx, error);
      }
    },
  );

  router.put(
    '/:userId/roles',
    requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service'],
      requiredScope: TENANT_USER_WRITE_SCOPE,
    }),
    requireUserOrganization(),
    tenantUserWriteRateLimiter(),
    async (ctx) => {
      try {
        const actor = serviceActor(ctx);
        if (!actor) return;
        const body = roleIdsSchema.parse(ctx.request.body);
        await assignRolesToUser({
          organizationId: ctx.params.orgId,
          userId: ctx.params.userId,
          roleIds: body.roleIds,
          actor: tenantActorToAuditActor(actor),
          allowedApplicationId: actor.applicationId,
          auditContext: auditContext(ctx),
        });
        ctx.status = 204;
      } catch (error) {
        handleTenantError(ctx, error);
      }
    },
  );

  router.delete(
    '/:userId/roles',
    requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service'],
      requiredScope: TENANT_USER_WRITE_SCOPE,
    }),
    requireUserOrganization(),
    tenantUserWriteRateLimiter(),
    async (ctx) => {
      try {
        const actor = serviceActor(ctx);
        if (!actor) return;
        const body = roleIdsSchema.parse(ctx.request.body);
        const result = await removeRolesFromUser({
          organizationId: ctx.params.orgId,
          userId: ctx.params.userId,
          roleIds: body.roleIds,
          actor: tenantActorToAuditActor(actor),
          allowedApplicationId: actor.applicationId,
          auditContext: auditContext(ctx),
        });
        ctx.status = 200;
        ctx.body = { data: result };
      } catch (error) {
        handleTenantError(ctx, error);
      }
    },
  );

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
        handleTenantError(ctx, error);
      }
    },
  );

  return router;
}
