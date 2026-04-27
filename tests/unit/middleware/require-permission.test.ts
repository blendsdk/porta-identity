import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context, Next } from 'koa';
import { requirePermission } from '../../../src/middleware/require-permission.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockContext(adminUser?: {
  id: string;
  email: string;
  organizationId: string;
  roles: string[];
  permissions: readonly string[];
}): Context {
  const ctx = {
    state: {} as Record<string, unknown>,
    status: 200,
    body: undefined as unknown,
  } as unknown as Context;

  if (adminUser) {
    ctx.state.adminUser = adminUser;
  }

  return ctx;
}

const mockNext: Next = vi.fn().mockResolvedValue(undefined);

const superAdminUser = {
  id: 'user-1',
  email: 'admin@test.com',
  organizationId: 'org-1',
  roles: ['porta-super-admin'],
  permissions: [
    'admin:org:create', 'admin:org:read', 'admin:org:update', 'admin:org:suspend', 'admin:org:archive',
    'admin:user:create', 'admin:user:read', 'admin:user:update',
    'admin:audit:read', 'admin:config:read', 'admin:config:update',
  ] as const,
};

const auditorUser = {
  id: 'user-2',
  email: 'auditor@test.com',
  organizationId: 'org-1',
  roles: ['porta-auditor'],
  permissions: ['admin:audit:read', 'admin:org:read', 'admin:user:read', 'admin:export:read'] as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requirePermission middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when adminUser is not set (auth middleware not run)', () => {
    it('should return 401', async () => {
      const ctx = createMockContext();
      const middleware = requirePermission('admin:org:read');

      await middleware(ctx, mockNext);

      expect(ctx.status).toBe(401);
      expect((ctx.body as { error: string }).error).toBe('Authentication required');
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('when user has the required permission', () => {
    it('should call next for a single permission', async () => {
      const ctx = createMockContext(superAdminUser);
      const middleware = requirePermission('admin:org:create');

      await middleware(ctx, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
      expect(ctx.status).toBe(200); // unchanged
    });

    it('should call next when user has all required permissions', async () => {
      const ctx = createMockContext(superAdminUser);
      const middleware = requirePermission('admin:org:create', 'admin:org:read');

      await middleware(ctx, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should call next with no required permissions (empty check)', async () => {
      const ctx = createMockContext(auditorUser);
      const middleware = requirePermission();

      await middleware(ctx, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
    });
  });

  describe('when user lacks the required permission', () => {
    it('should return 403 for a single missing permission', async () => {
      const ctx = createMockContext(auditorUser);
      const middleware = requirePermission('admin:org:create');

      await middleware(ctx, mockNext);

      expect(ctx.status).toBe(403);
      expect((ctx.body as { error: string }).error).toBe('Forbidden');
      expect((ctx.body as { message: string }).message).toContain('admin:org:create');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user has some but not all required permissions', async () => {
      const ctx = createMockContext(auditorUser);
      // auditor has audit:read but not config:update
      const middleware = requirePermission('admin:audit:read', 'admin:config:update');

      await middleware(ctx, mockNext);

      expect(ctx.status).toBe(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should include required permissions in error message', async () => {
      const ctx = createMockContext(auditorUser);
      const middleware = requirePermission('admin:org:create', 'admin:org:update');

      await middleware(ctx, mockNext);

      const body = ctx.body as { message: string };
      expect(body.message).toContain('admin:org:create');
      expect(body.message).toContain('admin:org:update');
    });
  });

  describe('permission checks for different roles', () => {
    it('should allow super-admin to access any permission', async () => {
      const ctx = createMockContext(superAdminUser);
      const middleware = requirePermission('admin:org:create', 'admin:audit:read', 'admin:config:update');

      await middleware(ctx, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should restrict auditor to read-only permissions', async () => {
      // Auditor can read
      const readCtx = createMockContext(auditorUser);
      await requirePermission('admin:audit:read')(readCtx, mockNext);
      expect(mockNext).toHaveBeenCalled();

      // Auditor cannot create
      vi.clearAllMocks();
      const createCtx = createMockContext(auditorUser);
      await requirePermission('admin:org:create')(createCtx, mockNext);
      expect(createCtx.status).toBe(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
