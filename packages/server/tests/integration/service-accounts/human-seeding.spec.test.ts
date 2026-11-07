/** Fresh initialization and upgrades must seed the same machine-only role without human grants. */
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { runner } from 'node-pg-migrate';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestRole,
  createTestUser,
} from '../helpers/factories.js';
import {
  addFixtureMemberships,
  controlPlaneOrganizationId,
  humanFixturePassword,
  humanUserFingerprint,
  resetHumanFixtures,
} from './human-fixtures.js';
import { restoreMigrationOrder } from './migration-order.js';

/** Use an asynchronous child so the test worker retains control of cleanup and time limits. */
const execFileAsync = promisify(execFile);

/** Require the parent's explicit isolated database rather than selecting a fallback installation. */
function isolatedDatabaseUrl(): string {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || process.env.DATABASE_URL !== databaseUrl) {
    throw new Error('Seeding verification requires matching explicit isolated test database URLs');
  }
  return databaseUrl;
}

/** Ensure the service-account migration remains installed after targeted reversals. */
async function ensureSeedingMigration(): Promise<void> {
  await runner({
    databaseUrl: isolatedDatabaseUrl(),
    dir: join(process.cwd(), 'migrations'),
    migrationsTable: 'pgmigrations',
    direction: 'up',
    file: '037_service_account_invitations',
    count: 1,
    checkOrder: false,
    log: () => {},
    decamelize: false,
  });
}

/** Inspect canonical seed semantics, not generated role identifiers or descriptive labels. */
async function reservedRoleDefinition() {
  const result = await getPool().query<{
    application_slug: string;
    role_slug: string;
    permission_slugs: string[];
  }>(
    `SELECT application.slug AS application_slug, role.slug AS role_slug,
            COALESCE(array_agg(permission.slug ORDER BY permission.slug)
              FILTER (WHERE permission.id IS NOT NULL), ARRAY[]::varchar[]) AS permission_slugs
       FROM roles AS role
       JOIN applications AS application ON application.id = role.application_id
       LEFT JOIN role_permissions AS mapping ON mapping.role_id = role.id
       LEFT JOIN permissions AS permission ON permission.id = mapping.permission_id
      WHERE role.slug = $1 AND application.slug = $2
      GROUP BY application.slug, role.id, role.slug`,
    ['porta-invite-service', 'porta-admin'],
  );
  return result.rows;
}

/** A machine-only role is never a grant to a bootstrap administrator or an existing human. */
async function expectNoHumanServiceGrants(): Promise<void> {
  const grants = await getPool().query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM user_roles AS membership
       JOIN roles AS role ON role.id = membership.role_id
       JOIN applications AS application ON application.id = role.application_id
       JOIN users AS account ON account.id = membership.user_id
      WHERE role.slug = $1 AND application.slug = $2 AND NOT account.is_service_account`,
    ['porta-invite-service', 'porta-admin'],
  );
  expect(grants.rows[0]?.count).toBe(0);
}

describe('Reserved role seeding preserves human identities', () => {
  beforeEach(async () => {
    await ensureSeedingMigration();
    await resetHumanFixtures();
  });
  afterEach(truncateAllTables);

  it('should seed only invitation authority and no human grant when current source initializes a fresh installation', async () => {
    isolatedDatabaseUrl();
    const email = 'synthetic-admin@test.example.com';
    const password = humanFixturePassword();
    try {
      // Execute source through the existing loader; a built artifact could hide a missing init change.
      await execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          'src/cli/index.ts',
          'init',
          '--email',
          email,
          '--given-name',
          'Synthetic',
          '--family-name',
          'Admin',
          '--password',
          password,
        ],
        { cwd: process.cwd(), env: process.env, timeout: 45_000, maxBuffer: 64 * 1024 },
      );
    } catch {
      // Child diagnostics can include arguments or configuration. Never forward them to the reporter.
      throw new Error('Current-source initialization failed for the isolated synthetic installation');
    }

    expect(await reservedRoleDefinition()).toEqual([
      {
        application_slug: 'porta-admin',
        role_slug: 'porta-invite-service',
        permission_slugs: ['admin:user:invite'],
      },
    ]);
    await expectNoHumanServiceGrants();
    const bootstrap = await getPool().query<{ classified: boolean }>(
      'SELECT is_service_account AS classified FROM users WHERE email = $1',
      [email],
    );
    expect(bootstrap.rows).toEqual([{ classified: false }]);
  }, 60_000);

  it('should seed the same reserved definition without changing existing humans when the additive migration is reapplied', async () => {
    const databaseUrl = isolatedDatabaseUrl();
    await ensureSeedingMigration();
    const applied = await getPool().query<{ name: string }>(
      'SELECT name FROM pgmigrations WHERE name LIKE $1',
      ['037_service_account_invitations%'],
    );
    expect(applied.rows).toHaveLength(1);
    const organizationId = await controlPlaneOrganizationId();
    const application = await createTestApplication({ name: 'Porta Admin', slug: 'porta-admin' });
    const ordinaryRole = await createTestRole(application.id, { slug: 'ordinary-existing-role' });
    const human = await createTestUser(organizationId);
    await addFixtureMemberships(human.id, [ordinaryRole.id]);
    const before = await humanUserFingerprint(human.id);
    const options = {
      databaseUrl,
      dir: join(process.cwd(), 'migrations'),
      migrationsTable: 'pgmigrations',
      log: () => {},
      decamelize: false,
      file: '037_service_account_invitations',
      checkOrder: false,
    };

    try {
      // The fixture has no flagged users or bindings, so the guarded downgrade is legitimate.
      await runner({ ...options, direction: 'down', count: 1 });
      await runner({ ...options, direction: 'up', count: 1 });

      expect(await reservedRoleDefinition()).toEqual([
        {
          application_slug: 'porta-admin',
          role_slug: 'porta-invite-service',
          permission_slugs: ['admin:user:invite'],
        },
      ]);
      await expectNoHumanServiceGrants();
      expect(await humanUserFingerprint(human.id)).toBe(before);
      const memberships = await getPool().query<{ role_id: string }>(
        'SELECT role_id FROM user_roles WHERE user_id = $1',
        [human.id],
      );
      expect(memberships.rows).toEqual([{ role_id: ordinaryRole.id }]);
    } finally {
      await runner({ ...options, direction: 'up', count: Infinity });
    }
  });
});

afterAll(async () => {
  await ensureSeedingMigration();
  await restoreMigrationOrder();
});
