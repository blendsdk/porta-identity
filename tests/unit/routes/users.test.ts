import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../../../src/users/types.js';
import { UserNotFoundError, UserValidationError } from '../../../src/users/errors.js';

// Mock all dependencies before importing the module under test
vi.mock('../../../src/users/service.js', () => ({
  createUser: vi.fn(),
  getUserById: vi.fn(),
  listUsersByOrganization: vi.fn(),
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  reactivateUser: vi.fn(),
  suspendUser: vi.fn(),
  unsuspendUser: vi.fn(),
  lockUser: vi.fn(),
  unlockUser: vi.fn(),
  setUserPassword: vi.fn(),
  clearUserPassword: vi.fn(),
  markEmailVerified: vi.fn(),
}));

// Mock super-admin middleware to always pass through
vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

import * as userService from '../../../src/users/service.js';
import { createUserRouter } from '../../../src/routes/users.js';

/** Standard test user */
function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid-1',
    organizationId: 'org-uuid-1',
    email: 'john@example.com',
    emailVerified: false,
    hasPassword: true,
    passwordChangedAt: null,
    givenName: 'John',
    familyName: 'Doe',
    middleName: null,
    nickname: null,
    preferredUsername: null,
    profileUrl: null,
    pictureUrl: null,
    websiteUrl: null,
    gender: null,
    birthdate: null,
    zoneinfo: null,
    locale: null,
    phoneNumber: null,
    phoneNumberVerified: false,
    addressStreet: null,
    addressLocality: null,
    addressRegion: null,
    addressPostalCode: null,
    addressCountry: null,
    status: 'active',
    lockedAt: null,
    lockedReason: null,
    lastLoginAt: null,
    loginCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Create a minimal mock Koa context for route testing */
function createMockCtx(overrides: {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
} = {}) {
  let statusCode = 200;
  let responseBody: unknown = undefined;

  const ctx = {
    params: { orgId: 'org-uuid-1', ...(overrides.params ?? {}) },
    query: overrides.query ?? {},
    request: { body: overrides.body ?? {} },
    get status() { return statusCode; },
    set status(v: number) { statusCode = v; },
    get body() { return responseBody; },
    set body(v: unknown) { responseBody = v; },
    state: { organization: { isSuperAdmin: true } },
    throw: vi.fn((status: number, message: string) => {
      const err = new Error(message) as Error & { status: number };
      err.status = status;
      throw err;
    }),
  };
  return ctx;
}

const PREFIX = '/api/admin/organizations/:orgId/users';

/** Find a route layer by method and path suffix */
function findLayer(router: ReturnType<typeof createUserRouter>, method: string, pathSuffix: string) {
  return router.stack.find(
    (l) => l.methods.includes(method) && l.path === `${PREFIX}${pathSuffix}`,
  );
}

/** Execute the last middleware in the layer's stack (the actual handler) */
async function exec(layer: NonNullable<ReturnType<typeof findLayer>>, ctx: ReturnType<typeof createMockCtx>) {
  return layer.stack[layer.stack.length - 1](ctx as never, vi.fn());
}

