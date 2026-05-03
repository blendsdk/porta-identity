import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Organization } from '../../../src/organizations/types.js';
import type { TwoFactorSummary } from '../../../src/two-factor/service.js';

// Mock all dependencies before importing the module under test.
vi.mock('../../../src/organizations/service.js', () => ({
  getOrganizationById: vi.fn(),
  updateOrganization: vi.fn(),
}));

vi.mock('../../../src/two-factor/service.js', () => ({
  getTwoFactorSummary: vi.fn(),
  // user-level mocks (needed because they're imported in the same module)
  getTwoFactorStatus: vi.fn(),
  disableTwoFactor: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
}));

vi.mock('../../../src/users/service.js', () => ({
  getUserById: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock('../../../src/lib/super-admin-protection.js', () => ({
  guardSuperAdmin: vi.fn(),
}));

vi.mock('../../../src/lib/etag.js', () => ({
  setETagHeader: vi.fn(),
  checkIfMatch: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/middleware/require-permission.js', () => ({
  requirePermission: (..._perms: string[]) => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

import { getOrganizationById, updateOrganization } from '../../../src/organizations/service.js';
import { getTwoFactorSummary } from '../../../src/two-factor/service.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import { checkIfMatch, setETagHeader } from '../../../src/lib/etag.js';
import { createTwoFactorOrgAdminRouter } from '../../../src/routes/two-factor-admin.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-a000-000000000001';
const ADMIN_ID = 'c0000000-0000-4000-c000-000000000001';

function createTestOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: ORG_ID,
    name: 'Acme Corp',
    slug: 'acme-corp',
    status: 'active',
    isSuperAdmin: false,
    brandingLogoUrl: null,
    defaultLocale: 'en',
    twoFactorPolicy: 'optional',
    defaultLoginMethods: ['password', 'magic_link'],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as Organization;
}

const mockSummary: TwoFactorSummary = {
  totalUsers: 50,
  enabledCount: 35,
  disabledCount: 15,
  totpCount: 20,
  emailCount: 15,
  complianceRate: 0.7,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockCtx(overrides: {
  params?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
} = {}) {
  let statusCode = 200;
  let responseBody: unknown = undefined;
  const responseHeaders: Record<string, string> = {};

  return {
    params: overrides.params ?? { orgId: ORG_ID },
    request: { body: overrides.body ?? {} },
    get status() { return statusCode; },
    set status(v: number) { statusCode = v; },
    get body() { return responseBody; },
    set body(v: unknown) { responseBody = v; },
    get: (field: string) => (overrides.headers ?? {})[field] ?? '',
    set: (field: string, value: string) => { responseHeaders[field] = value; },
    _responseHeaders: responseHeaders,
    state: {
      adminUser: {
        id: ADMIN_ID,
        permissions: ['admin:org:read', 'admin:org:update'],
      },
    },
  };
}

function findLayer(router: ReturnType<typeof createTwoFactorOrgAdminRouter>, method: string, pathSuffix: string) {
  const prefix = '/api/admin/organizations/:orgId/two-factor';
  return router.stack.find(
    (l) => l.methods.includes(method) && l.path === `${prefix}${pathSuffix}`,
  );
}

async function execHandler(layer: NonNullable<ReturnType<typeof findLayer>>, ctx: ReturnType<typeof createMockCtx>) {
  const next = vi.fn();
  await layer.stack[layer.stack.length - 1](ctx as never, next);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('two-factor-admin org-level routes', () => {
  beforeEach(() => vi.clearAllMocks());

  // =========================================================================
  // GET /policy — SH-1
  // =========================================================================

  describe('GET /policy — Get org 2FA policy', () => {
    it('should return policy for valid org', async () => {
      vi.mocked(getOrganizationById).mockResolvedValue(createTestOrg());

      const layer = findLayer(createTwoFactorOrgAdminRouter(), 'GET', '/policy');
      expect(layer).toBeDefined();

      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(200);
      expect(ctx.body).toEqual({
        data: {
          twoFactorPolicy: 'optional',
          validPolicies: ['optional', 'required_email', 'required_totp', 'required_any'],
        },
      });
      expect(setETagHeader).toHaveBeenCalled();
    });

    it('should return 404 when org not found', async () => {
      vi.mocked(getOrganizationById).mockResolvedValue(null);

      const layer = findLayer(createTwoFactorOrgAdminRouter(), 'GET', '/policy');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(404);
      expect(ctx.body).toEqual({ error: 'Organization not found' });
    });
  });

  // =========================================================================
  // PUT /policy — SH-2
  // =========================================================================

  describe('PUT /policy — Update org 2FA policy', () => {
    it('should update policy and return updated value', async () => {
      const org = createTestOrg();
      const updated = createTestOrg({ twoFactorPolicy: 'required_totp', updatedAt: new Date('2026-01-02') });
      vi.mocked(getOrganizationById).mockResolvedValue(org);
      vi.mocked(checkIfMatch).mockReturnValue(true);
      vi.mocked(updateOrganization).mockResolvedValue(updated);

      const layer = findLayer(createTwoFactorOrgAdminRouter(), 'PUT', '/policy');
      expect(layer).toBeDefined();

      const ctx = createMockCtx({ body: { twoFactorPolicy: 'required_totp' } });
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({
        data: {
          twoFactorPolicy: 'required_totp',
          validPolicies: ['optional', 'required_email', 'required_totp', 'required_any'],
        },
      });
      expect(updateOrganization).toHaveBeenCalledWith(ORG_ID, { twoFactorPolicy: 'required_totp' });
    });

    it('should write audit log with previous and new policy', async () => {
      const org = createTestOrg();
      const updated = createTestOrg({ twoFactorPolicy: 'required_email' });
      vi.mocked(getOrganizationById).mockResolvedValue(org);
      vi.mocked(checkIfMatch).mockReturnValue(true);
      vi.mocked(updateOrganization).mockResolvedValue(updated);

      const layer = findLayer(createTwoFactorOrgAdminRouter(), 'PUT', '/policy');
      const ctx = createMockCtx({ body: { twoFactorPolicy: 'required_email' } });
      await execHandler(layer!, ctx);

      expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: ORG_ID,
        actorId: ADMIN_ID,
        eventType: 'org.2fa.policyChanged',
        metadata: { previousPolicy: 'optional', newPolicy: 'required_email' },
      }));
    });

    it('should return 404 when org not found', async () => {
      vi.mocked(getOrganizationById).mockResolvedValue(null);

      const layer = findLayer(createTwoFactorOrgAdminRouter(), 'PUT', '/policy');
      const ctx = createMockCtx({ body: { twoFactorPolicy: 'required_totp' } });
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(404);
      expect(updateOrganization).not.toHaveBeenCalled();
    });

    it('should abort on ETag mismatch (checkIfMatch returns false)', async () => {
      vi.mocked(getOrganizationById).mockResolvedValue(createTestOrg());
      vi.mocked(checkIfMatch).mockReturnValue(false);

      const layer = findLayer(createTwoFactorOrgAdminRouter(), 'PUT', '/policy');
      const ctx = createMockCtx({ body: { twoFactorPolicy: 'required_totp' } });
      await execHandler(layer!, ctx);

      expect(updateOrganization).not.toHaveBeenCalled();
    });

    it('should reject invalid policy value', async () => {
      const layer = findLayer(createTwoFactorOrgAdminRouter(), 'PUT', '/policy');
      const ctx = createMockCtx({ body: { twoFactorPolicy: 'invalid_policy' } });

      await expect(execHandler(layer!, ctx)).rejects.toThrow();
    });
  });

  // =========================================================================
  // GET /summary — SH-3
  // =========================================================================

  describe('GET /summary — Get org 2FA enrollment summary', () => {
    it('should return summary statistics', async () => {
      vi.mocked(getOrganizationById).mockResolvedValue(createTestOrg());
      vi.mocked(getTwoFactorSummary).mockResolvedValue(mockSummary);

      const layer = findLayer(createTwoFactorOrgAdminRouter(), 'GET', '/summary');
      expect(layer).toBeDefined();

      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.body).toEqual({ data: mockSummary });
      expect(getTwoFactorSummary).toHaveBeenCalledWith(ORG_ID);
    });

    it('should set Cache-Control header', async () => {
      vi.mocked(getOrganizationById).mockResolvedValue(createTestOrg());
      vi.mocked(getTwoFactorSummary).mockResolvedValue(mockSummary);

      const layer = findLayer(createTwoFactorOrgAdminRouter(), 'GET', '/summary');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx._responseHeaders['Cache-Control']).toBe('private, max-age=30');
    });

    it('should return 404 when org not found', async () => {
      vi.mocked(getOrganizationById).mockResolvedValue(null);

      const layer = findLayer(createTwoFactorOrgAdminRouter(), 'GET', '/summary');
      const ctx = createMockCtx();
      await execHandler(layer!, ctx);

      expect(ctx.status).toBe(404);
      expect(getTwoFactorSummary).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Router structure
  // =========================================================================

  describe('router structure', () => {
    it('should have the correct prefix', () => {
      const router = createTwoFactorOrgAdminRouter();
      expect(router.opts.prefix).toBe('/api/admin/organizations/:orgId/two-factor');
    });

    it('should register all 3 expected routes', () => {
      const router = createTwoFactorOrgAdminRouter();
      const prefix = '/api/admin/organizations/:orgId/two-factor';
      const paths = router.stack.map(
        (l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`,
      );

      expect(paths).toContain(`GET ${prefix}/policy`);
      expect(paths).toContain(`PUT ${prefix}/policy`);
      expect(paths).toContain(`GET ${prefix}/summary`);
    });
  });
});
