/**
 * Data export and import integration tests.
 *
 * Validates export produces correct data in CSV/JSON formats,
 * import with merge/overwrite/dry-run modes, and round-trip integrity.
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
import { importData } from '../../../src/lib/data-import.js';

describe('Data Export & Import (Integration)', () => {
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
      await createTestRole(app.id, { name: 'Test Role' });

      const result = await exportData({
        entityType: 'roles',
        format: 'json',
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
  });

  // ── Import ─────────────────────────────────────────────────────────

  describe('importData', () => {
    it('should import organizations in dry-run mode without persisting', async () => {
      const manifest = {
        version: '1.0',
        organizations: [
          {
            name: 'Dry Run Org',
            slug: 'dry-run-org',
          },
        ],
      };

      const result = await importData(manifest, 'dry-run');

      expect(result.mode).toBe('dry-run');
      expect(result.created.length).toBeGreaterThanOrEqual(1);

      // Verify it was NOT actually created
      const { findOrganizationBySlug } = await import(
        '../../../src/organizations/repository.js'
      );
      const org = await findOrganizationBySlug('dry-run-org');
      expect(org).toBeNull();
    });

    it('should import organizations in merge mode (create new, skip existing)', async () => {
      // Create an existing org
      await createTestOrganization({ name: 'Existing Org' });

      const manifest = {
        version: '1.0',
        organizations: [
          {
            name: 'New Import Org',
            slug: 'new-import-org',
          },
        ],
      };

      const result = await importData(manifest, 'merge');

      expect(result.mode).toBe('merge');
      expect(result.created.length).toBeGreaterThanOrEqual(1);
    });

    it('should import applications with dependency ordering', async () => {
      const org = await createTestOrganization({ name: 'Import App Org' });

      const manifest = {
        version: '1.0',
        applications: [
          {
            name: 'Imported App',
            slug: 'imported-app',
            organization_slug: org.slug,
          },
        ],
      };

      const result = await importData(manifest, 'merge');

      expect(result.errors).toHaveLength(0);
    });
  });

  // ── Round-Trip ─────────────────────────────────────────────────────

  describe('export → import round-trip', () => {
    it('should export and re-import organizations maintaining data integrity', async () => {
      // Create test data
      await createTestOrganization({ name: 'Round Trip Org A' });
      await createTestOrganization({ name: 'Round Trip Org B' });

      // Export
      const exported = await exportData({
        entityType: 'organizations',
        format: 'json',
      });

      const originalParsed = JSON.parse(exported.data);
      const originalData = originalParsed.data;
      const originalCount = originalData.length;

      expect(originalCount).toBeGreaterThanOrEqual(2);

      // Re-import in dry-run to verify structure
      // Build a minimal manifest from exported data
      const manifest = {
        version: '1.0',
        organizations: originalData.map((org: Record<string, unknown>) => ({
          name: org.name,
          slug: org.slug,
          default_locale: org.default_locale || null,
        })),
      };

      const result = await importData(manifest, 'dry-run');

      // In dry-run, existing orgs should be skipped
      expect(result.skipped.length).toBeGreaterThanOrEqual(2);
    });
  });
});
