/**
 * Cursor-based pagination integration tests.
 *
 * Validates keyset pagination across all four entity repositories:
 * organizations, applications, clients, and users.
 *
 * @see 04-cursor-pagination-etag.md
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
import { listOrganizationsCursor } from '../../../src/organizations/repository.js';
import { listApplicationsCursor } from '../../../src/applications/repository.js';
import { listClientsCursor } from '../../../src/clients/repository.js';
import { listUsersCursor } from '../../../src/users/repository.js';

describe('Cursor Pagination (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  // ── Organization Cursor Pagination ──────────────────────────────────

  describe('listOrganizationsCursor', () => {
    it('should return empty result when no organizations exist beyond seed', async () => {
      const result = await listOrganizationsCursor({ limit: 10, status: 'active' });

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(result.hasMore).toBe(false);
    });

    it('should return items with cursor metadata', async () => {
      // Create 3 orgs
      await createTestOrganization({ name: 'Alpha Org' });
      await createTestOrganization({ name: 'Beta Org' });
      await createTestOrganization({ name: 'Gamma Org' });

      const result = await listOrganizationsCursor({ limit: 10 });

      // 3 created + 1 seed (porta-admin) = 4
      expect(result.data.length).toBeGreaterThanOrEqual(3);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should respect limit and indicate hasMore', async () => {
      // Create 5 orgs
      for (let i = 0; i < 5; i++) {
        await createTestOrganization({ name: `Org ${String(i).padStart(2, '0')}` });
      }

      const result = await listOrganizationsCursor({ limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it('should paginate forward using cursor', async () => {
      // Create 5 orgs with sequential names for stable ordering
      for (let i = 0; i < 5; i++) {
        await createTestOrganization({ name: `Cursor Org ${String(i).padStart(2, '0')}` });
      }

      // First page
      const page1 = await listOrganizationsCursor({ limit: 2, sortBy: 'name', sortOrder: 'asc' });
      expect(page1.data).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      // Second page using cursor
      const page2 = await listOrganizationsCursor({
        limit: 2,
        sortBy: 'name',
        sortOrder: 'asc',
        cursor: page1.nextCursor!,
      });
      expect(page2.data).toHaveLength(2);

      // Pages should not overlap
      const page1Ids = page1.data.map((o) => o.id);
      const page2Ids = page2.data.map((o) => o.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it('should filter by status', async () => {
      await createTestOrganization({ name: 'Active Org', status: 'active' });
      await createTestOrganization({ name: 'Suspended Org', status: 'suspended' });

      const result = await listOrganizationsCursor({ limit: 10, status: 'suspended' });

      expect(result.data.every((o) => o.status === 'suspended')).toBe(true);
    });

    it('should filter by search term', async () => {
      await createTestOrganization({ name: 'Searchable Corp' });
      await createTestOrganization({ name: 'Hidden LLC' });

      const result = await listOrganizationsCursor({ limit: 10, search: 'Searchable' });

      expect(result.data.some((o) => o.name === 'Searchable Corp')).toBe(true);
      expect(result.data.every((o) => o.name !== 'Hidden LLC')).toBe(true);
    });

    it('should sort by created_at descending', async () => {
      await createTestOrganization({ name: 'First Org' });
      await createTestOrganization({ name: 'Second Org' });

      const result = await listOrganizationsCursor({
        limit: 10,
        sortBy: 'created_at',
        sortOrder: 'desc',
      });

      // Most recently created should come first
      expect(result.data.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < result.data.length; i++) {
        expect(result.data[i - 1]!.createdAt.getTime()).toBeGreaterThanOrEqual(
          result.data[i]!.createdAt.getTime(),
        );
      }
    });
  });

  // ── Application Cursor Pagination ──────────────────────────────────

  describe('listApplicationsCursor', () => {
    it('should return paginated applications', async () => {
      const org = await createTestOrganization();
      for (let i = 0; i < 4; i++) {
        await createTestApplication({ organizationId: org.id, name: `App ${i}` });
      }

      const result = await listApplicationsCursor({ limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it('should paginate forward without duplicates', async () => {
      const org = await createTestOrganization();
      for (let i = 0; i < 5; i++) {
        await createTestApplication({
          organizationId: org.id,
          name: `App ${String(i).padStart(2, '0')}`,
        });
      }

      const page1 = await listApplicationsCursor({ limit: 2, sortBy: 'name', sortOrder: 'asc' });
      const page2 = await listApplicationsCursor({
        limit: 2,
        sortBy: 'name',
        sortOrder: 'asc',
        cursor: page1.nextCursor!,
      });

      const allIds = [...page1.data.map((a) => a.id), ...page2.data.map((a) => a.id)];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });

    it('should filter by status', async () => {
      const org = await createTestOrganization();
      await createTestApplication({ organizationId: org.id, name: 'Active App', status: 'active' });
      await createTestApplication({
        organizationId: org.id,
        name: 'Archived App',
        status: 'archived',
      });

      const result = await listApplicationsCursor({ limit: 10, status: 'active' });

      expect(result.data.every((a) => a.status === 'active')).toBe(true);
    });
  });

  // ── Client Cursor Pagination ───────────────────────────────────────

  describe('listClientsCursor', () => {
    it('should return paginated clients', async () => {
      const org = await createTestOrganization();
      const app = await createTestApplication({ organizationId: org.id });
      for (let i = 0; i < 4; i++) {
        await createTestClient(org.id, app.id, { clientName: `Client ${i}` });
      }

      const result = await listClientsCursor({ limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });

    it('should filter by organizationId', async () => {
      const org1 = await createTestOrganization({ name: 'Org One' });
      const org2 = await createTestOrganization({ name: 'Org Two' });
      const app1 = await createTestApplication({ organizationId: org1.id });
      const app2 = await createTestApplication({ organizationId: org2.id });
      await createTestClient(org1.id, app1.id);
      await createTestClient(org2.id, app2.id);

      const result = await listClientsCursor({ limit: 10, organizationId: org1.id });

      expect(result.data.every((c) => c.organizationId === org1.id)).toBe(true);
    });

    it('should paginate forward without duplicates', async () => {
      const org = await createTestOrganization();
      const app = await createTestApplication({ organizationId: org.id });
      for (let i = 0; i < 5; i++) {
        await createTestClient(org.id, app.id, { clientName: `Client ${String(i).padStart(2, '0')}` });
      }

      const page1 = await listClientsCursor({
        limit: 2,
        sortBy: 'client_name',
        sortOrder: 'asc',
      });
      const page2 = await listClientsCursor({
        limit: 2,
        sortBy: 'client_name',
        sortOrder: 'asc',
        cursor: page1.nextCursor!,
      });

      const allIds = [...page1.data.map((c) => c.id), ...page2.data.map((c) => c.id)];
      expect(new Set(allIds).size).toBe(allIds.length);
    });
  });

  // ── User Cursor Pagination ─────────────────────────────────────────

  describe('listUsersCursor', () => {
    it('should return paginated users scoped to organization', async () => {
      const org = await createTestOrganization();
      for (let i = 0; i < 4; i++) {
        await createTestUser(org.id, { email: `user${i}@cursor-test.com` });
      }

      const result = await listUsersCursor({ organizationId: org.id, limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.data.every((u) => u.organizationId === org.id)).toBe(true);
    });

    it('should paginate forward without duplicates', async () => {
      const org = await createTestOrganization();
      for (let i = 0; i < 5; i++) {
        await createTestUser(org.id, { email: `paginate${String(i).padStart(2, '0')}@cursor-test.com` });
      }

      const page1 = await listUsersCursor({
        organizationId: org.id,
        limit: 2,
        sortBy: 'email',
        sortOrder: 'asc',
      });
      const page2 = await listUsersCursor({
        organizationId: org.id,
        limit: 2,
        sortBy: 'email',
        sortOrder: 'asc',
        cursor: page1.nextCursor!,
      });

      const allIds = [...page1.data.map((u) => u.id), ...page2.data.map((u) => u.id)];
      expect(new Set(allIds).size).toBe(allIds.length);
    });

    it('should filter by status', async () => {
      const org = await createTestOrganization();
      await createTestUser(org.id, { email: 'active@test.com' });
      const suspUser = await createTestUser(org.id, { email: 'suspended@test.com' });
      // Change status to suspended via direct update
      const { updateUser } = await import('../../../src/users/repository.js');
      await updateUser(suspUser.id, { status: 'suspended' } as any);

      const result = await listUsersCursor({
        organizationId: org.id,
        limit: 10,
        status: 'active',
      });

      expect(result.data.every((u) => u.status === 'active')).toBe(true);
    });

    it('should filter by search term', async () => {
      const org = await createTestOrganization();
      await createTestUser(org.id, { email: 'findme@test.com', preferredUsername: 'findme-user' });
      await createTestUser(org.id, { email: 'other@test.com', preferredUsername: 'other-user' });

      const result = await listUsersCursor({
        organizationId: org.id,
        limit: 10,
        search: 'findme',
      });

      expect(result.data.length).toBeGreaterThanOrEqual(1);
      expect(result.data.some((u) => u.email === 'findme@test.com')).toBe(true);
    });
  });
});
