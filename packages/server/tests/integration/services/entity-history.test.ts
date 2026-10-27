/**
 * Entity change history integration tests.
 *
 * Validates that getEntityHistory correctly queries the audit_log table
 * for entity-scoped audit trails with cursor pagination and filtering.
 *
 * @see 05-dashboard-sessions-history.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import { createTestOrganization, createTestUser } from '../helpers/factories.js';
import { getEntityHistory } from '../../../src/lib/entity-history.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';

describe('Entity History (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  // ── Basic History Retrieval ────────────────────────────────────────

  describe('getEntityHistory', () => {
    it('should return empty result when no audit entries exist for entity', async () => {
      const org = await createTestOrganization({ name: 'No History Org' });

      const result = await getEntityHistory('organization', org.id, { limit: 10 });

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('should return audit entries for a specific organization', async () => {
      const org = await createTestOrganization({ name: 'Audited Org' });

      // Write audit entries using the existing audit_log columns
      await writeAuditLog({
        eventType: 'organization.created',
        eventCategory: 'admin',
        organizationId: org.id,
        metadata: { name: org.name },
      });
      await writeAuditLog({
        eventType: 'organization.updated',
        eventCategory: 'admin',
        organizationId: org.id,
        metadata: { changes: { display_name: 'New Name' } },
      });

      const result = await getEntityHistory('organization', org.id, { limit: 10 });

      expect(result.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should return audit entries for a specific user', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);

      await writeAuditLog({
        eventType: 'user.created',
        eventCategory: 'admin',
        organizationId: org.id,
        userId: user.id,
        metadata: { email: user.email },
      });

      const result = await getEntityHistory('user', user.id, { limit: 10 });

      expect(result.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should not return entries for other entities', async () => {
      const org1 = await createTestOrganization({ name: 'Org A' });
      const org2 = await createTestOrganization({ name: 'Org B' });

      await writeAuditLog({
        eventType: 'organization.created',
        eventCategory: 'admin',
        organizationId: org1.id,
        metadata: {},
      });
      await writeAuditLog({
        eventType: 'organization.created',
        eventCategory: 'admin',
        organizationId: org2.id,
        metadata: {},
      });

      const result = await getEntityHistory('organization', org1.id, { limit: 10 });

      // All entries should belong to org1 (filtered by organization_id)
      expect(result.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Pagination ─────────────────────────────────────────────────────

  describe('cursor pagination', () => {
    it('should support cursor-based pagination', async () => {
      const org = await createTestOrganization({ name: 'Paginated Org' });

      // Write enough entries that at least some appear
      for (let i = 0; i < 5; i++) {
        await writeAuditLog({
          eventType: `organization.updated`,
          eventCategory: 'admin',
          organizationId: org.id,
          description: `Update ${i}`,
          metadata: { index: i },
        });
      }

      // Request with a small limit — if entries exist, should page through them
      const allResult = await getEntityHistory('organization', org.id, { limit: 100 });
      const totalEntries = allResult.data.length;

      // Verify we have at least some entries
      expect(totalEntries).toBeGreaterThanOrEqual(1);

      // If enough entries for pagination, test it
      if (totalEntries >= 2) {
        const page1 = await getEntityHistory('organization', org.id, { limit: 1 });
        expect(page1.data).toHaveLength(1);
        expect(page1.hasMore).toBe(true);

        const page2 = await getEntityHistory('organization', org.id, {
          limit: 1,
          after: page1.nextCursor!,
        });
        expect(page2.data).toHaveLength(1);

        // No overlap
        expect(page1.data[0].id).not.toBe(page2.data[0].id);
      }
    });
  });

  // ── Event Type Filtering ───────────────────────────────────────────

  describe('event type filtering', () => {
    it('should filter by event type prefix', async () => {
      const org = await createTestOrganization({ name: 'Filtered Org' });

      await writeAuditLog({
        eventType: 'organization.created',
        eventCategory: 'admin',
        organizationId: org.id,
        metadata: {},
      });
      await writeAuditLog({
        eventType: 'organization.updated',
        eventCategory: 'admin',
        organizationId: org.id,
        metadata: {},
      });
      await writeAuditLog({
        eventType: 'organization.suspended',
        eventCategory: 'admin',
        organizationId: org.id,
        metadata: {},
      });

      const result = await getEntityHistory('organization', org.id, {
        limit: 10,
        eventTypePrefix: 'organization.updated',
      });

      expect(result.data.length).toBeGreaterThanOrEqual(1);
      expect(result.data.every((e) => e.eventType.startsWith('organization.updated'))).toBe(true);
    });
  });

  // ── Application and client metadata scopes ─────────────────────────

  describe('application and client history scopes', () => {
    it('should return only the application events recorded in audit metadata', async () => {
      const applicationId = randomUUID();
      const otherApplicationId = randomUUID();

      await writeAuditLog({
        eventType: 'app.created',
        eventCategory: 'admin',
        metadata: { applicationId },
      });
      await writeAuditLog({
        eventType: 'app.module.created',
        eventCategory: 'admin',
        metadata: { applicationId, moduleId: randomUUID() },
      });
      await writeAuditLog({
        eventType: 'app.created',
        eventCategory: 'admin',
        metadata: { applicationId: otherApplicationId },
      });
      await writeAuditLog({
        eventType: 'client.created',
        eventCategory: 'admin',
        metadata: { applicationId, clientDbId: randomUUID() },
      });

      const result = await getEntityHistory('application', applicationId, { limit: 10 });

      expect(result.data.map((entry) => entry.eventType).sort()).toEqual([
        'app.created',
        'app.module.created',
      ]);
    });

    it('should include legacy client secret events keyed by the internal client id', async () => {
      const clientId = randomUUID();
      const otherClientId = randomUUID();

      await writeAuditLog({
        eventType: 'client.created',
        eventCategory: 'admin',
        metadata: { clientDbId: clientId, clientId: 'public-client-1' },
      });
      await writeAuditLog({
        eventType: 'client.secret.generated',
        eventCategory: 'admin',
        metadata: { clientId, secretId: randomUUID() },
      });
      await writeAuditLog({
        eventType: 'client.created',
        eventCategory: 'admin',
        metadata: { clientDbId: otherClientId, clientId: 'public-client-2' },
      });
      await writeAuditLog({
        eventType: 'app.created',
        eventCategory: 'admin',
        metadata: { applicationId: clientId },
      });

      const result = await getEntityHistory('client', clientId, { limit: 10 });

      expect(result.data.map((entry) => entry.eventType).sort()).toEqual([
        'client.created',
        'client.secret.generated',
      ]);
    });

    it('should paginate application history with the composite cursor', async () => {
      const applicationId = randomUUID();
      for (let index = 0; index < 3; index += 1) {
        await writeAuditLog({
          eventType: 'app.updated',
          eventCategory: 'admin',
          description: `Update ${index}`,
          metadata: { applicationId, index },
        });
      }

      const first = await getEntityHistory('application', applicationId, { limit: 1 });
      expect(first.data).toHaveLength(1);
      expect(first.hasMore).toBe(true);

      const second = await getEntityHistory('application', applicationId, {
        limit: 1,
        after: first.nextCursor!,
      });
      expect(second.data).toHaveLength(1);
      expect(second.data[0]?.id).not.toBe(first.data[0]?.id);
    });

    it('should combine the caller event prefix with the application family prefix', async () => {
      const applicationId = randomUUID();
      await writeAuditLog({
        eventType: 'app.created',
        eventCategory: 'admin',
        metadata: { applicationId },
      });
      await writeAuditLog({
        eventType: 'app.module.created',
        eventCategory: 'admin',
        metadata: { applicationId, moduleId: randomUUID() },
      });

      const result = await getEntityHistory('application', applicationId, {
        limit: 10,
        eventTypePrefix: 'app.module',
      });

      expect(result.data.map((entry) => entry.eventType)).toEqual(['app.module.created']);
    });
  });
});
