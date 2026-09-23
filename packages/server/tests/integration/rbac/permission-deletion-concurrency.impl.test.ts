import { beforeEach, describe, expect, it } from 'vitest';
import {
  getDatabaseTransactionClient,
  getPool,
  runDatabaseTransaction,
} from '../../../src/lib/database.js';
import { capturePermissionForDeletion } from '../../../src/rbac/permission-repository.js';
import { assignRolesToUser } from '../../../src/rbac/user-role-service.js';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import {
  createTestApplication,
  createTestOrganization,
  createTestPermission,
  createTestRole,
  createTestUser,
} from '../helpers/factories.js';

/** Return true once PostgreSQL reports that the selected backend is waiting on a row lock. */
async function waitForRowLock(processId: number): Promise<boolean> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await getPool().query<{ waitEventType: string | null }>(
      'SELECT wait_event_type AS "waitEventType" FROM pg_stat_activity WHERE pid = $1',
      [processId],
    );
    if (result.rows[0]?.waitEventType === 'Lock') return true;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return false;
}

beforeEach(async () => {
  await truncateAllTables();
  await seedBaseData();
});

describe('permission deletion capture locking', () => {
  it('serializes a user-role assignment through an affected role', async () => {
    const organization = await createTestOrganization();
    const application = await createTestApplication();
    const role = await createTestRole(application.id);
    const permission = await createTestPermission(application.id);
    const user = await createTestUser(organization.id);
    await getPool().query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [
      role.id,
      permission.id,
    ]);

    const captured = Promise.withResolvers<void>();
    const releaseCapture = Promise.withResolvers<void>();
    const capture = runDatabaseTransaction(async () => {
      await capturePermissionForDeletion(application.id, permission.id);
      captured.resolve();
      await releaseCapture.promise;
    });
    await captured.promise;

    const assignmentBackend = Promise.withResolvers<number>();
    const assignment = runDatabaseTransaction(async () => {
      const transaction = getDatabaseTransactionClient();
      if (!transaction) throw new Error('Expected an active assignment transaction');
      const process = await transaction.query<{ processId: number }>(
        'SELECT pg_backend_pid() AS "processId"',
      );
      assignmentBackend.resolve(process.rows[0]!.processId);
      await assignRolesToUser(organization.id, user.id, [role.id], user.id);
    });

    try {
      expect(await waitForRowLock(await assignmentBackend.promise)).toBe(true);
    } finally {
      releaseCapture.resolve();
    }
    await Promise.all([capture, assignment]);

    const result = await getPool().query<{ count: string }>(
      'SELECT COUNT(*) FROM user_roles WHERE user_id = $1 AND role_id = $2',
      [user.id, role.id],
    );
    expect(Number(result.rows[0]?.count ?? 0)).toBe(1);
  });
});
