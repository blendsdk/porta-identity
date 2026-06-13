import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createStatsDomain } from '../../src/domains/stats.js';

function mockTransport(response: Partial<TransportResponse> = {}): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: {},
      ...response,
    }),
  };
}

// Rewritten to server truth (PF-001/PF-014): the previous test asserted a
// non-existent `GET /stats` and returned the un-unwrapped `{ data }` body.
describe('domains/stats', () => {
  // ── get ─────────────────────────────────────────────────────
  describe('get (ST-10b)', () => {
    it('calls GET /stats/overview and returns the unwrapped StatsOverview', async () => {
      // Source: src/routes/stats.ts — GET /stats/overview, { data }-wrapped.
      const overview = {
        organizations: { total: 1, active: 1 },
        users: { total: 1, active: 1, newLast7d: 0, newLast30d: 0, activeLast30d: 0 },
        applications: { total: 1, active: 1 },
        clients: { total: 1, active: 1 },
        loginActivity: {
          last24h: { successful: 0, failed: 0 },
          last7d: { successful: 0, failed: 0 },
          last30d: { successful: 0, failed: 0 },
        },
        systemHealth: { database: true, redis: true },
        generatedAt: '2026-01-01T00:00:00Z',
      };
      const transport = mockTransport({ body: { data: overview } });
      const stats = createStatsDomain(transport);
      const result = await stats.get();
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/stats/overview',
      });
      expect(result).toEqual(overview);
    });
  });

  // ── getOrganizationStats ────────────────────────────────────
  describe('getOrganizationStats (ST-10c)', () => {
    it('calls GET /stats/organization/:orgId and returns the unwrapped OrgStats', async () => {
      // Source: src/routes/stats.ts — GET /stats/organization/:orgId, { data }-wrapped.
      const orgStats = {
        organizationId: 'org-1',
        users: { total: 1, active: 1, newLast7d: 0, newLast30d: 0, activeLast30d: 0 },
        clients: { total: 1, active: 1 },
        loginActivity: {
          last24h: { successful: 0, failed: 0 },
          last7d: { successful: 0, failed: 0 },
          last30d: { successful: 0, failed: 0 },
        },
        generatedAt: '2026-01-01T00:00:00Z',
      };
      const transport = mockTransport({ body: { data: orgStats } });
      const stats = createStatsDomain(transport);
      const result = await stats.getOrganizationStats('org-1');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/stats/organization/org-1',
      });
      expect(result).toEqual(orgStats);
    });
  });
});
