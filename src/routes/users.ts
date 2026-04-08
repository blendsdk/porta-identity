/**
 * User management API routes.
 *
 * All routes are under `/api/admin/organizations/:orgId/users` and
 * require super-admin authorization. User routes are nested under an
 * organization context because users are always scoped to an org.
 *
 * Route structure:
 *   POST   /                     — Create a user in the organization
 *   GET    /                     — List users (paginated, searchable)
 *   GET    /:userId              — Get user by ID
 *   PUT    /:userId              — Update user profile
 *   POST   /:userId/deactivate   — Deactivate (active → inactive)
 *   POST   /:userId/reactivate   — Reactivate (inactive → active)
 *   POST   /:userId/suspend      — Suspend (active → suspended)
 *   POST   /:userId/unsuspend    — Unsuspend (suspended → active)
 *   POST   /:userId/lock         — Lock (active → locked)
 *   POST   /:userId/unlock       — Unlock (locked → active)
 *   POST   /:userId/password     — Set/change password
 *   DELETE /:userId/password     — Clear password (passwordless)
 *   POST   /:userId/verify-email — Mark email as verified
 *
 * Error mapping:
 *   UserNotFoundError → 404
 *   UserValidationError → 400
 *   ZodError → 400 with validation details
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireSuperAdmin } from '../middleware/super-admin.js';
import * as userService from '../users/service.js';
import { UserNotFoundError, UserValidationError } from '../users/errors.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/** Schema for creating a new user */
const createUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128).optional(),
  givenName: z.string().max(255).optional(),
  familyName: z.string().max(255).optional(),
  middleName: z.string().max(255).optional(),
  nickname: z.string().max(255).optional(),
  preferredUsername: z.string().max(255).optional(),
  profileUrl: z.string().url().optional(),
  pictureUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  gender: z.string().max(50).optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  zoneinfo: z.string().max(50).optional(),
  locale: z.string().max(10).optional(),
  phoneNumber: z.string().max(50).optional(),
  phoneNumberVerified: z.boolean().optional(),
  address: z.object({
    street: z.string().nullable().optional(),
    locality: z.string().max(255).nullable().optional(),
    region: z.string().max(255).nullable().optional(),
    postalCode: z.string().max(20).nullable().optional(),
    country: z.string().length(2).nullable().optional(),
  }).optional(),
});

/** Schema for updating a user (all fields optional, nullable for clearing) */
const updateUserSchema = z.object({
  givenName: z.string().max(255).nullable().optional(),
  familyName: z.string().max(255).nullable().optional(),
  middleName: z.string().max(255).nullable().optional(),
  nickname: z.string().max(255).nullable().optional(),
  preferredUsername: z.string().max(255).nullable().optional(),
  profileUrl: z.string().url().nullable().optional(),
  pictureUrl: z.string().url().nullable().optional(),
  websiteUrl: z.string().url().nullable().optional(),
  gender: z.string().max(50).nullable().optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  zoneinfo: z.string().max(50).nullable().optional(),
  locale: z.string().max(10).nullable().optional(),
  phoneNumber: z.string().max(50).nullable().optional(),
  phoneNumberVerified: z.boolean().optional(),
  address: z.object({
    street: z.string().nullable().optional(),
    locality: z.string().max(255).nullable().optional(),
    region: z.string().max(255).nullable().optional(),
    postalCode: z.string().max(20).nullable().optional(),
    country: z.string().length(2).nullable().optional(),
  }).nullable().optional(),
});

