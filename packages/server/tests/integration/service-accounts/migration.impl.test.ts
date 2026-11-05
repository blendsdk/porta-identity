import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { runner } from 'node-pg-migrate';
import { Client } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
  createTestPermission,
  createTestRole,
  createTestUser,
} from '../helpers/factories.js';

/** Execute only the owned feature migration, refusing implicit or earlier-database fallbacks. */
async function migrate(direction: 'up' | 'down', applicationName?: string): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (process.env.NODE_ENV !== 'test' || !databaseUrl || databaseUrl !== process.env.DATABASE_URL) {
    throw new Error('Migration checks require an explicit isolated test database');
  }
  if (direction === 'down') {
    const latest = await getPool().query<{ name: string }>(
      'SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1',
    );
    expect(latest.rows[0]?.name).toBe('037_service_account_invitations');
  }
  const migrationUrl = new URL(databaseUrl);
  if (applicationName) migrationUrl.searchParams.set('application_name', applicationName);
  await runner({
    databaseUrl: migrationUrl.toString(), migrationsTable: 'pgmigrations', dir: join(process.cwd(), 'migrations'),
    direction, count: direction === 'down' ? 1 : Infinity, log: () => {}, decamelize: false,
  });
}

/** Observe a real migration waiting on the exact writer, not a delay or an unrelated lock. */
async function waitForWriterBlock(applicationName: string, writerPid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await getPool().query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity WHERE application_name = $1
           AND wait_event_type = 'Lock' AND $2::integer = ANY(pg_blocking_pids(pid))
       ) AS blocked`, [applicationName, writerPid],
    );
    if (result.rows[0]?.blocked) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Downgrade did not reach the expected writer-lock barrier');
}

beforeEach(async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (process.env.NODE_ENV !== 'test' || !databaseUrl || databaseUrl !== process.env.DATABASE_URL) {
    throw new Error('Migration checks require an explicit isolated test database');
  }
  const latest = await getPool().query<{ name: string }>(
    'SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1',
  );
  expect(latest.rows[0]?.name).toBe('037_service_account_invitations');
  await truncateAllTables();
});

describe('service-account role migration integration', () => {
  it.each(['flag', 'marker'] as const)(
    'should refuse downgrade when an uncommitted %s becomes visible after its lock wait',
    async (kind) => {
      const organization = await createTestOrganization();
      const application = await createTestApplication();
      const client = await createTestClient(organization.id, application.id);
      const user = await createTestUser(organization.id);
      const bindingId = randomUUID();
      const writer = await getPool().connect();
      let committed = false;
      let pending: Promise<unknown> | undefined;
      try {
        await writer.query('BEGIN');
        const identity = await writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        const writerPid = identity.rows[0]?.pid;
        if (typeof writerPid !== 'number') throw new Error('Missing isolated writer identity');
        if (kind === 'flag') {
          await writer.query('UPDATE users SET is_service_account = TRUE WHERE id = $1', [user.id]);
        } else {
          await writer.query(
            `INSERT INTO client_service_accounts
              (id, client_id, account_id, authorization_version, status, targets)
             VALUES ($1, $2, NULL, $3, 'revoked', '[]'::jsonb)`,
            [bindingId, client.id, randomUUID()],
          );
        }
        const applicationName = `porta-down-${randomUUID()}`;
        // Capture rejection immediately so a refused migration cannot become an unhandled promise.
        pending = migrate('down', applicationName).then(() => null, (error: unknown) => error);
        await waitForWriterBlock(applicationName, writerPid);
        await writer.query('COMMIT');
        committed = true;
        expect(await pending).toMatchObject({
          message: 'Remove all service-account identities and bindings before downgrade',
        });
        const latest = await getPool().query<{ name: string }>(
          'SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1',
        );
        expect(latest.rows[0]?.name).toBe('037_service_account_invitations');
        if (kind === 'flag') {
          const flags = await getPool().query<{ is_service_account: boolean }>(
            'SELECT is_service_account FROM users WHERE id = $1', [user.id],
          );
          expect(flags.rows).toEqual([{ is_service_account: true }]);
        } else {
          const markers = await getPool().query<{ id: string }>(
            'SELECT id FROM client_service_accounts WHERE id = $1', [bindingId],
          );
          expect(markers.rows).toEqual([{ id: bindingId }]);
        }
      } finally {
        try {
          if (!committed) await writer.query('ROLLBACK');
        } finally {
          writer.release();
        }
        if (pending) await pending;
        await migrate('up');
      }
    });

  it('should refuse higher isolation without changing empty feature schema', async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl || databaseUrl !== process.env.DATABASE_URL) {
      throw new Error('Isolation checks require the explicitly selected test database');
    }
    const connection = new Client({ connectionString: databaseUrl });
    try {
      await connection.connect();
      await connection.query('SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await expect(runner({
        dbClient: connection, migrationsTable: 'pgmigrations', dir: join(process.cwd(), 'migrations'),
        direction: 'down', count: 1, log: () => {}, decamelize: false,
      })).rejects.toMatchObject({
        message: 'Service-account downgrade requires READ COMMITTED isolation',
      });
      const table = await getPool().query<{ name: string | null }>(
        "SELECT to_regclass('public.client_service_accounts')::text AS name",
      );
      expect(table.rows).toEqual([{ name: 'client_service_accounts' }]);
    } finally {
      await connection.end();
      await migrate('up');
    }
  });

  it('should seed only the reserved role when the canonical application already exists', async () => {
    await migrate('down');
    try {
      const application = await createTestApplication({ slug: 'porta-admin' });
      const permission = await createTestPermission(application.id, { slug: 'admin:user:invite' });
      const organization = await createTestOrganization();
      const human = await createTestUser(organization.id);
      const existingRole = await createTestRole(application.id);
      await getPool().query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
        [human.id, existingRole.id]);
      await migrate('up');

      const grants = await getPool().query<{ slug: string; permissionId: string }>(
        `SELECT p.slug, p.id AS "permissionId" FROM roles r
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE r.application_id = $1 AND r.slug = 'porta-invite-service'`, [application.id],
      );
      expect(grants.rows).toEqual([{ slug: 'admin:user:invite', permissionId: permission.id }]);
      const assignments = await getPool().query<{ role_id: string }>(
        'SELECT role_id FROM user_roles WHERE user_id = $1', [human.id],
      );
      expect(assignments.rows).toEqual([{ role_id: existingRole.id }]);
    } finally {
      await migrate('up');
    }
  });

  it('should roll back the additive schema when an existing role conflicts with the reserved name',
    async () => {
      await migrate('down');
      let conflictingRoleId: string | undefined;
      try {
        const application = await createTestApplication({ slug: 'porta-admin' });
        const role = await createTestRole(application.id, {
          slug: 'porta-invite-service', name: 'Existing operator role',
        });
        conflictingRoleId = role.id;
        await expect(migrate('up')).rejects.toThrow();
        const columns = await getPool().query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'users'
             AND column_name = 'is_service_account'`,
        );
        expect(columns.rows).toEqual([]);
        const table = await getPool().query<{ name: string | null }>(
          "SELECT to_regclass('public.client_service_accounts')::text AS name",
        );
        expect(table.rows).toEqual([{ name: null }]);
        const roles = await getPool().query<{ name: string }>(
          'SELECT name FROM roles WHERE id = $1', [role.id],
        );
        expect(roles.rows).toEqual([{ name: 'Existing operator role' }]);
      } finally {
        // This is only the test-owned conflicting row, never an operator's real role.
        if (conflictingRoleId) await getPool().query('DELETE FROM roles WHERE id = $1',
          [conflictingRoleId]);
        await migrate('up');
      }
    });
});
