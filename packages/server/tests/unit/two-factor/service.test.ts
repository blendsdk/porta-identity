/**
 * Unit tests for the two-factor service — business logic orchestrator.
 *
 * Mocks all external dependencies (repository, cache, crypto, config, users,
 * audit log) to test service logic in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

vi.mock('../../../src/config/index.js', () => ({
  config: { twoFactorEncryptionKey: 'a'.repeat(64) },
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/two-factor/crypto.js', () => ({
  encryptTotpSecret: vi.fn().mockReturnValue({ encrypted: 'enc', iv: 'iv', tag: 'tag' }),
  decryptTotpSecret: vi.fn().mockReturnValue('DECODED_SECRET'),
}));

vi.mock('../../../src/two-factor/otp.js', () => ({
  generateOtpCode: vi.fn().mockReturnValue('123456'),
  hashOtpCode: vi.fn().mockReturnValue('sha256-hash'),
  verifyOtpCode: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../src/two-factor/totp.js', () => ({
  generateTotpSecret: vi.fn().mockReturnValue('BASE32SECRET'),
  generateTotpUri: vi.fn().mockReturnValue('otpauth://totp/Test?secret=BASE32SECRET'),
  generateQrCodeDataUri: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
  verifyTotpCode: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../src/two-factor/recovery.js', () => ({
  generateRecoveryCodes: vi.fn().mockReturnValue(['CODE-0001', 'CODE-0002']),
  hashRecoveryCode: vi.fn().mockResolvedValue('$argon2id$hash'),
  verifyRecoveryCode: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../src/two-factor/repository.js', () => ({
  insertTotp: vi.fn().mockResolvedValue({ id: 'totp-1', userId: 'user-1', verified: false }),
  findTotpByUserId: vi.fn().mockResolvedValue(null),
  markTotpVerified: vi.fn().mockResolvedValue(undefined),
  deleteTotp: vi.fn().mockResolvedValue(undefined),
  insertOtpCode: vi.fn().mockResolvedValue({ id: 'otp-1' }),
  findActiveOtpCodes: vi.fn().mockResolvedValue([]),
  markOtpCodeUsed: vi.fn().mockResolvedValue(undefined),
  deleteExpiredOtpCodes: vi.fn().mockResolvedValue(0),
  countActiveOtpCodes: vi.fn().mockResolvedValue(0),
  insertRecoveryCodes: vi.fn().mockResolvedValue(undefined),
  findUnusedRecoveryCodes: vi.fn().mockResolvedValue([]),
  markRecoveryCodeUsed: vi.fn().mockResolvedValue(undefined),
  deleteAllRecoveryCodes: vi.fn().mockResolvedValue(undefined),
  countUnusedRecoveryCodes: vi.fn().mockResolvedValue(0),
}));

vi.mock('../../../src/two-factor/cache.js', () => ({
  getCachedTwoFactorStatus: vi.fn().mockResolvedValue(null),
  cacheTwoFactorStatus: vi.fn().mockResolvedValue(undefined),
  invalidateTwoFactorCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/users/repository.js', () => ({
  findUserById: vi.fn().mockResolvedValue(null),
  updateUser: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  setupEmailOtp,
  setupTotp,
  confirmTotpSetup,
  sendOtpCode,
  verifyOtp,
  verifyTotp,
  verifyRecoveryCode as verifyRecoveryCodeService,
  getTwoFactorStatus,
  disableTwoFactor,
  regenerateRecoveryCodes,
  requiresTwoFactor,
  determineTwoFactorMethod,
} from '../../../src/two-factor/service.js';
import { findUserById, updateUser } from '../../../src/users/repository.js';
import { findTotpByUserId, findActiveOtpCodes, findUnusedRecoveryCodes, countActiveOtpCodes, countUnusedRecoveryCodes } from '../../../src/two-factor/repository.js';
import { getCachedTwoFactorStatus } from '../../../src/two-factor/cache.js';
import { verifyOtpCode } from '../../../src/two-factor/otp.js';
import { verifyTotpCode } from '../../../src/two-factor/totp.js';
import { verifyRecoveryCode as verifyRecoveryCodeHash } from '../../../src/two-factor/recovery.js';
import { TwoFactorAlreadyEnabledError, TwoFactorNotEnabledError, TotpNotConfiguredError, OtpExpiredError, OtpInvalidError, RecoveryCodesExhaustedError, RecoveryCodeInvalidError } from '../../../src/two-factor/errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal mock user for service tests. */
function createMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    email: 'user@example.com',
    twoFactorEnabled: false,
    twoFactorMethod: null,
    givenName: 'Test',
    familyName: 'User',
    ...overrides,
  };
}

