import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Permission, Role } from '../../../src/rbac/types.js';
import { PermissionNotFoundError, RbacValidationError } from '../../../src/rbac/errors.js';

// Mock all dependencies before importing the module under test.
// vi.mock factories are hoisted — must use inline objects, not const references.
vi.mock('../../../src/rbac/permission-service.js', () => ({
  createPermission: vi.fn(),
  findPermissionById: vi.fn(),
  findPermissionBySlug: vi.fn(),
  listPermissionsByApplication: vi.fn(),
  updatePermission: vi.fn(),
  deletePermission: vi.fn(),
  getRolesWithPermission: vi.fn(),
}));

// Mock super-admin middleware to always pass through
vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

import * as permissionService from '../../../src/rbac/permission-service.js';
import { createPermissionRouter } from '../../../src/routes/permissions.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

/** Standard test role (for getRolesWithPermission results) */
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
function findLayer(router: ReturnType<typeof createPermissionRouter>, method: string, pathSuffix: string) {
  const prefix = '/api/admin/applications/:appId/permissions';
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

describe('permission routes', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // POST / — Create permission
  // -------------------------------------------------------------------------

  describe('POST / — Create permission', () => {
    it('should return 201 with created permission', async () => {
      const permission = createTestPermission();
      vi.mocked(permissionService.createPermission).mockResolvedValue(permission);

      const layer = findLayer(createPermissionRouter(), 'POST', '');
      expect(layer).toBeDefined();

      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1' },
        body: { name: 'Read Contacts', slug: 'crm:contacts:read' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(201);
      expect(ctx.body).toEqual({ data: permission });
      expect(permissionService.createPermission).toHaveBeenCalledWith({
        applicationId: 'app-uuid-1',
        name: 'Read Contacts',
        slug: 'crm:contacts:read',
      });
    });

    it('should return 400 for invalid input (missing required fields)', async () => {
      const layer = findLayer(createPermissionRouter(), 'POST', '');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1' }, body: {} });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(400);
      expect((ctx.body as { error: string }).error).toBe('Validation failed');
    });

    it('should return 400 for invalid slug format', async () => {
      vi.mocked(permissionService.createPermission).mockRejectedValue(
        new RbacValidationError('Invalid permission slug format'),
      );

      const layer = findLayer(createPermissionRouter(), 'POST', '');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1' },
        body: { name: 'Bad Permission', slug: 'INVALID' },
      });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('Invalid permission slug format');
    });
  });

  // -------------------------------------------------------------------------
  // GET / — List permissions
  // -------------------------------------------------------------------------

  describe('GET / — List permissions', () => {
    it('should return list of permissions for application', async () => {
      const permissions = [createTestPermission()];
      vi.mocked(permissionService.listPermissionsByApplication).mockResolvedValue(permissions);

      const layer = findLayer(createPermissionRouter(), 'GET', '');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1' } });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: permissions });
      expect(permissionService.listPermissionsByApplication).toHaveBeenCalledWith('app-uuid-1', undefined);
    });

    it('should pass moduleId filter when provided', async () => {
      vi.mocked(permissionService.listPermissionsByApplication).mockResolvedValue([]);

      const layer = findLayer(createPermissionRouter(), 'GET', '');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1' },
        query: { moduleId: 'a0000000-0000-4000-a000-000000000001' },
      });
      await execHandler(layer!, ctx);

      expect(permissionService.listPermissionsByApplication).toHaveBeenCalledWith(
        'app-uuid-1',
        'a0000000-0000-4000-a000-000000000001',
      );
    });

    it('should return empty array when no permissions exist', async () => {
      vi.mocked(permissionService.listPermissionsByApplication).mockResolvedValue([]);

      const layer = findLayer(createPermissionRouter(), 'GET', '');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1' } });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: [] });
    });
  });

  // -------------------------------------------------------------------------
  // GET /:permId — Get permission by ID
  // -------------------------------------------------------------------------

  describe('GET /:permId — Get permission by ID', () => {
    it('should return permission when found', async () => {
      const permission = createTestPermission();
      vi.mocked(permissionService.findPermissionById).mockResolvedValue(permission);

      const layer = findLayer(createPermissionRouter(), 'GET', '/:permId');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1', permId: 'perm-uuid-1' } });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: permission });
    });

    it('should throw 404 when permission not found', async () => {
      vi.mocked(permissionService.findPermissionById).mockResolvedValue(null);

      const layer = findLayer(createPermissionRouter(), 'GET', '/:permId');
      const ctx = createMockCtx({ params: { appId: 'app-uuid-1', permId: 'nonexistent' } });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('Permission not found');
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:permId — Update permission
  // -------------------------------------------------------------------------

  describe('PUT /:permId — Update permission', () => {
    it('should return updated permission', async () => {
      const permission = createTestPermission({ name: 'Updated' });
      vi.mocked(permissionService.updatePermission).mockResolvedValue(permission);

      const layer = findLayer(createPermissionRouter(), 'PUT', '/:permId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', permId: 'perm-uuid-1' },
        body: { name: 'Updated' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: permission });
      expect(permissionService.updatePermission).toHaveBeenCalledWith('perm-uuid-1', { name: 'Updated' });
    });

    it('should throw 404 when permission not found', async () => {
      vi.mocked(permissionService.updatePermission).mockRejectedValue(
        new PermissionNotFoundError('nonexistent'),
      );

      const layer = findLayer(createPermissionRouter(), 'PUT', '/:permId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', permId: 'nonexistent' },
        body: { name: 'Test' },
      });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('Permission not found');
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /:permId — Delete permission
  // -------------------------------------------------------------------------

  describe('DELETE /:permId — Delete permission', () => {
    it('should return 204 on successful delete', async () => {
      vi.mocked(permissionService.deletePermission).mockResolvedValue(undefined);

      const layer = findLayer(createPermissionRouter(), 'DELETE', '/:permId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', permId: 'perm-uuid-1' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(204);
      expect(permissionService.deletePermission).toHaveBeenCalledWith('perm-uuid-1', false);
    });

    it('should pass force=true when query param is set', async () => {
      vi.mocked(permissionService.deletePermission).mockResolvedValue(undefined);

      const layer = findLayer(createPermissionRouter(), 'DELETE', '/:permId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', permId: 'perm-uuid-1' },
        query: { force: 'true' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(204);
      expect(permissionService.deletePermission).toHaveBeenCalledWith('perm-uuid-1', true);
    });

    it('should throw 400 when permission is used by roles (no force)', async () => {
      vi.mocked(permissionService.deletePermission).mockRejectedValue(
        new RbacValidationError('Permission is used by 3 roles. Use force=true to delete.'),
      );

      const layer = findLayer(createPermissionRouter(), 'DELETE', '/:permId');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', permId: 'perm-uuid-1' },
      });

      await expect(execHandler(layer!, ctx)).rejects.toThrow('Permission is used by 3 roles');
    });
  });

  // -------------------------------------------------------------------------
  // GET /:permId/roles — List roles with permission
  // -------------------------------------------------------------------------

  describe('GET /:permId/roles — List roles with permission', () => {
    it('should return roles that have this permission', async () => {
      const roles = [createTestRole()];
      vi.mocked(permissionService.getRolesWithPermission).mockResolvedValue(roles);

      const layer = findLayer(createPermissionRouter(), 'GET', '/:permId/roles');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', permId: 'perm-uuid-1' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: roles });
    });

    it('should return empty array when no roles have this permission', async () => {
      vi.mocked(permissionService.getRolesWithPermission).mockResolvedValue([]);

      const layer = findLayer(createPermissionRouter(), 'GET', '/:permId/roles');
      const ctx = createMockCtx({
        params: { appId: 'app-uuid-1', permId: 'perm-uuid-1' },
      });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: [] });
    });
  });

  // -------------------------------------------------------------------------
  // Router structure
  // -------------------------------------------------------------------------

  describe('router structure', () => {
    it('should have the correct prefix', () => {
      const router = createPermissionRouter();
      expect(router.opts.prefix).toBe('/api/admin/applications/:appId/permissions');
    });

    it('should register all expected routes', () => {
      const router = createPermissionRouter();
      const prefix = '/api/admin/applications/:appId/permissions';
      const paths = router.stack.map((l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`);

      expect(paths).toContain(`POST ${prefix}`);
      expect(paths).toContain(`GET ${prefix}`);
      expect(paths).toContain(`GET ${prefix}/:permId`);
      expect(paths).toContain(`PUT ${prefix}/:permId`);
      expect(paths).toContain(`DELETE ${prefix}/:permId`);
      expect(paths).toContain(`GET ${prefix}/:permId/roles`);
    });
  });
});
