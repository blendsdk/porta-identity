import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { upsertSession } from '../../../src/lib/session-tracking.js';
import { truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestPermission,
} from '../helpers/factories.js';
import {
  clientRecord,
  durableCounts,
  getApplyManifestFunction,
  manifest,
  organizationRecord,
  seedDestination,
  userRecord,
} from './portability-import-live-fixtures.js';

/** Read a single integer aggregate through a parameterized live query. */
async function scalar(sql: string, values: readonly unknown[] = []): Promise<number> {
  const result = await getPool().query<{ count: string }>(sql, [...values]);
  return Number(result.rows[0]?.count ?? 0);
}

/** Create a tracked session whose revocation can be observed after commit. */
async function trackSession(userId: string, organizationId: string): Promise<string> {
  const sessionId = randomUUID();
  await upsertSession({
    sessionId,
    userId,
    organizationId,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  return sessionId;
}

/** Read whether one tracked administrative session is revoked. */
async function sessionRevoked(sessionId: string): Promise<boolean | null> {
  const result = await getPool().query<{ revoked: boolean }>(
    'SELECT revoked_at IS NOT NULL AS revoked FROM admin_sessions WHERE session_id = $1',
    [sessionId],
  );
  return result.rows[0]?.revoked ?? null;
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('live portability atomic apply specification', () => {
  // Apply works directly from the manifest and rebuilds current destination state without preview state.
  it('should apply independently without a preview token or retained plan', async () => {
    const applyManifest = getApplyManifestFunction();
    const fixture = await seedDestination();
    const result = await applyManifest(
      manifest({ organizations: [organizationRecord()] }),
      'keep-existing',
      fixture.actor,
    );

    expect(result.mode).toBe('keep-existing');
    expect(result.items).toContainEqual(
      expect.objectContaining({ entity_type: 'organizations', action: 'skipped' }),
    );
    expect(result).not.toHaveProperty('preview_token');
  });

  // Keep-existing preserves matched values while creating missing records and relationships.
  it('should preserve matches and create missing graph data in keep-existing mode', async () => {
    const applyManifest = getApplyManifestFunction();
    const fixture = await seedDestination();
    const result = await applyManifest(
      manifest({
        categories: ['organizations', 'applications_authorization'],
        application_selection: { all_applications: true, application_slugs: [] },
        organizations: [organizationRecord('Manifest Name')],
        applications: [
          { slug: 'new-app', name: 'New Application', description: null, status: 'active' },
        ],
      }),
      'keep-existing',
      fixture.actor,
    );
    const organization = await getPool().query<{ name: string }>(
      'SELECT name FROM organizations WHERE slug = $1',
      ['alpha-org'],
    );

    expect(organization.rows[0]?.name).toBe('Alpha Organization');
    expect(await scalar('SELECT COUNT(*) FROM applications WHERE slug = $1', ['new-app'])).toBe(1);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity_type: 'organizations', action: 'skipped' }),
        expect.objectContaining({ entity_type: 'applications', action: 'created' }),
      ]),
    );
  });

  // Update-existing changes only portable mutable fields and listed claims while preserving destination-only rows.
  it('should update allowed values and preserve destination-only state', async () => {
    const applyManifest = getApplyManifestFunction();
    const fixture = await seedDestination();
    const extraApplication = await createTestApplication({
      name: 'Destination Only',
      slug: 'only-here',
    });
    const passwordHash = '$argon2id$destination-password-hash';
    await getPool().query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      passwordHash,
      fixture.userId,
    ]);

    await applyManifest(
      manifest({
        categories: ['organizations', 'users_assignments'],
        application_selection: { all_applications: true, application_slugs: [] },
        organizations: [organizationRecord('Updated Name')],
        users: [{ ...userRecord(), given_name: 'Updated Given' }],
      }),
      'update-existing',
      fixture.actor,
    );
    const user = await getPool().query<{ given_name: string; password_hash: string }>(
      'SELECT given_name, password_hash FROM users WHERE id = $1',
      [fixture.userId],
    );

    expect(user.rows[0]).toStrictEqual({
      given_name: 'Updated Given',
      password_hash: passwordHash,
    });
    expect(
      await scalar('SELECT COUNT(*) FROM applications WHERE id = $1', [extraApplication.id]),
    ).toBe(1);
  });

  // Mapping actions count each record once and distinguish all, none, and mixed existing edges.
  it.each([
    ['skipped', 'all'],
    ['created', 'none'],
    ['updated', 'mixed'],
  ] as const)('should report a %s aggregate mapping when %s edges exist', async (action, state) => {
    const applyManifest = getApplyManifestFunction();
    const fixture = await seedDestination();
    const second = await createTestPermission(fixture.applicationId, {
      name: 'Write orders',
      slug: 'orders:write',
    });
    if (state === 'all') {
      await getPool().query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
        [fixture.roleId, second.id],
      );
    } else if (state === 'none') {
      await getPool().query('DELETE FROM role_permissions WHERE role_id = $1', [fixture.roleId]);
    }
    const result = await applyManifest(
      manifest({
        categories: ['applications_authorization'],
        application_selection: { all_applications: false, application_slugs: ['alpha-app'] },
        role_permission_mappings: [
          {
            application_slug: 'alpha-app',
            role_slug: 'OPERATOR',
            permission_slugs: ['orders:read / delegated', 'orders:write'],
          },
        ],
      }),
      'keep-existing',
      fixture.actor,
    );

    expect(result.items).toContainEqual(
      expect.objectContaining({ entity_type: 'role_permission_mappings', action }),
    );
    expect(
      await scalar('SELECT COUNT(*) FROM role_permissions WHERE role_id = $1', [fixture.roleId]),
    ).toBe(2);
  });

  // A forced final audit failure rolls back records, mappings, audits, and secrets together.
  it('should roll back the complete apply when the final audit write fails', async () => {
    const applyManifest = getApplyManifestFunction();
    const fixture = await seedDestination();
    const before = await durableCounts();
    await getPool().query(`
      CREATE FUNCTION reject_portability_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.event_type = 'admin.import' THEN RAISE EXCEPTION 'forced private audit failure'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER reject_portability_audit
      BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_portability_audit()
    `);

    try {
      await expect(
        applyManifest(
          manifest({
            categories: ['oidc_clients'],
            application_selection: { all_applications: true, application_slugs: [] },
            clients: [clientRecord()],
          }),
          'keep-existing',
          fixture.actor,
        ),
      ).rejects.toMatchObject({ code: 'import_execution_failed', status: 503 });
      expect(await durableCounts()).toStrictEqual(before);
      expect(await scalar('SELECT COUNT(*) FROM client_secrets')).toBe(0);
    } finally {
      await getPool().query('DROP TRIGGER IF EXISTS reject_portability_audit ON audit_log');
      await getPool().query('DROP FUNCTION IF EXISTS reject_portability_audit()');
    }
  });

  // New confidential clients receive one hashed Imported secret with six-month clamped UTC expiry.
  it('should return one committed confidential credential and persist only its hash', async () => {
    const applyManifest = getApplyManifestFunction();
    const fixture = await seedDestination();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-31T23:45:12.345Z'));
    try {
      const result = await applyManifest(
        manifest({
          categories: ['oidc_clients'],
          application_selection: { all_applications: true, application_slugs: [] },
          clients: [clientRecord()],
        }),
        'keep-existing',
        fixture.actor,
      );
      const secrets = await getPool().query<{
        secret_hash: string;
        label: string;
        expires_at: Date;
      }>('SELECT secret_hash, label, expires_at FROM client_secrets');

      expect(result.credentials).toHaveLength(1);
      expect(result.credentials?.[0]).toMatchObject({
        client_id: 'portable-client',
        label: 'Imported',
        expires_at: '2027-02-28T23:45:12.345Z',
      });
      expect(secrets.rows).toHaveLength(1);
      expect(secrets.rows[0]?.label).toBe('Imported');
      expect(secrets.rows[0]?.secret_hash).not.toBe(result.credentials?.[0]?.secret);
    } finally {
      vi.useRealTimers();
    }
  });

  // Public and matched confidential clients never create or return another secret.
  it.each(['public', 'matched confidential'] as const)(
    'should create no credential for a %s client',
    async (scenario) => {
      const applyManifest = getApplyManifestFunction();
      const fixture = await seedDestination();
      if (scenario === 'matched confidential') {
        await createTestClient(fixture.organizationId, fixture.applicationId, {
          clientId: 'portable-client',
        });
      }
      const result = await applyManifest(
        manifest({
          categories: ['oidc_clients'],
          application_selection: { all_applications: true, application_slugs: [] },
          clients: [clientRecord(scenario === 'public' ? 'public' : 'confidential')],
        }),
        'keep-existing',
        fixture.actor,
      );

      expect(result.credentials ?? []).toStrictEqual([]);
      expect(await scalar('SELECT COUNT(*) FROM client_secrets')).toBe(0);
    },
  );

  // Active imports preserve automatic lock state; inactive imports deactivate without restoring source state.
  it.each(['active', 'inactive'] as const)(
    'should apply %s lifecycle without clearing destination lock state',
    async (status) => {
      const applyManifest = getApplyManifestFunction();
      const fixture = await seedDestination();
      await getPool().query(
        `UPDATE users SET status = 'locked', locked_at = NOW(), locked_reason = 'auto_lockout',
                          failed_login_count = 5 WHERE id = $1`,
        [fixture.userId],
      );
      await applyManifest(
        manifest({
          categories: ['users_assignments'],
          application_selection: { all_applications: true, application_slugs: [] },
          users: [userRecord(status)],
        }),
        'update-existing',
        fixture.actor,
      );
      const user = await getPool().query<{
        status: string;
        locked_at: Date | null;
        failed_login_count: number;
      }>('SELECT status, locked_at, failed_login_count FROM users WHERE id = $1', [fixture.userId]);

      expect(user.rows[0]?.status).toBe(status === 'active' ? 'locked' : 'inactive');
      expect(user.rows[0]?.locked_at).not.toBeNull();
      expect(user.rows[0]?.failed_login_count).toBe(5);
    },
  );

  // Deactivation revokes only affected authority after commit and leaves unrelated sessions active.
  it('should perform targeted post-commit authority cleanup', async () => {
    const applyManifest = getApplyManifestFunction();
    const fixture = await seedDestination();
    const otherUser = await getPool().query<{ id: string }>(
      `INSERT INTO users (organization_id, email, status)
       VALUES ($1, $2, 'active') RETURNING id`,
      [fixture.organizationId, 'other@alpha.example'],
    );
    const affectedSession = await trackSession(fixture.userId, fixture.organizationId);
    const unrelatedSession = await trackSession(otherUser.rows[0]!.id, fixture.organizationId);

    await applyManifest(
      manifest({
        categories: ['users_assignments'],
        application_selection: { all_applications: true, application_slugs: [] },
        users: [userRecord('inactive')],
      }),
      'update-existing',
      fixture.actor,
    );

    await vi.waitFor(async () => expect(await sessionRevoked(affectedSession)).toBe(true));
    expect(await sessionRevoked(unrelatedSession)).toBe(false);
  });

  // Audit and later reads retain no plaintext credential, manifest body, or internal identifiers.
  it('should keep durable audit and later client reads content-free', async () => {
    const applyManifest = getApplyManifestFunction();
    const fixture = await seedDestination();
    const result = await applyManifest(
      manifest({
        categories: ['oidc_clients'],
        application_selection: { all_applications: true, application_slugs: [] },
        clients: [clientRecord()],
      }),
      'keep-existing',
      fixture.actor,
    );
    const secret = result.credentials?.[0]?.secret;
    expect(secret).toBeTruthy();
    const audit = await getPool().query<{ metadata: unknown }>(
      "SELECT metadata FROM audit_log WHERE event_type = 'admin.import'",
    );
    const laterClient = await getPool().query('SELECT * FROM clients WHERE client_id = $1', [
      'portable-client',
    ]);

    expect(JSON.stringify(audit.rows)).not.toContain(secret);
    expect(JSON.stringify(audit.rows)).not.toMatch(/portable\.example|Portable Client|internal-/i);
    expect(JSON.stringify(laterClient.rows)).not.toContain(secret);
    expect(JSON.stringify(result.items)).not.toMatch(/resolved_id|organization_id|application_id/i);
  });
});
