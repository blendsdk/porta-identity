import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Organization } from '../../../src/organizations/types.js';

vi.mock('../../../src/organizations/cache.js', () => ({
  getCachedOrganizationBySlug: vi.fn(),
  cacheOrganization: vi.fn(),
}));

vi.mock('../../../src/organizations/repository.js', () => ({
  findOrganizationBySlug: vi.fn(),
}));

vi.mock('../../../src/config/index.js', () => ({
  config: {
    issuerBaseUrl: 'https://porta.local:3443',
    nodeEnv: 'test',
    port: 3000,
    host: '0.0.0.0',
    databaseUrl: 'postgresql://localhost/porta',
    redisUrl: 'redis://localhost:6379',
    cookieKeys: ['test-cookie-key-0123456789'],
    smtp: { host: 'localhost', port: 587, user: '', pass: '', from: 'test@test.com' },
    logLevel: 'info',
  },
}));

import { getCachedOrganizationBySlug, cacheOrganization } from '../../../src/organizations/cache.js';
import { findOrganizationBySlug } from '../../../src/organizations/repository.js';
import { tenantResolver } from '../../../src/middleware/tenant-resolver.js';

/** Create a full Organization test object */
function createTestOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-uuid-1',
    name: 'Acme Corp',
    slug: 'acme-corp',
    status: 'active',
    isSuperAdmin: false,
    brandingLogoUrl: null,
    brandingFaviconUrl: null,
    brandingPrimaryColor: null,
    brandingCompanyName: null,
    brandingCustomCss: null,
    defaultLocale: 'en',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function createMockCtx(orgSlug?: string) {
  return {
    params: orgSlug ? { orgSlug } : {},
    state: {} as Record<string, unknown>,
    throw: vi.fn((status: number, message: string) => {
      const err = new Error(message) as Error & { status: number };
      err.status = status;
      throw err;
    }),
  };
}

describe('tenant-resolver', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return cached org on cache hit (no DB query)', async () => {
    const org = createTestOrg();
    (getCachedOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

    const middleware = tenantResolver();
    const ctx = createMockCtx('acme-corp');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(ctx.state.organization).toEqual(org);
    expect(findOrganizationBySlug).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should query DB on cache miss and cache the result', async () => {
    const org = createTestOrg();
    (getCachedOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (findOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

    const middleware = tenantResolver();
    const ctx = createMockCtx('acme-corp');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(findOrganizationBySlug).toHaveBeenCalledWith('acme-corp');
    expect(cacheOrganization).toHaveBeenCalledWith(org);
    expect(ctx.state.organization).toEqual(org);
  });

  it('should set issuer on ctx.state', async () => {
    const org = createTestOrg({ slug: 'test-org' });
    (getCachedOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

    const middleware = tenantResolver();
    const ctx = createMockCtx('test-org');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(ctx.state.issuer).toBe('https://porta.local:3443/test-org');
  });

  it('should set full Organization object on ctx.state', async () => {
    const org = createTestOrg({ brandingPrimaryColor: '#FF0000', isSuperAdmin: true });
    (getCachedOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

    const middleware = tenantResolver();
    const ctx = createMockCtx('acme-corp');
    const next = vi.fn();

    await middleware(ctx as never, next);

    const stateOrg = ctx.state.organization as Organization;
    expect(stateOrg.brandingPrimaryColor).toBe('#FF0000');
    expect(stateOrg.isSuperAdmin).toBe(true);
    expect(stateOrg.createdAt).toBeInstanceOf(Date);
  });

  it('should throw 404 for unknown slug', async () => {
    (getCachedOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (findOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const middleware = tenantResolver();
    const ctx = createMockCtx('nonexistent');
    const next = vi.fn();

    await expect(middleware(ctx as never, next)).rejects.toThrow('Organization not found');
    expect(next).not.toHaveBeenCalled();
  });

  it('should throw 404 for missing orgSlug parameter', async () => {
    const middleware = tenantResolver();
    const ctx = createMockCtx(); // no orgSlug
    const next = vi.fn();

    await expect(middleware(ctx as never, next)).rejects.toThrow('Organization not found');
  });

  it('should throw 404 for archived organization', async () => {
    const org = createTestOrg({ status: 'archived' });
    (getCachedOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

    const middleware = tenantResolver();
    const ctx = createMockCtx('acme-corp');
    const next = vi.fn();

    await expect(middleware(ctx as never, next)).rejects.toThrow('Organization not found');
    expect(ctx.throw).toHaveBeenCalledWith(404, 'Organization not found');
    expect(next).not.toHaveBeenCalled();
  });

  it('should throw 403 for suspended organization', async () => {
    const org = createTestOrg({ status: 'suspended' });
    (getCachedOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

    const middleware = tenantResolver();
    const ctx = createMockCtx('acme-corp');
    const next = vi.fn();

    await expect(middleware(ctx as never, next)).rejects.toThrow('Organization is suspended');
    expect(ctx.throw).toHaveBeenCalledWith(403, 'Organization is suspended');
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() on success', async () => {
    const org = createTestOrg();
    (getCachedOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

    const middleware = tenantResolver();
    const ctx = createMockCtx('acme-corp');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should gracefully handle cache returning null and DB also null', async () => {
    (getCachedOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (findOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const middleware = tenantResolver();
    const ctx = createMockCtx('gone-org');
    const next = vi.fn();

    await expect(middleware(ctx as never, next)).rejects.toThrow('Organization not found');
    expect(cacheOrganization).not.toHaveBeenCalled();
  });
});
