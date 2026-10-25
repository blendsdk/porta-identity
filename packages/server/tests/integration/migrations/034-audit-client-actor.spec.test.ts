/**
 * Migration specification for first-class audit client attribution.
 *
 * The migration must classify historical service, user, system, and
 * deleted-actor rows, backfill target users only when they still exist,
 * enforce the actor shape, and remain reversible. The test runs both
 * directions inside one transaction so the live test schema is unchanged.
 */

import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';

interface MigrationSql {
  readonly up: string;
  readonly down: string;
}

/** Read the migration owned by this specification. */
async function auditMigrationSql(): Promise<MigrationSql> {
  const name = '034_audit_client_actor.sql';
  const sql = await readFile(join(process.cwd(), 'migrations', name), 'utf8');
  const marker = '-- Down Migration';
  const markerIndex = sql.indexOf(marker);
  if (markerIndex < 0) throw new Error(`${name} has no Down Migration section`);

  return {
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

/** Create one disposable organization for the migration fixture. */
async function createOrganization(connection: PoolClient): Promise<string> {
  const suffix = randomBytes(8).toString('hex');
  const result = await connection.query<{ id: string }>(
    `INSERT INTO organizations (name, slug)
     VALUES ($1, $2)
     RETURNING id`,
    [`Audit migration organization ${suffix}`, `audit-migration-${suffix}`],
  );
  return result.rows[0]!.id;
}

/** Create one disposable user in the migration fixture organization. */
async function createUser(connection: PoolClient, organizationId: string, label: string): Promise<string> {
  const suffix = randomBytes(8).toString('hex');
  const result = await connection.query<{ id: string }>(
    `INSERT INTO users (organization_id, email)
     VALUES ($1, $2)
     RETURNING id`,
    [organizationId, `${label}-${suffix}@example.test`],
  );
  return result.rows[0]!.id;
}

/** Read one audit row by event type inside the fixture organization. */
async function readAuditRow(
  connection: PoolClient,
  organizationId: string,
  eventType: string,
): Promise<{
  actor_id: string | null;
  actor_type: string;
  actor_client_id: string | null;
  actor_client_name: string | null;
  user_id: string | null;
}> {
  const result = await connection.query<{
    actor_id: string | null;
    actor_type: string;
    actor_client_id: string | null;
    actor_client_name: string | null;
    user_id: string | null;
  }>(
    `SELECT actor_id, actor_type, actor_client_id, actor_client_name, user_id
       FROM audit_log
      WHERE organization_id = $1 AND event_type = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [organizationId, eventType],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Missing audit row ${eventType}`);
  return row;
}

describe('audit client actor migration', () => {
  it('ST-46 should backfill client, user, system, and deleted-actor rows and enforce the actor shape', async () => {
    await inTransaction(async (connection) => {
      const migration = await auditMigrationSql();

      // Recreate the pre-migration shape inside this transaction.
      await connection.query(migration.down);

      const organizationId = await createOrganization(connection);
      const liveActor = await createUser(connection, organizationId, 'live-actor');
      const targetUser = await createUser(connection, organizationId, 'target-user');
      const deletedActor = await createUser(connection, organizationId, 'deleted-actor');
      const deletedTarget = await createUser(connection, organizationId, 'deleted-target');
      const futureActor = await createUser(connection, organizationId, 'future-actor');

      await connection.query(
        `INSERT INTO audit_log (organization_id, actor_id, event_type, event_category, metadata)
         VALUES
           ($1, NULL, 'user.invited', 'admin', $2::jsonb),
           ($1, $3, 'user.created', 'admin', $4::jsonb),
           ($1, NULL, 'user.auto_unlocked', 'security', '{}'::jsonb),
           ($1, $5, 'user.updated', 'admin', '{}'::jsonb),
           ($1, NULL, 'user.deleted_target', 'admin', $6::jsonb)`,
        [
          organizationId,
          JSON.stringify({
            actorKind: 'service',
            serviceClientId: 'bff-client',
            serviceClientName: 'Acme BFF',
            invitationId: 'invitation-1',
          }),
          liveActor,
          JSON.stringify({ userId: targetUser }),
          deletedActor,
          JSON.stringify({ userId: deletedTarget }),
        ],
      );

      // A deleted actor leaves actor_id NULL through the existing FK. The
      // deleted target still has a well-formed UUID in metadata, so the
      // migration must leave user_id NULL rather than violate the FK.
      await connection.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
        [deletedActor, deletedTarget],
      ]);

      await connection.query(migration.up);

      const serviceRow = await readAuditRow(connection, organizationId, 'user.invited');
      expect(serviceRow).toMatchObject({
        actor_id: null,
        actor_type: 'client',
        actor_client_id: 'bff-client',
        actor_client_name: 'Acme BFF',
        user_id: null,
      });

      const userRow = await readAuditRow(connection, organizationId, 'user.created');
      expect(userRow).toMatchObject({
        actor_id: liveActor,
        actor_type: 'user',
        actor_client_id: null,
        actor_client_name: null,
        user_id: targetUser,
      });

      const systemRow = await readAuditRow(connection, organizationId, 'user.auto_unlocked');
      expect(systemRow).toMatchObject({
        actor_id: null,
        actor_type: 'system',
        actor_client_id: null,
        actor_client_name: null,
        user_id: null,
      });

      const deletedActorRow = await readAuditRow(connection, organizationId, 'user.updated');
      expect(deletedActorRow).toMatchObject({
        actor_id: null,
        actor_type: 'system',
        actor_client_id: null,
        actor_client_name: null,
        user_id: null,
      });

      const deletedTargetRow = await readAuditRow(
        connection,
        organizationId,
        'user.deleted_target',
      );
      expect(deletedTargetRow).toMatchObject({
        actor_type: 'system',
        user_id: null,
      });

      const columns = await connection.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'audit_log'
            AND column_name IN ('actor_type', 'actor_client_id', 'actor_client_name')`,
      );
      expect(columns.rows).toEqual(
        expect.arrayContaining([
          { column_name: 'actor_type', is_nullable: 'NO' },
          { column_name: 'actor_client_id', is_nullable: 'YES' },
          { column_name: 'actor_client_name', is_nullable: 'YES' },
        ]),
      );

      const index = await connection.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'idx_audit_log_actor_client'`,
      );
      expect(index.rowCount).toBe(1);

      const constraint = await connection.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint WHERE conname = 'audit_log_actor_shape'`,
      );
      expect(constraint.rowCount).toBe(1);

      await connection.query('SAVEPOINT invalid_client_actor');
      await expect(
        connection.query(
          `INSERT INTO audit_log (organization_id, event_type, event_category, actor_type)
           VALUES ($1, 'user.invalid', 'admin', 'client')`,
          [organizationId],
        ),
      ).rejects.toThrow();
      await connection.query('ROLLBACK TO SAVEPOINT invalid_client_actor');
      await connection.query('RELEASE SAVEPOINT invalid_client_actor');

      // A future actor deletion keeps the user classification.
      await connection.query(
        `INSERT INTO audit_log (organization_id, actor_id, actor_type, event_type, event_category)
         VALUES ($1, $2, 'user', 'user.future_actor_deleted', 'admin')`,
        [organizationId, futureActor],
      );
      await connection.query('DELETE FROM users WHERE id = $1', [futureActor]);
      const futureRow = await readAuditRow(connection, organizationId, 'user.future_actor_deleted');
      expect(futureRow).toMatchObject({ actor_id: null, actor_type: 'user' });

      // The down migration removes the new shape without touching base columns.
      await connection.query(migration.down);
      const afterDown = await connection.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'audit_log'
            AND column_name IN ('actor_type', 'actor_client_id', 'actor_client_name')`,
      );
      expect(afterDown.rowCount).toBe(0);

      const droppedIndex = await connection.query(
        `SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'idx_audit_log_actor_client'`,
      );
      expect(droppedIndex.rowCount).toBe(0);

      const droppedConstraint = await connection.query(
        `SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_actor_shape'`,
      );
      expect(droppedConstraint.rowCount).toBe(0);
    });
  });
});
