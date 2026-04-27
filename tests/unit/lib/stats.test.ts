import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import { getStatsOverview, getOrgStats } from '../../../src/lib/stats.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockPool() {
  return { query: vi.fn() };
}

describe('stats service', () => {
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = createMockPool();
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(mockPool);
  });

  // -------------------------------------------------------------------------
  // getStatsOverview
  // -------------------------------------------------------------------------

  describe('getStatsOverview', () => {
    it('should return system-wide statistics with correct structure', async () => {
      // Mock all the queries that getStatsOverview makes
      mockPool.query
        // 1. countByStatus('organizations')
        .mockResolvedValueOnce({
          rows: [
            { status: 'active', count: '5' },
            { status: 'suspended', count: '1' },
            { status: 'archived', count: '2' },
          ],
        })
        // 2. countByStatus('users')
        .mockResolvedValueOnce({
          rows: [
            { status: 'active', count: '100' },
            { status: 'inactive', count: '10' },
            { status: 'suspended', count: '3' },
            { status: 'locked', count: '2' },
          ],
        })
        // 3. countByStatus('applications')
        .mockResolvedValueOnce({
          rows: [
            { status: 'active', count: '8' },
            { status: 'inactive', count: '1' },
          ],
        })
        // 4. countByStatus('clients')
        .mockResolvedValueOnce({
          rows: [
            { status: 'active', count: '15' },
            { status: 'inactive', count: '3' },
            { status: 'revoked', count: '1' },
          ],
        })
        // 5. countNewUsers('7 days')
        .mockResolvedValueOnce({ rows: [{ count: '12' }] })
        // 6. countNewUsers('30 days')
        .mockResolvedValueOnce({ rows: [{ count: '45' }] })
        // 7. countActiveUsers('30 days')
        .mockResolvedValueOnce({ rows: [{ count: '80' }] })
        // 8. countLoginActivity('24 hours')
        .mockResolvedValueOnce({
          rows: [
            { category: 'successful', count: '50' },
            { category: 'failed', count: '5' },
          ],
        })
        // 9. countLoginActivity('7 days')
        .mockResolvedValueOnce({
          rows: [
            { category: 'successful', count: '300' },
            { category: 'failed', count: '25' },
          ],
        })
        // 10. countLoginActivity('30 days')
        .mockResolvedValueOnce({
          rows: [
            { category: 'successful', count: '1200' },
            { category: 'failed', count: '100' },
          ],
        })
        // 11. checkDatabaseHealth()
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

      const stats = await getStatsOverview();

      expect(stats.organizations).toEqual({ total: 8, active: 5, suspended: 1, archived: 2 });
      expect(stats.users.total).toBe(115);
      expect(stats.users.active).toBe(100);
      expect(stats.users.newLast7d).toBe(12);
      expect(stats.users.newLast30d).toBe(45);
      expect(stats.users.activeLast30d).toBe(80);
      expect(stats.applications).toEqual({ total: 9, active: 8, inactive: 1 });
      expect(stats.clients).toEqual({ total: 19, active: 15, inactive: 3, revoked: 1 });
      expect(stats.loginActivity.last24h).toEqual({ successful: 50, failed: 5 });
      expect(stats.loginActivity.last7d).toEqual({ successful: 300, failed: 25 });
      expect(stats.loginActivity.last30d).toEqual({ successful: 1200, failed: 100 });
      expect(stats.systemHealth.database).toBe(true);
      expect(stats.systemHealth.redis).toBe(true);
      expect(stats.generatedAt).toBeDefined();
    });

    it('should handle empty tables gracefully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // organizations
        .mockResolvedValueOnce({ rows: [] }) // users
        .mockResolvedValueOnce({ rows: [] }) // applications
        .mockResolvedValueOnce({ rows: [] }) // clients
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // new 7d
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // new 30d
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // active 30d
        .mockResolvedValueOnce({ rows: [] }) // login 24h
        .mockResolvedValueOnce({ rows: [] }) // login 7d
        .mockResolvedValueOnce({ rows: [] }) // login 30d
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // health

      const stats = await getStatsOverview();

      expect(stats.organizations.total).toBe(0);
      expect(stats.users.total).toBe(0);
      expect(stats.users.newLast7d).toBe(0);
      expect(stats.loginActivity.last24h).toEqual({ successful: 0, failed: 0 });
    });

    it('should report database unhealthy when query fails', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // organizations
        .mockResolvedValueOnce({ rows: [] }) // users
        .mockResolvedValueOnce({ rows: [] }) // applications
        .mockResolvedValueOnce({ rows: [] }) // clients
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('connection refused')); // health check fails

      const stats = await getStatsOverview();
      expect(stats.systemHealth.database).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getOrgStats
  // -------------------------------------------------------------------------

  describe('getOrgStats', () => {
    it('should return per-org scoped statistics', async () => {
      const orgId = '00000000-0000-0000-0000-000000000001';

      mockPool.query
        // 1. countByStatus('users', org)
        .mockResolvedValueOnce({
          rows: [
            { status: 'active', count: '20' },
            { status: 'inactive', count: '2' },
          ],
        })
        // 2. countByStatus('clients', org)
        .mockResolvedValueOnce({
          rows: [
            { status: 'active', count: '4' },
          ],
        })
        // 3. countNewUsers('7 days', orgId)
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        // 4. countNewUsers('30 days', orgId)
        .mockResolvedValueOnce({ rows: [{ count: '8' }] })
        // 5. countActiveUsers('30 days', orgId)
        .mockResolvedValueOnce({ rows: [{ count: '15' }] })
        // 6. countLoginActivity('24 hours', orgId)
        .mockResolvedValueOnce({
          rows: [{ category: 'successful', count: '10' }],
        })
        // 7. countLoginActivity('7 days', orgId)
        .mockResolvedValueOnce({
          rows: [
            { category: 'successful', count: '60' },
            { category: 'failed', count: '4' },
          ],
        })
        // 8. countLoginActivity('30 days', orgId)
        .mockResolvedValueOnce({
          rows: [
            { category: 'successful', count: '200' },
            { category: 'failed', count: '15' },
          ],
        });

      const stats = await getOrgStats(orgId);

      expect(stats.organizationId).toBe(orgId);
      expect(stats.users.total).toBe(22);
      expect(stats.users.active).toBe(20);
      expect(stats.users.newLast7d).toBe(3);
      expect(stats.users.newLast30d).toBe(8);
      expect(stats.users.activeLast30d).toBe(15);
      expect(stats.clients).toEqual({ total: 4, active: 4 });
      expect(stats.loginActivity.last24h).toEqual({ successful: 10, failed: 0 });
      expect(stats.loginActivity.last7d).toEqual({ successful: 60, failed: 4 });
      expect(stats.loginActivity.last30d).toEqual({ successful: 200, failed: 15 });
      expect(stats.generatedAt).toBeDefined();
    });

    it('should pass orgId to all queries as parameter', async () => {
      const orgId = 'test-org-uuid';

      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await getOrgStats(orgId);

      // All queries should include the orgId in params
      for (const call of mockPool.query.mock.calls) {
        const params = call[1] as unknown[];
        expect(params).toContain(orgId);
      }
    });
  });
});
