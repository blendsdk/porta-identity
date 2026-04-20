import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Role, Permission, UserRole } from '../../../src/rbac/types.js';
import { RoleNotFoundError, RbacValidationError } from '../../../src/rbac/errors.js';

// Mock all dependencies before importing the module under test.
// vi.mock factories are hoisted — must use inline objects, not const references.
vi.mock('../../../src/rbac/role-service.js', () => ({
  createRole: vi.fn(),
  findRoleById: vi.fn(),
  findRoleBySlug: vi.fn(),
  listRolesByApplication: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  assignPermissionsToRole: vi.fn(),
  removePermissionsFromRole: vi.fn(),
  getPermissionsForRole: vi.fn(),
}));

vi.mock('../../../src/rbac/user-role-service.js', () => ({
  getUsersWithRole: vi.fn(),
}));

// Mock super-admin middleware to always pass through
vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

import * as roleService from '../../../src/rbac/role-service.js';
import * as userRoleService from '../../../src/rbac/user-role-service.js';
import { createRoleRouter } from '../../../src/routes/roles.js';

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
function findLayer(router: ReturnType<typeof createRoleRouter>, method: string, pathSuffix: string) {
  const prefix = '/api/admin/applications/:appId/roles';
  return router.stack.find(
    (l) => l.methods.includes(method) && l.path === `${prefix}${pathSuffix}`,
  );
}

