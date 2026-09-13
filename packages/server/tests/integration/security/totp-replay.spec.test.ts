import { randomBytes } from 'node:crypto';
import { TOTP, Secret } from 'otpauth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPool } from '../../../src/lib/database.js';
import { confirmTotpSetup, setupTotp, verifyTotp } from '../../../src/two-factor/service.js';
import { createTestOrganization, createTestUser } from '../helpers/factories.js';
import { truncateAllTables } from '../helpers/database.js';

const BASE_TIME = Date.parse('2026-09-13T12:00:15.000Z');

function secretFromUri(uri: string): string {
  const value = new URL(uri).searchParams.get('secret');
  if (value === null) throw new Error('Enrollment URI did not contain a secret');
  return value;
}

function codeAt(secret: string, timestamp: number): string {
  return new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).generate({ timestamp });
}

async function createEnrollment(): Promise<{ userId: string; secret: string; totpId: string }> {
  const organization = await createTestOrganization();
  const user = await createTestUser(organization.id);
  const setup = await setupTotp(user.id, user.email, organization.slug);
  const row = await getPool().query<{ id: string }>('SELECT id FROM user_totp WHERE user_id = $1', [
    user.id,
  ]);
  return { userId: user.id, secret: secretFromUri(setup.totpUri), totpId: row.rows[0]!.id };
}

async function storedState(userId: string) {
  const result = await getPool().query<{
    id: string;
    encrypted_secret: string;
    verified: boolean;
    last_accepted_time_step: string | null;
    two_factor_enabled: boolean;
    two_factor_method: string | null;
  }>(
    `
    SELECT t.id, t.encrypted_secret, t.verified, t.last_accepted_time_step,
           u.two_factor_enabled, u.two_factor_method
      FROM user_totp t
      JOIN users u ON u.id = t.user_id
     WHERE t.user_id = $1
  `,
    [userId],
  );
  return result.rows[0]!;
}

