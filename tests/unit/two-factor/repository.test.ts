/**
 * Unit tests for the two-factor repository — PostgreSQL data access layer.
 *
 * Mocks getPool() to test SQL construction, parameter passing, and row mapping
 * without a real database. Follows the same patterns as organization and user
 * repository tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
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
import type { UserTotpRow, OtpCodeRow, RecoveryCodeRow } from '../../../src/two-factor/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock pool with a query function returning given rows. */
function mockPool(rows: Record<string, unknown>[] = [], rowCount?: number) {
  const mockQuery = vi.fn().mockResolvedValue({
    rows,
    rowCount: rowCount ?? rows.length,
  });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

/** Standard TOTP row from DB. */
function createTotpRow(overrides: Partial<UserTotpRow> = {}): UserTotpRow {
  return {
    id: 'totp-uuid-1',
    user_id: 'user-uuid-1',
    encrypted_secret: 'enc-secret',
    encryption_iv: 'enc-iv',
    encryption_tag: 'enc-tag',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    verified: false,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Standard OTP code row from DB. */
function createOtpRow(overrides: Partial<OtpCodeRow> = {}): OtpCodeRow {
  return {
    id: 'otp-uuid-1',
    user_id: 'user-uuid-1',
    code_hash: 'sha256-hash',
    expires_at: new Date('2026-01-01T00:10:00Z'),
    used_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Standard recovery code row from DB. */
function createRecoveryRow(overrides: Partial<RecoveryCodeRow> = {}): RecoveryCodeRow {
  return {
    id: 'recovery-uuid-1',
    user_id: 'user-uuid-1',
    code_hash: '$argon2id$hash',
    used_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('two-factor repository', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // TOTP operations
  // -------------------------------------------------------------------------

  describe('insertTotp', () => {
    it('should execute INSERT with correct parameters', async () => {
      const row = createTotpRow();
      const mockQuery = mockPool([row]);

      await insertTotp({
        userId: 'user-uuid-1',
        encryptedSecret: 'enc-secret',
        encryptionIv: 'enc-iv',
        encryptionTag: 'enc-tag',
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO user_totp');
      expect(sql).toContain('RETURNING *');
    });

    it('should return a mapped UserTotp object', async () => {
      const row = createTotpRow();
      mockPool([row]);

      const result = await insertTotp({
        userId: 'user-uuid-1',
        encryptedSecret: 'enc-secret',
        encryptionIv: 'enc-iv',
        encryptionTag: 'enc-tag',
      });

      expect(result.id).toBe('totp-uuid-1');
      expect(result.userId).toBe('user-uuid-1');
      expect(result.encryptedSecret).toBe('enc-secret');
    });

    it('should use default algorithm, digits, period when not specified', async () => {
      const row = createTotpRow();
      const mockQuery = mockPool([row]);

      await insertTotp({
        userId: 'user-uuid-1',
        encryptedSecret: 'enc',
        encryptionIv: 'iv',
        encryptionTag: 'tag',
      });

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[4]).toBe('SHA1');  // algorithm
      expect(params[5]).toBe(6);       // digits
      expect(params[6]).toBe(30);      // period
    });
  });

  describe('findTotpByUserId', () => {
    it('should return mapped UserTotp when found', async () => {
      const row = createTotpRow({ verified: true });
      mockPool([row]);

      const result = await findTotpByUserId('user-uuid-1');
      expect(result).not.toBeNull();
      expect(result!.verified).toBe(true);
    });

    it('should return null when not found', async () => {
      mockPool([]);
      const result = await findTotpByUserId('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('markTotpVerified', () => {
    it('should execute UPDATE with correct userId', async () => {
      const mockQuery = mockPool();
      await markTotpVerified('user-uuid-1');

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE user_totp');
      expect(sql).toContain('verified = true');
      expect(mockQuery.mock.calls[0][1]).toEqual(['user-uuid-1']);
    });
  });

  describe('deleteTotp', () => {
    it('should execute DELETE with correct userId', async () => {
      const mockQuery = mockPool();
      await deleteTotp('user-uuid-1');

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM user_totp');
      expect(mockQuery.mock.calls[0][1]).toEqual(['user-uuid-1']);
    });
  });

  // -------------------------------------------------------------------------
  // OTP code operations
  // -------------------------------------------------------------------------

  describe('insertOtpCode', () => {
    it('should execute INSERT and return mapped OtpCode', async () => {
      const row = createOtpRow();
      const mockQuery = mockPool([row]);

      const result = await insertOtpCode('user-uuid-1', 'hash123', new Date('2026-01-01T00:10:00Z'));

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(result.userId).toBe('user-uuid-1');
      expect(result.codeHash).toBe('sha256-hash');
    });
  });

  describe('findActiveOtpCodes', () => {
    it('should return mapped OtpCode array', async () => {
      const rows = [
        createOtpRow({ id: 'otp-1' }),
        createOtpRow({ id: 'otp-2' }),
      ];
      mockPool(rows);

      const result = await findActiveOtpCodes('user-uuid-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('otp-1');
    });

    it('should return empty array when no active codes', async () => {
      mockPool([]);
      const result = await findActiveOtpCodes('user-uuid-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('markOtpCodeUsed', () => {
    it('should execute UPDATE with correct codeId', async () => {
      const mockQuery = mockPool();
      await markOtpCodeUsed('otp-uuid-1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE two_factor_otp_codes');
      expect(sql).toContain('used_at = NOW()');
      expect(mockQuery.mock.calls[0][1]).toEqual(['otp-uuid-1']);
    });
  });

  describe('deleteExpiredOtpCodes', () => {
    it('should return the number of deleted rows', async () => {
      mockPool([], 3);
      const count = await deleteExpiredOtpCodes('user-uuid-1');
      expect(count).toBe(3);
    });

    it('should return 0 when nothing to delete', async () => {
      mockPool([], 0);
      const count = await deleteExpiredOtpCodes('user-uuid-1');
      expect(count).toBe(0);
    });
  });

  describe('countActiveOtpCodes', () => {
    it('should return the count as a number', async () => {
      mockPool([{ count: '3' }]);
      const count = await countActiveOtpCodes('user-uuid-1');
      expect(count).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Recovery code operations
  // -------------------------------------------------------------------------

  describe('insertRecoveryCodes', () => {
    it('should execute INSERT with multi-row VALUES', async () => {
      const mockQuery = mockPool();
      await insertRecoveryCodes('user-uuid-1', ['hash1', 'hash2', 'hash3']);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO two_factor_recovery_codes');
      // Should have 3 value tuples
      expect(sql).toContain('($1, $2)');
      expect(sql).toContain('($1, $3)');
      expect(sql).toContain('($1, $4)');
    });

    it('should not execute query for empty array', async () => {
      const mockQuery = mockPool();
      await insertRecoveryCodes('user-uuid-1', []);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('findUnusedRecoveryCodes', () => {
    it('should return mapped RecoveryCode array', async () => {
      const rows = [
        createRecoveryRow({ id: 'rc-1' }),
        createRecoveryRow({ id: 'rc-2' }),
      ];
      mockPool(rows);

      const result = await findUnusedRecoveryCodes('user-uuid-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('rc-1');
    });
  });

  describe('markRecoveryCodeUsed', () => {
    it('should execute UPDATE with correct codeId', async () => {
      const mockQuery = mockPool();
      await markRecoveryCodeUsed('rc-uuid-1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE two_factor_recovery_codes');
      expect(sql).toContain('used_at = NOW()');
    });
  });

  describe('deleteAllRecoveryCodes', () => {
    it('should execute DELETE with correct userId', async () => {
      const mockQuery = mockPool();
      await deleteAllRecoveryCodes('user-uuid-1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM two_factor_recovery_codes');
      expect(mockQuery.mock.calls[0][1]).toEqual(['user-uuid-1']);
    });
  });

  describe('countUnusedRecoveryCodes', () => {
    it('should return the count as a number', async () => {
      mockPool([{ count: '7' }]);
      const count = await countUnusedRecoveryCodes('user-uuid-1');
      expect(count).toBe(7);
    });
  });
});
