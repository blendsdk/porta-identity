/** Schema and constraint evidence for per-application resource servers. */

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { runner } from 'node-pg-migrate';
import { Client } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { getPool } from '../../../src/lib/database.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import { createTestApplication } from '../helpers/factories.js';
import { restoreMigrationOrder } from '../service-accounts/migration-order.js';

const MIGRATION = '038_resource_servers';

/** Runs only the resource-server migration in the requested direction. */
async function migrate(direction: 'up' | 'down'): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || databaseUrl !== process.env.DATABASE_URL) {
    throw new Error('Schema checks require the explicitly selected test database');
  }
  await runner({
    databaseUrl,
    migrationsTable: 'pgmigrations',
    dir: join(process.cwd(), 'migrations'),
    direction,
    file: MIGRATION,
    count: 1,
    checkOrder: false,
    log: () => {},
    decamelize: false,
  });
}

/** Inserts one resource row with an explicit or default audience. */
async function createResource(
  applicationId: string,
  identifier: string,
  audience?: string,
) {
  return getPool().query<{ id: string; audience: string }>(
    `INSERT INTO resource_servers (application_id, slug, name, identifier, audience)
     VALUES ($1, $2, 'Resource API', $3, $4) RETURNING id, audience`,
    [applicationId, `resource-${randomUUID()}`, identifier, audience ?? null],
  );
}

beforeEach(async () => {
  await migrate('up');
  await truncateAllTables();
  await seedBaseData();
});

afterAll(async () => {
  await migrate('up');
  await restoreMigrationOrder();
});

describe('resource server schema', () => {
  it('defaults the audience to the identifier and stores explicit scopes', async () => {
    const application = await createTestApplication();
    const identifier = `https://resource-${randomUUID()}.example.test`;
    const created = await createResource(application.id, identifier);

    expect(created.rows[0]?.audience).toBe(identifier);
    await getPool().query(
      'INSERT INTO resource_server_scopes (resource_server_id, scope) VALUES ($1, $2)',
      [created.rows[0]?.id, 'billing:read'],
    );
    const scopes = await getPool().query<{ scope: string }>(
      'SELECT scope FROM resource_server_scopes WHERE resource_server_id = $1',
      [created.rows[0]?.id],
    );
    expect(scopes.rows).toEqual([{ scope: 'billing:read' }]);
  });

  it('rejects an audience that collides with another resource identifier', async () => {
    const owner = await createTestApplication();
    const firstIdentifier = `https://first-${randomUUID()}.example.test`;
    const secondIdentifier = `https://second-${randomUUID()}.example.test`;
    await createResource(owner.id, firstIdentifier, secondIdentifier);

    const other = await createTestApplication();
    await expect(createResource(other.id, secondIdentifier, `https://other-${randomUUID()}.example.test`))
      .rejects.toThrow();
    await expect(createResource(other.id, `https://reverse-${randomUUID()}.example.test`, firstIdentifier))
      .rejects.toThrow();
  });

  it('serializes concurrent inserts that would collide in the shared namespace', async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('Schema checks require the test database URL');
    const firstApplication = await createTestApplication();
    const secondApplication = await createTestApplication();
    const firstIdentifier = `https://first-${randomUUID()}.example.test`;
    const shared = `https://shared-${randomUUID()}.example.test`;
    const third = `https://third-${randomUUID()}.example.test`;
    const first = new Client({ connectionString: databaseUrl });
    const second = new Client({ connectionString: databaseUrl });
    await Promise.all([first.connect(), second.connect()]);
    try {
      await first.query('BEGIN');
      await first.query(
        `INSERT INTO resource_servers (application_id, slug, name, identifier, audience)
         VALUES ($1, $2, 'First', $3, $4)`,
        [firstApplication.id, `resource-${randomUUID()}`, firstIdentifier, shared],
      );
      await second.query('BEGIN');
      const pending = second
        .query(
          `INSERT INTO resource_servers (application_id, slug, name, identifier, audience)
           VALUES ($1, $2, 'Second', $3, $4)`,
          [secondApplication.id, `resource-${randomUUID()}`, shared, third],
        )
        .then(() => null, (error: unknown) => error);
      await first.query('COMMIT');
      const failure = await pending;
      expect(failure).toBeInstanceOf(Error);
      expect(failure instanceof Error ? Reflect.get(failure, 'code') : undefined).toBe('23505');
      await second.query('ROLLBACK');
    } finally {
      await first.end();
      await second.end();
    }
  });

  it('rejects relative, fragmented, oversized and malformed scope values', async () => {
    const application = await createTestApplication();
    await expect(createResource(application.id, 'relative/path')).rejects.toThrow();
    await expect(
      createResource(application.id, `https://resource-${randomUUID()}.example.test/#fragment`),
    ).rejects.toThrow();
    await expect(
      createResource(application.id, `https://${'a'.repeat(2_040)}.example.test`),
    ).rejects.toThrow();

    const valid = await createResource(
      application.id,
      `https://resource-${randomUUID()}.example.test`,
    );
    await expect(
      getPool().query(
        'INSERT INTO resource_server_scopes (resource_server_id, scope) VALUES ($1, $2)',
        [valid.rows[0]?.id, 'bad scope'],
      ),
    ).rejects.toThrow();
  });

  it('cascades scopes and resource rows when the owning application is deleted', async () => {
    const application = await createTestApplication();
    const created = await createResource(
      application.id,
      `https://resource-${randomUUID()}.example.test`,
    );
    await getPool().query(
      'INSERT INTO resource_server_scopes (resource_server_id, scope) VALUES ($1, $2)',
      [created.rows[0]?.id, 'billing:read'],
    );

    await getPool().query('DELETE FROM applications WHERE id = $1', [application.id]);

    const resources = await getPool().query('SELECT id FROM resource_servers WHERE application_id = $1', [
      application.id,
    ]);
    const scopes = await getPool().query('SELECT scope FROM resource_server_scopes WHERE resource_server_id = $1', [
      created.rows[0]?.id,
    ]);
    expect(resources.rows).toEqual([]);
    expect(scopes.rows).toEqual([]);
  });

  it('reverses and reapplies only the resource-server schema', async () => {
    await migrate('down');
    expect(
      await getPool().query<{ resource: string | null; scope: string | null }>(
        "SELECT to_regclass('public.resource_servers')::text AS resource, to_regclass('public.resource_server_scopes')::text AS scope",
      ),
    ).toMatchObject({ rows: [{ resource: null, scope: null }] });
    await migrate('up');
    expect(
      await getPool().query<{ resource: string | null; scope: string | null }>(
        "SELECT to_regclass('public.resource_servers')::text AS resource, to_regclass('public.resource_server_scopes')::text AS scope",
      ),
    ).toMatchObject({
      rows: [{ resource: 'resource_servers', scope: 'resource_server_scopes' }],
    });
  });
});
