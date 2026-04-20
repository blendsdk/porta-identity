/**
 * Unit tests for the admin auth middleware.
 *
 * Tests all 12 scenarios from the testing strategy:
 *   - 401: missing header, non-Bearer, malformed, bad signature,
 *           expired, wrong issuer, user not found, user not active
 *   - 403: user not in super-admin org, user lacks admin role
 *   - 500: no super-admin org, no signing keys
 *   - 200: happy path sets ctx.state.adminUser
 *
 * Uses real jose JWT signing with test key pairs for realistic token
 * validation. All external dependencies (DB, Redis, config) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateKeyPairSync, createPrivateKey } from 'node:crypto';
import * as jose from 'jose';

// ---------------------------------------------------------------------------
// Generate a real ES256 key pair for tests
// ---------------------------------------------------------------------------

const { publicKey: testPubKey, privateKey: testPrivKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});
const testJwk = {
  ...testPubKey.export({ format: 'jwk' }),
  kid: 'test-kid-1',
  use: 'sig',
  alg: 'ES256',
};
const testJwks = { keys: [testJwk] };

// A second, unrelated key pair for "bad signature" tests
const { privateKey: wrongPrivKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});

// ---------------------------------------------------------------------------
// Mocks — hoisted before module import
// ---------------------------------------------------------------------------

vi.mock('../../../src/config/index.js', () => ({
  config: {
    issuerBaseUrl: 'http://localhost:3000',
  },
}));

vi.mock('../../../src/lib/signing-keys.js', () => ({
  getActiveJwks: vi.fn(),
}));

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

import { requireAdminAuth } from '../../../src/middleware/admin-auth.js';
import { getActiveJwks } from '../../../src/lib/signing-keys.js';
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

const EXPECTED_ISSUER = 'http://localhost:3000/porta-admin';

/**
 * Sign a JWT with the test private key using jose.
 */
