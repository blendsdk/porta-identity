import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

import { getPool } from '../../../src/lib/database.js';

async function migrationSql(): Promise<{ up: string; down: string }> {
  const sql = await readFile(
    join(process.cwd(), 'migrations/028_totp_replay_protection.sql'),
    'utf8',
  );
  const marker = '-- Down Migration';
  const index = sql.indexOf(marker);
  if (index < 0) throw new Error('The replay migration has no Down Migration section');
  return { up: sql.slice(0, index), down: sql.slice(index + marker.length) };
}

async function isolatedSchema(
  assertions: (connection: PoolClient) => Promise<void>,
): Promise<void> {
  const connection = await getPool().connect();
  const schema = `totp_replay_${randomBytes(8).toString('hex')}`;
  try {
    await connection.query('BEGIN');
    await connection.query(`CREATE SCHEMA ${schema}`);
    await connection.query(`SET LOCAL search_path TO ${schema}, public`);
    await connection.query(`
      CREATE TABLE user_totp (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        algorithm VARCHAR(10) NOT NULL DEFAULT 'SHA1',
        digits INTEGER NOT NULL DEFAULT 6,
        period INTEGER NOT NULL DEFAULT 30,
        marker TEXT NOT NULL DEFAULT 'preserved'
      )
    `);
    await assertions(connection);
  } finally {
    await connection.query('ROLLBACK').catch(() => undefined);
    connection.release();
  }
}

async function expectRejected(
  connection: PoolClient,
  sql: string,
  values: unknown[],
): Promise<void> {
  await connection.query('SAVEPOINT before_invalid_configuration');
  try {
    await expect(connection.query(sql, values)).rejects.toThrow();
  } finally {
    await connection.query('ROLLBACK TO SAVEPOINT before_invalid_configuration');
    await connection.query('RELEASE SAVEPOINT before_invalid_configuration');
  }
}

describe('TOTP replay migration schema behavior', () => {
  it('Up adds a nullable BIGINT with the three fixed configuration constraints', async () => {
    await isolatedSchema(async (connection) => {
      const migration = await migrationSql();
      await connection.query(migration.up);

      const column = await connection.query<{ data_type: string; is_nullable: string }>(`
        SELECT data_type, is_nullable
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'user_totp'
           AND column_name = 'last_accepted_time_step'
      `);
      expect(column.rows).toEqual([{ data_type: 'bigint', is_nullable: 'YES' }]);

      await expect(
        connection.query('INSERT INTO user_totp (algorithm, digits, period) VALUES ($1, $2, $3)', [
          'SHA1',
          6,
          30,
        ]),
      ).resolves.toBeDefined();
      await expectRejected(
        connection,
        'INSERT INTO user_totp (algorithm, digits, period) VALUES ($1, $2, $3)',
        ['SHA256', 6, 30],
      );
      await expectRejected(
        connection,
        'INSERT INTO user_totp (algorithm, digits, period) VALUES ($1, $2, $3)',
        ['SHA1', 8, 30],
      );
      await expectRejected(
        connection,
        'INSERT INTO user_totp (algorithm, digits, period) VALUES ($1, $2, $3)',
        ['SHA1', 6, 60],
      );

      const constraints = await connection.query<{ conname: string }>(`
        SELECT conname
          FROM pg_constraint
         WHERE conrelid = 'user_totp'::regclass
           AND contype = 'c'
         ORDER BY conname
      `);
      expect(constraints.rows.map((row) => row.conname)).toEqual([
        'user_totp_algorithm_check',
        'user_totp_digits_check',
        'user_totp_period_check',
      ]);
    });
  });

  it('Down removes only the replay column and its checks', async () => {
    await isolatedSchema(async (connection) => {
      const migration = await migrationSql();
      await connection.query(migration.up);
      await connection.query("INSERT INTO user_totp (marker) VALUES ('keep-me')");
      await connection.query(migration.down);

      const columns = await connection.query<{ column_name: string }>(`
        SELECT column_name
          FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'user_totp'
         ORDER BY column_name
      `);
      expect(columns.rows.map((row) => row.column_name)).toEqual([
        'algorithm',
        'digits',
        'id',
        'marker',
        'period',
      ]);
      await expect(
        connection.query("SELECT marker FROM user_totp WHERE marker = 'keep-me'"),
      ).resolves.toMatchObject({ rows: [{ marker: 'keep-me' }] });
      await expect(
        connection.query(
          "INSERT INTO user_totp (algorithm, digits, period) VALUES ('SHA256', 8, 60)",
        ),
      ).resolves.toBeDefined();
    });
  });
});
