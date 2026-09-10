/**
 * Permission management API routes.
 *
 * All routes are under `/api/admin/applications/:appId/permissions` and
 * require admin authorization with granular permissions. Provides CRUD
 * for permissions and a query for roles that include a given permission.
 *
 * Route structure:
 *   POST   /                — Create a new permission
 *   GET    /                — List permissions (optional ?moduleId filter)
 *   GET    /:permId         — Get a permission by ID
 *   PUT    /:permId         — Update a permission (name/description only)
 *   DELETE /:permissionId   — Delete a permission
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
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS, ALL_ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import { getApplicationBySlug } from '../applications/service.js';
import * as permissionService from '../rbac/permission-service.js';
import { PermissionNotFoundError, RbacValidationError } from '../rbac/errors.js';

const ADMIN_APPLICATION_SLUG = 'porta-admin';
const ADMIN_PERMISSION_SLUGS = new Set<string>(ALL_ADMIN_PERMISSIONS);

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/** Schema for creating a new permission */
const createPermissionSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().trim().min(1).max(150),
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

/** Parent-qualified parameters accepted by permission reads and updates. */
const permissionIdentifierSchema = z.object({
  appId: z.string().uuid(),
  permId: z.string().uuid(),
});

/** Parent-qualified parameters accepted by permission deletion. */
const deletionIdentifierSchema = z.object({
  appId: z.string().uuid(),
  permissionId: z.string().uuid(),
});

/** Application parent parameter accepted by collection routes. */
const applicationIdentifierSchema = z.object({ appId: z.string().uuid() });

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
  if (err instanceof PermissionNotFoundError) {
    ctx.throw(404, 'Permission not found');
  }
  if (err instanceof RbacValidationError) {
    ctx.throw(400, 'Permission request is invalid');
  }
  if (err instanceof z.ZodError) {
    ctx.status = 400;
    ctx.body = { error: 'Permission request is invalid' };
    return undefined as never;
  }
  throw err;
}

/** Reject generic route mutations of a canonical Porta Admin permission. */
async function requireMutablePermission(
  applicationId: string,
  permissionId: string,
): Promise<void> {
  const permission = await permissionService.findPermissionById(applicationId, permissionId);
  // The mutation service remains responsible for authoritative not-found handling and repeats the
  // canonical check after locking. This route lookup exists only for an early sanitized rejection.
  if (!permission) return;
  if (!ADMIN_PERMISSION_SLUGS.has(permission.slug)) return;
  const adminApplication = await getApplicationBySlug(ADMIN_APPLICATION_SLUG);
  if (adminApplication?.id === permission.applicationId) {
    throw new RbacValidationError('Canonical Porta Admin permissions cannot be modified');
  }
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the permission management router.
 *
 * All routes require admin authorization with granular permissions.
 * Permissions are scoped to an application via the :appId URL parameter.
 *
 * Prefix: /api/admin/applications/:appId/permissions
 *
 * @returns Configured Koa Router
 */
export function createPermissionRouter(): Router {
  const router = new Router({ prefix: '/api/admin/applications/:appId/permissions' });

  // All routes require admin authentication
  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // POST / — Create permission
  // -------------------------------------------------------------------------
  router.post('/', requirePermission(ADMIN_PERMISSIONS.PERMISSION_CREATE), async (ctx) => {
    try {
      applicationIdentifierSchema.parse(ctx.params);
      const body = createPermissionSchema.parse(ctx.request.body);
      const permission = await permissionService.createPermission(
        {
          applicationId: ctx.params.appId,
          ...body,
        },
        ctx.state.adminUser?.id,
      );
      ctx.status = 201;
      ctx.body = { data: permission };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET / — List permissions for application (optional moduleId filter)
  // -------------------------------------------------------------------------
  router.get('/', requirePermission(ADMIN_PERMISSIONS.PERMISSION_READ), async (ctx) => {
    try {
      applicationIdentifierSchema.parse(ctx.params);
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
  router.get('/:permId', requirePermission(ADMIN_PERMISSIONS.PERMISSION_READ), async (ctx) => {
    try {
      permissionIdentifierSchema.parse(ctx.params);
      const permission = await permissionService.findPermissionById(
        ctx.params.appId,
        ctx.params.permId,
      );
      if (!permission) {
        ctx.throw(404, 'Permission not found');
      }
      ctx.body = { data: permission };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // PUT /:permId — Update permission (name and description only)
  // -------------------------------------------------------------------------
  router.put('/:permId', requirePermission(ADMIN_PERMISSIONS.PERMISSION_UPDATE), async (ctx) => {
    try {
      permissionIdentifierSchema.parse(ctx.params);
      const body = updatePermissionSchema.parse(ctx.request.body);
      await requireMutablePermission(ctx.params.appId, ctx.params.permId);
      const permission = await permissionService.updatePermission(
        ctx.params.appId,
        ctx.params.permId,
        body,
        ctx.state.adminUser?.id,
      );
      ctx.body = { data: permission };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /:permissionId — Delete permission
  // -------------------------------------------------------------------------
  router.delete(
    '/:permissionId',
    requirePermission(ADMIN_PERMISSIONS.PERMISSION_DELETE),
    async (ctx) => {
      try {
        deletionIdentifierSchema.parse(ctx.params);
        await requireMutablePermission(ctx.params.appId, ctx.params.permissionId);
        const result = await permissionService.deletePermission(
          ctx.params.appId,
          ctx.params.permissionId,
          ctx.state.adminUser?.id,
        );
        ctx.status = 200;
        ctx.body = { data: result };
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /:permId/roles — List roles that include this permission
  // -------------------------------------------------------------------------
  router.get(
    '/:permId/roles',
    requirePermission(ADMIN_PERMISSIONS.PERMISSION_READ),
    async (ctx) => {
      try {
        permissionIdentifierSchema.parse(ctx.params);
        const roles = await permissionService.getRolesWithPermission(
          ctx.params.appId,
          ctx.params.permId,
        );
        ctx.body = { data: roles };
      } catch (err) {
        handleError(ctx, err);
      }
    },
  );

  return router;
}
