import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { getPool, runDatabaseTransaction } from '../../../src/lib/database.js';
import { ServiceAccountStorageError } from '../../../src/service-accounts/index.js';
import {
  findServiceAccountByClientId,
  lockServiceAccountByClientId,
} from '../../../src/service-accounts/repository.js';
import { truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
  createTestUser,
} from '../helpers/factories.js';

/** Create owned rows without coupling lock tests to the future public provisioning operation. */
async function fixture(
  bound = true,
  ownerless = false,
  nonfiniteTimestamp?: 'creation' | 'modification',
) {
  const organization = await createTestOrganization();
  const application = await createTestApplication();
  const client = await createTestClient(organization.id, application.id);
  const account = await createTestUser(organization.id);
  await getPool().query('UPDATE users SET is_service_account = TRUE WHERE id = $1', [account.id]);
  const bindingId = randomUUID();
  if (bound) {
    const targets = ownerless ? [] : [{
      organizationId: organization.id, allowedRoles: [], allowedClaimDefinitions: [],
    }];
    await getPool().query(
      `INSERT INTO client_service_accounts
        (id, client_id, account_id, authorization_version, status, targets, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [bindingId, client.id, ownerless ? null : account.id, randomUUID(),
        ownerless ? 'revoked' : 'active', JSON.stringify(targets),
        nonfiniteTimestamp === 'creation' ? 'infinity' : new Date(),
        nonfiniteTimestamp === 'modification' ? 'infinity' : new Date()],
    );
  }
  return { clientId: client.id, accountId: account.id, bindingId };
}

/**
 * A separate connection must actually contend with the transaction under test.
 * PostgreSQL's local timeout bounds the negative check; no wall-clock assertion or retry is used.
 */
async function expectLockHeld(pool: Pool, query: string, id: string): Promise<void> {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    await connection.query("SET LOCAL lock_timeout = '100ms'");
    await expect(connection.query(query, [id])).rejects.toMatchObject({ code: '55P03' });
  } finally {
    try {
      await connection.query('ROLLBACK');
    } finally {
      connection.release();
    }
  }
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('service-account repository locking', () => {
  it('should reject lock acquisition when no owning transaction exists', async () => {
    await expect(lockServiceAccountByClientId(randomUUID())).rejects.toThrow(
      'Service-account locking requires an active database transaction',
    );
  });

  it('should return null when the locked parent client does not exist', async () => {
    await expect(runDatabaseTransaction(() => lockServiceAccountByClientId(randomUUID())))
      .resolves.toBeNull();
  });

  it('should retain the parent lock when first provisioning has no binding row yet', async () => {
    const data = await fixture(false);
    const pool = getPool();
    await runDatabaseTransaction(async () => {
      expect(await lockServiceAccountByClientId(data.clientId)).toBeNull();
      await expectLockHeld(pool, 'UPDATE clients SET status = status WHERE id = $1', data.clientId);
    });
  });

  it('should hold all three lifecycle locks until the owning transaction ends', async () => {
    const data = await fixture();
    const pool = getPool();
    await runDatabaseTransaction(async () => {
      expect(await lockServiceAccountByClientId(data.clientId)).toMatchObject({
        id: data.bindingId, clientId: data.clientId, accountId: data.accountId,
      });
      await expectLockHeld(pool, 'UPDATE clients SET status = status WHERE id = $1', data.clientId);
      await expectLockHeld(pool,
        'UPDATE client_service_accounts SET status = status WHERE id = $1', data.bindingId);
      await expectLockHeld(pool, 'UPDATE users SET status = status WHERE id = $1', data.accountId);
    });

    await runDatabaseTransaction(async () => {
      await getPool().query("SET LOCAL lock_timeout = '100ms'");
      await getPool().query('UPDATE clients SET status = status WHERE id = $1', [data.clientId]);
      await getPool().query('UPDATE client_service_accounts SET status = status WHERE id = $1',
        [data.bindingId]);
      await getPool().query('UPDATE users SET status = status WHERE id = $1', [data.accountId]);
    });
  });

  it('should lock and retain the marker when the owned account has been erased', async () => {
    const data = await fixture(true, true);
    const pool = getPool();
    await runDatabaseTransaction(async () => {
      expect(await lockServiceAccountByClientId(data.clientId)).toMatchObject({
        accountId: null, status: 'revoked', targets: [],
      });
      await expectLockHeld(pool,
        'UPDATE client_service_accounts SET status = status WHERE id = $1', data.bindingId);
    });
  });

  it('should roll back and release locks when stored policy is corrupt', async () => {
    const data = await fixture();
    await getPool().query('UPDATE client_service_accounts SET targets = $1::jsonb WHERE id = $2',
      [JSON.stringify([{ organizationId: 'corrupt' }]), data.bindingId]);
    await expect(runDatabaseTransaction(() => lockServiceAccountByClientId(data.clientId)))
      .rejects.toBeInstanceOf(ServiceAccountStorageError);
    await runDatabaseTransaction(async () => {
      await getPool().query("SET LOCAL lock_timeout = '100ms'");
      await getPool().query('UPDATE clients SET status = status WHERE id = $1', [data.clientId]);
    });
  });

  it.each(['creation', 'modification'] as const)(
    'should reject a non-finite %s timestamp instead of projecting corrupt state',
    async (timestamp) => {
      // Insert corruption directly: the ordinary update trigger replaces supplied updated_at.
      const data = await fixture(true, false, timestamp);
      await expect(findServiceAccountByClientId(data.clientId))
        .rejects.toBeInstanceOf(ServiceAccountStorageError);
    });
});