/** Schema for listing users with pagination */
const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'inactive', 'suspended', 'locked']).optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['email', 'given_name', 'family_name', 'created_at', 'last_login_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/** Schema for setting a password */
const setPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

/** Schema for locking a user (reason required) */
const lockUserSchema = z.object({
  reason: z.string().min(1).max(500),
});

/** Schema for suspending a user (reason optional) */
const suspendUserSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Error handler helper
// ---------------------------------------------------------------------------

/**
 * Handle domain errors and map them to HTTP responses.
 * Unknown errors are re-thrown for the global error handler.
 */
function handleError(ctx: { status: number; body: unknown; throw: (status: number, msg: string) => never }, err: unknown): never {
  if (err instanceof UserNotFoundError) {
    ctx.throw(404, err.message);
  }
  if (err instanceof UserValidationError) {
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
 * Create the user management router.
 *
 * All routes require super-admin authorization. Users are always
 * scoped to an organization via the :orgId URL parameter.
 *
 * Prefix: /api/admin/organizations/:orgId/users
 *
 * @returns Configured Koa Router
 */
export function createUserRouter(): Router {
  const router = new Router({ prefix: '/api/admin/organizations/:orgId/users' });

  // All routes require super-admin access
  router.use(requireSuperAdmin());

  // -------------------------------------------------------------------------
  // POST / — Create user
  // -------------------------------------------------------------------------
  router.post('/', async (ctx) => {
    try {
      const body = createUserSchema.parse(ctx.request.body);
      const user = await userService.createUser({
        organizationId: ctx.params.orgId,
        ...body,
      });
      ctx.status = 201;
      ctx.body = { data: user };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET / — List users (paginated)
  // -------------------------------------------------------------------------
  router.get('/', async (ctx) => {
    try {
      const query = listUsersSchema.parse(ctx.query);
      const result = await userService.listUsersByOrganization({
        organizationId: ctx.params.orgId,
        ...query,
      });
      ctx.body = result;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:userId — Get user by ID
  // -------------------------------------------------------------------------
  router.get('/:userId', async (ctx) => {
    const user = await userService.getUserById(ctx.params.userId);
    if (!user) {
      ctx.throw(404, 'User not found');
    }
    ctx.body = { data: user };
  });

  // -------------------------------------------------------------------------
  // PUT /:userId — Update user profile
  // -------------------------------------------------------------------------
  router.put('/:userId', async (ctx) => {
    try {
      const body = updateUserSchema.parse(ctx.request.body);
      // Convert null address to undefined — Zod allows null for clearing,
      // but UpdateUserInput uses undefined to mean "no change"
      const input = { ...body, address: body.address ?? undefined };
      const user = await userService.updateUser(ctx.params.userId, input);
      ctx.body = { data: user };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/deactivate — Deactivate user
  // -------------------------------------------------------------------------
  router.post('/:userId/deactivate', async (ctx) => {
    try {
      await userService.deactivateUser(ctx.params.userId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/reactivate — Reactivate user
  // -------------------------------------------------------------------------
  router.post('/:userId/reactivate', async (ctx) => {
    try {
      await userService.reactivateUser(ctx.params.userId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/suspend — Suspend user
  // -------------------------------------------------------------------------
  router.post('/:userId/suspend', async (ctx) => {
    try {
      const body = suspendUserSchema.parse(ctx.request.body ?? {});
      await userService.suspendUser(ctx.params.userId, body.reason);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/unsuspend — Unsuspend user
  // -------------------------------------------------------------------------
  router.post('/:userId/unsuspend', async (ctx) => {
    try {
      await userService.unsuspendUser(ctx.params.userId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/lock — Lock user
  // -------------------------------------------------------------------------
  router.post('/:userId/lock', async (ctx) => {
    try {
      const body = lockUserSchema.parse(ctx.request.body);
      await userService.lockUser(ctx.params.userId, body.reason);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/unlock — Unlock user
  // -------------------------------------------------------------------------
  router.post('/:userId/unlock', async (ctx) => {
    try {
      await userService.unlockUser(ctx.params.userId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/password — Set password
  // -------------------------------------------------------------------------
  router.post('/:userId/password', async (ctx) => {
    try {
      const body = setPasswordSchema.parse(ctx.request.body);
      await userService.setUserPassword(ctx.params.userId, body.password);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /:userId/password — Clear password (convert to passwordless)
  // -------------------------------------------------------------------------
  router.delete('/:userId/password', async (ctx) => {
    try {
      await userService.clearUserPassword(ctx.params.userId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:userId/verify-email — Mark email as verified
  // -------------------------------------------------------------------------
  router.post('/:userId/verify-email', async (ctx) => {
    try {
      await userService.markEmailVerified(ctx.params.userId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  return router;
}
