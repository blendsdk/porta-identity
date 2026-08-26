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
  createTestPermission,
  createTestClaimDefinition,
} from '../helpers/factories.js';
import { exportData } from '../../../src/lib/data-export.js';
import { importData } from '../../../src/lib/data-import.js';
import { getPool } from '../../../src/lib/database.js';

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
      const { findOrganizationBySlug } = await import('../../../src/organizations/repository.js');
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

      expect(result.errors).toBeUndefined();
    });

    it('should validate a complete new dependency graph in dry-run without persistence', async () => {
      const manifest = {
        version: '1.0' as const,
        organizations: [{ name: 'Preview Org', slug: 'preview-org' }],
        applications: [
          { name: 'Preview App', slug: 'preview-app', organization_slug: 'preview-org' },
        ],
        clients: [
          {
            client_name: 'Preview Client',
            application_slug: 'preview-app',
            organization_slug: 'preview-org',
            client_type: 'public' as const,
            application_type: 'spa' as const,
            redirect_uris: ['https://preview.example.test/callback'],
          },
        ],
        roles: [
          {
            name: 'Preview Role',
            slug: 'preview-role',
            application_slug: 'preview-app',
            organization_slug: 'preview-org',
          },
        ],
        permissions: [
          {
            name: 'Preview Read',
            slug: 'preview:records:read',
            application_slug: 'preview-app',
            organization_slug: 'preview-org',
          },
        ],
        role_permission_mappings: [
          {
            role_slug: 'preview-role',
            permission_slugs: ['preview:records:read'],
            application_slug: 'preview-app',
            organization_slug: 'preview-org',
          },
        ],
        users: [{ email: 'preview@example.test', organization_slug: 'preview-org' }],
        user_role_assignments: [
          {
            email: 'preview@example.test',
            organization_slug: 'preview-org',
            application_slug: 'preview-app',
            role_slug: 'preview-role',
          },
        ],
      };

      const result = await importData(manifest, 'dry-run');

      expect(result.errors).toBeUndefined();
      expect(result.created.map(({ type }) => type)).toEqual(
        expect.arrayContaining([
          'organization',
          'application',
          'client',
          'role',
          'permission',
          'role_permission_mapping',
          'user',
          'user_role_assignment',
        ]),
      );
      const persisted = await getPool().query('SELECT 1 FROM organizations WHERE slug = $1', [
        'preview-org',
      ]);
      expect(persisted.rowCount).toBe(0);
    });

    it('should resolve mixed planned and persisted relationship endpoints in dry-run', async () => {
      const org = await createTestOrganization({ name: 'Mixed Preview Org' });
      const app = await createTestApplication({ organizationId: org.id });
      await createTestClient(org.id, app.id);
      const user = await createTestUser(org.id, { email: 'mixed-preview@example.test' });
      const permission = await createTestPermission(app.id, {
        name: 'Persisted Read',
        slug: 'mixed:records:read',
      });

      const result = await importData(
        {
          version: '1.0',
          roles: [
            {
              name: 'Planned Role',
              slug: 'planned-role',
              application_slug: app.slug,
              organization_slug: org.slug,
            },
          ],
          claim_definitions: [
            {
              name: 'Planned Department',
              slug: 'planned_department',
              claim_type: 'string',
              application_slug: app.slug,
              organization_slug: org.slug,
            },
          ],
          role_permission_mappings: [
            {
              role_slug: 'planned-role',
              permission_slugs: [permission.slug],
              application_slug: app.slug,
              organization_slug: org.slug,
            },
          ],
          user_role_assignments: [
            {
              email: user.email,
              role_slug: 'planned-role',
              application_slug: app.slug,
              organization_slug: org.slug,
            },
          ],
          user_claim_values: [
            {
              email: user.email,
              claim_slug: 'planned_department',
              value: 'engineering',
              application_slug: app.slug,
              organization_slug: org.slug,
            },
          ],
        },
        'dry-run',
      );

      expect(result.errors).toBeUndefined();
      expect(result.created.map(({ type }) => type)).toEqual(
        expect.arrayContaining([
          'role',
          'claim_definition',
          'role_permission_mapping',
          'user_role_assignment',
          'user_claim_value',
        ]),
      );
      expect(
        await getPool().query('SELECT 1 FROM roles WHERE application_id = $1 AND slug = $2', [
          app.id,
          'planned-role',
        ]),
      ).toMatchObject({ rowCount: 0 });
    });

    it('should reject mismatched custom-claim values without durable effects', async () => {
      const org = await createTestOrganization({ name: 'Claim Validation Org' });
      const app = await createTestApplication({ organizationId: org.id });
      await createTestClient(org.id, app.id);
      const user = await createTestUser(org.id, { email: 'claim-validation@example.test' });
      const claim = await createTestClaimDefinition(app.id, {
        claimName: 'employee_number',
        claimType: 'number',
      });

      await expect(
        importData(
          {
            version: '1.0',
            user_claim_values: [
              {
                email: user.email,
                claim_slug: claim.claimName,
                value: 'not-a-number',
                application_slug: app.slug,
                organization_slug: org.slug,
              },
            ],
          },
          'overwrite',
        ),
      ).rejects.toMatchObject({ code: 'import_plan_rejected' });
      expect(
        await getPool().query(
          'SELECT 1 FROM custom_claim_values WHERE user_id = $1 AND claim_id = $2',
          [user.id, claim.id],
        ),
      ).toMatchObject({ rowCount: 0 });
    });

    it('should reject a tenant-scoped declaration of a foreign shared application', async () => {
      const alpha = await createTestOrganization({ name: 'Scoped Alpha' });
      const bravo = await createTestOrganization({ name: 'Scoped Bravo' });
      const bravoApp = await createTestApplication({ organizationId: bravo.id });
      await createTestClient(bravo.id, bravoApp.id);

      await expect(
        importData(
          {
            version: '1.0',
            applications: [
              {
                name: 'Foreign Rewrite',
                slug: bravoApp.slug,
                organization_slug: alpha.slug,
              },
            ],
          },
          'overwrite',
          undefined,
          alpha.id,
        ),
      ).rejects.toMatchObject({ code: 'import_plan_rejected' });
    });

    it('should serialize concurrent same-tenant client creation', async () => {
      const org = await createTestOrganization({ name: 'Concurrent Import Org' });
      const app = await createTestApplication({ organizationId: org.id });
      const manifest = {
        version: '1.0' as const,
        clients: [
          {
            client_name: 'Concurrent Client',
            application_slug: app.slug,
            organization_slug: org.slug,
            client_type: 'public' as const,
            application_type: 'spa' as const,
            redirect_uris: ['https://concurrent.example.test/callback'],
          },
        ],
      };

      const outcomes = await Promise.allSettled([
        importData(manifest, 'merge'),
        importData(manifest, 'merge'),
      ]);
      expect(outcomes.every(({ status }) => status === 'fulfilled')).toBe(true);
      const results = outcomes.flatMap((outcome) =>
        outcome.status === 'fulfilled' ? [outcome.value] : [],
      );
      expect(results.flatMap(({ created }) => created)).toHaveLength(1);
      expect(results.flatMap(({ skipped }) => skipped)).toHaveLength(1);
      const count = await getPool().query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM clients
         WHERE organization_id = $1 AND application_id = $2 AND client_name = $3`,
        [org.id, app.id, 'Concurrent Client'],
      );
      expect(count.rows[0].count).toBe('1');
    });

    it('should preserve typed config values and reject sensitive config updates', async () => {
      await importData(
        {
          version: '1.0',
          config: { api_rate_limit: 250, cookie_secure: false, access_token_ttl: '7200' },
        },
        'overwrite',
      );
      const values = await getPool().query<{ key: string; value: unknown }>(
        `SELECT key, value FROM system_config
         WHERE key = ANY($1::text[]) ORDER BY key`,
        [['access_token_ttl', 'api_rate_limit', 'cookie_secure']],
      );
      expect(Object.fromEntries(values.rows.map(({ key, value }) => [key, value]))).toEqual({
        access_token_ttl: '7200',
        api_rate_limit: 250,
        cookie_secure: false,
      });

      await getPool().query(
        `INSERT INTO system_config (key, value, value_type, is_sensitive)
         VALUES ('private_runtime_key', '"protected"', 'string', TRUE)`,
      );
      await expect(
        importData({ version: '1.0', config: { private_runtime_key: 'replacement' } }, 'overwrite'),
      ).rejects.toMatchObject({ code: 'import_plan_rejected' });
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
