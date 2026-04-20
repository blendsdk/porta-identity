/**
 * Permission management API routes.
 *
 * All routes are under `/api/admin/applications/:appId/permissions` and
 * require super-admin authorization. Provides CRUD for permissions and
 * a query for roles that include a given permission.
 *
 * Route structure:
 *   POST   /                — Create a new permission
 *   GET    /                — List permissions (optional ?moduleId filter)
 *   GET    /:permId         — Get a permission by ID
 *   PUT    /:permId         — Update a permission (name/description only)
 *   DELETE /:permId         — Delete a permission (?force=true)
 *   GET    /:permId/roles   — List roles that have this permission
 *
 * Error mapping:
 *   PermissionNotFoundError → 404
 *   RbacValidationError → 400
 *   ZodError → 400 with validation details
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import * as permissionService from '../rbac/permission-service.js';
import { PermissionNotFoundError, RbacValidationError } from '../rbac/errors.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/** Schema for creating a new permission */
const createPermissionSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(150),
  moduleId: z.string().uuid().optional(),
  description: z.string().max(1000).optional(),
});

/** Schema for updating a permission (name and description only) */
const updatePermissionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
});

/** Schema for filtering permissions by module */
const listPermissionsSchema = z.object({
  moduleId: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Error handler helper
// ---------------------------------------------------------------------------

/**
 * Handle domain errors and map them to HTTP responses.
 * Unknown errors are re-thrown for the global error handler.
 */
function handleError(ctx: { status: number; body: unknown; throw: (status: number, msg: string) => never }, err: unknown): never {
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
 * Create the permission management router.
 *
 * All routes require super-admin authorization. Permissions are scoped
 * to an application via the :appId URL parameter.
 *
 * Prefix: /api/admin/applications/:appId/permissions
 *
 * @returns Configured Koa Router
 */
export function createPermissionRouter(): Router {
  const router = new Router({ prefix: '/api/admin/applications/:appId/permissions' });

  // All routes require super-admin access
  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // POST / — Create permission
  // -------------------------------------------------------------------------
  router.post('/', async (ctx) => {
    try {
      const body = createPermissionSchema.parse(ctx.request.body);
      const permission = await permissionService.createPermission({
        applicationId: ctx.params.appId,
        ...body,
      });
      ctx.status = 201;
      ctx.body = { data: permission };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET / — List permissions for application (optional moduleId filter)
  // -------------------------------------------------------------------------
  router.get('/', async (ctx) => {
    try {
      const query = listPermissionsSchema.parse(ctx.query);
      const permissions = await permissionService.listPermissionsByApplication(
        ctx.params.appId,
        query.moduleId,
      );
      ctx.body = { data: permissions };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:permId — Get permission by ID
  // -------------------------------------------------------------------------
  router.get('/:permId', async (ctx) => {
    const permission = await permissionService.findPermissionById(ctx.params.permId);
    if (!permission) {
      ctx.throw(404, 'Permission not found');
    }
    ctx.body = { data: permission };
  });

  // -------------------------------------------------------------------------
  // PUT /:permId — Update permission (name and description only)
  // -------------------------------------------------------------------------
  router.put('/:permId', async (ctx) => {
    try {
      const body = updatePermissionSchema.parse(ctx.request.body);
      const permission = await permissionService.updatePermission(ctx.params.permId, body);
      ctx.body = { data: permission };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /:permId — Delete permission
  // Supports ?force=true to delete even when roles reference it
  // -------------------------------------------------------------------------
  router.delete('/:permId', async (ctx) => {
    try {
      const force = ctx.query.force === 'true';
      await permissionService.deletePermission(ctx.params.permId, force);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:permId/roles — List roles that include this permission
  // -------------------------------------------------------------------------
  router.get('/:permId/roles', async (ctx) => {
    try {
      const roles = await permissionService.getRolesWithPermission(ctx.params.permId);
      ctx.body = { data: roles };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  return router;
}
