/** Generic human-user mutations cannot alter or restore a permanently classified account. */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import {
  activateUser,
  clearUserPassword,
  deactivateUser,
  setUserPassword,
  updateUser,
  verifyUserPassword,
} from '../../../src/users/index.js';
import { truncateAllTables } from '../helpers/database.js';
import { createTestUserWithPassword } from '../helpers/factories.js';
import {
  classifyFixtureUser,
  createHumanAdminFixtures,
  humanFixturePassword,
  humanUserFingerprint,
  resetHumanFixtures,
} from './human-fixtures.js';

/** These are existing human mutation entry points, not binding lifecycle operations. */
const mutationKinds = ['profile', 'activate', 'deactivate', 'set-password', 'clear-password'] as const;

/** A single existing human mutation selected by the parameterized specification. */
type MutationKind = (typeof mutationKinds)[number];

/** Invoke each real service using the same live human administrator and valid inputs. */
async function mutateHumanUser(
  kind: MutationKind,
  userId: string,
  actorId: string,
  replacementPassword: string,
) {
  const actor = { kind: 'user', userId: actorId } as const;
  switch (kind) {
    case 'profile':
      return updateUser(
        userId,
        { givenName: 'Changed', email: `changed-${randomUUID()}@test.example.com` },
        actor,
      );
    case 'activate':
      return activateUser(userId, actor);
    case 'deactivate':
      return deactivateUser(userId, actor);
    case 'set-password':
      return setUserPassword(userId, replacementPassword, actorId);
    case 'clear-password':
      return clearUserPassword(userId, actorId);
  }
}

/** Read only non-secret fields needed to establish successful ordinary-user behavior. */
async function humanMutationState(userId: string) {
  const result = await getPool().query<{
    status: string;
    given_name: string | null;
    password_is_empty: boolean;
    classified: boolean;
  }>(
    `SELECT status, given_name, password_hash IS NULL AS password_is_empty,
            is_service_account AS classified
       FROM users WHERE id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('The synthetic mutation target is missing');
  return row;
}

describe('Generic human-user mutation guards', () => {
  beforeEach(resetHumanFixtures);
  afterEach(truncateAllTables);

  it.each(mutationKinds)(
    'should reject %s without changing either account when the target is permanently classified',
    async (kind) => {
      const admin = await createHumanAdminFixtures();
      const { user } = await createTestUserWithPassword(
        admin.organizationId,
        humanFixturePassword(),
      );
      if (kind === 'activate') {
        await getPool().query('UPDATE users SET status = $2 WHERE id = $1', [user.id, 'inactive']);
      }
      await classifyFixtureUser(user.id);
      const targetBefore = await humanUserFingerprint(user.id);
      const humanBefore = await humanUserFingerprint(admin.superAdmin.id);

      await expect(
        mutateHumanUser(kind, user.id, admin.superAdmin.id, humanFixturePassword()),
      ).rejects.toThrow();

      expect(await humanUserFingerprint(user.id)).toBe(targetBefore);
      expect(await humanUserFingerprint(admin.superAdmin.id)).toBe(humanBefore);
      expect((await humanMutationState(user.id)).classified).toBe(true);
    },
  );

  it.each(mutationKinds)(
    'should retain successful %s when the target remains an ordinary human',
    async (kind) => {
      const admin = await createHumanAdminFixtures();
      const { user, password } = await createTestUserWithPassword(
        admin.organizationId,
        humanFixturePassword(),
      );
      if (kind === 'activate') {
        await getPool().query('UPDATE users SET status = $2 WHERE id = $1', [user.id, 'inactive']);
      }
      const replacementPassword = humanFixturePassword();

      await mutateHumanUser(kind, user.id, admin.superAdmin.id, replacementPassword);

      const state = await humanMutationState(user.id);
      expect(state.classified).toBe(false);
      switch (kind) {
        case 'profile':
          expect(state.given_name).toBe('Changed');
          break;
        case 'activate':
          expect(state.status).toBe('active');
          break;
        case 'deactivate':
          expect(state.status).toBe('inactive');
          break;
        case 'set-password':
          expect(await verifyUserPassword(user.id, replacementPassword)).toBe(true);
          expect(await verifyUserPassword(user.id, password)).toBe(false);
          break;
        case 'clear-password':
          expect(state.password_is_empty).toBe(true);
          expect(await verifyUserPassword(user.id, password)).toBe(false);
          break;
      }
    },
  );
});
