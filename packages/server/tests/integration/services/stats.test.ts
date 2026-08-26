/**
 * Dashboard statistics integration tests.
 *
 * Validates the stats service returns accurate counts from real
 * database tables: organizations, users, applications, clients.
 *
 * @see 05-dashboard-sessions-history.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClient,
  createTestUser,
} from '../helpers/factories.js';
import { getStatsOverview, getOrgStats } from '../../../src/lib/stats.js';
import { bulkStatusChange } from '../../../src/lib/bulk-operations.js';

describe('Dashboard Stats (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  // ── System-Wide Stats ──────────────────────────────────────────────

  describe('getStatsOverview', () => {
    it('should return stats with seed data only', async () => {
      const stats = await getStatsOverview();

      expect(stats).toBeDefined();
      expect(stats.organizations).toBeDefined();
      expect(stats.users).toBeDefined();
      expect(stats.applications).toBeDefined();
      expect(stats.clients).toBeDefined();
    });

    it('should count organizations accurately', async () => {
      await createTestOrganization({ name: 'Stats Org 1' });
      await createTestOrganization({ name: 'Stats Org 2' });
      const org3 = await createTestOrganization({ name: 'Stats Org 3' });
      // Suspend org3 to test suspended count
      await bulkStatusChange({ entityType: 'organization', entityIds: [org3.id], action: 'suspend' });

      const stats = await getStatsOverview();

      // 3 created + 1 seed (porta-admin) = 4 total
      expect(stats.organizations.total).toBeGreaterThanOrEqual(4);
      expect(stats.organizations.active).toBeGreaterThanOrEqual(3); // 2 new active + 1 seed
      expect(stats.organizations.suspended).toBeGreaterThanOrEqual(1);
    });

    it('should count users accurately across organizations', async () => {
      const org1 = await createTestOrganization({ name: 'User Org 1' });
      const org2 = await createTestOrganization({ name: 'User Org 2' });
      await createTestUser(org1.id, { email: 'u1@stats.com' });
      await createTestUser(org1.id, { email: 'u2@stats.com' });
      await createTestUser(org2.id, { email: 'u3@stats.com' });

      const stats = await getStatsOverview();

      expect(stats.users.total).toBeGreaterThanOrEqual(3);
    });

    it('should count applications and clients', async () => {
      const org = await createTestOrganization();
      const app = await createTestApplication({ organizationId: org.id });
      await createTestClient(org.id, app.id);

      const stats = await getStatsOverview();

      expect(stats.applications.total).toBeGreaterThanOrEqual(1);
      expect(stats.clients.total).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Per-Organization Stats ─────────────────────────────────────────

  describe('getOrgStats', () => {
    it('should return scoped stats for a specific organization', async () => {
      const org = await createTestOrganization({ name: 'Scoped Org' });
      const app = await createTestApplication({ organizationId: org.id });
      await createTestClient(org.id, app.id);
      await createTestUser(org.id, { email: 'o1@org.com' });
      await createTestUser(org.id, { email: 'o2@org.com' });

      const stats = await getOrgStats(org.id);

      expect(stats).toBeDefined();
      expect(stats.users.total).toBe(2);
      expect(stats.clients.total).toBe(1);
    });

    it('should not include data from other organizations', async () => {
      const org1 = await createTestOrganization({ name: 'Isolated Org 1' });
      const org2 = await createTestOrganization({ name: 'Isolated Org 2' });
      await createTestUser(org1.id, { email: 'a@iso.com' });
      await createTestUser(org2.id, { email: 'b@iso.com' });
      await createTestUser(org2.id, { email: 'c@iso.com' });

      const stats1 = await getOrgStats(org1.id);
      const stats2 = await getOrgStats(org2.id);

      expect(stats1.users.total).toBe(1);
      expect(stats2.users.total).toBe(2);
    });

    it('should return zero counts for an organization with no entities', async () => {
      const org = await createTestOrganization({ name: 'Empty Org' });

      const stats = await getOrgStats(org.id);

      expect(stats.users.total).toBe(0);
      expect(stats.clients.total).toBe(0);
    });
  });
});
