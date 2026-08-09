/**
 * Two-factor repository integration tests.
 *
 * Verifies CRUD operations for TOTP, OTP codes, and recovery codes
 * against a real PostgreSQL database. Tests cover: insert, find, update,
 * delete, count, and cascade behaviors.
 *
 * Each test starts with a clean slate via truncateAllTables().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import { createTestOrganization, createTestUser } from '../helpers/factories.js';
import {
  insertTotp,
  findTotpByUserId,
  markTotpVerified,
  deleteTotp,
  insertOtpCode,
  findActiveOtpCodes,
  markOtpCodeUsed,
  deleteExpiredOtpCodes,
  countActiveOtpCodes,
  insertRecoveryCodes,
  findUnusedRecoveryCodes,
  markRecoveryCodeUsed,
  deleteAllRecoveryCodes,
  countUnusedRecoveryCodes,
} from '../../../src/two-factor/repository.js';
import { getPool } from '../../../src/lib/database.js';

describe('Two-Factor Repository (Integration)', () => {
  let orgId: string;
  let userId: string;

  beforeEach(async () => {
    await truncateAllTables();
    await flushTestRedis();

    const org = await createTestOrganization();
    orgId = org.id;
    const user = await createTestUser(orgId);
    userId = user.id;
  });

  // -------------------------------------------------------------------------
  // TOTP operations
  // -------------------------------------------------------------------------

  describe('TOTP', () => {
    it('should insert and find a TOTP record by userId', async () => {
      const totp = await insertTotp({
        userId,
        encryptedSecret: 'encrypted-secret-hex',
        encryptionIv: 'iv-hex',
        encryptionTag: 'tag-hex',
      });

      expect(totp.userId).toBe(userId);
      expect(totp.encryptedSecret).toBe('encrypted-secret-hex');
      expect(totp.verified).toBe(false);

      const found = await findTotpByUserId(userId);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(totp.id);
    });

    it('should return null when no TOTP exists for user', async () => {
      const found = await findTotpByUserId(userId);
      expect(found).toBeNull();
    });

    it('should mark TOTP as verified', async () => {
      await insertTotp({
        userId,
        encryptedSecret: 'enc',
        encryptionIv: 'iv',
        encryptionTag: 'tag',
      });

      await markTotpVerified(userId);

      const found = await findTotpByUserId(userId);
      expect(found!.verified).toBe(true);
    });

    it('should delete TOTP record', async () => {
      await insertTotp({
        userId,
        encryptedSecret: 'enc',
        encryptionIv: 'iv',
        encryptionTag: 'tag',
      });

      await deleteTotp(userId);

      const found = await findTotpByUserId(userId);
      expect(found).toBeNull();
    });

    it('should enforce unique user_id constraint', async () => {
      await insertTotp({
        userId,
        encryptedSecret: 'enc1',
        encryptionIv: 'iv1',
        encryptionTag: 'tag1',
      });

      await expect(
        insertTotp({
          userId,
          encryptedSecret: 'enc2',
          encryptionIv: 'iv2',
          encryptionTag: 'tag2',
        }),
      ).rejects.toThrow();
    });

    it('should cascade delete TOTP when user is deleted', async () => {
      await insertTotp({
        userId,
        encryptedSecret: 'enc',
        encryptionIv: 'iv',
        encryptionTag: 'tag',
      });

      // Delete the user
      const pool = getPool();
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);

      const found = await findTotpByUserId(userId);
      expect(found).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // OTP code operations
  // -------------------------------------------------------------------------

  describe('OTP codes', () => {
    it('should insert and find active OTP codes', async () => {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      await insertOtpCode(userId, 'hash-1', expiresAt);
      await insertOtpCode(userId, 'hash-2', expiresAt);

      const active = await findActiveOtpCodes(userId);
      expect(active.length).toBe(2);
    });

    it('should count active OTP codes', async () => {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await insertOtpCode(userId, 'hash-1', expiresAt);
      await insertOtpCode(userId, 'hash-2', expiresAt);

      const count = await countActiveOtpCodes(userId);
      expect(count).toBe(2);
    });

    it('should mark OTP code as used', async () => {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const otp = await insertOtpCode(userId, 'hash-1', expiresAt);

      await markOtpCodeUsed(otp.id);

      // After marking used, it should no longer appear as active
      const active = await findActiveOtpCodes(userId);
      expect(active.length).toBe(0);
    });

    it('should not return expired OTP codes as active', async () => {
      // Insert an already-expired code
      const expiredAt = new Date(Date.now() - 1000);
      await insertOtpCode(userId, 'hash-expired', expiredAt);

      const active = await findActiveOtpCodes(userId);
      expect(active.length).toBe(0);
    });

    it('should delete expired OTP codes', async () => {
      const expiredAt = new Date(Date.now() - 1000);
      await insertOtpCode(userId, 'hash-expired', expiredAt);

      const deleted = await deleteExpiredOtpCodes(userId);
      expect(deleted).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Recovery code operations
  // -------------------------------------------------------------------------

  describe('Recovery codes', () => {
    it('should insert and find unused recovery codes', async () => {
      await insertRecoveryCodes(userId, ['hash-a', 'hash-b', 'hash-c']);

      const unused = await findUnusedRecoveryCodes(userId);
      expect(unused.length).toBe(3);
    });

    it('should count unused recovery codes', async () => {
      await insertRecoveryCodes(userId, ['hash-1', 'hash-2', 'hash-3', 'hash-4']);

      const count = await countUnusedRecoveryCodes(userId);
      expect(count).toBe(4);
    });

    it('should mark recovery code as used', async () => {
      await insertRecoveryCodes(userId, ['hash-rc']);

      const unused = await findUnusedRecoveryCodes(userId);
      expect(unused.length).toBe(1);

      await markRecoveryCodeUsed(unused[0].id);

      const afterMark = await findUnusedRecoveryCodes(userId);
      expect(afterMark.length).toBe(0);
    });

    it('should delete all recovery codes for a user', async () => {
      await insertRecoveryCodes(userId, ['h1', 'h2', 'h3']);
      await deleteAllRecoveryCodes(userId);

      const count = await countUnusedRecoveryCodes(userId);
      expect(count).toBe(0);
    });

    it('should not insert anything for empty array', async () => {
      await insertRecoveryCodes(userId, []);
      const count = await countUnusedRecoveryCodes(userId);
      expect(count).toBe(0);
    });

    it('should cascade delete recovery codes when user is deleted', async () => {
      await insertRecoveryCodes(userId, ['h1', 'h2']);

      const pool = getPool();
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);

      // Direct query since the repo function requires a valid userId
      const result = await pool.query(
        'SELECT COUNT(*) FROM two_factor_recovery_codes WHERE user_id = $1',
        [userId],
      );
      expect(parseInt(result.rows[0].count, 10)).toBe(0);
    });
  });
});
