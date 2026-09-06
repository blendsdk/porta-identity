import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROLE_DEFINITIONS,
  ALL_ADMIN_PERMISSIONS,
} from '../../../src/lib/admin-permissions.js';
import { getPool } from '../../../src/lib/database.js';

/** Delete permissions created by normal Porta initialization. */
const DELETE_PERMISSIONS = [
  'admin:org:delete',
  'admin:app:delete',
  'admin:module:delete',
  'admin:client:delete',
  'admin:role:delete',
  'admin:permission:delete',
  'admin:claim:delete',
  'admin:user:delete',
] as const;

/** Expected delete permissions for each built-in administrative role. */
const ROLE_DELETE_PERMISSIONS = new Map<string, readonly string[]>([
  ['porta-super-admin', DELETE_PERMISSIONS],
  ['porta-org-admin', ['admin:org:delete']],
  ['porta-user-admin', ['admin:user:delete']],
  [
    'porta-app-admin',
    [
      'admin:app:delete',
      'admin:module:delete',
      'admin:client:delete',
      'admin:role:delete',
      'admin:permission:delete',
      'admin:claim:delete',
    ],
  ],
  ['porta-auditor', []],
]);

/** Up and Down sections of the newest ordered migration. */
interface MigrationSql {
  readonly name: string;
  readonly up: string;
  readonly down: string;
}

/** Read the newest ordered SQL migration without applying it again. */
async function newestMigrationSql(): Promise<MigrationSql> {
  const migrationsDirectory = join(process.cwd(), 'migrations');
  const names = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  const name = names.at(-1);
  if (name === undefined) throw new Error('No ordered SQL migration was found');

  const sql = await readFile(join(migrationsDirectory, name), 'utf8');
  const marker = '-- Down Migration';
  const markerIndex = sql.indexOf(marker);
  if (markerIndex < 0) throw new Error(`${name} has no Down Migration section`);

  return {
    name,
    up: sql.slice(0, markerIndex),
    down: sql.slice(markerIndex + marker.length),
  };
}

/** Run isolated database assertions and always roll their changes back. */
async function inTransaction(assertions: (connection: PoolClient) => Promise<void>): Promise<void> {
  const connection = await getPool().connect();
  try {
    await connection.query('BEGIN');
    await assertions(connection);
  } finally {
    await connection.query('ROLLBACK').catch(() => undefined);
    connection.release();
  }
}

/** Insert the shared parent rows needed by application, module, and client status checks. */
async function createLifecycleParents(connection: PoolClient): Promise<{
  readonly applicationId: string;
  readonly organizationId: string;
}> {
  const suffix = randomBytes(8).toString('hex');
  const organization = await connection.query<{ id: string }>(
    `INSERT INTO organizations (name, slug)
     VALUES ($1, $2)
     RETURNING id`,
    [`Lifecycle organization ${suffix}`, `lifecycle-org-${suffix}`],
  );
  const application = await connection.query<{ id: string }>(
    `INSERT INTO applications (name, slug)
     VALUES ($1, $2)
     RETURNING id`,
    [`Lifecycle application ${suffix}`, `lifecycle-app-${suffix}`],
  );

  return {
    applicationId: application.rows[0]!.id,
    organizationId: organization.rows[0]!.id,
  };
}

/** Expect a removed lifecycle value to be rejected by a database constraint. */
async function expectStatusRejected(
  connection: PoolClient,
  sql: string,
  values: readonly unknown[],
): Promise<void> {
  await connection.query('SAVEPOINT before_removed_status');
  try {
    await expect(connection.query(sql, [...values])).rejects.toThrow();
  } finally {
    await connection.query('ROLLBACK TO SAVEPOINT before_removed_status');
    await connection.query('RELEASE SAVEPOINT before_removed_status');
  }
}

