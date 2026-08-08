/**
 * Unit tests for two-factor authentication error classes.
 *
 * Verifies correct class names, error messages, and inheritance chain
 * for all 2FA error types.
 */

import { describe, it, expect } from 'vitest';
import {
  TwoFactorError,
  TwoFactorNotEnabledError,
  TotpNotConfiguredError,
  OtpExpiredError,
  OtpInvalidError,
  RecoveryCodeInvalidError,
  RecoveryCodesExhaustedError,
  TwoFactorRequiredError,
  TwoFactorAlreadyEnabledError,
  TwoFactorCryptoError,
} from '../../../src/two-factor/errors.js';

describe('two-factor errors', () => {
  describe('TwoFactorError (base)', () => {
    it('should set name and message correctly', () => {
      const error = new TwoFactorError('test message');
      expect(error.name).toBe('TwoFactorError');
      expect(error.message).toBe('test message');
    });

    it('should be an instance of Error', () => {
      const error = new TwoFactorError('test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('TwoFactorNotEnabledError', () => {
    it('should include userId in message', () => {
      const error = new TwoFactorNotEnabledError('user-123');
      expect(error.name).toBe('TwoFactorNotEnabledError');
      expect(error.message).toContain('user-123');
    });

    it('should extend TwoFactorError', () => {
      const error = new TwoFactorNotEnabledError('user-123');
      expect(error).toBeInstanceOf(TwoFactorError);
    });
  });

  describe('TotpNotConfiguredError', () => {
    it('should include userId in message', () => {
      const error = new TotpNotConfiguredError('user-456');
      expect(error.name).toBe('TotpNotConfiguredError');
      expect(error.message).toContain('user-456');
    });

    it('should extend TwoFactorError', () => {
      expect(new TotpNotConfiguredError('u')).toBeInstanceOf(TwoFactorError);
    });
  });

  describe('OtpExpiredError', () => {
    it('should have correct name and message', () => {
      const error = new OtpExpiredError();
      expect(error.name).toBe('OtpExpiredError');
      expect(error.message).toContain('expired');
    });
  });

  describe('OtpInvalidError', () => {
    it('should have correct name and message', () => {
      const error = new OtpInvalidError();
      expect(error.name).toBe('OtpInvalidError');
      expect(error.message).toContain('Invalid');
    });
  });

  describe('RecoveryCodeInvalidError', () => {
    it('should have correct name and message', () => {
      const error = new RecoveryCodeInvalidError();
      expect(error.name).toBe('RecoveryCodeInvalidError');
      expect(error.message).toContain('Invalid');
    });
  });

  describe('RecoveryCodesExhaustedError', () => {
    it('should include userId in message', () => {
      const error = new RecoveryCodesExhaustedError('user-789');
      expect(error.name).toBe('RecoveryCodesExhaustedError');
      expect(error.message).toContain('user-789');
    });
  });

  describe('TwoFactorRequiredError', () => {
    it('should include userId in message', () => {
      const error = new TwoFactorRequiredError('user-abc');
      expect(error.name).toBe('TwoFactorRequiredError');
      expect(error.message).toContain('user-abc');
    });
  });

  describe('TwoFactorAlreadyEnabledError', () => {
    it('should include userId in message', () => {
      const error = new TwoFactorAlreadyEnabledError('user-def');
      expect(error.name).toBe('TwoFactorAlreadyEnabledError');
      expect(error.message).toContain('user-def');
    });
  });

  describe('TwoFactorCryptoError', () => {
    it('should include custom message', () => {
      const error = new TwoFactorCryptoError('decryption failed');
      expect(error.name).toBe('TwoFactorCryptoError');
      expect(error.message).toContain('decryption failed');
    });

    it('should extend TwoFactorError', () => {
      expect(new TwoFactorCryptoError('x')).toBeInstanceOf(TwoFactorError);
    });
  });

  describe('inheritance chain', () => {
    it('should make all errors instanceof TwoFactorError and Error', () => {
      const errors = [
        new TwoFactorNotEnabledError('u'),
        new TotpNotConfiguredError('u'),
        new OtpExpiredError(),
        new OtpInvalidError(),
        new RecoveryCodeInvalidError(),
        new RecoveryCodesExhaustedError('u'),
        new TwoFactorRequiredError('u'),
        new TwoFactorAlreadyEnabledError('u'),
        new TwoFactorCryptoError('x'),
      ];

      for (const err of errors) {
        expect(err).toBeInstanceOf(TwoFactorError);
        expect(err).toBeInstanceOf(Error);
      }
    });
  });
});
