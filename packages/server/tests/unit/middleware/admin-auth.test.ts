/**
 * Unit tests for the admin auth middleware.
 *
 * Tests all scenarios for opaque access token validation:
 *   - 401: missing header, non-Bearer, token not found, no accountId,
 *           token lookup throws, user not found
 *   - 403: user not in super-admin org, user lacks admin role
 *   - 500: provider not set, no super-admin org
 *   - 200: happy path sets ctx.state.adminUser
 *
 * Uses a mock OIDC provider with AccessToken.find() to simulate opaque
 * token validation. All external dependencies (DB, Redis) are mocked.
 *
 * Note: With opaque tokens (vs JWTs), scenarios like "bad signature",
 * "expired", and "wrong issuer" all result in the provider returning
 * undefined from AccessToken.find() — they are covered by the
 * "token not found" test case.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock OIDC provider — simulates provider.AccessToken.find()
// ---------------------------------------------------------------------------

const mockAccessTokenFind = vi.fn();
const mockProvider = {
  AccessToken: { find: mockAccessTokenFind },
};

// ---------------------------------------------------------------------------
// Mocks — hoisted before module import
// ---------------------------------------------------------------------------

vi.mock('../../../src/users/service.js', () => ({
  findUserForOidc: vi.fn(),
}));

vi.mock('../../../src/organizations/repository.js', () => ({
  findSuperAdminOrganization: vi.fn(),
}));

vi.mock('../../../src/rbac/user-role-service.js', () => ({
  getUserRoles: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { requireAdminAuth, setAdminAuthProvider } from '../../../src/middleware/admin-auth.js';
import { findUserForOidc } from '../../../src/users/service.js';
import { findSuperAdminOrganization } from '../../../src/organizations/repository.js';
import { getUserRoles } from '../../../src/rbac/user-role-service.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SUPER_ADMIN_ORG = {
  id: 'org-admin-uuid',
  name: 'Porta Admin',
  slug: 'porta-admin',
  status: 'active' as const,
  isSuperAdmin: true,
  brandingLogoUrl: null,
  brandingFaviconUrl: null,
  brandingPrimaryColor: null,
  brandingCompanyName: null,
  brandingCustomCss: null,
  defaultLocale: 'en',
  defaultLoginMethods: ['password' as const, 'magic_link' as const],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ADMIN_USER = {
  id: 'user-admin-uuid',
  email: 'admin@example.com',
  organizationId: 'org-admin-uuid',
  status: 'active',
};

const ADMIN_ROLES = [
  { id: 'role-1', applicationId: 'app-1', name: 'Admin', slug: 'porta-admin', description: null, createdAt: new Date(), updatedAt: new Date() },
];

/** Simulated opaque access token returned by provider.AccessToken.find() */
const VALID_ACCESS_TOKEN = {
  accountId: 'user-admin-uuid',
  clientId: 'cli-client-id',
  scope: 'openid',
};

/**
 * Create a minimal mock Koa context.
 */
function createMockCtx(authHeader?: string) {
  let statusCode = 200;
  let responseBody: unknown = undefined;

  return {
    get: vi.fn((name: string) => {
      if (name === 'Authorization') return authHeader ?? '';
      return '';
    }),
    get status() { return statusCode; },
    set status(v: number) { statusCode = v; },
    get body() { return responseBody; },
    set body(v: unknown) { responseBody = v; },
    state: {} as Record<string, unknown>,
  };
}