describe('two-factor service', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // Setup functions
  // -------------------------------------------------------------------------

  describe('setupEmailOtp', () => {
    it('should set up email OTP and return recovery codes', async () => {
      (findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser());

      const result = await setupEmailOtp('user-1', 'org-1');

      expect(result.method).toBe('email');
      expect(result.recoveryCodes).toEqual(['CODE-0001', 'CODE-0002']);
      expect(updateUser).toHaveBeenCalledWith('user-1', { twoFactorEnabled: true, twoFactorMethod: 'email' });
    });

    it('should throw TwoFactorAlreadyEnabledError if 2FA is already enabled', async () => {
      (findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser({ twoFactorEnabled: true }));

      await expect(setupEmailOtp('user-1', 'org-1')).rejects.toThrow(TwoFactorAlreadyEnabledError);
    });

    it('should throw TwoFactorNotEnabledError if user not found', async () => {
      (findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(setupEmailOtp('user-1', 'org-1')).rejects.toThrow(TwoFactorNotEnabledError);
    });
  });

  describe('setupTotp', () => {
    it('should set up TOTP and return URI, QR code, and recovery codes', async () => {
      (findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser());

      const result = await setupTotp('user-1', 'user@example.com', 'acme');

      expect(result.method).toBe('totp');
      expect(result.totpUri).toContain('otpauth://');
      expect(result.qrCodeDataUri).toContain('data:image/png');
      expect(result.recoveryCodes).toEqual(['CODE-0001', 'CODE-0002']);
    });

    it('should throw TwoFactorAlreadyEnabledError if 2FA is already enabled', async () => {
      (findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser({ twoFactorEnabled: true }));

      await expect(setupTotp('user-1', 'user@example.com', 'acme')).rejects.toThrow(TwoFactorAlreadyEnabledError);
    });
  });

  describe('confirmTotpSetup', () => {
    it('should confirm TOTP setup and enable 2FA', async () => {
      (findTotpByUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'totp-1', userId: 'user-1', verified: false,
        encryptedSecret: 'enc', encryptionIv: 'iv', encryptionTag: 'tag',
      });
      (findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser());
      (verifyTotpCode as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = await confirmTotpSetup('user-1', '123456');

      expect(result).toBe(true);
      expect(updateUser).toHaveBeenCalledWith('user-1', { twoFactorEnabled: true, twoFactorMethod: 'totp' });
    });

    it('should return false for an invalid TOTP code', async () => {
      (findTotpByUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'totp-1', userId: 'user-1', verified: false,
        encryptedSecret: 'enc', encryptionIv: 'iv', encryptionTag: 'tag',
      });
      (verifyTotpCode as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = await confirmTotpSetup('user-1', '000000');

      expect(result).toBe(false);
    });

    it('should throw TotpNotConfiguredError if no pending TOTP config', async () => {
      (findTotpByUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(confirmTotpSetup('user-1', '123456')).rejects.toThrow(TotpNotConfiguredError);
    });
  });

  // -------------------------------------------------------------------------
  // OTP email sending
  // -------------------------------------------------------------------------

  describe('sendOtpCode', () => {
    it('should generate and return an OTP code', async () => {
      const code = await sendOtpCode('user-1', 'user@example.com', 'org-1');
      expect(code).toBe('123456');
    });

    it('should throw when too many active codes', async () => {
      (countActiveOtpCodes as ReturnType<typeof vi.fn>).mockResolvedValue(5);

      await expect(sendOtpCode('user-1', 'user@example.com', 'org-1'))
        .rejects.toThrow('Too many active OTP codes');
    });
  });

  // -------------------------------------------------------------------------
  // Verification functions
  // -------------------------------------------------------------------------

  describe('verifyOtp', () => {
    it('should verify a valid OTP code', async () => {
      (findActiveOtpCodes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'otp-1', codeHash: 'hash1' },
      ]);
      (verifyOtpCode as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = await verifyOtp('user-1', '123456');
      expect(result).toBe(true);
    });

    it('should throw OtpExpiredError when no active codes', async () => {
      (findActiveOtpCodes as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await expect(verifyOtp('user-1', '123456')).rejects.toThrow(OtpExpiredError);
    });

    it('should throw OtpInvalidError when no code matches', async () => {
      (findActiveOtpCodes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'otp-1', codeHash: 'hash1' },
      ]);
      (verifyOtpCode as ReturnType<typeof vi.fn>).mockReturnValue(false);

      await expect(verifyOtp('user-1', '000000')).rejects.toThrow(OtpInvalidError);
    });
  });

  describe('verifyTotp', () => {
    it('should verify a valid TOTP code', async () => {
      (findTotpByUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'totp-1', verified: true,
        encryptedSecret: 'enc', encryptionIv: 'iv', encryptionTag: 'tag',
      });
      (verifyTotpCode as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = await verifyTotp('user-1', '123456');
      expect(result).toBe(true);
    });

    it('should throw TotpNotConfiguredError if no verified TOTP', async () => {
      (findTotpByUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(verifyTotp('user-1', '123456')).rejects.toThrow(TotpNotConfiguredError);
    });

    it('should throw TotpNotConfiguredError if TOTP is not verified', async () => {
      (findTotpByUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'totp-1', verified: false,
        encryptedSecret: 'enc', encryptionIv: 'iv', encryptionTag: 'tag',
      });

      await expect(verifyTotp('user-1', '123456')).rejects.toThrow(TotpNotConfiguredError);
    });
  });

  describe('verifyRecoveryCode (service)', () => {
    it('should verify a valid recovery code and mark it used', async () => {
      (findUnusedRecoveryCodes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'rc-1', codeHash: '$argon2id$hash1' },
      ]);
      (verifyRecoveryCodeHash as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await verifyRecoveryCodeService('user-1', 'ABCD-1234');
      expect(result).toBe(true);
    });

    it('should throw RecoveryCodesExhaustedError when no unused codes', async () => {
      (findUnusedRecoveryCodes as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await expect(verifyRecoveryCodeService('user-1', 'ABCD-1234'))
        .rejects.toThrow(RecoveryCodesExhaustedError);
    });

    it('should throw RecoveryCodeInvalidError when no code matches', async () => {
      (findUnusedRecoveryCodes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'rc-1', codeHash: '$argon2id$hash1' },
      ]);
      (verifyRecoveryCodeHash as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(verifyRecoveryCodeService('user-1', 'WRONG-CODE'))
        .rejects.toThrow(RecoveryCodeInvalidError);
    });
  });

  // -------------------------------------------------------------------------
  // Management functions
  // -------------------------------------------------------------------------

  describe('getTwoFactorStatus', () => {
    it('should return cached status when available', async () => {
      const cachedStatus = { enabled: true, method: 'totp' as const, totpConfigured: true, recoveryCodesRemaining: 8 };
      (getCachedTwoFactorStatus as ReturnType<typeof vi.fn>).mockResolvedValue(cachedStatus);

      const result = await getTwoFactorStatus('user-1');
      expect(result).toEqual(cachedStatus);
    });

    it('should build status from DB when cache misses', async () => {
      (getCachedTwoFactorStatus as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser({ twoFactorEnabled: true, twoFactorMethod: 'email' }));
      (findTotpByUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (countUnusedRecoveryCodes as ReturnType<typeof vi.fn>).mockResolvedValue(10);

      const result = await getTwoFactorStatus('user-1');
      expect(result.enabled).toBe(true);
      expect(result.method).toBe('email');
      expect(result.totpConfigured).toBe(false);
      expect(result.recoveryCodesRemaining).toBe(10);
    });

    it('should return disabled status for unknown user', async () => {
      (getCachedTwoFactorStatus as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getTwoFactorStatus('nonexistent');
      expect(result.enabled).toBe(false);
      expect(result.method).toBeNull();
    });
  });

  describe('disableTwoFactor', () => {
    it('should disable 2FA and clear all data', async () => {
      (findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser({ twoFactorEnabled: true, twoFactorMethod: 'totp' }));

      await disableTwoFactor('user-1');

      expect(updateUser).toHaveBeenCalledWith('user-1', { twoFactorEnabled: false, twoFactorMethod: null });
    });

    it('should throw TwoFactorNotEnabledError if not enabled', async () => {
      (findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser({ twoFactorEnabled: false }));

      await expect(disableTwoFactor('user-1')).rejects.toThrow(TwoFactorNotEnabledError);
    });

    it('should throw TwoFactorNotEnabledError if user not found', async () => {
      (findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(disableTwoFactor('user-1')).rejects.toThrow(TwoFactorNotEnabledError);
    });
  });

  describe('regenerateRecoveryCodes', () => {
    it('should return new recovery codes', async () => {
      (findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser({ twoFactorEnabled: true }));

      const codes = await regenerateRecoveryCodes('user-1');
      expect(codes).toEqual(['CODE-0001', 'CODE-0002']);
    });

    it('should throw TwoFactorNotEnabledError if 2FA not enabled', async () => {
      (findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(createMockUser({ twoFactorEnabled: false }));

      await expect(regenerateRecoveryCodes('user-1')).rejects.toThrow(TwoFactorNotEnabledError);
    });
  });

  // -------------------------------------------------------------------------
  // Policy functions (pure, no mocking needed)
  // -------------------------------------------------------------------------

  describe('requiresTwoFactor', () => {
    it('should return false when policy is optional', () => {
      expect(requiresTwoFactor({ twoFactorPolicy: 'optional' }, { twoFactorEnabled: false, twoFactorMethod: null })).toBe(false);
    });

    it('should return false when user already has 2FA enabled', () => {
      expect(requiresTwoFactor({ twoFactorPolicy: 'required_any' }, { twoFactorEnabled: true, twoFactorMethod: 'totp' })).toBe(false);
    });

    it('should return true when policy requires 2FA and user has none', () => {
      expect(requiresTwoFactor({ twoFactorPolicy: 'required_email' }, { twoFactorEnabled: false, twoFactorMethod: null })).toBe(true);
    });

    it('should return true for required_totp when user has no 2FA', () => {
      expect(requiresTwoFactor({ twoFactorPolicy: 'required_totp' }, { twoFactorEnabled: false, twoFactorMethod: null })).toBe(true);
    });

    it('should return true for required_any when user has no 2FA', () => {
      expect(requiresTwoFactor({ twoFactorPolicy: 'required_any' }, { twoFactorEnabled: false, twoFactorMethod: null })).toBe(true);
    });
  });

  describe('determineTwoFactorMethod', () => {
    it('should return user method when 2FA is already enabled', () => {
      expect(determineTwoFactorMethod({ twoFactorPolicy: 'optional' }, { twoFactorEnabled: true, twoFactorMethod: 'totp' })).toBe('totp');
    });

    it('should return email for required_email policy', () => {
      expect(determineTwoFactorMethod({ twoFactorPolicy: 'required_email' }, { twoFactorEnabled: false, twoFactorMethod: null })).toBe('email');
    });

    it('should return totp for required_totp policy', () => {
      expect(determineTwoFactorMethod({ twoFactorPolicy: 'required_totp' }, { twoFactorEnabled: false, twoFactorMethod: null })).toBe('totp');
    });

    it('should return null for required_any policy (user chooses)', () => {
      expect(determineTwoFactorMethod({ twoFactorPolicy: 'required_any' }, { twoFactorEnabled: false, twoFactorMethod: null })).toBeNull();
    });

    it('should return null for optional policy', () => {
      expect(determineTwoFactorMethod({ twoFactorPolicy: 'optional' }, { twoFactorEnabled: false, twoFactorMethod: null })).toBeNull();
    });
  });
});