describe('record deletion lifecycle migration specification', () => {
  // Fresh schemas retain only Active and Suspended as organization lifecycle states.
  it('ST-01 accepts active and suspended organizations and rejects archived', async () => {
    await inTransaction(async (connection) => {
      const suffix = randomBytes(8).toString('hex');
      const organization = await connection.query<{ id: string }>(
        `INSERT INTO organizations (name, slug, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [`Status organization ${suffix}`, `status-org-${suffix}`],
      );
      const organizationId = organization.rows[0]!.id;

      await expect(
        connection.query("UPDATE organizations SET status = 'suspended' WHERE id = $1", [
          organizationId,
        ]),
      ).resolves.toBeDefined();
      await expectStatusRejected(
        connection,
        "UPDATE organizations SET status = 'archived' WHERE id = $1",
        [organizationId],
      );
    });
  });

  // Fresh schemas retain only Active and Inactive as application lifecycle states.
  it('ST-01 accepts active and inactive applications and rejects archived', async () => {
    await inTransaction(async (connection) => {
      const { applicationId } = await createLifecycleParents(connection);

      await expect(
        connection.query("UPDATE applications SET status = 'inactive' WHERE id = $1", [
          applicationId,
        ]),
      ).resolves.toBeDefined();
      await expectStatusRejected(
        connection,
        "UPDATE applications SET status = 'archived' WHERE id = $1",
        [applicationId],
      );
    });
  });

  // Modules have the same reversible lifecycle as their parent application.
  it('ST-01 accepts active and inactive modules and rejects archived', async () => {
    await inTransaction(async (connection) => {
      const { applicationId } = await createLifecycleParents(connection);
      const module = await connection.query<{ id: string }>(
        `INSERT INTO application_modules (application_id, name, slug, status)
         VALUES ($1, 'Lifecycle module', 'lifecycle-module', 'active')
         RETURNING id`,
        [applicationId],
      );
      const moduleId = module.rows[0]!.id;

      await expect(
        connection.query("UPDATE application_modules SET status = 'inactive' WHERE id = $1", [
          moduleId,
        ]),
      ).resolves.toBeDefined();
      await expectStatusRejected(
        connection,
        "UPDATE application_modules SET status = 'archived' WHERE id = $1",
        [moduleId],
      );
    });
  });

  // Whole-client Revoked is removed; secret revocation remains a separate artifact operation.
  it('ST-01 accepts active and inactive clients and rejects revoked', async () => {
    await inTransaction(async (connection) => {
      const { applicationId, organizationId } = await createLifecycleParents(connection);
      const suffix = randomBytes(8).toString('hex');
      const client = await connection.query<{ id: string }>(
        `INSERT INTO clients (
           organization_id, application_id, client_id, client_name, client_type, status
         ) VALUES ($1, $2, $3, 'Lifecycle client', 'public', 'active')
         RETURNING id`,
        [organizationId, applicationId, `lifecycle-client-${suffix}`],
      );
      const clientId = client.rows[0]!.id;

      await expect(
        connection.query("UPDATE clients SET status = 'inactive' WHERE id = $1", [clientId]),
      ).resolves.toBeDefined();
      await expectStatusRejected(
        connection,
        "UPDATE clients SET status = 'revoked' WHERE id = $1",
        [clientId],
      );
    });
  });

  // Porta init owns deletion permissions and assigns only the approved delete capabilities.
  it('ST-03 persists eight init-owned delete permissions with exact built-in role mappings', async () => {
    const allPermissions = [...ALL_ADMIN_PERMISSIONS];
    const deletePermissions = allPermissions.filter((permission) => permission.endsWith(':delete'));

    expect(deletePermissions.sort()).toEqual([...DELETE_PERMISSIONS].sort());
    expect(allPermissions.some((permission) => permission.endsWith(':archive'))).toBe(false);
    expect(allPermissions).toContain('admin:client:revoke');

    const roles = Object.values(ADMIN_ROLE_DEFINITIONS);
    expect(roles.map((role) => role.slug).sort()).toEqual(
      [...ROLE_DELETE_PERMISSIONS.keys()].sort(),
    );
    for (const role of roles) {
      const assignedDeletes = role.permissions.filter((permission) =>
        permission.endsWith(':delete'),
      );
      expect(assignedDeletes.sort()).toEqual(
        [...(ROLE_DELETE_PERMISSIONS.get(role.slug) ?? [])].sort(),
      );
    }

    expect(
      roles
        .filter((role) => role.permissions.includes('admin:client:revoke'))
        .map((role) => role.slug)
        .sort(),
    ).toEqual(['porta-app-admin', 'porta-super-admin']);

    // Exercise the same permission, role, and mapping order used by normal initialization against
    // the freshly migrated schema. The transaction keeps the shared integration database intact.
    await inTransaction(async (connection) => {
      const suffix = randomBytes(8).toString('hex');
      const application = await connection.query<{ id: string }>(
        `INSERT INTO applications (name, slug)
         VALUES ($1, $2)
         RETURNING id`,
        [`Initialization application ${suffix}`, `init-app-${suffix}`],
      );
      const applicationId = application.rows[0]!.id;
      const permissionIds = new Map<string, string>();

      for (const permission of allPermissions) {
        const inserted = await connection.query<{ id: string }>(
          `INSERT INTO permissions (application_id, name, slug)
           VALUES ($1, $2, $2)
           RETURNING id`,
          [applicationId, permission],
        );
        permissionIds.set(permission, inserted.rows[0]!.id);
      }

      for (const role of roles) {
        const insertedRole = await connection.query<{ id: string }>(
          `INSERT INTO roles (application_id, name, slug)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [applicationId, role.name, role.slug],
        );
        for (const permission of role.permissions) {
          const permissionId = permissionIds.get(permission);
          if (permissionId === undefined) {
            throw new Error(
              `Built-in role ${role.slug} references unknown permission ${permission}`,
            );
          }
          await connection.query(
            'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
            [insertedRole.rows[0]!.id, permissionId],
          );
        }
      }

      const storedDeletePermissions = await connection.query<{ slug: string }>(
        `SELECT slug
           FROM permissions
          WHERE application_id = $1 AND slug LIKE 'admin:%:delete'
          ORDER BY slug`,
        [applicationId],
      );
      expect(storedDeletePermissions.rows.map((row) => row.slug)).toEqual(
        [...DELETE_PERMISSIONS].sort(),
      );
    });
  });

  // Deleting a module removes its permissions and their mappings while unrelated rows survive.
  it('ST-04 cascades module-owned permissions without converting them to unscoped permissions', async () => {
    await inTransaction(async (connection) => {
      const { applicationId } = await createLifecycleParents(connection);
      const module = await connection.query<{ id: string }>(
        `INSERT INTO application_modules (application_id, name, slug)
         VALUES ($1, 'Billing', 'billing')
         RETURNING id`,
        [applicationId],
      );
      const role = await connection.query<{ id: string }>(
        `INSERT INTO roles (application_id, name, slug)
         VALUES ($1, 'Billing administrator', 'billing-admin')
         RETURNING id`,
        [applicationId],
      );
      const scopedPermission = await connection.query<{ id: string }>(
        `INSERT INTO permissions (application_id, module_id, name, slug)
         VALUES ($1, $2, 'Read invoices', 'billing:invoice:read')
         RETURNING id`,
        [applicationId, module.rows[0]!.id],
      );
      const unscopedPermission = await connection.query<{ id: string }>(
        `INSERT INTO permissions (application_id, module_id, name, slug)
         VALUES ($1, NULL, 'Read application', 'application:details:read')
         RETURNING id`,
        [applicationId],
      );
      await connection.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2), ($1, $3)`,
        [role.rows[0]!.id, scopedPermission.rows[0]!.id, unscopedPermission.rows[0]!.id],
      );

      await connection.query('DELETE FROM application_modules WHERE id = $1', [module.rows[0]!.id]);

      const permissions = await connection.query<{ id: string; module_id: string | null }>(
        'SELECT id, module_id FROM permissions WHERE application_id = $1 ORDER BY id',
        [applicationId],
      );
      const mappings = await connection.query<{ permission_id: string }>(
        'SELECT permission_id FROM role_permissions WHERE role_id = $1',
        [role.rows[0]!.id],
      );
      expect(permissions.rows).toEqual([{ id: unscopedPermission.rows[0]!.id, module_id: null }]);
      expect(mappings.rows).toEqual([{ permission_id: unscopedPermission.rows[0]!.id }]);
    });
  });

  // The forward migration changes schema only; normal init remains the sole permission owner.
  it('ST-05 keeps the newest migration forward-only and free of permission seeding', async () => {
    const migration = await newestMigrationSql();

    expect(Number.parseInt(migration.name, 10)).toBeGreaterThan(24);
    expect(migration.up).not.toMatch(/INSERT\s+INTO\s+(?:permissions|role_permissions)\b/i);
    for (const permission of DELETE_PERMISSIONS) {
      expect(migration.up).not.toContain(permission);
    }
    expect(migration.down).toMatch(/--[^\n]*(?:no-op|no op)/i);
    expect(migration.down).toMatch(/\bSELECT\s+1\s*;/i);
    expect(migration.down).not.toMatch(/\b(?:ALTER|DELETE|DROP|INSERT|UPDATE)\b/i);
  });
});
