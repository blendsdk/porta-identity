/**
 * Unit tests for the email OTP code module.
 *
 * Tests 6-digit code generation, SHA-256 hashing, and verification.
 * All operations use real crypto — no mocking needed.
 */

import { describe, it, expect } from 'vitest';
import { generateOtpCode, hashOtpCode, verifyOtpCode } from '../../../src/two-factor/otp.js';

describe('two-factor otp', () => {
  // -------------------------------------------------------------------------
  // generateOtpCode
  // -------------------------------------------------------------------------

  describe('generateOtpCode', () => {
    it('should return a 6-character string', () => {
      const code = generateOtpCode();
      expect(code).toHaveLength(6);
    });

    it('should contain only digits', () => {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should zero-pad codes shorter than 6 digits', () => {
      // Generate many codes — at least some should start with 0 statistically
      const codes = Array.from({ length: 100 }, () => generateOtpCode());
      // All codes must be exactly 6 chars (zero-padded)
      for (const code of codes) {
        expect(code).toHaveLength(6);
        expect(code).toMatch(/^\d{6}$/);
      }
    });

    it('should generate different codes on successive calls', () => {
      // Generate several codes and check they are not all the same
      const codes = new Set(Array.from({ length: 20 }, () => generateOtpCode()));
      // With 20 random 6-digit codes, the probability of all being the same is ~0
      expect(codes.size).toBeGreaterThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // hashOtpCode
  // -------------------------------------------------------------------------

  describe('hashOtpCode', () => {
    it('should return a 64-character hex string (SHA-256)', () => {
      const hash = hashOtpCode('123456');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce the same hash for the same code', () => {
      const hash1 = hashOtpCode('123456');
      const hash2 = hashOtpCode('123456');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different codes', () => {
      const hash1 = hashOtpCode('123456');
      const hash2 = hashOtpCode('654321');
      expect(hash1).not.toBe(hash2);
    });
  });

  // -------------------------------------------------------------------------
  // verifyOtpCode
  // -------------------------------------------------------------------------

  describe('verifyOtpCode', () => {
    it('should return true for a matching code and hash', () => {
      const code = '042819';
      const hash = hashOtpCode(code);
      expect(verifyOtpCode(code, hash)).toBe(true);
    });

    it('should return false for a non-matching code', () => {
      const hash = hashOtpCode('123456');
      expect(verifyOtpCode('654321', hash)).toBe(false);
    });

    it('should work with generated codes (round-trip)', () => {
      const code = generateOtpCode();
      const hash = hashOtpCode(code);
      expect(verifyOtpCode(code, hash)).toBe(true);
    });
  });
});
