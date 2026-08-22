import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { afterDatabaseCommit, getPool, runDatabaseTransaction } from '../../src/lib/database.js';

const TABLE_NAME = 'admin_mutation_audit_integration';

describe('administrative transaction ownership', () => {
  beforeAll(async () => {
    await getPool().query(
      `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (run_id UUID PRIMARY KEY, value TEXT NOT NULL)`,
    );
  });

  afterAll(async () => {
    await getPool().query(`DROP TABLE IF EXISTS ${TABLE_NAME}`);
  });

  it('should discard database changes and deferred effects when the request rolls back', async () => {
    const runId = randomUUID();
    const effect = vi.fn(async () => undefined);

    await expect(
      runDatabaseTransaction(async () => {
        await getPool().query(`INSERT INTO ${TABLE_NAME} (run_id, value) VALUES ($1, $2)`, [
          runId,
          'uncommitted',
        ]);
        await afterDatabaseCommit(effect);
        throw new Error('request rejected');
      }),
    ).rejects.toThrow('request rejected');

    const result = await getPool().query(`SELECT run_id FROM ${TABLE_NAME} WHERE run_id = $1`, [
      runId,
    ]);
    expect(result.rowCount).toBe(0);
    expect(effect).not.toHaveBeenCalled();
  });

  it('should publish deferred effects only after the database result commits', async () => {
    const runId = randomUUID();
    const observedCounts: number[] = [];

    await runDatabaseTransaction(async () => {
      await getPool().query(`INSERT INTO ${TABLE_NAME} (run_id, value) VALUES ($1, $2)`, [
        runId,
        'committed',
      ]);
      await afterDatabaseCommit(async () => {
        const result = await getPool().query(
          `SELECT COUNT(*)::int AS count FROM ${TABLE_NAME} WHERE run_id = $1`,
          [runId],
        );
        observedCounts.push(result.rows[0]?.count ?? 0);
      });
    });

    expect(observedCounts).toStrictEqual([1]);
  });
});