/** Set up all mocks for the happy path */
function setupHappyPath(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setAdminAuthProvider(mockProvider as any);
  mockAccessTokenFind.mockResolvedValue(VALID_ACCESS_TOKEN);
  vi.mocked(findSuperAdminOrganization).mockResolvedValue(SUPER_ADMIN_ORG);
  vi.mocked(findUserForOidc).mockResolvedValue(ADMIN_USER as never);
  vi.mocked(getUserRoles).mockResolvedValue(ADMIN_ROLES as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('admin auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset provider to null state — "provider not set" test depends on this
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAdminAuthProvider(null as any);
  });

  // -------------------------------------------------------------------------
  // 401 — Authentication failures
  // -------------------------------------------------------------------------

  describe('returns 401', () => {
    it('when no Authorization header is present', async () => {
      const middleware = requireAdminAuth();
      const ctx = createMockCtx(undefined);
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(401);
      expect((ctx.body as { error: string }).error).toBe('Authentication required');
      expect(next).not.toHaveBeenCalled();
    });

    it('when Authorization header is not Bearer', async () => {
      const middleware = requireAdminAuth();
      const ctx = createMockCtx('Basic dXNlcjpwYXNz');
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(401);
      expect((ctx.body as { error: string }).error).toBe('Authentication required');
      expect(next).not.toHaveBeenCalled();
    });

    it('when token is not found by provider (invalid, expired, or revoked)', async () => {
      setupHappyPath();
      // Provider returns undefined — token doesn't exist in the store
      mockAccessTokenFind.mockResolvedValue(undefined);

      const middleware = requireAdminAuth();
      const ctx = createMockCtx('Bearer some-opaque-token-value');
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(401);
      expect((ctx.body as { error: string }).error).toBe('Invalid token');
      expect(mockAccessTokenFind).toHaveBeenCalledWith('some-opaque-token-value');
      expect(next).not.toHaveBeenCalled();
    });

    it('when access token has no accountId', async () => {
      setupHappyPath();
      // Token exists but has no accountId (e.g., client_credentials grant)
      mockAccessTokenFind.mockResolvedValue({ clientId: 'some-client', scope: 'openid' });

      const middleware = requireAdminAuth();
      const ctx = createMockCtx('Bearer token-without-account');
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(401);
      expect((ctx.body as { error: string }).error).toBe('Invalid token');
      expect(next).not.toHaveBeenCalled();
    });

    it('when access token lookup throws an error', async () => {
      setupHappyPath();
      // Provider throws (e.g., Redis connection error)
      mockAccessTokenFind.mockRejectedValue(new Error('Redis connection lost'));

      const middleware = requireAdminAuth();
      const ctx = createMockCtx('Bearer some-token');
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(401);
      expect((ctx.body as { error: string }).error).toBe('Invalid token');
      expect(next).not.toHaveBeenCalled();
    });

    it('when user is not found (deleted or inactive)', async () => {
      setupHappyPath();
      vi.mocked(findUserForOidc).mockResolvedValue(null);

      const middleware = requireAdminAuth();
      const ctx = createMockCtx('Bearer valid-token');
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(401);
      expect((ctx.body as { message: string }).message).toBe('User not found or not active');
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 403 — Authorization failures
  // -------------------------------------------------------------------------

  describe('returns 403', () => {
    it('when user is not in super-admin organization', async () => {
      setupHappyPath();
      // User is in a different organization
      vi.mocked(findUserForOidc).mockResolvedValue({
        ...ADMIN_USER,
        organizationId: 'other-org-uuid',
      } as never);

      const middleware = requireAdminAuth();
      const ctx = createMockCtx('Bearer valid-token');
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(403);
      expect((ctx.body as { error: string }).error).toBe('Forbidden');
      expect((ctx.body as { message: string }).message).toContain('admin organization');
      expect(next).not.toHaveBeenCalled();
    });

    it('when user lacks porta-admin role', async () => {
      setupHappyPath();
      // User has roles but not porta-admin
      vi.mocked(getUserRoles).mockResolvedValue([
        { id: 'role-2', applicationId: 'app-1', name: 'Viewer', slug: 'viewer', description: null, createdAt: new Date(), updatedAt: new Date() },
      ] as never);

      const middleware = requireAdminAuth();
      const ctx = createMockCtx('Bearer valid-token');
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(403);
      expect((ctx.body as { message: string }).message).toBe('Admin role required');
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 500 — System not initialized
  // -------------------------------------------------------------------------

  describe('returns 500', () => {
    it('when OIDC provider is not set', async () => {
      // Provider is null (not set via setAdminAuthProvider) — beforeEach resets it
      const middleware = requireAdminAuth();
      const ctx = createMockCtx('Bearer some-token');
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(500);
      expect((ctx.body as { error: string }).error).toBe('Server configuration error');
      expect(next).not.toHaveBeenCalled();
    });

    it('when super-admin organization does not exist', async () => {
      setupHappyPath();
      vi.mocked(findSuperAdminOrganization).mockResolvedValue(null);

      const middleware = requireAdminAuth();
      const ctx = createMockCtx('Bearer valid-token');
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(500);
      expect((ctx.body as { error: string }).error).toBe('Server configuration error');
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Happy path — full authentication + authorization
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('sets ctx.state.adminUser and calls next() for valid admin', async () => {
      setupHappyPath();

      const middleware = requireAdminAuth();
      const ctx = createMockCtx('Bearer valid-opaque-token');
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(next).toHaveBeenCalledOnce();
      expect(ctx.state.adminUser).toBeDefined();
      expect(ctx.state.adminUser).toEqual({
        id: 'user-admin-uuid',
        email: 'admin@example.com',
        organizationId: 'org-admin-uuid',
        roles: ['porta-admin'],
        permissions: expect.any(Array),
      });
      // Legacy porta-admin resolves to all permissions (super-admin equivalent)
      expect((ctx.state.adminUser as { permissions: string[] }).permissions.length).toBeGreaterThan(0);
      // Verify the token was looked up with the correct value
      expect(mockAccessTokenFind).toHaveBeenCalledWith('valid-opaque-token');
    });

    it('includes only porta-* role slugs in adminUser.roles', async () => {
      setupHappyPath();
      vi.mocked(getUserRoles).mockResolvedValue([
        { id: 'r1', applicationId: 'app-1', name: 'Admin', slug: 'porta-super-admin', description: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'r2', applicationId: 'app-1', name: 'Auditor', slug: 'porta-auditor', description: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'r3', applicationId: 'app-1', name: 'Custom', slug: 'custom-role', description: null, createdAt: new Date(), updatedAt: new Date() },
      ] as never);

      const middleware = requireAdminAuth();
      const ctx = createMockCtx('Bearer valid-opaque-token');
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(next).toHaveBeenCalledOnce();
      expect(ctx.state.adminUser).toBeDefined();
      // Only porta-* roles are included, not custom-role
      expect((ctx.state.adminUser as { roles: string[] }).roles).toEqual([
        'porta-super-admin',
        'porta-auditor',
      ]);
      // Permissions should be resolved from both admin roles
      expect((ctx.state.adminUser as { permissions: string[] }).permissions.length).toBeGreaterThan(0);
    });
  });
});
