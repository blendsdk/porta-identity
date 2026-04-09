import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Role, Permission } from '../../../src/rbac/types.js';
import { RoleNotFoundError } from '../../../src/rbac/errors.js';

// Mock all dependencies before importing the module under test.
// vi.mock factories are hoisted — must use inline objects, not const references.
vi.mock('../../../src/rbac/user-role-service.js', () => ({
  getUserRoles: vi.fn(),
  assignRolesToUser: vi.fn(),
  removeRolesFromUser: vi.fn(),
  getUserPermissions: vi.fn(),
}));

// Mock super-admin middleware to always pass through
vi.mock('../../../src/middleware/super-admin.js', () => ({
  requireSuperAdmin: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

import * as userRoleService from '../../../src/rbac/user-role-service.js';
import { createUserRoleRouter } from '../../../src/routes/user-roles.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Standard test role */
function createTestRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-uuid-1',
    applicationId: 'app-uuid-1',
    name: 'Editor',
    slug: 'editor',
    description: 'Can edit content',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Standard test permission */
function createTestPermission(overrides: Partial<Permission> = {}): Permission {
  return {
    id: 'perm-uuid-1',
    applicationId: 'app-uuid-1',
    moduleId: null,
    name: 'Read Contacts',
    slug: 'crm:contacts:read',
    description: 'Can read contacts',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Create a minimal mock Koa context for route testing.
 * Simulates what Koa provides to route handlers.
 */
function createMockCtx(overrides: {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
} = {}) {
  let statusCode = 200;
  let responseBody: unknown = undefined;

  const ctx = {
    params: overrides.params ?? {},
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

/** Find a route layer by method and path suffix */
function findLayer(router: ReturnType<typeof createUserRoleRouter>, method: string, pathSuffix: string) {
  const prefix = '/api/admin/organizations/:orgId/users/:userId/roles';
  return router.stack.find(
    (l) => l.methods.includes(method) && l.path === `${prefix}${pathSuffix}`,
  );
}

/** Execute the last middleware in a layer's stack (the actual handler) */
async function execHandler(layer: NonNullable<ReturnType<typeof findLayer>>, ctx: ReturnType<typeof createMockCtx>) {
  const next = vi.fn();
  await layer.stack[layer.stack.length - 1](ctx as never, next);
}

/** Default params for all user-role routes */
const defaultParams = { orgId: 'org-uuid-1', userId: 'user-uuid-1' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('user-role routes', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // GET / — List roles for user
  // -------------------------------------------------------------------------

  describe('GET / — List roles for user', () => {
    it('should return list of roles for user', async () => {
      const roles = [createTestRole()];
      vi.mocked(userRoleService.getUserRoles).mockResolvedValue(roles);

      const layer = findLayer(createUserRoleRouter(), 'GET', '');
      expect(layer).toBeDefined();

      const ctx = createMockCtx({ params: defaultParams });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: roles });
      expect(userRoleService.getUserRoles).toHaveBeenCalledWith('user-uuid-1');
    });

    it('should return empty array when user has no roles', async () => {
      vi.mocked(userRoleService.getUserRoles).mockResolvedValue([]);

      const layer = findLayer(createUserRoleRouter(), 'GET', '');
      const ctx = createMockCtx({ params: defaultParams });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: [] });
    });
  });

  // -------------------------------------------------------------------------
  // PUT / — Assign roles to user
  // -------------------------------------------------------------------------

  describe('PUT / — Assign roles to user', () => {
    it('should return 204 on successful assignment', async () => {
      vi.mocked(userRoleService.assignRolesToUser).mockResolvedValue(undefined);

      const layer = findLayer(createUserRoleRouter(), 'PUT', '');
      const ctx = createMockCtx({
        params: defaultParams,
        body: { roleIds: ['a0000000-0000-4000-a000-000000000001'] },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(204);
      expect(userRoleService.assignRolesToUser).toHaveBeenCalledWith(
        'user-uuid-1',
        ['a0000000-0000-4000-a000-000000000001'],
      );
    });

    it('should return 400 for invalid role IDs (not UUIDs)', async () => {
      const layer = findLayer(createUserRoleRouter(), 'PUT', '');
      const ctx = createMockCtx({
        params: defaultParams,
        body: { roleIds: ['not-a-uuid'] },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(400);
      expect((ctx.body as { error: string }).error).toBe('Validation failed');
    });

    it('should return 400 for empty role IDs array', async () => {
      const layer = findLayer(createUserRoleRouter(), 'PUT', '');
      const ctx = createMockCtx({
        params: defaultParams,
        body: { roleIds: [] },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(400);
    });

    it('should throw 404 when role not found', async () => {
      vi.mocked(userRoleService.assignRolesToUser).mockRejectedValue(
        new RoleNotFoundError('nonexistent-role'),
      );

      const layer = findLayer(createUserRoleRouter(), 'PUT', '');
      const ctx = createMockCtx({
        params: defaultParams,
        body: { roleIds: ['a0000000-0000-4000-a000-000000000001'] },
      });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('Role not found');
    });
  });

  // -------------------------------------------------------------------------
  // DELETE / — Remove roles from user
  // -------------------------------------------------------------------------

  describe('DELETE / — Remove roles from user', () => {
    it('should return 204 on successful removal', async () => {
      vi.mocked(userRoleService.removeRolesFromUser).mockResolvedValue(undefined);

      const layer = findLayer(createUserRoleRouter(), 'DELETE', '');
      const ctx = createMockCtx({
        params: defaultParams,
        body: { roleIds: ['a0000000-0000-4000-a000-000000000001'] },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(204);
    });

    it('should return 400 for missing roleIds', async () => {
      const layer = findLayer(createUserRoleRouter(), 'DELETE', '');
      const ctx = createMockCtx({
        params: defaultParams,
        body: {},
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /permissions — List resolved permissions for user
  // -------------------------------------------------------------------------

  describe('GET /permissions — List resolved permissions', () => {
    it('should return resolved permissions for user', async () => {
      const permissions = [createTestPermission()];
      vi.mocked(userRoleService.getUserPermissions).mockResolvedValue(permissions);

      const layer = findLayer(createUserRoleRouter(), 'GET', '/permissions');
      const ctx = createMockCtx({ params: defaultParams });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: permissions });
      expect(userRoleService.getUserPermissions).toHaveBeenCalledWith('user-uuid-1');
    });

    it('should return empty array when user has no permissions', async () => {
      vi.mocked(userRoleService.getUserPermissions).mockResolvedValue([]);

      const layer = findLayer(createUserRoleRouter(), 'GET', '/permissions');
      const ctx = createMockCtx({ params: defaultParams });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: [] });
    });
  });

  // -------------------------------------------------------------------------
  // Router structure
  // -------------------------------------------------------------------------

  describe('router structure', () => {
    it('should have the correct prefix', () => {
      const router = createUserRoleRouter();
      expect(router.opts.prefix).toBe('/api/admin/organizations/:orgId/users/:userId/roles');
    });

    it('should register all expected routes', () => {
      const router = createUserRoleRouter();
      const prefix = '/api/admin/organizations/:orgId/users/:userId/roles';
      const paths = router.stack.map((l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`);

      expect(paths).toContain(`GET ${prefix}`);
      expect(paths).toContain(`PUT ${prefix}`);
      expect(paths).toContain(`DELETE ${prefix}`);
      expect(paths).toContain(`GET ${prefix}/permissions`);
    });
  });
});
