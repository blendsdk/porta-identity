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
import {
  ADMIN_PERMISSIONS,
  getPermissionsForAdminRole,
} from '../lib/admin-permissions.js';
import { guardSuperAdmin } from '../lib/super-admin-protection.js';
import * as userRoleService from '../rbac/user-role-service.js';
import * as roleService from '../rbac/role-service.js';
import { getApplicationBySlug } from '../applications/service.js';
import { RoleNotFoundError, RbacValidationError } from '../rbac/errors.js';

/** Immutable slug of the application that owns Porta's control-plane roles. */
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
 * Reject assignment of a canonical Admin role that contains authority the actor does not hold.
 * Ordinary application roles are unaffected because they have no Porta Admin significance.
 *
 * @param roleIds - Requested role identifiers.
 * @param actorPermissions - Static capabilities held by the authenticated administrator.
 * @returns `true` when every canonical target capability is held by the actor.
 * @throws RoleNotFoundError when a requested role does not exist.
 * @throws RbacValidationError when the canonical Admin application is unavailable.
 */
async function requireDelegableRoles(
  roleIds: string[],
  actorPermissions: readonly string[],
): Promise<boolean> {
  const adminApplication = await getApplicationBySlug(ADMIN_APPLICATION_SLUG);
  if (!adminApplication) {
    throw new RbacValidationError('Role assignment request is invalid');
  }

  const actorCapabilitySet = new Set(actorPermissions);
  const roles = await Promise.all(roleIds.map((roleId) => roleService.findRoleById(roleId)));

  for (let index = 0; index < roles.length; index += 1) {
    const role = roles[index];
    if (!role) throw new RoleNotFoundError(roleIds[index]);
    if (role.applicationId !== adminApplication.id) continue;

    const targetCapabilities = getPermissionsForAdminRole(role.slug);
    if (targetCapabilities.some((capability) => !actorCapabilitySet.has(capability))) {
      return false;
    }
  }
  return true;
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
        const roles = await userRoleService.getUserRoles(ctx.params.userId);
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
        if (!actor) ctx.throw(401, 'Authentication required');
        if (!(await requireDelegableRoles(body.roleIds, actor.permissions))) {
          ctx.throw(403, 'Role assignment is not permitted');
        }
        await userRoleService.assignRolesToUser(ctx.params.userId, body.roleIds, actor.id);
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
        await userRoleService.removeRolesFromUser(ctx.params.userId, body.roleIds);
        ctx.status = 204;
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
        const permissions = await userRoleService.getUserPermissions(ctx.params.userId);
        ctx.body = { data: permissions };
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  return router;
}