describe('TOTP replay protection', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await truncateAllTables();
  });

  afterEach(() => vi.restoreAllMocks());

  it('transactionally verifies the exact enrollment row, stores its step, enables the user, and rejects immediate reuse', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(BASE_TIME);
    const enrollment = await createEnrollment();
    const code = codeAt(enrollment.secret, BASE_TIME);

    await expect(confirmTotpSetup(enrollment.userId, code)).resolves.toBe(true);
    expect(await storedState(enrollment.userId)).toMatchObject({
      id: enrollment.totpId,
      verified: true,
      last_accepted_time_step: String(Math.floor(BASE_TIME / 30_000)),
      two_factor_enabled: true,
      two_factor_method: 'totp',
    });
    await expect(verifyTotp(enrollment.userId, code)).resolves.toBe(false);
  });

  it('rolls enrollment consumption back when enabling the user fails', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(BASE_TIME);
    const enrollment = await createEnrollment();
    const code = codeAt(enrollment.secret, BASE_TIME);
    const triggerName = `reject_totp_enable_${randomBytes(6).toString('hex')}`;
    const functionName = `${triggerName}_fn`;
    try {
      await getPool().query(`
        CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.two_factor_enabled THEN RAISE EXCEPTION 'forced user update failure'; END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER ${triggerName}
          BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION ${functionName}();
      `);

      await expect(confirmTotpSetup(enrollment.userId, code)).rejects.toThrow(
        'forced user update failure',
      );
      expect(await storedState(enrollment.userId)).toMatchObject({
        id: enrollment.totpId,
        verified: false,
        last_accepted_time_step: null,
        two_factor_enabled: false,
        two_factor_method: null,
      });
    } finally {
      await getPool().query(`DROP TRIGGER IF EXISTS ${triggerName} ON users`);
      await getPool().query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    }
  });

  it('allows exactly one of two concurrent attempts with the same valid code', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(BASE_TIME);
    const enrollment = await createEnrollment();
    await confirmTotpSetup(enrollment.userId, codeAt(enrollment.secret, BASE_TIME));

    const nextTime = BASE_TIME + 30_000;
    vi.mocked(Date.now).mockReturnValue(nextTime);
    const code = codeAt(enrollment.secret, nextTime);
    const results = await Promise.all([
      verifyTotp(enrollment.userId, code),
      verifyTotp(enrollment.userId, code),
    ]);

    expect(results.sort()).toEqual([false, true]);
    expect((await storedState(enrollment.userId)).last_accepted_time_step).toBe(
      String(Math.floor(nextTime / 30_000)),
    );
  });

  it('advances only for a greater matched step and changes nothing for malformed, mismatched, expired, equal, or older codes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(BASE_TIME);
    const enrollment = await createEnrollment();
    await confirmTotpSetup(enrollment.userId, codeAt(enrollment.secret, BASE_TIME));
    const initial = await storedState(enrollment.userId);

    await expect(verifyTotp(enrollment.userId, 'not-a-code')).resolves.toBe(false);
    await expect(verifyTotp(enrollment.userId, '000000')).resolves.toBe(false);
    await expect(
      verifyTotp(enrollment.userId, codeAt(enrollment.secret, BASE_TIME - 60_000)),
    ).resolves.toBe(false);
    await expect(verifyTotp(enrollment.userId, codeAt(enrollment.secret, BASE_TIME))).resolves.toBe(
      false,
    );
    await expect(
      verifyTotp(enrollment.userId, codeAt(enrollment.secret, BASE_TIME - 30_000)),
    ).resolves.toBe(false);
    expect(await storedState(enrollment.userId)).toEqual(initial);

    const nextTime = BASE_TIME + 30_000;
    vi.mocked(Date.now).mockReturnValue(nextTime);
    await expect(verifyTotp(enrollment.userId, codeAt(enrollment.secret, nextTime))).resolves.toBe(
      true,
    );
    expect((await storedState(enrollment.userId)).last_accepted_time_step).toBe(
      String(Math.floor(nextTime / 30_000)),
    );
  });

  it('does not consume a replacement row installed after validation but before the conditional update', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(BASE_TIME);
    const enrollment = await createEnrollment();
    await confirmTotpSetup(enrollment.userId, codeAt(enrollment.secret, BASE_TIME));
    const nextTime = BASE_TIME + 30_000;
    vi.mocked(Date.now).mockReturnValue(nextTime);

    const blocker = await getPool().connect();
    let attempt: Promise<boolean> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM user_totp WHERE id = $1 FOR UPDATE', [enrollment.totpId]);
      attempt = verifyTotp(enrollment.userId, codeAt(enrollment.secret, nextTime));

      await vi.waitFor(
        async () => {
          const waiting = await getPool().query<{ blocked: boolean }>(`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
             WHERE cardinality(pg_blocking_pids(pid)) > 0
               AND query ~* 'UPDATE\\s+user_totp'
          ) AS blocked
        `);
          expect(waiting.rows[0]?.blocked).toBe(true);
        },
        { timeout: 2_000, interval: 10 },
      );

      await blocker.query('DELETE FROM user_totp WHERE id = $1', [enrollment.totpId]);
      const replacement = await blocker.query<{ id: string }>(
        `
        INSERT INTO user_totp (
          user_id, encrypted_secret, encryption_iv, encryption_tag,
          algorithm, digits, period, verified, last_accepted_time_step
        )
        SELECT user_id, encrypted_secret, encryption_iv, encryption_tag,
               'SHA1', 6, 30, true, NULL
          FROM (VALUES ($1::uuid, $2::text, $3::text, $4::text))
               AS replacement(user_id, encrypted_secret, encryption_iv, encryption_tag)
        RETURNING id
      `,
        [enrollment.userId, 'replacement-ciphertext', 'replacement-iv', 'replacement-tag'],
      );
      await blocker.query('COMMIT');

      await expect(attempt).resolves.toBe(false);
      const state = await storedState(enrollment.userId);
      expect(state.id).toBe(replacement.rows[0]!.id);
      expect(state.encrypted_secret).toBe('replacement-ciphertext');
      expect(state.verified).toBe(true);
      expect(state.last_accepted_time_step).toBeNull();
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined);
      blocker.release();
      if (attempt !== undefined) await attempt.catch(() => undefined);
    }
  });

  it('leaves rows unchanged for the wrong user and the wrong enrollment state', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(BASE_TIME);
    const enrollment = await createEnrollment();
    const otherOrganization = await createTestOrganization();
    const otherUser = await createTestUser(otherOrganization.id);
    const before = await storedState(enrollment.userId);

    await expect(verifyTotp(otherUser.id, codeAt(enrollment.secret, BASE_TIME))).rejects.toThrow();
    await expect(
      confirmTotpSetup(enrollment.userId, codeAt(enrollment.secret, BASE_TIME)),
    ).resolves.toBe(true);
    const verified = await storedState(enrollment.userId);
    await expect(
      confirmTotpSetup(enrollment.userId, codeAt(enrollment.secret, BASE_TIME + 30_000)),
    ).rejects.toThrow();
    expect(before.verified).toBe(false);
    expect(await storedState(enrollment.userId)).toEqual(verified);
  });
});
