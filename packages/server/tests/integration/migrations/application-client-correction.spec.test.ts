import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getPool } from '../../../src/lib/database.js';

interface CorrectionMigrationSql {
  up: string;
  down: string;
}

/** Find the ordered migration that owns both application/client upgrade corrections. */
async function correctionMigrationSql(): Promise<CorrectionMigrationSql> {
  const migrationsDirectory = join(process.cwd(), 'migrations');
  const candidates = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name) && Number.parseInt(name, 10) > 23)
    .sort();

  for (const name of candidates) {
    const sql = await readFile(join(migrationsDirectory, name), 'utf8');
    if (
      sql.includes('porta-app-admin') &&
      sql.includes('admin:org:read') &&
      sql.includes('client_secrets')
    ) {
      const [up = sql, down = ''] = sql.split('-- Down Migration');
      return { up, down };
    }
  }
  throw new Error('Application/client correction migration was not found');
}

/** Count the target built-in role/permission mapping in the current search path. */
async function roleMappingCount(
  query: (text: string, values?: readonly unknown[]) => Promise<{ rows: Array<{ count: string }> }>,
): Promise<number> {
  const mapping = await query(`
    SELECT COUNT(*)::text AS count
      FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
     WHERE r.slug = 'porta-app-admin'
       AND p.slug = 'admin:org:read'
  `);
  return Number(mapping.rows[0]?.count ?? '0');
}

/** Create the minimum pre-upgrade schema used by the correction migration. */
async function createPreUpgradeSchema(
  query: (text: string, values?: readonly unknown[]) => Promise<unknown>,
  activeSecretCount: number,
): Promise<void> {
  await query(`
    CREATE TABLE applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT NOT NULL UNIQUE
    );
    CREATE TABLE roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      application_id UUID NOT NULL REFERENCES applications(id),
      slug TEXT NOT NULL
    );
    CREATE TABLE permissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      application_id UUID NOT NULL REFERENCES applications(id),
      slug TEXT NOT NULL
    );
    CREATE TABLE role_permissions (
      role_id UUID NOT NULL REFERENCES roles(id),
      permission_id UUID NOT NULL REFERENCES permissions(id),
      PRIMARY KEY (role_id, permission_id)
    );
    CREATE TABLE clients (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE client_secrets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id),
      status TEXT NOT NULL,
      expires_at TIMESTAMPTZ
    );
  `);
  await query(`
    WITH app AS (
      INSERT INTO applications (slug) VALUES ('porta-admin') RETURNING id
    ), role_row AS (
      INSERT INTO roles (application_id, slug)
      SELECT id, 'porta-app-admin' FROM app
    )
    INSERT INTO permissions (application_id, slug)
    SELECT id, 'admin:org:read' FROM app;
  `);
  const insertedClient = await getPool().query<{ id: string }>('SELECT gen_random_uuid() AS id');
  const clientId = insertedClient.rows[0]!.id;
  await query('INSERT INTO clients (id) VALUES ($1)', [clientId]);
  for (let index = 0; index < activeSecretCount; index += 1) {
    await query(
      `INSERT INTO client_secrets (client_id, status, expires_at)
       VALUES ($1, 'active', NULL)`,
      [clientId],
    );
  }
}

