import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/config/index.js', () => ({
  config: {
    issuerBaseUrl: 'http://localhost:3000',
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

import { getPool } from '../../../src/lib/database.js';
import { tenantResolver } from '../../../src/middleware/tenant-resolver.js';

function mockPool(rows: Record<string, unknown>[] = []) {
  const mockQuery = vi.fn().mockResolvedValue({ rows });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

function createMockCtx(orgSlug?: string) {
  const ctx = {
    params: orgSlug ? { orgSlug } : {},
    state: {} as Record<string, unknown>,
    throw: vi.fn((status: number, message: string) => {
      const err = new Error(message) as Error & { status: number };
      err.status = status;
      throw err;
    }),
  };
  return ctx;
}

describe('tenant-resolver', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets organization on ctx.state for valid active org', async () => {
    const org = { id: 'uuid-1', slug: 'acme-corp', name: 'Acme Corp', status: 'active' };
    mockPool([org]);

    const middleware = tenantResolver();
    const ctx = createMockCtx('acme-corp');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(ctx.state.organization).toEqual(org);
    expect(next).toHaveBeenCalled();
  });

  it('sets issuer on ctx.state', async () => {
    const org = { id: 'uuid-1', slug: 'acme-corp', name: 'Acme Corp', status: 'active' };
    mockPool([org]);

    const middleware = tenantResolver();
    const ctx = createMockCtx('acme-corp');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(ctx.state.issuer).toBe('http://localhost:3000/acme-corp');
  });

  it('throws 404 for unknown slug', async () => {
    mockPool([]);

    const middleware = tenantResolver();
    const ctx = createMockCtx('nonexistent');
    const next = vi.fn();

    await expect(middleware(ctx as never, next)).rejects.toThrow('Organization not found');
    expect(next).not.toHaveBeenCalled();
  });

  it('throws 404 for missing orgSlug parameter', async () => {
    mockPool([]);

    const middleware = tenantResolver();
    const ctx = createMockCtx(); // no orgSlug
    const next = vi.fn();

    await expect(middleware(ctx as never, next)).rejects.toThrow('Organization not found');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() on success', async () => {
    const org = { id: 'uuid-1', slug: 'test-org', name: 'Test Org', status: 'active' };
    mockPool([org]);

    const middleware = tenantResolver();
    const ctx = createMockCtx('test-org');
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('queries with active status filter', async () => {
    const mockQuery = mockPool([]);

    const middleware = tenantResolver();
    const ctx = createMockCtx('test-org');
    const next = vi.fn();

    try { await middleware(ctx as never, next); } catch { /* expected 404 */ }

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'active'");
  });
});
