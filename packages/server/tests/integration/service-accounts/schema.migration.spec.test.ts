import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { runner } from 'node-pg-migrate';
import type { RunnerOption } from 'node-pg-migrate';
import { beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
  createTestRole,
  createTestUser,
} from '../helpers/factories.js';

/** The exact migration must be latest before a one-step downgrade can be safe. */
const FEATURE_MIGRATION = '037_service_account_invitations';

/** Refuse implicit database fallbacks; the parent run must supply its isolated test database. */
function getMigrationDatabaseUrl(): string {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (process.env.NODE_ENV !== 'test' || !databaseUrl || process.env.DATABASE_URL !== databaseUrl) {
    throw new Error('Migration tests require an explicit, matching isolated TEST_DATABASE_URL.');
  }
  return databaseUrl;
}

/** Fail before any rollback if the feature migration is absent or a later migration is installed. */
async function assertFeatureMigrationIsLatest(): Promise<void> {
  getMigrationDatabaseUrl();
  const result = await getPool().query<{ name: string }>(
    'SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1',
  );
  expect(result.rows[0]?.name, 'Only the installed service-account migration may be rolled back.').toBe(
    FEATURE_MIGRATION,
  );
}

/**
 * Use the ordinary runner with its own connection and migration transaction.
 * A refused downgrade must not abort the application pool's subsequent assertions.
 */
async function migrate(direction: 'up' | 'down'): Promise<void> {
  if (direction === 'down') await assertFeatureMigrationIsLatest();
  const options: RunnerOption = {
    databaseUrl: getMigrationDatabaseUrl(),
    migrationsTable: 'pgmigrations',
    dir: join(process.cwd(), 'migrations'),
    direction,
    count: direction === 'down' ? 1 : Infinity,
    log: () => {},
    decamelize: false,
  };
  await runner(options);
}

/** Create unrelated identities and role data that either migration direction must preserve. */
async function createOrdinaryFixture(status: 'active' | 'inactive' = 'active') {
  const organization = await createTestOrganization();
  const application = await createTestApplication();
  const client = await createTestClient(organization.id, application.id);
  const user = await createTestUser(organization.id);
  await getPool().query('UPDATE users SET status = $1 WHERE id = $2', [status, user.id]);
  const role = await createTestRole(application.id);
  return { client, user, role };
}

/** Compare all ordinary row data while allowing only the feature-owned user column to disappear. */
async function readOrdinaryData(userId: string, clientId: string, roleId: string) {
  const [users, clients, roles] = await Promise.all([
    getPool().query<{ data: Record<string, unknown> }>(
      "SELECT to_jsonb(u) - 'is_service_account' AS data FROM users u WHERE id = $1",
      [userId],
    ),
    getPool().query<{ data: Record<string, unknown> }>(
      'SELECT to_jsonb(c) AS data FROM clients c WHERE id = $1',
      [clientId],
    ),
    getPool().query<{ data: Record<string, unknown> }>(
      'SELECT to_jsonb(r) AS data FROM roles r WHERE id = $1',
      [roleId],
    ),
  ]);
  return { users: users.rows, clients: clients.rows, roles: roles.rows };
}

/** Read the complete marker so a failed downgrade cannot silently change its authority or times. */
async function readMarker(id: string) {
  const result = await getPool().query<{ data: Record<string, unknown> }>(
    'SELECT to_jsonb(binding) AS data FROM client_service_accounts binding WHERE id = $1',
    [id],
  );
  return result.rows;
}

