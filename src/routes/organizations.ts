/**
 * Organization management API routes.
 *
 * All routes are under `/api/admin/organizations` and require
 * admin authentication (Bearer JWT). Provides CRUD, status lifecycle,
 * branding management, and slug validation endpoints.
 *
 * Route structure:
 *   POST   /                  — Create a new organization
 *   GET    /                  — List organizations (paginated)
 *   GET    /validate-slug     — Validate slug availability
 *   GET    /:id               — Get organization by ID
 *   PUT    /:id               — Update organization
 *   PUT    /:id/branding      — Update branding
 *   POST   /:id/suspend       — Suspend organization
 *   POST   /:id/activate      — Activate organization
 *   POST   /:id/archive       — Archive organization
 *   POST   /:id/restore       — Restore organization
 *
 * Error mapping:
 *   OrganizationNotFoundError → 404
 *   OrganizationValidationError → 400
 *   ZodError → 400 with validation details
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import * as organizationService from '../organizations/service.js';
import { OrganizationNotFoundError, OrganizationValidationError } from '../organizations/errors.js';
import { LOGIN_METHODS } from '../clients/types.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/**
 * Login method Zod schema — single source of truth for HTTP payload validation.
 * Uses the runtime `LOGIN_METHODS` const so adding a new method only requires
 * updating the union in `src/clients/types.ts`.
 */
const loginMethodSchema = z.enum(LOGIN_METHODS);

/**
 * Organization-level default login methods — a non-empty array (empty arrays
 * are rejected by the service layer and must be rejected at the HTTP boundary
 * too so the 400 carries a useful validation message).
 */
const defaultLoginMethodsSchema = z.array(loginMethodSchema).min(1);

const createOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(3).max(100).optional(),
  defaultLocale: z.string().min(2).max(10).optional(),
  defaultLoginMethods: defaultLoginMethodsSchema.optional(),
  branding: z.object({
    logoUrl: z.string().url().nullable().optional(),
    faviconUrl: z.string().url().nullable().optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
    companyName: z.string().max(255).nullable().optional(),
    customCss: z.string().max(10000).nullable().optional(),
  }).optional(),
});

const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  defaultLocale: z.string().min(2).max(10).optional(),
  defaultLoginMethods: defaultLoginMethodsSchema.optional(),
  branding: z.object({
    logoUrl: z.string().url().nullable().optional(),
    faviconUrl: z.string().url().nullable().optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
    companyName: z.string().max(255).nullable().optional(),
    customCss: z.string().max(10000).nullable().optional(),
  }).optional(),
});

const updateBrandingSchema = z.object({
  logoUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  companyName: z.string().max(255).nullable().optional(),
  customCss: z.string().max(10000).nullable().optional(),
});

const listOrganizationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'suspended', 'archived']).optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['name', 'created_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const validateSlugSchema = z.object({
  slug: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Error handler helper
// ---------------------------------------------------------------------------

/**
 * Handle domain errors and map them to HTTP responses.
 * Unknown errors are re-thrown for the global error handler.
 */
function handleError(ctx: { status: number; body: unknown; throw: (status: number, msg: string) => never }, err: unknown): never {
  if (err instanceof OrganizationNotFoundError) {
    ctx.throw(404, err.message);
  }
  if (err instanceof OrganizationValidationError) {
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
 * Create the organization management router.
 *
 * All routes require admin authentication (Bearer JWT via requireAdminAuth).
 * The middleware validates the token, checks the user belongs to the
 * super-admin org, and verifies the porta-admin role.
 *
 * Prefix: /api/admin/organizations
 *
 * @returns Configured Koa Router
 */
export function createOrganizationRouter(): Router {
  const router = new Router({ prefix: '/api/admin/organizations' });

  // All routes require admin authentication
  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // POST / — Create organization
  // -------------------------------------------------------------------------
  router.post('/', requirePermission(ADMIN_PERMISSIONS.ORG_CREATE), async (ctx) => {
    try {
      const body = createOrganizationSchema.parse(ctx.request.body);
      const org = await organizationService.createOrganization(body);
      ctx.status = 201;
      ctx.body = { data: org };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET / — List organizations (paginated)
  // -------------------------------------------------------------------------
  router.get('/', requirePermission(ADMIN_PERMISSIONS.ORG_READ), async (ctx) => {
    try {
      const query = listOrganizationsSchema.parse(ctx.query);
      const result = await organizationService.listOrganizations(query);
      ctx.body = result;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /validate-slug — Validate slug availability
  // Must be BEFORE /:id to avoid matching "validate-slug" as an :id param
  // -------------------------------------------------------------------------
  router.get('/validate-slug', requirePermission(ADMIN_PERMISSIONS.ORG_READ), async (ctx) => {
    try {
      const { slug } = validateSlugSchema.parse(ctx.query);
      const result = await organizationService.validateSlugAvailability(slug);
      ctx.body = result;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:id — Get organization by ID
  // -------------------------------------------------------------------------
  router.get('/:id', requirePermission(ADMIN_PERMISSIONS.ORG_READ), async (ctx) => {
    const param = ctx.params.id;
    // Support both UUID and slug lookups — CLI and API consumers may use either
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);
    const org = isUuid
      ? await organizationService.getOrganizationById(param)
      : await organizationService.getOrganizationBySlug(param);
    if (!org) {
      ctx.throw(404, 'Organization not found');
    }
    ctx.body = { data: org };
  });

  // -------------------------------------------------------------------------
  // PUT /:id — Update organization
  // -------------------------------------------------------------------------
  router.put('/:id', requirePermission(ADMIN_PERMISSIONS.ORG_UPDATE), async (ctx) => {
    try {
      const body = updateOrganizationSchema.parse(ctx.request.body);
      const org = await organizationService.updateOrganization(ctx.params.id, body);
      ctx.body = { data: org };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // PUT /:id/branding — Update branding
  // -------------------------------------------------------------------------
  router.put('/:id/branding', requirePermission(ADMIN_PERMISSIONS.ORG_UPDATE), async (ctx) => {
    try {
      const body = updateBrandingSchema.parse(ctx.request.body);
      const org = await organizationService.updateOrganizationBranding(ctx.params.id, body);
      ctx.body = { data: org };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/suspend — Suspend organization
  // -------------------------------------------------------------------------
  router.post('/:id/suspend', requirePermission(ADMIN_PERMISSIONS.ORG_SUSPEND), async (ctx) => {
    try {
      const body = ctx.request.body as { reason?: string } | undefined;
      await organizationService.suspendOrganization(ctx.params.id, body?.reason);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/activate — Activate organization
  // -------------------------------------------------------------------------
  router.post('/:id/activate', requirePermission(ADMIN_PERMISSIONS.ORG_SUSPEND), async (ctx) => {
    try {
      await organizationService.activateOrganization(ctx.params.id);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/archive — Archive organization
  // -------------------------------------------------------------------------
  router.post('/:id/archive', requirePermission(ADMIN_PERMISSIONS.ORG_ARCHIVE), async (ctx) => {
    try {
      await organizationService.archiveOrganization(ctx.params.id);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/restore — Restore organization
  // -------------------------------------------------------------------------
  router.post('/:id/restore', requirePermission(ADMIN_PERMISSIONS.ORG_ARCHIVE), async (ctx) => {
    try {
      await organizationService.restoreOrganization(ctx.params.id);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  return router;
}
