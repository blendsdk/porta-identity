/**
 * Unit tests for two-factor authentication types and row mapping functions.
 *
 * Tests the three mapping functions that convert snake_case PostgreSQL
 * rows to camelCase TypeScript objects: mapRowToUserTotp, mapRowToOtpCode,
 * and mapRowToRecoveryCode.
 */

import { describe, it, expect } from 'vitest';
import type { UserTotpRow, OtpCodeRow, RecoveryCodeRow } from '../../../src/two-factor/types.js';
import {
  mapRowToUserTotp,
  mapRowToOtpCode,
  mapRowToRecoveryCode,
} from '../../../src/two-factor/types.js';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

/** Create a complete UserTotpRow with sensible defaults. */
function createTotpRow(overrides: Partial<UserTotpRow> = {}): UserTotpRow {
  return {
    id: 'totp-uuid-1',
    user_id: 'user-uuid-1',
    encrypted_secret: 'abc123encrypted',
    encryption_iv: 'def456iv',
    encryption_tag: 'ghi789tag',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    verified: false,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T12:00:00Z'),
    ...overrides,
  };
}

/** Create a complete OtpCodeRow with sensible defaults. */
function createOtpRow(overrides: Partial<OtpCodeRow> = {}): OtpCodeRow {
  return {
    id: 'otp-uuid-1',
    user_id: 'user-uuid-1',
    code_hash: 'sha256-hash-string',
    expires_at: new Date('2026-01-01T00:10:00Z'),
    used_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Create a complete RecoveryCodeRow with sensible defaults. */
function createRecoveryRow(overrides: Partial<RecoveryCodeRow> = {}): RecoveryCodeRow {
  return {
    id: 'recovery-uuid-1',
    user_id: 'user-uuid-1',
    code_hash: '$argon2id$v=19$hash',
    used_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('two-factor types', () => {
  // -------------------------------------------------------------------------
  // mapRowToUserTotp
  // -------------------------------------------------------------------------

  describe('mapRowToUserTotp', () => {
    it('should correctly map all fields from a TOTP row', () => {
      const row = createTotpRow();
      const totp = mapRowToUserTotp(row);

      expect(totp).toEqual({
        id: 'totp-uuid-1',
        userId: 'user-uuid-1',
        encryptedSecret: 'abc123encrypted',
        encryptionIv: 'def456iv',
        encryptionTag: 'ghi789tag',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        verified: false,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T12:00:00Z'),
      });
    });

    it('should map verified=true correctly', () => {
      const row = createTotpRow({ verified: true });
      const totp = mapRowToUserTotp(row);
      expect(totp.verified).toBe(true);
    });

    it('should preserve Date objects for timestamp fields', () => {
      const createdAt = new Date('2026-03-15T10:30:00Z');
      const updatedAt = new Date('2026-04-01T14:45:00Z');
      const row = createTotpRow({ created_at: createdAt, updated_at: updatedAt });
      const totp = mapRowToUserTotp(row);

      expect(totp.createdAt).toBeInstanceOf(Date);
      expect(totp.updatedAt).toBeInstanceOf(Date);
      expect(totp.createdAt.toISOString()).toBe('2026-03-15T10:30:00.000Z');
    });
  });

  // -------------------------------------------------------------------------
  // mapRowToOtpCode
  // -------------------------------------------------------------------------

  describe('mapRowToOtpCode', () => {
    it('should correctly map all fields from an OTP code row', () => {
      const row = createOtpRow();
      const otp = mapRowToOtpCode(row);

      expect(otp).toEqual({
        id: 'otp-uuid-1',
        userId: 'user-uuid-1',
        codeHash: 'sha256-hash-string',
        expiresAt: new Date('2026-01-01T00:10:00Z'),
        usedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
    });

    it('should map usedAt when set', () => {
      const usedAt = new Date('2026-01-01T00:05:00Z');
      const row = createOtpRow({ used_at: usedAt });
      const otp = mapRowToOtpCode(row);
      expect(otp.usedAt).toEqual(usedAt);
    });

    it('should preserve null for usedAt when unused', () => {
      const row = createOtpRow({ used_at: null });
      const otp = mapRowToOtpCode(row);
      expect(otp.usedAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // mapRowToRecoveryCode
  // -------------------------------------------------------------------------

  describe('mapRowToRecoveryCode', () => {
    it('should correctly map all fields from a recovery code row', () => {
      const row = createRecoveryRow();
      const recovery = mapRowToRecoveryCode(row);

      expect(recovery).toEqual({
        id: 'recovery-uuid-1',
        userId: 'user-uuid-1',
        codeHash: '$argon2id$v=19$hash',
        usedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
    });

    it('should map usedAt when set', () => {
      const usedAt = new Date('2026-01-01T00:05:00Z');
      const row = createRecoveryRow({ used_at: usedAt });
      const recovery = mapRowToRecoveryCode(row);
      expect(recovery.usedAt).toEqual(usedAt);
    });

    it('should preserve null for usedAt when unused', () => {
      const row = createRecoveryRow({ used_at: null });
      const recovery = mapRowToRecoveryCode(row);
      expect(recovery.usedAt).toBeNull();
    });
  });
});
