/** Ownership migration preserves invitation lifetime and supports a loss-aware downgrade. */
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';

/** Load both migration directions without executing any schema changes outside a transaction. */
async function migrationSql() {
  const sql = await readFile(
    join(process.cwd(), 'migrations', '036_invitation_application_owner.sql'), 'utf8',
  );
  const marker = '-- Down Migration';
  const index = sql.indexOf(marker);
  if (index < 0) throw new Error('Invitation ownership migration needs a down section');
  return {
    up: sql.slice(0, index).replace('-- Up Migration', ''),
    down: sql.slice(index + marker.length),
  };
}

/** Always restore the original schema and rows, including when an assertion fails. */
async function inTransaction(assertions: (client: PoolClient) => Promise<void>) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await assertions(client);
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
}

/** Create an unused legacy invitation without any application ownership column. */
async function legacyInvitation(client: PoolClient) {
  const suffix = randomUUID();
  const organization = await client.query<{ id: string }>(
    'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
    ['Migration invitation organization', `migration-${suffix}`],
  );
  const invitation = await client.query<{ id: string }>(
    `INSERT INTO invitation_tokens (organization_id, email, token_hash, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [organization.rows[0]!.id, `${suffix}@example.test`, randomBytes(32).toString('hex'),
      new Date('2035-01-02T03:04:05.000Z')],
  );
  return invitation.rows[0]!.id;
}

/** Preserve all row fields, not just the expiry, through ownership-only schema changes. */
async function snapshot(client: PoolClient, id: string) {
  const result = await client.query<{ value: Record<string, unknown> }>(
    'SELECT to_jsonb(invitation_tokens) AS value FROM invitation_tokens WHERE id = $1', [id],
  );
  return result.rows[0]!.value;
}

/** Compare all invitation columns, indexes and constraints except the ownership addition. */
async function schemaWithoutOwnership(client: PoolClient) {
  const columns = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns WHERE table_schema = 'public'
       AND table_name = 'invitation_tokens' AND column_name <> 'application_id'
       ORDER BY ordinal_position`,
  );
  const indexes = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
       AND tablename = 'invitation_tokens' ORDER BY indexname`,
  );
  const constraints = await client.query(
    `SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE conrelid = 'invitation_tokens'::regclass
       AND NOT (contype = 'f' AND confrelid = 'applications'::regclass)
       ORDER BY conname`,
  );
  return { columns: columns.rows, indexes: indexes.rows, constraints: constraints.rows };
}

describe('invitation application ownership migration', () => {
  it('adds nullable UUID ownership without inferring owners or changing existing invitation history', async () => {
    const migration = await migrationSql();
    await inTransaction(async (client) => {
      await client.query(migration.down);
      const id = await legacyInvitation(client);
      const before = await snapshot(client, id);
      const schema = await schemaWithoutOwnership(client);
      await client.query(migration.up);
      expect(await snapshot(client, id)).toEqual({ ...before, application_id: null });
      expect(await schemaWithoutOwnership(client)).toEqual(schema);
      const column = await client.query(
        `SELECT data_type, is_nullable, column_default FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'invitation_tokens'
         AND column_name = 'application_id'`,
      );
      expect(column.rows).toEqual([{ data_type: 'uuid', is_nullable: 'YES', column_default: null }]);
    });
  });

  it('clears ownership on application deletion and loses only ownership on down and up', async () => {
    const migration = await migrationSql();
    await inTransaction(async (client) => {
      await client.query(migration.down);
      const id = await legacyInvitation(client);
      const schema = await schemaWithoutOwnership(client);
      const original = await snapshot(client, id);
      await client.query(migration.up);
      const application = await client.query<{ id: string }>(
        'INSERT INTO applications (name, slug) VALUES ($1, $2) RETURNING id',
        ['Migration application', `migration-${randomUUID()}`],
      );
      const applicationId = application.rows[0]!.id;
      await client.query('UPDATE invitation_tokens SET application_id = $1 WHERE id = $2',
        [applicationId, id]);
      expect(await snapshot(client, id)).toEqual({ ...original, application_id: applicationId });
      await client.query('SAVEPOINT invalid_owner');
      await expect(client.query('UPDATE invitation_tokens SET application_id = $1 WHERE id = $2',
        [randomUUID(), id])).rejects.toThrow();
      await client.query('ROLLBACK TO SAVEPOINT invalid_owner');
      await client.query('DELETE FROM applications WHERE id = $1', [applicationId]);
      expect(await snapshot(client, id)).toEqual({ ...original, application_id: null });

      const survivingApplication = await client.query<{ id: string }>(
        'INSERT INTO applications (name, slug) VALUES ($1, $2) RETURNING id',
        ['Surviving application', `migration-${randomUUID()}`],
      );
      await client.query('UPDATE invitation_tokens SET application_id = $1 WHERE id = $2',
        [survivingApplication.rows[0]!.id, id]);
      await client.query(migration.down);
      expect(await snapshot(client, id)).toEqual(original);
      expect(await schemaWithoutOwnership(client)).toEqual(schema);
      await client.query(migration.up);
      expect(await snapshot(client, id)).toEqual({ ...original, application_id: null });
      expect(await schemaWithoutOwnership(client)).toEqual(schema);
    });
  });
});
