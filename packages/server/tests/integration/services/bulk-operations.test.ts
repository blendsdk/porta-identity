/**
 * Bulk operations integration tests.
 *
 * Validates bulk status change operations for organizations and users
 * against real database tables.
 *
 * @see 06-bulk-branding.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import { createTestOrganization, createTestUser } from '../helpers/factories.js';
import { bulkStatusChange } from '../../../src/lib/bulk-operations.js';
import { findOrganizationById } from '../../../src/organizations/repository.js';
import { findUserById } from '../../../src/users/repository.js';

describe('Bulk Operations (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  // ── Bulk Organization Status Changes ───────────────────────────────

  describe('bulk organization status changes', () => {
    it('should suspend multiple active organizations', async () => {
      const org1 = await createTestOrganization({ name: 'Bulk Org 1', status: 'active' });
      const org2 = await createTestOrganization({ name: 'Bulk Org 2', status: 'active' });

      const result = await bulkStatusChange({
        entityType: 'organization',
        entityIds: [org1.id, org2.id],
        action: 'suspend',
      });

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);

      const updated1 = await findOrganizationById(org1.id);
      const updated2 = await findOrganizationById(org2.id);
      expect(updated1!.status).toBe('suspended');
      expect(updated2!.status).toBe('suspended');
    });

    it('should activate multiple suspended organizations', async () => {
      const org1 = await createTestOrganization({ name: 'Bulk Act 1' });
      const org2 = await createTestOrganization({ name: 'Bulk Act 2' });

      // First suspend them (they start as 'active')
      await bulkStatusChange({
        entityType: 'organization',
        entityIds: [org1.id, org2.id],
        action: 'suspend',
      });

      const result = await bulkStatusChange({
        entityType: 'organization',
        entityIds: [org1.id, org2.id],
        action: 'activate',
      });

      expect(result.succeeded).toBe(2);

      const updated1 = await findOrganizationById(org1.id);
      expect(updated1!.status).toBe('active');
    });

    it('should archive multiple organizations', async () => {
      const org1 = await createTestOrganization({ name: 'Bulk Arch 1' });
      const org2 = await createTestOrganization({ name: 'Bulk Arch 2' });

      // Archive from active is valid per ORG_TRANSITIONS
      const result = await bulkStatusChange({
        entityType: 'organization',
        entityIds: [org1.id, org2.id],
        action: 'archive',
      });

      expect(result.succeeded).toBe(2);

      const updated1 = await findOrganizationById(org1.id);
      expect(updated1!.status).toBe('archived');
    });

    it('should handle partial failure for invalid transitions', async () => {
      const activeOrg = await createTestOrganization({ name: 'Active Bulk' });
      const archivedOrg = await createTestOrganization({ name: 'Archived Bulk' });

      // Archive the second org so it's already archived
      await bulkStatusChange({
        entityType: 'organization',
        entityIds: [archivedOrg.id],
        action: 'archive',
      });

      // Now try to suspend both — activeOrg can be suspended, archivedOrg cannot
      const result = await bulkStatusChange({
        entityType: 'organization',
        entityIds: [activeOrg.id, archivedOrg.id],
        action: 'suspend',
      });

      // activeOrg succeeds (active→suspended), archivedOrg fails (archived can't be suspended)
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  // ── Bulk User Status Changes ───────────────────────────────────────

  describe('bulk user status changes', () => {
    it('should suspend multiple active users', async () => {
      const org = await createTestOrganization();
      const user1 = await createTestUser(org.id, { email: 'bu1@bulk.com' });
      const user2 = await createTestUser(org.id, { email: 'bu2@bulk.com' });

      const result = await bulkStatusChange({
        entityType: 'user',
        entityIds: [user1.id, user2.id],
        action: 'suspend',
      });

      expect(result.succeeded).toBe(2);

      const updated1 = await findUserById(user1.id);
      const updated2 = await findUserById(user2.id);
      expect(updated1!.status).toBe('suspended');
      expect(updated2!.status).toBe('suspended');
    });

    it('should activate multiple suspended users', async () => {
      const org = await createTestOrganization();
      const user1 = await createTestUser(org.id, { email: 'act1@bulk.com' });
      const user2 = await createTestUser(org.id, { email: 'act2@bulk.com' });

      // Suspend them first so they can be activated
      await bulkStatusChange({ entityType: 'user', entityIds: [user1.id, user2.id], action: 'suspend' });

      const result = await bulkStatusChange({
        entityType: 'user',
        entityIds: [user1.id, user2.id],
        action: 'activate',
      });

      expect(result.succeeded).toBe(2);

      const updated1 = await findUserById(user1.id);
      expect(updated1!.status).toBe('active');
    });

    it('should lock multiple active users', async () => {
      const org = await createTestOrganization();
      const user1 = await createTestUser(org.id, { email: 'lock1@bulk.com' });

      const result = await bulkStatusChange({
        entityType: 'user',
        entityIds: [user1.id],
        action: 'lock',
      });

      expect(result.succeeded).toBe(1);

      const updated1 = await findUserById(user1.id);
      expect(updated1!.status).toBe('locked');
    });

    it('should report failures for non-existent IDs', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000099';

      const result = await bulkStatusChange({
        entityType: 'user',
        entityIds: [fakeId],
        action: 'suspend',
      });

      expect(result.failed).toBe(1);
      expect(result.succeeded).toBe(0);
    });
  });
});