describe('user routes', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // POST / — Create user
  // -------------------------------------------------------------------------

  describe('POST /', () => {
    it('should create user and return 201', async () => {
      const user = createTestUser();
      (userService.createUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      const router = createUserRouter();
      const layer = findLayer(router, 'POST', '');
      const ctx = createMockCtx({ body: { email: 'john@example.com' } });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(201);
      expect(ctx.body).toEqual({ data: user });
    });

    it('should return 400 for invalid email', async () => {
      const router = createUserRouter();
      const layer = findLayer(router, 'POST', '');
      const ctx = createMockCtx({ body: { email: 'not-an-email' } });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(400);
      expect((ctx.body as { error: string }).error).toBe('Validation failed');
    });

    it('should return 400 for duplicate email', async () => {
      (userService.createUser as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new UserValidationError('Email already exists in this organization'));

      const router = createUserRouter();
      const layer = findLayer(router, 'POST', '');
      const ctx = createMockCtx({ body: { email: 'john@example.com' } });

      await expect(exec(layer!, ctx)).rejects.toThrow('Email already exists');
    });
  });

  // -------------------------------------------------------------------------
  // GET / — List users
  // -------------------------------------------------------------------------

  describe('GET /', () => {
    it('should list users with pagination', async () => {
      const result = { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      (userService.listUsersByOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(result);

      const router = createUserRouter();
      const layer = findLayer(router, 'GET', '');
      const ctx = createMockCtx({ query: {} });

      await exec(layer!, ctx);

      expect(ctx.body).toEqual(result);
    });

    it('should filter by status', async () => {
      const result = { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      (userService.listUsersByOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(result);

      const router = createUserRouter();
      const layer = findLayer(router, 'GET', '');
      const ctx = createMockCtx({ query: { status: 'active' } });

      await exec(layer!, ctx);

      expect(userService.listUsersByOrganization).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' }),
      );
    });

    it('should search by name/email', async () => {
      const result = { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      (userService.listUsersByOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(result);

      const router = createUserRouter();
      const layer = findLayer(router, 'GET', '');
      const ctx = createMockCtx({ query: { search: 'john' } });

      await exec(layer!, ctx);

      expect(userService.listUsersByOrganization).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'john' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // GET /:userId — Get user
  // -------------------------------------------------------------------------

  describe('GET /:userId', () => {
    it('should return user', async () => {
      const user = createTestUser();
      (userService.getUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      const router = createUserRouter();
      const layer = findLayer(router, 'GET', '/:userId');
      const ctx = createMockCtx({ params: { userId: 'user-uuid-1' } });

      await exec(layer!, ctx);

      expect(ctx.body).toEqual({ data: user });
    });

    it('should return 404 for not found', async () => {
      (userService.getUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const router = createUserRouter();
      const layer = findLayer(router, 'GET', '/:userId');
      const ctx = createMockCtx({ params: { userId: 'nonexistent' } });

      await expect(exec(layer!, ctx)).rejects.toThrow('User not found');
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:userId — Update user
  // -------------------------------------------------------------------------

  describe('PUT /:userId', () => {
    it('should update user profile', async () => {
      const user = createTestUser({ givenName: 'Jane' });
      (userService.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      const router = createUserRouter();
      const layer = findLayer(router, 'PUT', '/:userId');
      const ctx = createMockCtx({ params: { userId: 'user-uuid-1' }, body: { givenName: 'Jane' } });

      await exec(layer!, ctx);

      expect(ctx.body).toEqual({ data: user });
    });

    it('should return 404 for not found', async () => {
      (userService.updateUser as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new UserNotFoundError('nonexistent'));

      const router = createUserRouter();
      const layer = findLayer(router, 'PUT', '/:userId');
      const ctx = createMockCtx({ params: { userId: 'nonexistent' }, body: { givenName: 'Test' } });

      await expect(exec(layer!, ctx)).rejects.toThrow('User not found');
    });
  });

  // -------------------------------------------------------------------------
  // Status transitions
  // -------------------------------------------------------------------------

  describe('POST /:userId/deactivate', () => {
    it('should deactivate user and return 204', async () => {
      (userService.deactivateUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createUserRouter();
      const layer = findLayer(router, 'POST', '/:userId/deactivate');
      const ctx = createMockCtx({ params: { userId: 'user-uuid-1' } });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(204);
    });
  });

  describe('POST /:userId/suspend', () => {
    it('should suspend user with reason', async () => {
      (userService.suspendUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createUserRouter();
      const layer = findLayer(router, 'POST', '/:userId/suspend');
      const ctx = createMockCtx({ params: { userId: 'user-uuid-1' }, body: { reason: 'policy violation' } });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(204);
      expect(userService.suspendUser).toHaveBeenCalledWith('user-uuid-1', 'policy violation');
    });
  });

  describe('POST /:userId/lock', () => {
    it('should lock user with reason', async () => {
      (userService.lockUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createUserRouter();
      const layer = findLayer(router, 'POST', '/:userId/lock');
      const ctx = createMockCtx({ params: { userId: 'user-uuid-1' }, body: { reason: 'brute force' } });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(204);
    });

    it('should return 400 without reason', async () => {
      const router = createUserRouter();
      const layer = findLayer(router, 'POST', '/:userId/lock');
      const ctx = createMockCtx({ params: { userId: 'user-uuid-1' }, body: {} });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(400);
      expect((ctx.body as { error: string }).error).toBe('Validation failed');
    });
  });

  describe('POST /:userId/unlock', () => {
    it('should unlock user and return 204', async () => {
      (userService.unlockUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createUserRouter();
      const layer = findLayer(router, 'POST', '/:userId/unlock');
      const ctx = createMockCtx({ params: { userId: 'user-uuid-1' } });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(204);
    });
  });

  // -------------------------------------------------------------------------
  // Password management
  // -------------------------------------------------------------------------

  describe('POST /:userId/password', () => {
    it('should set password and return 204', async () => {
      (userService.setUserPassword as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createUserRouter();
      const layer = findLayer(router, 'POST', '/:userId/password');
      const ctx = createMockCtx({ params: { userId: 'user-uuid-1' }, body: { password: 'secure_password_123' } });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(204);
    });

    it('should return 400 for invalid password', async () => {
      const router = createUserRouter();
      const layer = findLayer(router, 'POST', '/:userId/password');
      const ctx = createMockCtx({ params: { userId: 'user-uuid-1' }, body: { password: 'short' } });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(400);
    });
  });

  describe('DELETE /:userId/password', () => {
    it('should clear password and return 204', async () => {
      (userService.clearUserPassword as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createUserRouter();
      const layer = findLayer(router, 'DELETE', '/:userId/password');
      const ctx = createMockCtx({ params: { userId: 'user-uuid-1' } });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(204);
    });
  });

  // -------------------------------------------------------------------------
  // Email verification
  // -------------------------------------------------------------------------

  describe('POST /:userId/verify-email', () => {
    it('should verify email and return 204', async () => {
      (userService.markEmailVerified as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const router = createUserRouter();
      const layer = findLayer(router, 'POST', '/:userId/verify-email');
      const ctx = createMockCtx({ params: { userId: 'user-uuid-1' } });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(204);
    });
  });

  // -------------------------------------------------------------------------
  // Router structure
  // -------------------------------------------------------------------------

  describe('router structure', () => {
    it('should have the correct prefix', () => {
      const router = createUserRouter();
      expect(router.opts.prefix).toBe(PREFIX);
    });

    it('should register all expected routes', () => {
      const router = createUserRouter();
      const paths = router.stack.map((l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`);

      expect(paths).toContain(`POST ${PREFIX}`);
      expect(paths).toContain(`GET ${PREFIX}`);
      expect(paths).toContain(`GET ${PREFIX}/:userId`);
      expect(paths).toContain(`PUT ${PREFIX}/:userId`);
      expect(paths).toContain(`POST ${PREFIX}/:userId/deactivate`);
      expect(paths).toContain(`POST ${PREFIX}/:userId/reactivate`);
      expect(paths).toContain(`POST ${PREFIX}/:userId/suspend`);
      expect(paths).toContain(`POST ${PREFIX}/:userId/unsuspend`);
      expect(paths).toContain(`POST ${PREFIX}/:userId/lock`);
      expect(paths).toContain(`POST ${PREFIX}/:userId/unlock`);
      expect(paths).toContain(`POST ${PREFIX}/:userId/password`);
      expect(paths).toContain(`DELETE ${PREFIX}/:userId/password`);
      expect(paths).toContain(`POST ${PREFIX}/:userId/verify-email`);
    });
  });
});
