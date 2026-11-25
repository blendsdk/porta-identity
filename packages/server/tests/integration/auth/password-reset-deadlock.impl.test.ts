/**
 * Regression coverage for the password-reset lock order.
 *
 * Two resets for the same account must not deadlock. The reset transaction previously locked the
 * submitted token row, then the account row, then the account's other token rows. Two concurrent
 * submissions therefore locked the same rows in opposite orders and PostgreSQL aborted one with
 * SQLSTATE `40P01`.
 *
 * The production path now locks the account row first. This test drives two real transactions
 * against PostgreSQL so the lock order, not mocked calls, is what it proves.
 *
 * @see https://github.com/blendsdk/porta-identity/issues/255
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { insertToken } from '../../../src/auth/token-repository.js';
import { getPool } from '../../../src/lib/database.js';
import {
  completePasswordReset,
  ResetTokenAlreadyConsumedError,
} from '../../../src/routes/password-reset.js';
import { verifyPassword } from '../../../src/users/password.js';
import { getPasswordHash } from '../../../src/users/repository.js';
import { createTestOrganization, createTestUserWithPassword } from '../helpers/factories.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';

const FIRST_PASSWORD = 'ConcurrentResetPassword123!';
const SECOND_PASSWORD = 'ConcurrentResetPassword456!';
const RACE_ROUNDS = 3;

/** Read a PostgreSQL error code without assuming the rejection is a database error. */
function postgresCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/** Insert one valid reset token and return its row identifier. */
async function insertResetToken(userId: string): Promise<string> {
  const hash = (randomUUID() + randomUUID()).replaceAll('-', '');
  await insertToken('password_reset_tokens', userId, hash, new Date(Date.now() + 60 * 60 * 1000));

  const result = await getPool().query<{ id: string }>(
    `SELECT id FROM password_reset_tokens WHERE user_id = $1 AND token_hash = $2`,
    [userId, hash],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Inserted reset token was not found');
  return row.id;
}

describe('password reset deadlock regression', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
  });

  it('serializes concurrent resets for one account without a deadlock', async () => {
    const organization = await createTestOrganization();
    const { user } = await createTestUserWithPassword(organization.id, 'OriginalResetPassword123!');

    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const firstToken = await insertResetToken(user.id);
      const secondToken = await insertResetToken(user.id);

      const results = await Promise.allSettled([
        completePasswordReset({
          organizationId: organization.id,
          userId: user.id,
          tokenId: firstToken,
          password: FIRST_PASSWORD,
        }),
        completePasswordReset({
          organizationId: organization.id,
          userId: user.id,
          tokenId: secondToken,
          password: SECOND_PASSWORD,
        }),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const reason = rejected[0]?.reason;
      expect(postgresCode(reason)).not.toBe('40P01');
      expect(reason).toBeInstanceOf(ResetTokenAlreadyConsumedError);

      const winnerPassword =
        results[0]?.status === 'fulfilled' ? FIRST_PASSWORD : SECOND_PASSWORD;
      const hash = await getPasswordHash(user.id);
      if (hash === null) throw new Error('Password hash missing after reset');
      await expect(verifyPassword(hash, winnerPassword)).resolves.toBe(true);

      const tokens = await getPool().query<{ used_at: Date | null }>(
        `SELECT used_at FROM password_reset_tokens WHERE id = ANY($1::uuid[])`,
        [[firstToken, secondToken]],
      );
      expect(tokens.rows).toHaveLength(2);
      expect(tokens.rows.every((token) => token.used_at !== null)).toBe(true);
    }
  });
});
