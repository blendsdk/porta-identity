import { afterAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import type { RunnerOption } from 'node-pg-migrate';
import { getPool } from '../../../src/lib/database.js';
import { deleteUser } from '../../../src/users/service.js';
import {
  findServiceAccountByClientId,
  revokeServiceAccount,
  setServiceAccount,
} from '../../../src/service-accounts/index.js';
import {
  createLifecycleFixture,
  lifecycleSecurityFingerprint,
  readLifecycleAccount,
} from './lifecycle-fixtures.js';

/** The sole applied migration this destructive specification is permitted to reverse. */
const LIFECYCLE_MIGRATION_NAME = '037_service_account_invitations';

/** Require explicit matching test destinations without printing their connection credentials. */
function requireTestDatabaseUrl(): string {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (process.env.NODE_ENV !== 'test' || !testUrl || testUrl !== process.env.DATABASE_URL) {
    throw new Error('Lifecycle downgrade requires explicit matching test database configuration');
  }
  return testUrl;
}

/** Require the owned feature migration to be installed; later migrations remain independent. */
async function requireLifecycleMigrationApplied(): Promise<void> {
  const result = await getPool().query<{ name: string }>(
    'SELECT name FROM pgmigrations WHERE name LIKE $1',
    [`${LIFECYCLE_MIGRATION_NAME}%`],
  );
  if (result.rows.length !== 1) {
    throw new Error('Lifecycle downgrade requires its migration to be installed');
  }
}

/** Reapply the owned migration after an intentionally refused downgrade. */
async function ensureLifecycleMigration(): Promise<void> {
  await runner({
    databaseUrl: requireTestDatabaseUrl(),
    migrationsTable: 'pgmigrations',
    dir: fileURLToPath(new URL('../../../migrations/', import.meta.url)),
    direction: 'up',
    file: LIFECYCLE_MIGRATION_NAME,
    count: 1,
    checkOrder: false,
    log: () => {},
    decamelize: false,
  });
}

/** Fingerprint every migration-ledger row without exposing its stored values in assertion output. */
async function migrationLedgerFingerprint(): Promise<string> {
  const result = await getPool().query<{ fingerprint: string }>(`
    SELECT md5(COALESCE(
      jsonb_agg(to_jsonb(m) ORDER BY to_jsonb(m)::text), '[]'::jsonb
    )::text) AS fingerprint FROM pgmigrations m
  `);
  return result.rows[0].fingerprint;
}

/**
 * Capture logical public-schema definitions and object identities, not changing storage statistics.
 * Database-side hashing keeps function bodies and other catalog contents out of assertion output.
 */
async function publicSchemaFingerprint(): Promise<string> {
  const result = await getPool().query<{ fingerprint: string }>(`
    SELECT md5(jsonb_build_object(
      'relations', (
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.oid, 'name', c.relname, 'kind', c.relkind,
          'owner', c.relowner, 'acl', c.relacl,
          'rowSecurity', c.relrowsecurity, 'forceRowSecurity', c.relforcerowsecurity
        ) ORDER BY c.oid)
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
      ),
      'columns', (
        SELECT jsonb_agg(to_jsonb(c) ORDER BY c.table_name, c.ordinal_position)
        FROM information_schema.columns c WHERE c.table_schema = 'public'
      ),
      'constraints', (
        SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid)
        FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'public'
      ),
      'indexes', (
        SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexname)
        FROM pg_indexes i WHERE i.schemaname = 'public'
      ),
      'triggers', (
        SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid)
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
      ),
      'routines', (
        SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
      ),
      'types', (
        SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid)
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
      ),
      'enumLabels', (
        SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid)
        FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'
      ),
      'policies', (
        SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid)
        FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
      ),
      'rules', (
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid)
        FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
      ),
      'sequences', (
        SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sequence_name)
        FROM information_schema.sequences s WHERE s.sequence_schema = 'public'
      )
    )::text) AS fingerprint
  `);
  return result.rows[0].fingerprint;
}

// A marker left by actual account deletion must independently block removal of classification guards.
describe('service-account lifecycle deletion downgrade refusal', () => {
  it('should preserve the marker, security rows, schema and ledger when downgrade follows deletion and revoke', async () => {
    const databaseUrl = requireTestDatabaseUrl();
    await ensureLifecycleMigration();
    await requireLifecycleMigrationApplied();
    const fixture = await createLifecycleFixture();
    const created = await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail,
      targets: [fixture.target],
    }, fixture.actor);
    await deleteUser(fixture.adminOrganization.id, created.serviceAccountId, {
      kind: 'user',
      userId: fixture.actor.id,
    });
    expect(await readLifecycleAccount(created.serviceAccountId)).toBeNull();
    const deletedOwnerMarker = await findServiceAccountByClientId(fixture.client.id);
    expect(deletedOwnerMarker).toMatchObject({
      id: created.id,
      clientId: fixture.client.id,
      accountId: null,
      status: 'revoked',
      targets: [],
    });
    await expect(revokeServiceAccount(fixture.client.id, fixture.actor)).resolves.toBeUndefined();
    expect(await findServiceAccountByClientId(fixture.client.id)).toEqual(deletedOwnerMarker);
    const flaggedUsers = await getPool().query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM users WHERE is_service_account = TRUE',
    );
    expect(flaggedUsers.rows[0].count).toBe(0);

    await ensureLifecycleMigration();
    await requireLifecycleMigrationApplied();
    const securityBefore = await lifecycleSecurityFingerprint();
    const schemaBefore = await publicSchemaFingerprint();
    const ledgerBefore = await migrationLedgerFingerprint();
    const options: RunnerOption = {
      databaseUrl,
      migrationsTable: 'pgmigrations',
      dir: fileURLToPath(new URL('../../../migrations/', import.meta.url)),
      direction: 'down',
      file: LIFECYCLE_MIGRATION_NAME,
      count: 1,
      checkOrder: false,
      log: () => {},
      decamelize: false,
    };
    try {
      await expect(runner(options)).rejects.toThrow();
      expect(await findServiceAccountByClientId(fixture.client.id)).toEqual(deletedOwnerMarker);
      expect(await lifecycleSecurityFingerprint()).toBe(securityBefore);
      expect(await publicSchemaFingerprint()).toBe(schemaBefore);
      expect(await migrationLedgerFingerprint()).toBe(ledgerBefore);
    } finally {
      await runner({ ...options, direction: 'up' });
    }
  });
});

afterAll(async () => {
  await ensureLifecycleMigration();
});
