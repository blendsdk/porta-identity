/**
 * Legacy report export integration tests.
 *
 * Validates that the retained report exporter produces scoped CSV and JSON output.
 *
 * @see 07-import-export-invitation.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClient,
  createTestUser,
  createTestRole,
} from '../helpers/factories.js';
import { exportData } from '../../../src/lib/data-export.js';
import { getPool } from '../../../src/lib/database.js';

describe('Data Export (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  // ── Export ─────────────────────────────────────────────────────────

  describe('exportData', () => {
    it('should export organizations as JSON', async () => {
      await createTestOrganization({ name: 'Export Org 1' });
      await createTestOrganization({ name: 'Export Org 2' });

      const result = await exportData({
        entityType: 'organizations',
        format: 'json',
      });

      expect(result.contentType).toBe('application/json');
      expect(result.rowCount).toBeGreaterThanOrEqual(2);
      expect(result.filename).toContain('organizations');

      // Verify JSON is parseable
      const parsed = JSON.parse(result.data);
      expect(parsed.data).toBeDefined();
      expect(Array.isArray(parsed.data)).toBe(true);
      expect(parsed.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should export organizations as CSV', async () => {
      await createTestOrganization({ name: 'CSV Org' });

      const result = await exportData({
        entityType: 'organizations',
        format: 'csv',
      });

      expect(result.contentType).toBe('text/csv');
      expect(result.rowCount).toBeGreaterThanOrEqual(1);

      // CSV should have header row + data rows
      const lines = result.data.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2); // header + at least 1 row
    });

    it('should export users scoped to an organization', async () => {
      const org1 = await createTestOrganization({ name: 'Exp User Org 1' });
      const org2 = await createTestOrganization({ name: 'Exp User Org 2' });
      await createTestUser(org1.id, { email: 'e1@exp.com' });
      await createTestUser(org1.id, { email: 'e2@exp.com' });
      await createTestUser(org2.id, { email: 'e3@exp.com' });

      const result = await exportData({
        entityType: 'users',
        format: 'json',
        organizationId: org1.id,
      });

      const parsed = JSON.parse(result.data);
      expect(parsed.data).toHaveLength(2);
    });

    it('should export clients as JSON', async () => {
      const org = await createTestOrganization();
      const app = await createTestApplication({ organizationId: org.id });
      await createTestClient(org.id, app.id);

      const result = await exportData({
        entityType: 'clients',
        format: 'json',
        organizationId: org.id,
      });

      expect(result.rowCount).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(result.data);
      expect(parsed.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should export roles scoped to an application', async () => {
      const org = await createTestOrganization();
      const app = await createTestApplication({ organizationId: org.id });
      await createTestClient(org.id, app.id);
      await createTestRole(app.id, { name: 'Test Role' });

      const result = await exportData({
        entityType: 'roles',
        format: 'json',
        organizationId: org.id,
        applicationId: app.id,
      });

      expect(result.rowCount).toBeGreaterThanOrEqual(1);
    });

    it('should not include sensitive data in export', async () => {
      const org = await createTestOrganization();
      await createTestUser(org.id, { email: 'sec@exp.com' });

      const result = await exportData({
        entityType: 'users',
        format: 'json',
        organizationId: org.id,
      });

      const parsed = JSON.parse(result.data);
      for (const user of parsed.data) {
        expect(user.password_hash).toBeUndefined();
        expect(user.passwordHash).toBeUndefined();
      }
    });

    it('should retain exact role and audit-window scope in export audit metadata', async () => {
      const org = await createTestOrganization({ name: 'Export Audit Org' });
      const app = await createTestApplication({ organizationId: org.id });
      await createTestClient(org.id, app.id);
      await createTestRole(app.id, { name: 'Audited Role' });
      const actor = await createTestUser(org.id, { email: 'export-actor@example.test' });
      const startDate = new Date('2026-01-01T00:00:00.000Z');
      const endDate = new Date('2026-01-31T23:59:59.999Z');

      await exportData({
        entityType: 'roles',
        format: 'json',
        organizationId: org.id,
        applicationId: app.id,
        actorId: actor.id,
      });
      await exportData({
        entityType: 'audit',
        format: 'json',
        organizationId: org.id,
        startDate,
        endDate,
        actorId: actor.id,
      });

      const audits = await getPool().query<{ metadata: Record<string, unknown> }>(
        `SELECT metadata FROM audit_log
         WHERE event_type = 'admin.export' AND actor_id = $1
         ORDER BY created_at, id`,
        [actor.id],
      );
      expect(audits.rows).toHaveLength(2);
      expect(audits.rows[0].metadata).toMatchObject({ applicationId: app.id });
      expect(audits.rows[1].metadata).toMatchObject({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
    });
  });
});
