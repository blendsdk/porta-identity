/** Portability must retain control-plane exclusion and cannot reclassify a service user as human. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import {
  applyPortabilityManifest,
  exportPortabilityManifest,
} from '../../../src/portability/index.js';
import { truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
  createTestUser,
} from '../helpers/factories.js';
import {
  addFixtureMemberships,
  createClassifiedBindingFixture,
  createHumanAdminFixtures,
  humanUserFingerprint,
  resetHumanFixtures,
} from './human-fixtures.js';

/** Create one ordinary portable tenant alongside the excluded control-plane service identity. */
async function createPortabilityFixture() {
  const admin = await createHumanAdminFixtures();
  const organization = await createTestOrganization();
  const application = await createTestApplication();
  const user = await createTestUser(organization.id);
  const client = await createTestClient(organization.id, application.id);
  const service = await createClassifiedBindingFixture(
    admin.organizationId,
    admin.application.id,
    organization.id,
    'active',
  );
  await addFixtureMemberships(service.user.id, [admin.reservedRole.id]);
  const actor = {
    userId: admin.superAdmin.id,
    controlPlaneOrganizationId: admin.organizationId,
  };
  return { admin, organization, application, user, client, service, actor };
}

/** Use only the documented export request and let the exporter construct the complete wire schema. */
async function exportOrdinaryManifest(actor: {
  /** Live human administrator performing the export. */
  userId: string;
  /** Authoritative control-plane organization to exclude. */
  controlPlaneOrganizationId: string;
}) {
  return exportPortabilityManifest(
    {
      scope: { kind: 'environment' },
      categories: [
        'users_assignments',
        'organizations',
        'applications_authorization',
        'oidc_clients',
      ],
      application_selection: { all_applications: true, application_slugs: [] },
    },
    actor,
  );
}

/**
 * Detect partial imports across the exported identity categories without exposing row contents.
 * Password and client-secret material never leaves the database in this fingerprint.
 */
async function portableIdentityFingerprint(): Promise<string> {
  const result = await getPool().query<{ fingerprint: string }>(
    `SELECT md5(jsonb_build_object(
       'organizations', (SELECT jsonb_agg(to_jsonb(item) ORDER BY id) FROM organizations AS item),
       'applications', (SELECT jsonb_agg(to_jsonb(item) ORDER BY id) FROM applications AS item),
       'modules', (SELECT jsonb_agg(to_jsonb(item) ORDER BY id) FROM application_modules AS item),
       'users', (SELECT jsonb_agg(to_jsonb(item) ORDER BY id) FROM users AS item),
       'roles', (SELECT jsonb_agg(to_jsonb(item) ORDER BY id) FROM roles AS item),
       'permissions', (SELECT jsonb_agg(to_jsonb(item) ORDER BY id) FROM permissions AS item),
       'role_permissions', (SELECT jsonb_agg(to_jsonb(item) ORDER BY role_id, permission_id)
         FROM role_permissions AS item),
       'memberships', (SELECT jsonb_agg(to_jsonb(item) ORDER BY user_id, role_id) FROM user_roles AS item),
       'claim_definitions', (SELECT jsonb_agg(to_jsonb(item) ORDER BY id)
         FROM custom_claim_definitions AS item),
       'claim_values', (SELECT jsonb_agg(to_jsonb(item) ORDER BY user_id, claim_id)
         FROM custom_claim_values AS item),
       'clients', (SELECT jsonb_agg(to_jsonb(item) ORDER BY id) FROM clients AS item),
       'bindings', (SELECT jsonb_agg(to_jsonb(item) ORDER BY id) FROM client_service_accounts AS item)
     )::text) AS fingerprint`,
  );
  const row = result.rows[0];
  if (!row) throw new Error('The portable identity fingerprint is unavailable');
  return row.fingerprint;
}

describe('Portability preserves the human and control-plane boundary', () => {
  beforeEach(resetHumanFixtures);
  afterEach(truncateAllTables);

  it('should export the ordinary tenant but no service identity or canonical control-plane entities when scope is environment', async () => {
    const fixture = await createPortabilityFixture();
    const { manifest } = await exportOrdinaryManifest(fixture.actor);

    expect(manifest.users).toHaveLength(1);
    expect(manifest.organizations).toHaveLength(1);
    expect(manifest.applications).toHaveLength(1);
    expect(manifest.clients).toHaveLength(1);
    expect(JSON.stringify(manifest.users)).toContain(fixture.user.email);
    expect(JSON.stringify(manifest.users)).not.toContain(fixture.service.user.email);
    expect(JSON.stringify(manifest.organizations)).toContain(fixture.organization.slug);
    expect(JSON.stringify(manifest.organizations)).not.toContain('porta-admin');
    expect(JSON.stringify(manifest.applications)).toContain(fixture.application.slug);
    expect(JSON.stringify(manifest.applications)).not.toContain('porta-admin');
    expect(JSON.stringify(manifest.clients)).not.toContain(fixture.service.client.clientId);
    expect(JSON.stringify(manifest.clients)).not.toContain(fixture.service.client.clientName);
    expect(JSON.stringify(manifest)).not.toMatch(/"is_?service_?account"\s*:/i);
  });

  it('should reject organization export without changing classification when the requested organization is the control plane', async () => {
    const fixture = await createPortabilityFixture();
    const before = await humanUserFingerprint(fixture.service.user.id);

    await expect(
      exportPortabilityManifest(
        {
          scope: { kind: 'organization', organization_slug: 'porta-admin' },
          categories: ['users_assignments', 'organizations', 'applications_authorization', 'oidc_clients'],
          application_selection: { all_applications: true, application_slugs: [] },
        },
        fixture.actor,
      ),
    ).rejects.toThrow();

    expect(await humanUserFingerprint(fixture.service.user.id)).toBe(before);
  });

  it.each(['keep-existing', 'update-existing'] as const)(
    'should reject atomically in %s mode when an otherwise exported user targets the classified control-plane identity',
    async (mode) => {
      const fixture = await createPortabilityFixture();
      const { manifest } = await exportOrdinaryManifest(fixture.actor);
      const ordinaryUser = manifest.users[0];
      if (!ordinaryUser) throw new Error('The ordinary exported user is missing');
      const input = {
        ...manifest,
        users: [
          {
            ...ordinaryUser,
            organization_slug: 'porta-admin',
            email: fixture.service.user.email,
          },
          ...manifest.users.slice(1),
        ],
      };
      const before = await portableIdentityFingerprint();

      await expect(applyPortabilityManifest(input, mode, fixture.actor)).rejects.toThrow();

      expect(await portableIdentityFingerprint()).toBe(before);
      const classification = await getPool().query<{ classified: boolean }>(
        'SELECT is_service_account AS classified FROM users WHERE id = $1',
        [fixture.service.user.id],
      );
      expect(classification.rows[0]?.classified).toBe(true);
    },
  );

  it('should retain ordinary user import without a classification field when the original environment manifest is reapplied', async () => {
    const fixture = await createPortabilityFixture();
    const { manifest } = await exportOrdinaryManifest(fixture.actor);
    const serviceBefore = await humanUserFingerprint(fixture.service.user.id);

    await applyPortabilityManifest(manifest, 'update-existing', fixture.actor);

    const ordinary = await getPool().query<{ classified: boolean }>(
      'SELECT is_service_account AS classified FROM users WHERE id = $1 AND organization_id = $2',
      [fixture.user.id, fixture.organization.id],
    );
    expect(ordinary.rows).toEqual([{ classified: false }]);
    expect(await humanUserFingerprint(fixture.service.user.id)).toBe(serviceBefore);
  });
});