describe('application/client correction migration specification', () => {
  it('ST-07C accepts 10 active secrets and ST-08 remains idempotent when applied twice', async () => {
    const connection = await getPool().connect();
    const schema = `rd04_${randomBytes(8).toString('hex')}`;
    try {
      await connection.query('BEGIN');
      await connection.query(`CREATE SCHEMA ${schema}`);
      await connection.query(`SET LOCAL search_path TO ${schema}, public`);
      await createPreUpgradeSchema(
        (text, values) => connection.query(text, values === undefined ? undefined : [...values]),
        10,
      );
      const migration = await correctionMigrationSql();

      await expect(connection.query(migration.up)).resolves.toBeDefined();
      await expect(connection.query(migration.up)).resolves.toBeDefined();

      expect(
        await roleMappingCount((text, values) =>
          connection.query(text, values === undefined ? undefined : [...values]),
        ),
      ).toBe(1);
    } finally {
      await connection.query('ROLLBACK');
      connection.release();
    }
  });

  it('ST-07C aborts at 11 active secrets without mutating secrets or role mappings', async () => {
    const connection = await getPool().connect();
    const schema = `rd04_${randomBytes(8).toString('hex')}`;
    try {
      await connection.query('BEGIN');
      await connection.query(`CREATE SCHEMA ${schema}`);
      await connection.query(`SET LOCAL search_path TO ${schema}, public`);
      await createPreUpgradeSchema(
        (text, values) => connection.query(text, values === undefined ? undefined : [...values]),
        11,
      );
      const migration = await correctionMigrationSql();
      await connection.query('SAVEPOINT before_correction');

      await expect(connection.query(migration.up)).rejects.toThrow();
      await connection.query('ROLLBACK TO SAVEPOINT before_correction');

      const secrets = await connection.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM client_secrets
          WHERE status = 'active' AND expires_at IS NULL`,
      );
      const mappings = await connection.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM role_permissions',
      );
      expect(Number(secrets.rows[0]?.count ?? '0')).toBe(11);
      expect(Number(mappings.rows[0]?.count ?? '0')).toBe(0);
    } finally {
      await connection.query('ROLLBACK');
      connection.release();
    }
  });

  it('blocks a concurrent secret writer until the migration transaction releases its lock', async () => {
    const setup = await getPool().connect();
    const migrationConnection = await getPool().connect();
    const writer = await getPool().connect();
    const observer = await getPool().connect();
    const schema = `rd04_${randomBytes(8).toString('hex')}`;
    let writerInsert: Promise<unknown> | undefined;
    try {
      await setup.query('BEGIN');
      await setup.query(`CREATE SCHEMA ${schema}`);
      await setup.query(`SET LOCAL search_path TO ${schema}, public`);
      await createPreUpgradeSchema(
        (text, values) => setup.query(text, values === undefined ? undefined : [...values]),
        10,
      );

      const client = await setup.query<{ id: string }>('SELECT id FROM clients LIMIT 1');
      const clientId = client.rows[0]!.id;
      await setup.query('COMMIT');
      const migration = await correctionMigrationSql();
      await migrationConnection.query('BEGIN');
      await migrationConnection.query(`SET LOCAL search_path TO ${schema}, public`);
      await migrationConnection.query(migration.up);

      await writer.query('BEGIN');
      await writer.query(`SET LOCAL search_path TO ${schema}, public`);
      const writerPid = await writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      writerInsert = writer.query(
        `INSERT INTO client_secrets (client_id, status, expires_at)
         VALUES ($1, 'active', NULL)`,
        [clientId],
      );

      await vi.waitFor(
        async () => {
          const waiting = await observer.query<{ waiting: boolean }>(
            `SELECT EXISTS (
               SELECT 1
                 FROM pg_locks
                WHERE pid = $1
                  AND relation = to_regclass($2)
                  AND NOT granted
             ) AS waiting`,
            [writerPid.rows[0]!.pid, `${schema}.client_secrets`],
          );
          expect(waiting.rows[0]?.waiting).toBe(true);
        },
        { timeout: 2_000, interval: 10 },
      );

      await migrationConnection.query('COMMIT');
      await expect(writerInsert).resolves.toBeDefined();
      await writer.query('ROLLBACK');
      writerInsert = undefined;
    } finally {
      await setup.query('ROLLBACK').catch(() => undefined);
      await migrationConnection.query('ROLLBACK').catch(() => undefined);
      await writer.query('ROLLBACK').catch(() => undefined);
      if (writerInsert !== undefined) await writerInsert.catch(() => undefined);
      setup.release();
      migrationConnection.release();
      writer.release();
      observer.release();
      await getPool().query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  });

  it.each([
    ['pre-existing', true],
    ['migration-added', false],
  ] as const)('preserves a %s role mapping when Down runs', async (_case, preExisting) => {
    const connection = await getPool().connect();
    const schema = `rd04_${randomBytes(8).toString('hex')}`;
    try {
      await connection.query('BEGIN');
      await connection.query(`CREATE SCHEMA ${schema}`);
      await connection.query(`SET LOCAL search_path TO ${schema}, public`);
      await createPreUpgradeSchema(
        (text, values) => connection.query(text, values === undefined ? undefined : [...values]),
        0,
      );
      if (preExisting) {
        await connection.query(`
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT r.id, p.id
            FROM roles r
            JOIN permissions p ON p.application_id = r.application_id
           WHERE r.slug = 'porta-app-admin'
             AND p.slug = 'admin:org:read'
        `);
      }
      const migration = await correctionMigrationSql();

      await connection.query(migration.up);
      expect(
        await roleMappingCount((text, values) =>
          connection.query(text, values === undefined ? undefined : [...values]),
        ),
      ).toBe(1);
      await connection.query(migration.down);
      expect(
        await roleMappingCount((text, values) =>
          connection.query(text, values === undefined ? undefined : [...values]),
        ),
      ).toBe(1);
    } finally {
      await connection.query('ROLLBACK');
      connection.release();
    }
  });
});
