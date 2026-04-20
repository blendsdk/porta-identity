/**
 * Custom claims management API routes.
 *
 * All routes are under `/api/admin/applications/:appId/claims` and
 * require super-admin authorization. Provides CRUD for claim definitions
 * (per-application) and claim values (per-user).
 *
 * Route structure:
 *   POST   /                         — Create a claim definition
 *   GET    /                         — List claim definitions for the app
 *   GET    /users/:userId            — Get all claim values for a user
 *   GET    /:claimId                 — Get a claim definition
 *   PUT    /:claimId                 — Update a claim definition
 *   DELETE /:claimId                 — Delete a claim definition
 *   PUT    /:claimId/users/:userId   — Set a claim value for a user
 *   GET    /:claimId/users/:userId   — Get a claim value for a user
 *   DELETE /:claimId/users/:userId   — Delete a claim value
 *
 * Error mapping:
 *   ClaimNotFoundError → 404
 *   ClaimValidationError → 400
 *   ZodError → 400 with validation details
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import * as claimService from '../custom-claims/service.js';
import { ClaimNotFoundError, ClaimValidationError } from '../custom-claims/errors.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/** Schema for creating a new claim definition */
const createDefinitionSchema = z.object({
  claimName: z.string().min(1).max(255),
  claimType: z.enum(['string', 'number', 'boolean', 'json']),
  description: z.string().max(1000).optional(),
  includeInIdToken: z.boolean().optional(),
  includeInAccessToken: z.boolean().optional(),
  includeInUserinfo: z.boolean().optional(),
});

/** Schema for updating a claim definition (description and inclusion flags only) */
const updateDefinitionSchema = z.object({
  description: z.string().max(1000).nullable().optional(),
  includeInIdToken: z.boolean().optional(),
  includeInAccessToken: z.boolean().optional(),
  includeInUserinfo: z.boolean().optional(),
});

/** Schema for setting a claim value — type validation done by the service layer */
const setValueSchema = z.object({
  value: z.unknown(),
});

// ---------------------------------------------------------------------------
// Error handler helper
// ---------------------------------------------------------------------------

/**
 * Handle domain errors and map them to HTTP responses.
 * Unknown errors are re-thrown for the global error handler.
 */
function handleError(ctx: { status: number; body: unknown; throw: (status: number, msg: string) => never }, err: unknown): never {
  if (err instanceof ClaimNotFoundError) {
    ctx.throw(404, err.message);
  }
  if (err instanceof ClaimValidationError) {
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
 * Create the custom claims management router.
 *
 * All routes require super-admin authorization. Claim definitions are
 * scoped to an application via the :appId URL parameter. Claim values
 * are per-user, referenced via :userId sub-routes.
 *
 * Prefix: /api/admin/applications/:appId/claims
 *
 * @returns Configured Koa Router
 */
export function createCustomClaimRouter(): Router {
  const router = new Router({ prefix: '/api/admin/applications/:appId/claims' });

  // All routes require super-admin access
  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // POST / — Create claim definition
  // -------------------------------------------------------------------------
  router.post('/', async (ctx) => {
    try {
      const body = createDefinitionSchema.parse(ctx.request.body);
      const definition = await claimService.createDefinition({
        applicationId: ctx.params.appId,
        ...body,
      });
      ctx.status = 201;
      ctx.body = { data: definition };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET / — List claim definitions for application
  // -------------------------------------------------------------------------
  router.get('/', async (ctx) => {
    try {
      const definitions = await claimService.listDefinitions(ctx.params.appId);
      ctx.body = { data: definitions };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /users/:userId — Get all claim values for a user
  // Must be before /:claimId to avoid matching "users" as a claimId
  // -------------------------------------------------------------------------
  router.get('/users/:userId', async (ctx) => {
    try {
      const values = await claimService.getValuesForUser(ctx.params.userId);
      ctx.body = { data: values };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:claimId — Get claim definition by ID
  // -------------------------------------------------------------------------
  router.get('/:claimId', async (ctx) => {
    const definition = await claimService.findDefinitionById(ctx.params.claimId);
    if (!definition) {
      ctx.throw(404, 'Claim definition not found');
    }
    ctx.body = { data: definition };
  });

  // -------------------------------------------------------------------------
  // PUT /:claimId — Update claim definition
  // -------------------------------------------------------------------------
  router.put('/:claimId', async (ctx) => {
    try {
      const body = updateDefinitionSchema.parse(ctx.request.body);
      const definition = await claimService.updateDefinition(ctx.params.claimId, body);
      ctx.body = { data: definition };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /:claimId — Delete claim definition
  // -------------------------------------------------------------------------
  router.delete('/:claimId', async (ctx) => {
    try {
      await claimService.deleteDefinition(ctx.params.claimId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // PUT /:claimId/users/:userId — Set a claim value for a user
  // -------------------------------------------------------------------------
  router.put('/:claimId/users/:userId', async (ctx) => {
    try {
      const body = setValueSchema.parse(ctx.request.body);
      const value = await claimService.setValue(
        ctx.params.userId,
        ctx.params.claimId,
        body.value,
      );
      ctx.body = { data: value };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:claimId/users/:userId — Get a claim value for a user
  // -------------------------------------------------------------------------
  router.get('/:claimId/users/:userId', async (ctx) => {
    const value = await claimService.getValue(ctx.params.userId, ctx.params.claimId);
    if (!value) {
      ctx.throw(404, 'Claim value not found');
    }
    ctx.body = { data: value };
  });

  // -------------------------------------------------------------------------
  // DELETE /:claimId/users/:userId — Delete a claim value
  // -------------------------------------------------------------------------
  router.delete('/:claimId/users/:userId', async (ctx) => {
    try {
      await claimService.deleteValue(ctx.params.userId, ctx.params.claimId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  return router;
}