/** Execute the last middleware in a layer's stack (the actual handler) */
async function execHandler(layer: NonNullable<ReturnType<typeof findLayer>>, ctx: ReturnType<typeof createMockCtx>) {
  const next = vi.fn();
  await layer.stack[layer.stack.length - 1](ctx as never, next);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('role routes', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // POST / — Create role
  // -------------------------------------------------------------------------

  describe('POST / — Create role', () => {
    it('should return 201 with created role', async () => {
      const role = createTestRole();
      vi.mocked(roleService.createRole).mockResolvedValue(role);

      const layer = findLayer(createRoleRouter(), 'POST', '');
      expect(layer).toBeDefined();

      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1' },
        body: { name: 'Editor' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(201);
      expect(ctx.body).toEqual({ data: role });
      expect(roleService.createRole).toHaveBeenCalledWith({
        applicationId: 'app-uuid-1',
        name: 'Editor',
      });
    });

    it('should return 400 for invalid input (missing name)', async () => {
      const layer = findLayer(createRoleRouter(), 'POST', '');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1' }, body: {} });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(400);
      expect((ctx.body as { error: string }).error).toBe('Validation failed');
    });

    it('should throw 400 when slug already exists', async () => {
      vi.mocked(roleService.createRole).mockRejectedValue(
        new RbacValidationError('Role slug already exists'),
      );

      const layer = findLayer(createRoleRouter(), 'POST', '');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1' },
        body: { name: 'Editor' },
      });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('Role slug already exists');
    });
  });

  // -------------------------------------------------------------------------
  // GET / — List roles
  // -------------------------------------------------------------------------

  describe('GET / — List roles', () => {
    it('should return list of roles for application', async () => {
      const roles = [createTestRole()];
      vi.mocked(roleService.listRolesByApplication).mockResolvedValue(roles);

      const layer = findLayer(createRoleRouter(), 'GET', '');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1' } });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: roles });
      expect(roleService.listRolesByApplication).toHaveBeenCalledWith('app-uuid-1');
    });

    it('should return empty array when no roles exist', async () => {
      vi.mocked(roleService.listRolesByApplication).mockResolvedValue([]);

      const layer = findLayer(createRoleRouter(), 'GET', '');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1' } });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: [] });
    });
  });

  // -------------------------------------------------------------------------
  // GET /:roleId — Get role by ID
  // -------------------------------------------------------------------------

  describe('GET /:roleId — Get role by ID', () => {
    it('should return role when found', async () => {
      const role = createTestRole();
      vi.mocked(roleService.findRoleById).mockResolvedValue(role);

      const layer = findLayer(createRoleRouter(), 'GET', '/:roleId');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1', roleId: 'role-uuid-1' } });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: role });
    });

    it('should throw 404 when role not found', async () => {
      vi.mocked(roleService.findRoleById).mockResolvedValue(null);

      const layer = findLayer(createRoleRouter(), 'GET', '/:roleId');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1', roleId: 'nonexistent' } });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('Role not found');
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:roleId — Update role
  // -------------------------------------------------------------------------

  describe('PUT /:roleId — Update role', () => {
    it('should return updated role', async () => {
      const role = createTestRole({ name: 'Updated' });
      vi.mocked(roleService.updateRole).mockResolvedValue(role);

      const layer = findLayer(createRoleRouter(), 'PUT', '/:roleId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', roleId: 'role-uuid-1' },
        body: { name: 'Updated' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: role });
      expect(roleService.updateRole).toHaveBeenCalledWith('role-uuid-1', { name: 'Updated' });
    });

    it('should throw 404 when role not found', async () => {
      vi.mocked(roleService.updateRole).mockRejectedValue(
        new RoleNotFoundError('nonexistent'),
      );

      const layer = findLayer(createRoleRouter(), 'PUT', '/:roleId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', roleId: 'nonexistent' },
        body: { name: 'Test' },
      });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('Role not found');
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /:roleId — Delete role
  // -------------------------------------------------------------------------

  describe('DELETE /:roleId — Delete role', () => {
    it('should return 204 on successful delete', async () => {
      vi.mocked(roleService.deleteRole).mockResolvedValue(undefined);

      const layer = findLayer(createRoleRouter(), 'DELETE', '/:roleId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', roleId: 'role-uuid-1' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(204);
      expect(roleService.deleteRole).toHaveBeenCalledWith('role-uuid-1', false);
    });

    it('should pass force=true when query param is set', async () => {
      vi.mocked(roleService.deleteRole).mockResolvedValue(undefined);

      const layer = findLayer(createRoleRouter(), 'DELETE', '/:roleId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', roleId: 'role-uuid-1' },
        query: { force: 'true' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(204);
      expect(roleService.deleteRole).toHaveBeenCalledWith('role-uuid-1', true);
    });

    it('should throw 400 when role has assigned users (no force)', async () => {
      vi.mocked(roleService.deleteRole).mockRejectedValue(
        new RbacValidationError('Role has 5 assigned users. Use force=true to delete.'),
      );

      const layer = findLayer(createRoleRouter(), 'DELETE', '/:roleId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', roleId: 'role-uuid-1' },
      });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('Role has 5 assigned users');
    });
  });

  // -------------------------------------------------------------------------
  // GET /:roleId/permissions — List role permissions
  // -------------------------------------------------------------------------

  describe('GET /:roleId/permissions — List role permissions', () => {
    it('should return permissions for the role', async () => {
      const permissions = [createTestPermission()];
      vi.mocked(roleService.getPermissionsForRole).mockResolvedValue(permissions);

      const layer = findLayer(createRoleRouter(), 'GET', '/:roleId/permissions');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', roleId: 'role-uuid-1' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: permissions });
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:roleId/permissions — Assign permissions
  // -------------------------------------------------------------------------

  describe('PUT /:roleId/permissions — Assign permissions', () => {
    it('should return 204 on successful assignment', async () => {
      vi.mocked(roleService.assignPermissionsToRole).mockResolvedValue(undefined);

      const layer = findLayer(createRoleRouter(), 'PUT', '/:roleId/permissions');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', roleId: 'role-uuid-1' },
        body: { permissionIds: ['perm-uuid-1'] },
      });

      // permissionIds must be valid UUIDs for Zod validation (version 4, variant 1)
      ctx.request.body = { permissionIds: ['a0000000-0000-4000-a000-000000000001'] };
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(204);
    });

    it('should return 400 for invalid permission IDs (not UUIDs)', async () => {
      const layer = findLayer(createRoleRouter(), 'PUT', '/:roleId/permissions');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', roleId: 'role-uuid-1' },
        body: { permissionIds: ['not-a-uuid'] },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(400);
      expect((ctx.body as { error: string }).error).toBe('Validation failed');
    });

    it('should return 400 for empty permissions array', async () => {
      const layer = findLayer(createRoleRouter(), 'PUT', '/:roleId/permissions');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', roleId: 'role-uuid-1' },
        body: { permissionIds: [] },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /:roleId/permissions — Remove permissions
  // -------------------------------------------------------------------------

  describe('DELETE /:roleId/permissions — Remove permissions', () => {
    it('should return 204 on successful removal', async () => {
      vi.mocked(roleService.removePermissionsFromRole).mockResolvedValue(undefined);

      const layer = findLayer(createRoleRouter(), 'DELETE', '/:roleId/permissions');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', roleId: 'role-uuid-1' },
        body: { permissionIds: ['a0000000-0000-4000-a000-000000000001'] },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(204);
    });
  });

  // -------------------------------------------------------------------------
  // GET /:roleId/users — List users with role
  // -------------------------------------------------------------------------

  describe('GET /:roleId/users — List users with role', () => {
    it('should return paginated user list', async () => {
      const result = {
        rows: [{ userId: 'user-1', roleId: 'role-uuid-1', assignedBy: null, createdAt: new Date() }] as UserRole[],
        total: 1,
      };
      vi.mocked(userRoleService.getUsersWithRole).mockResolvedValue(result);

      const layer = findLayer(createRoleRouter(), 'GET', '/:roleId/users');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', roleId: 'role-uuid-1' },
        query: { orgId: 'a0000000-0000-4000-a000-000000000001' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: result.rows, total: 1 });
    });

    it('should return 400 when orgId is missing', async () => {
      const layer = findLayer(createRoleRouter(), 'GET', '/:roleId/users');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', roleId: 'role-uuid-1' },
        query: {},
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(400);
      expect((ctx.body as { error: string }).error).toBe('Validation failed');
    });
  });

  // -------------------------------------------------------------------------
  // Router structure
  // -------------------------------------------------------------------------

  describe('router structure', () => {
    it('should have the correct prefix', () => {
      const router = createRoleRouter();
      expect(router.opts.prefix).toBe('/api/admin/applications/:appId/roles');
    });

    it('should register all expected routes', () => {
      const router = createRoleRouter();
      const prefix = '/api/admin/applications/:appId/roles';
      const paths = router.stack.map((l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`);

      expect(paths).toContain(`POST ${prefix}`);
      expect(paths).toContain(`GET ${prefix}`);
      expect(paths).toContain(`GET ${prefix}/:roleId`);
      expect(paths).toContain(`PUT ${prefix}/:roleId`);
      expect(paths).toContain(`DELETE ${prefix}/:roleId`);
      expect(paths).toContain(`GET ${prefix}/:roleId/permissions`);
      expect(paths).toContain(`PUT ${prefix}/:roleId/permissions`);
      expect(paths).toContain(`DELETE ${prefix}/:roleId/permissions`);
      expect(paths).toContain(`GET ${prefix}/:roleId/users`);
    });
  });
});
