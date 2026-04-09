/**
 * Role management API routes.
 *
 * All routes are under `/api/admin/applications/:appId/roles` and
 * require super-admin authorization. Provides CRUD for roles,
 * permission assignment/removal, and user listing per role.
 *
 * Route structure:
 *   POST   /                       — Create a new role
 *   GET    /                       — List all roles for an application
 *   GET    /:roleId                — Get a role by ID
 *   PUT    /:roleId                — Update a role
 *   DELETE /:roleId                — Delete a role (?force=true)
 *   GET    /:roleId/permissions    — List permissions for a role
 *   PUT    /:roleId/permissions    — Assign permissions to a role
 *   DELETE /:roleId/permissions    — Remove permissions from a role
 *
 * Error mapping:
 *   RoleNotFoundError → 404
 *   PermissionNotFoundError → 404
 *   RbacValidationError → 400
 *   ZodError → 400 with validation details
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireSuperAdmin } from '../middleware/super-admin.js';
import * as roleService from '../rbac/role-service.js';
import * as userRoleService from '../rbac/user-role-service.js';
import { RoleNotFoundError, PermissionNotFoundError, RbacValidationError } from '../rbac/errors.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/** Schema for creating a new role */
const createRoleSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
});

/** Schema for updating a role (all fields optional) */
const updateRoleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
});

/** Schema for assigning/removing permissions (array of UUIDs) */
const permissionIdsSchema = z.object({
  permissionIds: z.array(z.string().uuid()).min(1),
});

/** Schema for listing users with a role (paginated, org-scoped) */
const listUsersWithRoleSchema = z.object({
  orgId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
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
  if (err instanceof PermissionNotFoundError) {
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
 * Create the role management router.
 *
 * All routes require super-admin authorization. Roles are scoped to
 * an application via the :appId URL parameter.
 *
 * Prefix: /api/admin/applications/:appId/roles
 *
 * @returns Configured Koa Router
 */
export function createRoleRouter(): Router {
  const router = new Router({ prefix: '/api/admin/applications/:appId/roles' });

  // All routes require super-admin access
  router.use(requireSuperAdmin());

  // -------------------------------------------------------------------------
  // POST / — Create role
  // -------------------------------------------------------------------------
  router.post('/', async (ctx) => {
    try {
      const body = createRoleSchema.parse(ctx.request.body);
      const role = await roleService.createRole({
        applicationId: ctx.params.appId,
        ...body,
      });
      ctx.status = 201;
      ctx.body = { data: role };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET / — List roles for application
  // -------------------------------------------------------------------------
  router.get('/', async (ctx) => {
    try {
      const roles = await roleService.listRolesByApplication(ctx.params.appId);
      ctx.body = { data: roles };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:roleId — Get role by ID
  // -------------------------------------------------------------------------
  router.get('/:roleId', async (ctx) => {
    const role = await roleService.findRoleById(ctx.params.roleId);
    if (!role) {
      ctx.throw(404, 'Role not found');
    }
    ctx.body = { data: role };
  });

  // -------------------------------------------------------------------------
  // PUT /:roleId — Update role
  // -------------------------------------------------------------------------
  router.put('/:roleId', async (ctx) => {
    try {
      const body = updateRoleSchema.parse(ctx.request.body);
      const role = await roleService.updateRole(ctx.params.roleId, body);
      ctx.body = { data: role };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /:roleId — Delete role
  // Supports ?force=true to delete even when users are assigned
  // -------------------------------------------------------------------------
  router.delete('/:roleId', async (ctx) => {
    try {
      const force = ctx.query.force === 'true';
      await roleService.deleteRole(ctx.params.roleId, force);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:roleId/permissions — List permissions for a role
  // -------------------------------------------------------------------------
  router.get('/:roleId/permissions', async (ctx) => {
    try {
      const permissions = await roleService.getPermissionsForRole(ctx.params.roleId);
      ctx.body = { data: permissions };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // PUT /:roleId/permissions — Assign permissions to a role
  // -------------------------------------------------------------------------
  router.put('/:roleId/permissions', async (ctx) => {
    try {
      const body = permissionIdsSchema.parse(ctx.request.body);
      await roleService.assignPermissionsToRole(ctx.params.roleId, body.permissionIds);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /:roleId/permissions — Remove permissions from a role
  // -------------------------------------------------------------------------
  router.delete('/:roleId/permissions', async (ctx) => {
    try {
      const body = permissionIdsSchema.parse(ctx.request.body);
      await roleService.removePermissionsFromRole(ctx.params.roleId, body.permissionIds);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:roleId/users — List users with this role (org-scoped, paginated)
  // Requires ?orgId=... query parameter
  // -------------------------------------------------------------------------
  router.get('/:roleId/users', async (ctx) => {
    try {
      const query = listUsersWithRoleSchema.parse(ctx.query);
      const result = await userRoleService.getUsersWithRole(
        ctx.params.roleId,
        query.orgId,
        { page: query.page, pageSize: query.pageSize },
      );
      ctx.body = { data: result.rows, total: result.total };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  return router;
}
