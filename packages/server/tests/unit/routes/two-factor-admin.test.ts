import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../../../src/users/types.js';
import type { TwoFactorStatus } from '../../../src/two-factor/types.js';
import { TwoFactorNotEnabledError } from '../../../src/two-factor/errors.js';
import { SuperAdminProtectionError } from '../../../src/lib/super-admin-protection.js';

// Mock all dependencies before importing the module under test.
// vi.mock factories are hoisted — must use inline objects, not const references.

vi.mock('../../../src/users/service.js', () => ({
  getUserById: vi.fn(),
}));

vi.mock('../../../src/two-factor/service.js', () => ({
  getTwoFactorStatus: vi.fn(),
  disableTwoFactor: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
}));

vi.mock('../../../src/lib/super-admin-protection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/super-admin-protection.js')>();
  return {
    ...actual,
    guardSuperAdmin: vi.fn(),
  };
});

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

// Mock admin auth middleware to always pass through
vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

// Mock require-permission to always pass through (permission tests verify correct binding)
vi.mock('../../../src/middleware/require-permission.js', () => ({
  requirePermission: (..._perms: string[]) => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

import { getUserById } from '../../../src/users/service.js';
import { getTwoFactorStatus, disableTwoFactor, regenerateRecoveryCodes } from '../../../src/two-factor/service.js';
import { guardSuperAdmin } from '../../../src/lib/super-admin-protection.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import { createTwoFactorUserAdminRouter } from '../../../src/routes/two-factor-admin.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-a000-000000000001';
const USER_ID = 'b0000000-0000-4000-b000-000000000001';
const ADMIN_ID = 'c0000000-0000-4000-c000-000000000001';
const OTHER_ORG_ID = 'd0000000-0000-4000-d000-000000000002';

function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    organizationId: ORG_ID,
    email: 'user@example.com',
    emailVerified: true,
    hasPassword: true,
    passwordChangedAt: null,
    givenName: 'Test',
    familyName: 'User',
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
    twoFactorEnabled: true,
    twoFactorMethod: 'totp',
    status: 'active',
    lockedAt: null,
    lockedReason: null,
    lastLoginAt: null,
    loginCount: 0,
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const enabledStatus: TwoFactorStatus = {
  enabled: true,
  method: 'totp',
  totpConfigured: true,
  recoveryCodesRemaining: 10,
};

const disabledStatus: TwoFactorStatus = {
  enabled: false,
  method: null,
  totpConfigured: false,
  recoveryCodesRemaining: 0,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock Koa context for route handler testing.
 * Includes adminUser in state for audit log writes.
 */
function createMockCtx(overrides: {
  params?: Record<string, string>;
  body?: unknown;
} = {}) {
  let statusCode = 200;
  let responseBody: unknown = undefined;

  return {
    params: overrides.params ?? { orgId: ORG_ID, userId: USER_ID },
    request: { body: overrides.body ?? {} },
    get status() { return statusCode; },
    set status(v: number) { statusCode = v; },
    get body() { return responseBody; },
    set body(v: unknown) { responseBody = v; },
    state: {
      adminUser: {
        id: ADMIN_ID,
        permissions: ['admin:user:read', 'admin:user:2fa'],
      },
    },
  };
}

/** Find a route layer by method and path suffix */
function findLayer(router: ReturnType<typeof createTwoFactorUserAdminRouter>, method: string, pathSuffix: string) {
  const prefix = '/api/admin/organizations/:orgId/users/:userId/two-factor';
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

describe('two-factor-admin user-level routes', () => {
  beforeEach(() => vi.clearAllMocks());

  // =========================================================================
  // GET /status — MH-1
  // =========================================================================

  describe('GET /status — Get 2FA status', () => {
    it('should return 2FA status for a valid user', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(getTwoFactorStatus).mockResolvedValue(enabledStatus);

      const router = createTwoFactorUserAdminRouter();
      const layer = findLayer(router, 'GET', '/status');
      expect(layer).toBeDefined();

      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(200);
      expect(ctx.body).toEqual({ data: enabledStatus });
      expect(getUserById).toHaveBeenCalledWith(USER_ID);
      expect(getTwoFactorStatus).toHaveBeenCalledWith(USER_ID);
    });

    it('should return disabled status when 2FA is not enabled', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser({ twoFactorEnabled: false, twoFactorMethod: null }));
      vi.mocked(getTwoFactorStatus).mockResolvedValue(disabledStatus);

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'GET', '/status');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: disabledStatus });
    });

    it('should return 404 when user not found', async () => {
      vi.mocked(getUserById).mockResolvedValue(null);

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'GET', '/status');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(404);
      expect(ctx.body).toEqual({ error: 'User not found' });
      expect(getTwoFactorStatus).not.toHaveBeenCalled();
    });

    it('should return 404 when user belongs to a different org', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser({ organizationId: OTHER_ORG_ID }));

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'GET', '/status');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(404);
      expect(ctx.body).toEqual({ error: 'User not found' });
      expect(getTwoFactorStatus).not.toHaveBeenCalled();
    });

    it('should not expose any secret material in response', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(getTwoFactorStatus).mockResolvedValue(enabledStatus);

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'GET', '/status');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      const data = (ctx.body as { data: TwoFactorStatus }).data;
      // Verify only expected fields are present — no secrets, keys, or codes
      expect(Object.keys(data)).toEqual(['enabled', 'method', 'totpConfigured', 'recoveryCodesRemaining']);
    });
  });

  // =========================================================================
  // POST /disable — MH-2
  // =========================================================================

  describe('POST /disable — Disable 2FA', () => {
    it('should disable 2FA and return 204', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(getTwoFactorStatus).mockResolvedValue(enabledStatus);
      vi.mocked(guardSuperAdmin).mockResolvedValue(undefined);
      vi.mocked(disableTwoFactor).mockResolvedValue(undefined);

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/disable');
      expect(layer).toBeDefined();

      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(204);
      expect(guardSuperAdmin).toHaveBeenCalledWith(USER_ID, 'manage-2fa');
      expect(disableTwoFactor).toHaveBeenCalledWith(USER_ID);
    });

    it('should write audit log with correct event type and metadata', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(getTwoFactorStatus).mockResolvedValue(enabledStatus);
      vi.mocked(guardSuperAdmin).mockResolvedValue(undefined);
      vi.mocked(disableTwoFactor).mockResolvedValue(undefined);

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/disable');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: ORG_ID,
        userId: USER_ID,
        actorId: ADMIN_ID,
        eventType: 'user.2fa.disabled',
        eventCategory: 'admin',
        metadata: { previousMethod: 'totp' },
      }));
    });

    it('should return 400 when 2FA is not enabled', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(getTwoFactorStatus).mockResolvedValue(enabledStatus);
      vi.mocked(guardSuperAdmin).mockResolvedValue(undefined);
      vi.mocked(disableTwoFactor).mockRejectedValue(new TwoFactorNotEnabledError(USER_ID));

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/disable');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(400);
      expect(ctx.body).toEqual({ error: 'Two-factor authentication is not enabled for this user' });
    });

    it('should throw SuperAdminProtectionError for super-admin user', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(guardSuperAdmin).mockRejectedValue(new SuperAdminProtectionError('manage-2fa'));

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/disable');
      const ctx = createMockCtx();

      await expect(execHandler(layer!, ctx)).rejects.toThrow(SuperAdminProtectionError);
      expect(disableTwoFactor).not.toHaveBeenCalled();
    });

    it('should return 404 when user belongs to wrong org', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser({ organizationId: OTHER_ORG_ID }));

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/disable');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(404);
      expect(disableTwoFactor).not.toHaveBeenCalled();
    });

    it('should re-throw unknown errors', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(getTwoFactorStatus).mockResolvedValue(enabledStatus);
      vi.mocked(guardSuperAdmin).mockResolvedValue(undefined);
      vi.mocked(disableTwoFactor).mockRejectedValue(new Error('DB connection lost'));

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/disable');
      const ctx = createMockCtx();

      await expect(execHandler(layer!, ctx)).rejects.toThrow('DB connection lost');
    });
  });

  // =========================================================================
  // POST /reset — MH-3
  // =========================================================================

  describe('POST /reset — Reset 2FA', () => {
    it('should reset 2FA and return 204', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(getTwoFactorStatus).mockResolvedValue(enabledStatus);
      vi.mocked(guardSuperAdmin).mockResolvedValue(undefined);
      vi.mocked(disableTwoFactor).mockResolvedValue(undefined);

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/reset');
      expect(layer).toBeDefined();

      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(204);
      expect(disableTwoFactor).toHaveBeenCalledWith(USER_ID);
    });

    it('should write audit log with reset event type (different from disable)', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(getTwoFactorStatus).mockResolvedValue(enabledStatus);
      vi.mocked(guardSuperAdmin).mockResolvedValue(undefined);
      vi.mocked(disableTwoFactor).mockResolvedValue(undefined);

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/reset');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        eventType: 'user.2fa.reset',
        eventCategory: 'admin',
        description: expect.stringContaining('re-enrollment'),
      }));
    });

    it('should return 400 when 2FA is not enabled', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(getTwoFactorStatus).mockResolvedValue(enabledStatus);
      vi.mocked(guardSuperAdmin).mockResolvedValue(undefined);
      vi.mocked(disableTwoFactor).mockRejectedValue(new TwoFactorNotEnabledError(USER_ID));

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/reset');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(400);
    });

    it('should throw SuperAdminProtectionError for super-admin user', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(guardSuperAdmin).mockRejectedValue(new SuperAdminProtectionError('manage-2fa'));

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/reset');
      const ctx = createMockCtx();

      await expect(execHandler(layer!, ctx)).rejects.toThrow(SuperAdminProtectionError);
    });
  });

  // =========================================================================
  // POST /recovery-codes/regenerate — MH-4
  // =========================================================================

  describe('POST /recovery-codes/regenerate — Regenerate recovery codes', () => {
    const mockCodes = ['ABCD-1234', 'EFGH-5678', 'IJKL-9012'];

    it('should regenerate codes and return them', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(guardSuperAdmin).mockResolvedValue(undefined);
      vi.mocked(regenerateRecoveryCodes).mockResolvedValue(mockCodes);

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/recovery-codes/regenerate');
      expect(layer).toBeDefined();

      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(200);
      expect(ctx.body).toEqual({
        data: {
          recoveryCodes: mockCodes,
          count: 3,
          warning: 'These codes will not be shown again. Provide them to the user securely.',
        },
      });
      expect(regenerateRecoveryCodes).toHaveBeenCalledWith(USER_ID);
    });

    it('should write audit log with codesRegenerated event', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(guardSuperAdmin).mockResolvedValue(undefined);
      vi.mocked(regenerateRecoveryCodes).mockResolvedValue(mockCodes);

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/recovery-codes/regenerate');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: ORG_ID,
        userId: USER_ID,
        actorId: ADMIN_ID,
        eventType: 'user.2fa.codesRegenerated',
        eventCategory: 'admin',
      }));
    });

    it('should return 400 when 2FA is not enabled', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(guardSuperAdmin).mockResolvedValue(undefined);
      vi.mocked(regenerateRecoveryCodes).mockRejectedValue(new TwoFactorNotEnabledError(USER_ID));

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/recovery-codes/regenerate');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(400);
      expect(ctx.body).toEqual({ error: 'Two-factor authentication is not enabled for this user' });
    });

    it('should throw SuperAdminProtectionError for super-admin user', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser());
      vi.mocked(guardSuperAdmin).mockRejectedValue(new SuperAdminProtectionError('manage-2fa'));

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/recovery-codes/regenerate');
      const ctx = createMockCtx();

      await expect(execHandler(layer!, ctx)).rejects.toThrow(SuperAdminProtectionError);
      expect(regenerateRecoveryCodes).not.toHaveBeenCalled();
    });

    it('should return 404 when user belongs to wrong org', async () => {
      vi.mocked(getUserById).mockResolvedValue(createTestUser({ organizationId: OTHER_ORG_ID }));

      const layer = findLayer(createTwoFactorUserAdminRouter(), 'POST', '/recovery-codes/regenerate');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(404);
      expect(regenerateRecoveryCodes).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Path parameter validation
  // =========================================================================

  describe('path parameter validation', () => {
    it('should throw ZodError for invalid orgId UUID', async () => {
      const layer = findLayer(createTwoFactorUserAdminRouter(), 'GET', '/status');
      const ctx = createMockCtx({ params: { orgId: 'not-a-uuid', userId: USER_ID } });

      await expect(execHandler(layer!, ctx)).rejects.toThrow();
    });

    it('should throw ZodError for invalid userId UUID', async () => {
      const layer = findLayer(createTwoFactorUserAdminRouter(), 'GET', '/status');
      const ctx = createMockCtx({ params: { orgId: ORG_ID, userId: 'not-a-uuid' } });

      await expect(execHandler(layer!, ctx)).rejects.toThrow();
    });
  });

  // =========================================================================
  // Router structure
  // =========================================================================

  describe('router structure', () => {
    it('should have the correct prefix', () => {
      const router = createTwoFactorUserAdminRouter();
      expect(router.opts.prefix).toBe('/api/admin/organizations/:orgId/users/:userId/two-factor');
    });

    it('should register all 4 expected routes', () => {
      const router = createTwoFactorUserAdminRouter();
      const prefix = '/api/admin/organizations/:orgId/users/:userId/two-factor';
      const paths = router.stack.map(
        (l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`,
      );

      expect(paths).toContain(`GET ${prefix}/status`);
      expect(paths).toContain(`POST ${prefix}/disable`);
      expect(paths).toContain(`POST ${prefix}/reset`);
      expect(paths).toContain(`POST ${prefix}/recovery-codes/regenerate`);
    });
  });
});