describe('Service-account migration safety', () => {
  beforeEach(async () => {
    await assertFeatureMigrationIsLatest();
    await truncateAllTables();
  });

  // A human row that predates the new column must stay human without acquiring new role assignments.
  it('should preserve an existing human when the feature migration is applied', async () => {
    const fixture = await createOrdinaryFixture();
    const ordinaryData = await readOrdinaryData(fixture.user.id, fixture.client.id, fixture.role.id);
    const assignments = await getPool().query<{ data: Record<string, unknown> }>(
      'SELECT to_jsonb(ur) AS data FROM user_roles ur WHERE user_id = $1',
      [fixture.user.id],
    );

    try {
      await migrate('down');
      await migrate('up');
      const user = await getPool().query<{ is_service_account: boolean }>(
        'SELECT is_service_account FROM users WHERE id = $1',
        [fixture.user.id],
      );
      const afterAssignments = await getPool().query<{ data: Record<string, unknown> }>(
        'SELECT to_jsonb(ur) AS data FROM user_roles ur WHERE user_id = $1',
        [fixture.user.id],
      );

      expect(user.rows).toEqual([{ is_service_account: false }]);
      expect(afterAssignments.rows).toEqual(assignments.rows);
      expect(await readOrdinaryData(fixture.user.id, fixture.client.id, fixture.role.id)).toEqual(
        ordinaryData,
      );
    } finally {
      await migrate('up');
    }
  });

  // Inactivity does not erase the permanent classification or make downgrade safe.
  it.each(['active', 'inactive'] as const)(
    'should refuse downgrade without changing data when an %s flagged user survives',
    async (status) => {
      const fixture = await createOrdinaryFixture(status);
      await getPool().query('UPDATE users SET is_service_account = TRUE WHERE id = $1', [
        fixture.user.id,
      ]);
      const ordinaryData = await readOrdinaryData(fixture.user.id, fixture.client.id, fixture.role.id);
      const bindings = await getPool().query<{ count: number }>(
        'SELECT count(*)::int AS count FROM client_service_accounts',
      );
      expect(bindings.rows).toEqual([{ count: 0 }]);

      try {
        await expect(migrate('down')).rejects.toThrow(Error);
        await assertFeatureMigrationIsLatest();
        const user = await getPool().query<{ status: string; is_service_account: boolean }>(
          'SELECT status, is_service_account FROM users WHERE id = $1',
          [fixture.user.id],
        );

        expect(user.rows).toEqual([{ status, is_service_account: true }]);
        expect(await readOrdinaryData(fixture.user.id, fixture.client.id, fixture.role.id)).toEqual(
          ordinaryData,
        );
      } finally {
        await migrate('up');
      }
    },
  );

  // A marker must survive independently of flagged users so its client cannot be restored as human.
  it('should refuse downgrade without changing data when only an ownerless revoked marker survives', async () => {
    const fixture = await createOrdinaryFixture();
    const ordinaryData = await readOrdinaryData(fixture.user.id, fixture.client.id, fixture.role.id);
    const id = randomUUID();
    await getPool().query(
      `INSERT INTO client_service_accounts
         (id, client_id, account_id, authorization_version, status, targets, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [id, fixture.client.id, null, randomUUID(), 'revoked', '[]', new Date(), new Date()],
    );
    const marker = await readMarker(id);
    const flaggedUsers = await getPool().query<{ count: number }>(
      'SELECT count(*)::int AS count FROM users WHERE is_service_account = TRUE',
    );
    expect(flaggedUsers.rows).toEqual([{ count: 0 }]);

    try {
      await expect(migrate('down')).rejects.toThrow(Error);
      await assertFeatureMigrationIsLatest();
      expect(await readMarker(id)).toEqual(marker);
      const remainingFlags = await getPool().query<{ count: number }>(
        'SELECT count(*)::int AS count FROM users WHERE is_service_account = TRUE',
      );
      expect(remainingFlags.rows).toEqual([{ count: 0 }]);
      expect(await readOrdinaryData(fixture.user.id, fixture.client.id, fixture.role.id)).toEqual(
        ordinaryData,
      );
    } finally {
      await migrate('up');
    }
  });

  // Empty feature state permits reversal, but ordinary user, client, and role rows are not disposable.
  it('should reverse and reapply only feature schema when no flags or binding rows remain', async () => {
    const fixture = await createOrdinaryFixture();
    const ordinaryData = await readOrdinaryData(fixture.user.id, fixture.client.id, fixture.role.id);

    try {
      await migrate('down');
      const table = await getPool().query<{ name: string | null }>(
        "SELECT to_regclass('public.client_service_accounts')::text AS name",
      );
      const column = await getPool().query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users'
            AND column_name = 'is_service_account'`,
      );

      expect(table.rows).toEqual([{ name: null }]);
      expect(column.rows).toEqual([]);
      expect(await readOrdinaryData(fixture.user.id, fixture.client.id, fixture.role.id)).toEqual(
        ordinaryData,
      );

      await migrate('up');
      await assertFeatureMigrationIsLatest();
      const restored = await getPool().query<{ is_service_account: boolean }>(
        'SELECT is_service_account FROM users WHERE id = $1',
        [fixture.user.id],
      );
      const bindings = await getPool().query<{ count: number }>(
        'SELECT count(*)::int AS count FROM client_service_accounts',
      );

      expect(restored.rows).toEqual([{ is_service_account: false }]);
      expect(bindings.rows).toEqual([{ count: 0 }]);
      expect(await readOrdinaryData(fixture.user.id, fixture.client.id, fixture.role.id)).toEqual(
        ordinaryData,
      );
    } finally {
      await migrate('up');
    }
  });
});
