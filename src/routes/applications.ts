/**
 * Application management API routes.
 *
 * All routes are under `/api/admin/applications` and require
 * admin authentication (Bearer JWT). Provides CRUD for applications,
 * status lifecycle (activate, deactivate, archive), and nested
 * module management (CRUD, deactivate).
 *
 * Route structure:
 *   POST   /                                — Create a new application
 *   GET    /                                — List applications (paginated)
 *   GET    /:id                             — Get application by ID
 *   PUT    /:id                             — Update application
 *   POST   /:id/archive                     — Archive application
 *   POST   /:id/activate                    — Activate application
 *   POST   /:id/deactivate                  — Deactivate application
 *   POST   /:id/modules                     — Create module
 *   GET    /:id/modules                     — List modules
 *   PUT    /:id/modules/:moduleId           — Update module
 *   POST   /:id/modules/:moduleId/deactivate — Deactivate module
 *
 * Error mapping:
 *   ApplicationNotFoundError → 404
 *   ApplicationValidationError → 400
 *   ZodError → 400 with validation details
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import * as applicationService from '../applications/service.js';
import { setETagHeader, checkIfMatch } from '../lib/etag.js';
import { ApplicationNotFoundError, ApplicationValidationError } from '../applications/errors.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/** Schema for creating a new application */
const createApplicationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(3).max(100).optional(),
  description: z.string().max(2000).optional(),
});

/** Schema for updating an application (all fields optional) */
const updateApplicationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

/** Schema for listing applications with pagination and filters */
const listApplicationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['name', 'created_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/** Schema for creating a module within an application */
const createModuleSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(3).max(100).optional(),
  description: z.string().max(2000).optional(),
});

/** Schema for updating a module (all fields optional) */
const updateModuleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Error handler helper
// ---------------------------------------------------------------------------

/**
 * Handle domain errors and map them to HTTP responses.
 * Unknown errors are re-thrown for the global error handler.
 */
function handleError(ctx: { status: number; body: unknown; throw: (status: number, msg: string) => never }, err: unknown): never {
  if (err instanceof ApplicationNotFoundError) {
    ctx.throw(404, err.message);
  }
  if (err instanceof ApplicationValidationError) {
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
 * Create the application management router.
 *
 * All routes require admin authentication (Bearer JWT via requireAdminAuth).
 * Provides full CRUD for applications and nested modules, plus status
 * lifecycle actions.
 *
 * Prefix: /api/admin/applications
 *
 * @returns Configured Koa Router
 */
export function createApplicationRouter(): Router {
  const router = new Router({ prefix: '/api/admin/applications' });

  // All routes require admin authentication
  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // POST / — Create application
  // -------------------------------------------------------------------------
  router.post('/', requirePermission(ADMIN_PERMISSIONS.APP_CREATE), async (ctx) => {
    try {
      const body = createApplicationSchema.parse(ctx.request.body);
      const app = await applicationService.createApplication(body);
      ctx.status = 201;
      ctx.body = { data: app };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET / — List applications (paginated)
  // -------------------------------------------------------------------------
  router.get('/', requirePermission(ADMIN_PERMISSIONS.APP_READ), async (ctx) => {
    try {
      const query = listApplicationsSchema.parse(ctx.query);
      const result = await applicationService.listApplications(query);
      ctx.body = result;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:id — Get application by ID
  // -------------------------------------------------------------------------
  router.get('/:id', requirePermission(ADMIN_PERMISSIONS.APP_READ), async (ctx) => {
    const param = ctx.params.id;
    // Support both UUID and slug lookups — CLI and API consumers may use either
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);
    const app = isUuid
      ? await applicationService.getApplicationById(param)
      : await applicationService.getApplicationBySlug(param);
    if (!app) {
      ctx.throw(404, 'Application not found');
      return; // unreachable — keeps TS narrowing happy
    }
    setETagHeader(ctx, 'application', app.id, app.updatedAt);
    ctx.body = { data: app };
  });

  // -------------------------------------------------------------------------
  // PUT /:id — Update application
  // -------------------------------------------------------------------------
  router.put('/:id', requirePermission(ADMIN_PERMISSIONS.APP_UPDATE), async (ctx) => {
    try {
      const body = updateApplicationSchema.parse(ctx.request.body);
      // Check If-Match for optimistic concurrency (optional — backward compatible)
      const current = await applicationService.getApplicationById(ctx.params.id);
      if (current && !checkIfMatch(ctx, 'application', current.id, current.updatedAt, current)) return;
      const app = await applicationService.updateApplication(ctx.params.id, body);
      setETagHeader(ctx, 'application', app.id, app.updatedAt);
      ctx.body = { data: app };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/archive — Archive application
  // -------------------------------------------------------------------------
  router.post('/:id/archive', requirePermission(ADMIN_PERMISSIONS.APP_ARCHIVE), async (ctx) => {
    try {
      await applicationService.archiveApplication(ctx.params.id);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/activate — Activate application
  // -------------------------------------------------------------------------
  router.post('/:id/activate', requirePermission(ADMIN_PERMISSIONS.APP_UPDATE), async (ctx) => {
    try {
      await applicationService.activateApplication(ctx.params.id);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/deactivate — Deactivate application
  // -------------------------------------------------------------------------
  router.post('/:id/deactivate', requirePermission(ADMIN_PERMISSIONS.APP_UPDATE), async (ctx) => {
    try {
      await applicationService.deactivateApplication(ctx.params.id);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/modules — Create module
  // -------------------------------------------------------------------------
  router.post('/:id/modules', requirePermission(ADMIN_PERMISSIONS.APP_UPDATE), async (ctx) => {
    try {
      const body = createModuleSchema.parse(ctx.request.body);
      const mod = await applicationService.createModule(ctx.params.id, body);
      ctx.status = 201;
      ctx.body = { data: mod };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:id/modules — List modules for an application
  // -------------------------------------------------------------------------
  router.get('/:id/modules', requirePermission(ADMIN_PERMISSIONS.APP_READ), async (ctx) => {
    const modules = await applicationService.listModules(ctx.params.id);
    ctx.body = { data: modules };
  });

  // -------------------------------------------------------------------------
  // PUT /:id/modules/:moduleId — Update module
  // -------------------------------------------------------------------------
  router.put('/:id/modules/:moduleId', requirePermission(ADMIN_PERMISSIONS.APP_UPDATE), async (ctx) => {
    try {
      const body = updateModuleSchema.parse(ctx.request.body);
      const mod = await applicationService.updateModule(ctx.params.moduleId, body);
      ctx.body = { data: mod };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/modules/:moduleId/deactivate — Deactivate module
  // -------------------------------------------------------------------------
  router.post('/:id/modules/:moduleId/deactivate', requirePermission(ADMIN_PERMISSIONS.APP_UPDATE), async (ctx) => {
    try {
      await applicationService.deactivateModule(ctx.params.moduleId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  return router;
}
