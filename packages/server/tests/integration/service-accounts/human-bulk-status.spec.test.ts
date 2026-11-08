/** Mixed bulk status operations must conceal and never lock or update classified users. */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bulkStatusChange } from '../../../src/lib/bulk-operations.js';
import { getPool } from '../../../src/lib/database.js';
import { truncateAllTables } from '../helpers/database.js';
import { createTestOrganization, createTestUser } from '../helpers/factories.js';
import {
  createClassifiedBindingFixture,
  createHumanAdminFixtures,
  humanUserFingerprint,
  resetHumanFixtures,
} from './human-fixtures.js';

/** Both user lifecycle operations share the same permanent-class exclusion. */
const statusActions = ['activate', 'deactivate'] as const;

/** Read binding identity and policy changes without returning account data or versions. */
async function bindingFingerprint(bindingId: string): Promise<string> {
  const result = await getPool().query<{ fingerprint: string }>(
    `SELECT md5(to_jsonb(binding)::text) AS fingerprint
       FROM client_service_accounts AS binding WHERE id = $1`,
    [bindingId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('The synthetic binding is missing');
  return row.fingerprint;
}

/**
 * Hold classified rows locked in another connection while a bulk call completes.
 * An update-only exclusion would still wait on these locks, so it cannot pass this
 * observation. The timer is a failure bound; all locks and pending work are drained.
 */
async function withoutClassifiedRowLocks(
  userIds: readonly string[],
  operation: () => ReturnType<typeof bulkStatusChange>,
) {
  const locker = await getPool().connect();
  let pending: ReturnType<typeof bulkStatusChange> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await locker.query('BEGIN');
    await locker.query(
      'SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [userIds],
    );
    pending = operation();
    const finished = await Promise.race([
      pending.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), 5_000);
      }),
    ]);
    expect(finished).toBe(true);
    return await pending;
  } finally {
    if (timer) clearTimeout(timer);
    try {
      await locker.query('ROLLBACK');
    } finally {
      locker.release();
    }
    if (pending) await pending;
  }
}

describe('Bulk user lifecycle preserves permanent classification', () => {
  beforeEach(resetHumanFixtures);
  afterEach(truncateAllTables);

  describe.each(['superAdmin', 'userAdmin'] as const)('live %s actor', (actorKind) => {
    it.each(statusActions)(
      'should preserve concealed service denials and ordered ordinary partial results when mixed users request %s',
      async (action) => {
        const admin = await createHumanAdminFixtures();
        const target = await createTestOrganization();
        const active = await createClassifiedBindingFixture(
          admin.organizationId,
          admin.application.id,
          target.id,
          'active',
        );
        const revoked = await createClassifiedBindingFixture(
          admin.organizationId,
          admin.application.id,
          target.id,
          'revoked',
        );
        const first = await createTestUser(admin.organizationId);
        const second = await createTestUser(admin.organizationId);
        const previousStatus = action === 'activate' ? 'inactive' : 'active';
        const newStatus = action === 'activate' ? 'active' : 'inactive';
        await getPool().query('UPDATE users SET status = $2 WHERE id = ANY($1::uuid[])', [
          [first.id, second.id],
          previousStatus,
        ]);
        const missingId = randomUUID();
        const entityIds = [second.id, active.user.id, missingId, revoked.user.id, first.id];
        const accountsBefore = await Promise.all([
          humanUserFingerprint(active.user.id),
          humanUserFingerprint(revoked.user.id),
        ]);
        const bindingsBefore = await Promise.all([
          bindingFingerprint(active.bindingId),
          bindingFingerprint(revoked.bindingId),
        ]);

        const result = await bulkStatusChange({
          entityType: 'user',
          entityIds,
          action,
          organizationId: admin.organizationId,
          actorId: admin[actorKind].id,
        });

        expect(result).toMatchObject({ total: 5, succeeded: 2, failed: 3 });
        expect(result.results.map((item) => item.id)).toEqual(entityIds);
        for (const id of [active.user.id, revoked.user.id, missingId]) {
          expect(result.results.find((item) => item.id === id)).toEqual({
            id,
            success: false,
            outcome: 'failed',
            code: 'not_found_or_not_authorized',
            error: 'Entity not found or not authorized',
          });
        }
        for (const id of [second.id, first.id]) {
          expect(result.results.find((item) => item.id === id)).toMatchObject({
            id,
            success: true,
            outcome: 'succeeded',
            code: null,
            previousStatus,
            newStatus,
          });
        }
        const ordinaryRows = await getPool().query<{ id: string; status: string }>(
          'SELECT id, status FROM users WHERE id = ANY($1::uuid[]) ORDER BY id',
          [[first.id, second.id]],
        );
        expect(ordinaryRows.rows).toHaveLength(2);
        expect(ordinaryRows.rows.every((row) => row.status === newStatus)).toBe(true);
        expect(
          await Promise.all([
            humanUserFingerprint(active.user.id),
            humanUserFingerprint(revoked.user.id),
          ]),
        ).toEqual(accountsBefore);
        expect(
          await Promise.all([
            bindingFingerprint(active.bindingId),
            bindingFingerprint(revoked.bindingId),
          ]),
        ).toEqual(bindingsBefore);
      },
    );
  });

  it.each(statusActions)(
    'should finish without waiting for classified row locks when the mixed operation is %s',
    async (action) => {
      const admin = await createHumanAdminFixtures();
      const target = await createTestOrganization();
      const active = await createClassifiedBindingFixture(
        admin.organizationId,
        admin.application.id,
        target.id,
        'active',
      );
      const revoked = await createClassifiedBindingFixture(
        admin.organizationId,
        admin.application.id,
        target.id,
        'revoked',
      );
      const ordinary = await createTestUser(admin.organizationId);
      await getPool().query('UPDATE users SET status = $2 WHERE id = $1', [
        ordinary.id,
        action === 'activate' ? 'inactive' : 'active',
      ]);
      const result = await withoutClassifiedRowLocks([active.user.id, revoked.user.id], () =>
        bulkStatusChange({
          entityType: 'user',
          entityIds: [active.user.id, ordinary.id, revoked.user.id],
          action,
          organizationId: admin.organizationId,
          actorId: admin.superAdmin.id,
        }),
      );

      expect(result).toMatchObject({ total: 3, succeeded: 1, failed: 2 });
      expect(result.results.map((item) => item.code)).toEqual([
        'not_found_or_not_authorized',
        null,
        'not_found_or_not_authorized',
      ]);
    },
  );
});