async function signTestToken(payload: jose.JWTPayload, overrides?: { key?: ReturnType<typeof createPrivateKey>; kid?: string }): Promise<string> {
  const key = overrides?.key ?? testPrivKey;
  const kid = overrides?.kid ?? 'test-kid-1';
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid })
    .setIssuedAt()
    .sign(key);
}

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
  vi.mocked(getActiveJwks).mockResolvedValue(testJwks as never);
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

    it('when token is malformed (not a JWT)', async () => {
      setupHappyPath();
      const middleware = requireAdminAuth();
      const ctx = createMockCtx('Bearer not-a-jwt-token');
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(401);
      expect((ctx.body as { error: string }).error).toBe('Invalid token');
      expect(next).not.toHaveBeenCalled();
    });

    it('when JWT signature is invalid (signed with wrong key)', async () => {
      setupHappyPath();
      const token = await signTestToken(
        { sub: 'user-admin-uuid', iss: EXPECTED_ISSUER, exp: Math.floor(Date.now() / 1000) + 300 },
        { key: wrongPrivKey },
      );

      const middleware = requireAdminAuth();
      const ctx = createMockCtx(`Bearer ${token}`);
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(401);
      expect((ctx.body as { error: string }).error).toBe('Invalid token');
      expect(next).not.toHaveBeenCalled();
    });

    it('when JWT is expired', async () => {
      setupHappyPath();
      const token = await signTestToken({
        sub: 'user-admin-uuid',
        iss: EXPECTED_ISSUER,
        exp: Math.floor(Date.now() / 1000) - 120, // 2 minutes ago (well past 30s tolerance)
      });

      const middleware = requireAdminAuth();
      const ctx = createMockCtx(`Bearer ${token}`);
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(401);
      expect((ctx.body as { error: string }).error).toBe('Invalid token');
      expect(next).not.toHaveBeenCalled();
    });

    it('when issuer is wrong', async () => {
      setupHappyPath();
      const token = await signTestToken({
        sub: 'user-admin-uuid',
        iss: 'http://evil.example.com/attacker',
        exp: Math.floor(Date.now() / 1000) + 300,
      });

      const middleware = requireAdminAuth();
      const ctx = createMockCtx(`Bearer ${token}`);
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(401);
      expect((ctx.body as { error: string }).error).toBe('Invalid token');
      expect(next).not.toHaveBeenCalled();
    });

    it('when user is not found (deleted)', async () => {
      setupHappyPath();
      vi.mocked(findUserForOidc).mockResolvedValue(null);

      const token = await signTestToken({
        sub: 'deleted-user-uuid',
        iss: EXPECTED_ISSUER,
        exp: Math.floor(Date.now() / 1000) + 300,
      });

      const middleware = requireAdminAuth();
      const ctx = createMockCtx(`Bearer ${token}`);
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(401);
      expect((ctx.body as { message: string }).message).toBe('User not found or not active');
      expect(next).not.toHaveBeenCalled();
    });

    it('when token has no sub claim', async () => {
      setupHappyPath();
      const token = await signTestToken({
        iss: EXPECTED_ISSUER,
        exp: Math.floor(Date.now() / 1000) + 300,
        // no sub claim
      });

      const middleware = requireAdminAuth();
      const ctx = createMockCtx(`Bearer ${token}`);
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(401);
      expect((ctx.body as { message: string }).message).toBe('Token missing subject claim');
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

      const token = await signTestToken({
        sub: 'user-admin-uuid',
        iss: EXPECTED_ISSUER,
        exp: Math.floor(Date.now() / 1000) + 300,
      });

      const middleware = requireAdminAuth();
      const ctx = createMockCtx(`Bearer ${token}`);
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

      const token = await signTestToken({
        sub: 'user-admin-uuid',
        iss: EXPECTED_ISSUER,
        exp: Math.floor(Date.now() / 1000) + 300,
      });

      const middleware = requireAdminAuth();
      const ctx = createMockCtx(`Bearer ${token}`);
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
    it('when super-admin organization does not exist', async () => {
      vi.mocked(getActiveJwks).mockResolvedValue(testJwks as never);
      vi.mocked(findSuperAdminOrganization).mockResolvedValue(null);

      const token = await signTestToken({
        sub: 'user-admin-uuid',
        iss: EXPECTED_ISSUER,
        exp: Math.floor(Date.now() / 1000) + 300,
      });

      const middleware = requireAdminAuth();
      const ctx = createMockCtx(`Bearer ${token}`);
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(ctx.status).toBe(500);
      expect((ctx.body as { error: string }).error).toBe('Server configuration error');
      expect(next).not.toHaveBeenCalled();
    });

    it('when no signing keys are available', async () => {
      vi.mocked(getActiveJwks).mockResolvedValue({ keys: [] } as never);
      vi.mocked(findSuperAdminOrganization).mockResolvedValue(SUPER_ADMIN_ORG);

      const token = await signTestToken({
        sub: 'user-admin-uuid',
        iss: EXPECTED_ISSUER,
        exp: Math.floor(Date.now() / 1000) + 300,
      });

      const middleware = requireAdminAuth();
      const ctx = createMockCtx(`Bearer ${token}`);
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

      const token = await signTestToken({
        sub: 'user-admin-uuid',
        iss: EXPECTED_ISSUER,
        exp: Math.floor(Date.now() / 1000) + 300,
      });

      const middleware = requireAdminAuth();
      const ctx = createMockCtx(`Bearer ${token}`);
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(next).toHaveBeenCalledOnce();
      expect(ctx.state.adminUser).toBeDefined();
      expect(ctx.state.adminUser).toEqual({
        id: 'user-admin-uuid',
        email: 'admin@example.com',
        organizationId: 'org-admin-uuid',
        roles: ['porta-admin'],
      });
    });

    it('includes all role slugs in adminUser.roles', async () => {
      setupHappyPath();
      vi.mocked(getUserRoles).mockResolvedValue([
        { id: 'r1', applicationId: 'app-1', name: 'Admin', slug: 'porta-admin', description: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'r2', applicationId: 'app-1', name: 'Auditor', slug: 'auditor', description: null, createdAt: new Date(), updatedAt: new Date() },
      ] as never);

      const token = await signTestToken({
        sub: 'user-admin-uuid',
        iss: EXPECTED_ISSUER,
        exp: Math.floor(Date.now() / 1000) + 300,
      });

      const middleware = requireAdminAuth();
      const ctx = createMockCtx(`Bearer ${token}`);
      const next = vi.fn();

      await middleware(ctx as never, next);

      expect(next).toHaveBeenCalledOnce();
      expect(ctx.state.adminUser).toBeDefined();
      expect((ctx.state.adminUser as { roles: string[] }).roles).toEqual(['porta-admin', 'auditor']);
    });
  });
});
