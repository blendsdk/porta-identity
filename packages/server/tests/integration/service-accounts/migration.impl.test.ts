import { join } from 'node:path';
import { runner } from 'node-pg-migrate';
import { beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestOrganization,
  createTestPermission,
  createTestRole,
  createTestUser,
} from '../helpers/factories.js';

/** Execute only the owned feature migration, refusing implicit or earlier-database fallbacks. */
async function migrate(direction: 'up' | 'down'): Promise<void> {
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
  await runner({
    databaseUrl, migrationsTable: 'pgmigrations', dir: join(process.cwd(), 'migrations'),
    direction, count: direction === 'down' ? 1 : Infinity, log: () => {}, decamelize: false,
  });
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('service-account role migration integration', () => {
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
