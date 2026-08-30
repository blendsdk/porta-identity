import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { afterDatabaseCommit, getPool, runDatabaseTransaction } from '../../src/lib/database.js';
import { insertSecret } from '../../src/clients/secret-repository.js';
import { generateAndStore, revoke } from '../../src/clients/secret-service.js';
import { ClientValidationError, ClientNotFoundError } from '../../src/clients/errors.js';
import { truncateAllTables } from './helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
} from './helpers/factories.js';

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

describe('client-secret administrative transactions', () => {
  beforeEach(async () => truncateAllTables());

  it('should generate the initial confidential credential inside the owning mutation transaction', async () => {
    const organization = await createTestOrganization();
    const application = await createTestApplication();

    const secretId = await runDatabaseTransaction(async () => {
      const client = await createTestClient(organization.id, application.id);
      return (await generateAndStore(client.id)).id;
    });

    const persisted = await getPool().query('SELECT id FROM client_secrets WHERE id = $1', [
      secretId,
    ]);
    expect(persisted.rowCount).toBe(1);
  });

  it('should reject generation when revocation wins before the parent lock', async () => {
    const organization = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(organization.id, application.id);
    await getPool().query("UPDATE clients SET status = 'revoked' WHERE id = $1", [client.id]);

    await expect(generateAndStore(client.id)).rejects.toBeInstanceOf(ClientNotFoundError);
    const persisted = await getPool().query(
      'SELECT id FROM client_secrets WHERE client_id = $1',
      [client.id],
    );
    expect(persisted.rowCount).toBe(0);
  });

  it('should permit exactly one concurrent revoke and write one success audit', async () => {
    const organization = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(organization.id, application.id);
    const secret = await insertSecret({
      clientId: client.id,
      secretHash: 'fixture-hash',
      secretSha256: 'a'.repeat(64),
      label: null,
      expiresAt: null,
    });

    const outcomes = await Promise.allSettled([
      revoke(client.id, secret.id),
      revoke(client.id, secret.id),
    ]);

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(({ status }) => status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: expect.any(ClientValidationError),
    });
    const audits = await getPool().query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM audit_log WHERE event_type = 'client.secret.revoked' AND metadata->>'secretId' = $1",
      [secret.id],
    );
    expect(Number(audits.rows[0]?.count ?? '0')).toBe(1);
  });
});
