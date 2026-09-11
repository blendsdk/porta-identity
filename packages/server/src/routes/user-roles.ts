/**
 * User-role assignment API routes.
 *
 * All routes are under `/api/admin/organizations/:orgId/users/:userId/roles`
 * and require admin authorization with granular permissions. Provides
 * endpoints for managing role assignments on a per-user basis and
 * resolving effective permissions.
 *
 * Route structure:
 *   GET    /              — List roles for a user
 *   PUT    /              — Assign roles to a user
 *   DELETE /              — Remove roles from a user
 *   GET    /permissions   — List resolved permissions for a user
 *
 * Error mapping:
 *   RoleNotFoundError → 404
 *   RbacValidationError → 400
 *   ZodError → 400 with validation details
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { requireUserOrganization } from '../middleware/require-user-organization.js';
import { ADMIN_PERMISSIONS, getPermissionsForAdminRole } from '../lib/admin-permissions.js';
import { guardSuperAdmin } from '../lib/super-admin-protection.js';
import { getApplicationBySlug } from '../applications/service.js';
import * as roleService from '../rbac/role-service.js';
import * as userRoleService from '../rbac/user-role-service.js';
import { RoleDelegationError, RoleNotFoundError, RbacValidationError } from '../rbac/errors.js';
import { UserNotFoundError, UserValidationError } from '../users/errors.js';

const ADMIN_APPLICATION_SLUG = 'porta-admin';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/** Schema for assigning/removing roles (array of UUIDs) */
const roleIdsSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1),
});

// ---------------------------------------------------------------------------
// Error handler helper
// ---------------------------------------------------------------------------

/**
 * Handle domain errors and map them to HTTP responses.
 * Unknown errors are re-thrown for the global error handler.
 */
function handleError(
  ctx: { status: number; body: unknown; throw: (status: number, msg: string) => never },
  err: unknown,
): never {
  if (err instanceof RoleNotFoundError) {
    ctx.throw(404, 'Role not found');
  }
  if (err instanceof UserNotFoundError) {
    ctx.throw(404, 'User not found');
  }
  if (err instanceof RoleDelegationError) {
    ctx.throw(403, 'Role assignment is not permitted');
  }
  if (err instanceof UserValidationError) {
    ctx.throw(409, 'At least one active super administrator is required');
  }
  if (err instanceof RbacValidationError) {
    ctx.throw(400, 'Role assignment request is invalid');
  }
  if (err instanceof z.ZodError) {
    ctx.status = 400;
    ctx.body = { error: 'Role assignment request is invalid' };
    return undefined as never;
  }
  throw err;
}

/**
 * Reject an assignment that exceeds the authenticated actor's static Admin capabilities.
 *
 * This route check provides an early sanitized response. The service repeats the decision from
 * locked database state so direct callers and concurrent changes cannot bypass it.
 */
async function requireDelegableRoles(
  applicationRoleIds: readonly string[],
  actorPermissions: readonly string[],
): Promise<void> {
  const adminApplication = await getApplicationBySlug(ADMIN_APPLICATION_SLUG);
  if (!adminApplication) return;
  const actorCapabilities = new Set(actorPermissions);

  for (const roleId of applicationRoleIds) {
    const role = await roleService.findRoleById(adminApplication.id, roleId);
    // A null result means this is not a canonical Admin role. The service still locks and validates
    // every requested role globally before assignment, including ordinary application roles.
    if (!role) continue;
    if (role.applicationId !== adminApplication.id) continue;
    if (
      getPermissionsForAdminRole(role.slug).some((capability) => !actorCapabilities.has(capability))
    ) {
      throw new RoleDelegationError();
    }
  }
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the user-role assignment router.
 *
 * All routes require admin authorization with granular permissions.
 * User-role assignments are scoped to a user within an organization
 * via :orgId and :userId URL parameters.
 *
 * Prefix: /api/admin/organizations/:orgId/users/:userId/roles
 *
 * @returns Configured Koa Router
 */
export function createUserRoleRouter(): Router {
  const router = new Router({ prefix: '/api/admin/organizations/:orgId/users/:userId/roles' });

  // All routes require admin authentication
  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // GET / — List roles for user
  // -------------------------------------------------------------------------
  router.get(
    '/',
    requirePermission(ADMIN_PERMISSIONS.ROLE_READ),
    requireUserOrganization(),
    async (ctx) => {
      try {
        const roles = await userRoleService.getUserRoles(ctx.params.orgId, ctx.params.userId);
        ctx.body = { data: roles };
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // PUT / — Assign roles to user
  // -------------------------------------------------------------------------
  router.put(
    '/',
    requirePermission(ADMIN_PERMISSIONS.ROLE_ASSIGN),
    requireUserOrganization(),
    async (ctx) => {
      try {
        const body = roleIdsSchema.parse(ctx.request.body);
        const actor = ctx.state.adminUser;
        if (!actor) {
          ctx.throw(401, 'Authentication required');
          return;
        }
        await requireDelegableRoles(body.roleIds, actor.permissions);
        await userRoleService.assignRolesToUser(
          ctx.params.orgId,
          ctx.params.userId,
          body.roleIds,
          actor.id,
        );
        ctx.status = 204;
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // DELETE / — Remove roles from user
  // -------------------------------------------------------------------------
  router.delete(
    '/',
    requirePermission(ADMIN_PERMISSIONS.ROLE_ASSIGN),
    requireUserOrganization(),
    async (ctx) => {
      try {
        const body = roleIdsSchema.parse(ctx.request.body);
        await guardSuperAdmin(ctx.params.userId, 'remove-super-admin-role');
        const actor = ctx.state.adminUser;
        if (!actor) {
          ctx.throw(401, 'Authentication required');
          return;
        }
        const result = await userRoleService.removeRolesFromUser(
          ctx.params.orgId,
          ctx.params.userId,
          body.roleIds,
          actor.id,
        );
        ctx.status = 200;
        ctx.body = { data: result };
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /permissions — List resolved permissions for user
  // Resolves all permissions across all assigned roles (deduplicated)
  // -------------------------------------------------------------------------
  router.get(
    '/permissions',
    requirePermission(ADMIN_PERMISSIONS.ROLE_READ),
    requireUserOrganization(),
    async (ctx) => {
      try {
        const permissions = await userRoleService.getUserPermissions(
          ctx.params.orgId,
          ctx.params.userId,
        );
        ctx.body = { data: permissions };
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  return router;
}
