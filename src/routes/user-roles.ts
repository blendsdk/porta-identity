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
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import * as userRoleService from '../rbac/user-role-service.js';
import { RoleNotFoundError, RbacValidationError } from '../rbac/errors.js';

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
function handleError(ctx: { status: number; body: unknown; throw: (status: number, msg: string) => never }, err: unknown): never {
  if (err instanceof RoleNotFoundError) {
    ctx.throw(404, err.message);
  }
  if (err instanceof RbacValidationError) {
    ctx.throw(400, err.message);
  }
  if (err instanceof z.ZodError) {
    ctx.status = 400;
    ctx.body = { error: 'Validation failed', details: err.issues };
    return undefined as never;
  }
  throw err;
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
  router.get('/', requirePermission(ADMIN_PERMISSIONS.ROLE_READ), async (ctx) => {
    try {
      const roles = await userRoleService.getUserRoles(ctx.params.userId);
      ctx.body = { data: roles };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // PUT / — Assign roles to user
  // -------------------------------------------------------------------------
  router.put('/', requirePermission(ADMIN_PERMISSIONS.ROLE_ASSIGN), async (ctx) => {
    try {
      const body = roleIdsSchema.parse(ctx.request.body);
      await userRoleService.assignRolesToUser(ctx.params.userId, body.roleIds);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // DELETE / — Remove roles from user
  // -------------------------------------------------------------------------
  router.delete('/', requirePermission(ADMIN_PERMISSIONS.ROLE_ASSIGN), async (ctx) => {
    try {
      const body = roleIdsSchema.parse(ctx.request.body);
      await userRoleService.removeRolesFromUser(ctx.params.userId, body.roleIds);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /permissions — List resolved permissions for user
  // Resolves all permissions across all assigned roles (deduplicated)
  // -------------------------------------------------------------------------
  router.get('/permissions', requirePermission(ADMIN_PERMISSIONS.ROLE_READ), async (ctx) => {
    try {
      const permissions = await userRoleService.getUserPermissions(ctx.params.userId);
      ctx.body = { data: permissions };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  return router;
}
