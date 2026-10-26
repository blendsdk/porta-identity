/**
 * Implementation tests for audit migration edge cases.
 *
 * The deployed migration is already applied to the live test schema. This
 * test temporarily reverses it inside one transaction, inserts malformed
 * metadata, reapplies it, and verifies the safe fallback.
 */

import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';

/** Read the migration up and down sections. */
async function migrationSql(): Promise<{ up: string; down: string }> {
  const sql = await readFile(join(process.cwd(), 'migrations', '034_audit_client_actor.sql'), 'utf8');
  const marker = '-- Down Migration';
  const index = sql.indexOf(marker);
  if (index < 0) throw new Error('Migration has no Down Migration section');
  return { up: sql.slice(0, index), down: sql.slice(index + marker.length) };
}

/** Run assertions in a rolled-back transaction. */
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

describe('audit client actor migration implementation', () => {
  it('leaves a malformed target user null without failing the migration', async () => {
    await inTransaction(async (connection) => {
      const migration = await migrationSql();
      await connection.query(migration.down);

      const suffix = randomBytes(8).toString('hex');
      const organization = await connection.query<{ id: string }>(
        `INSERT INTO organizations (name, slug)
         VALUES ($1, $2)
         RETURNING id`,
        [`Malformed audit ${suffix}`, `malformed-audit-${suffix}`],
      );
      const organizationId = organization.rows[0]!.id;

      await connection.query(
        `INSERT INTO audit_log (organization_id, event_type, event_category, metadata)
         VALUES ($1, 'user.malformed', 'admin', $2::jsonb)`,
        [organizationId, JSON.stringify({ userId: 'not-a-uuid' })],
      );

      await connection.query(migration.up);

      const result = await connection.query<{
        actor_type: string;
        actor_id: string | null;
        user_id: string | null;
      }>(
        `SELECT actor_type, actor_id, user_id
           FROM audit_log
          WHERE organization_id = $1 AND event_type = 'user.malformed'`,
        [organizationId],
      );

      expect(result.rows[0]).toEqual({
        actor_type: 'system',
        actor_id: null,
        user_id: null,
      });

      const names = await connection.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint WHERE conname = 'audit_log_actor_shape'`,
      );
      expect(names.rowCount).toBe(1);

      const index = await connection.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'idx_audit_log_actor_client'`,
      );
      expect(index.rowCount).toBe(1);

      await connection.query(migration.down);
    });
  });
});
