import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../src/lib/stats.js', () => ({
  getStatsOverview: vi.fn(),
  getOrgStats: vi.fn(),
}));

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/middleware/require-permission.js', () => ({
  requirePermission: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

import * as statsService from '../../../src/lib/stats.js';
import { createStatsRouter } from '../../../src/routes/stats.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockCtx(overrides: {
  params?: Record<string, string>;
} = {}) {
  let statusCode = 200;
  let responseBody: unknown = undefined;
  const headers: Record<string, string> = {};

  const ctx = {
    params: overrides.params ?? {},
    query: {},
    request: { body: {} },
    get status() { return statusCode; },
    set status(v: number) { statusCode = v; },
    get body() { return responseBody; },
    set body(v: unknown) { responseBody = v; },
    state: { organization: { isSuperAdmin: true } },
    set: vi.fn((key: string, value: string) => { headers[key] = value; }),
    get: vi.fn((key: string) => headers[key]),
    _headers: headers,
    throw: vi.fn((status: number, message: string) => {
      const err = new Error(message) as Error & { status: number };
      err.status = status;
      throw err;
    }),
  };
  return ctx;
}

function findHandler(router: ReturnType<typeof createStatsRouter>, method: string, path: string) {
  const layer = router.stack.find(
    (l) => l.methods.includes(method) && l.path === path,
  );
  expect(layer).toBeDefined();
  return layer!.stack[layer!.stack.length - 1];
}

describe('stats routes', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /overview', () => {
    it('should return system-wide stats with Cache-Control header', async () => {
      const mockStats = {
        organizations: { total: 5, active: 3 },
        users: { total: 50, active: 40, newLast7d: 5, newLast30d: 15, activeLast30d: 35 },
        applications: { total: 3, active: 3 },
        clients: { total: 8, active: 7 },
        loginActivity: {
          last24h: { successful: 10, failed: 1 },
          last7d: { successful: 60, failed: 5 },
          last30d: { successful: 200, failed: 20 },
        },
        systemHealth: { database: true, redis: true },
        generatedAt: '2026-01-01T00:00:00Z',
      };

      (statsService.getStatsOverview as ReturnType<typeof vi.fn>).mockResolvedValue(mockStats);

      const router = createStatsRouter();
      const handler = findHandler(router, 'GET', '/api/admin/stats/overview');
      const ctx = createMockCtx();

      await handler(ctx as never, vi.fn());

      expect(ctx.body).toEqual({ data: mockStats });
      expect(ctx.set).toHaveBeenCalledWith('Cache-Control', 'private, max-age=60');
    });
  });

  describe('GET /organization/:orgId', () => {
    it('should return per-org stats with Cache-Control header', async () => {
      const orgId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const mockStats = {
        organizationId: orgId,
        users: { total: 20, active: 18, newLast7d: 2, newLast30d: 5, activeLast30d: 15 },
        clients: { total: 3, active: 3 },
        loginActivity: {
          last24h: { successful: 5, failed: 0 },
          last7d: { successful: 30, failed: 2 },
          last30d: { successful: 100, failed: 8 },
        },
        generatedAt: '2026-01-01T00:00:00Z',
      };

      (statsService.getOrgStats as ReturnType<typeof vi.fn>).mockResolvedValue(mockStats);

      const router = createStatsRouter();
      const handler = findHandler(router, 'GET', '/api/admin/stats/organization/:orgId');
      const ctx = createMockCtx({ params: { orgId } });

      await handler(ctx as never, vi.fn());

      expect(ctx.body).toEqual({ data: mockStats });
      expect(statsService.getOrgStats).toHaveBeenCalledWith(orgId);
      expect(ctx.set).toHaveBeenCalledWith('Cache-Control', 'private, max-age=60');
    });

    it('should return 400 for invalid orgId format', async () => {
      const router = createStatsRouter();
      const handler = findHandler(router, 'GET', '/api/admin/stats/organization/:orgId');
      const ctx = createMockCtx({ params: { orgId: 'not-a-uuid' } });

      // ZodError thrown when parsing invalid UUID
      await expect(handler(ctx as never, vi.fn())).rejects.toThrow();
    });
  });

  describe('router structure', () => {
    it('should have the correct prefix', () => {
      const router = createStatsRouter();
      expect(router.opts.prefix).toBe('/api/admin/stats');
    });

    it('should register all expected routes', () => {
      const router = createStatsRouter();
      const paths = router.stack.map(
        (l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`,
      );

      expect(paths).toContain('GET /api/admin/stats/overview');
      expect(paths).toContain('GET /api/admin/stats/organization/:orgId');
    });
  });
});
