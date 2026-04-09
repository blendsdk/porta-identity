/**
 * Unit tests for recovery code utilities.
 *
 * Tests code generation (XXXX-XXXX format), Argon2id hashing, and
 * verification (case-insensitive, dash-insensitive). Uses real Argon2id
 * since it's a core dependency, not an external service.
 */

import { describe, it, expect } from 'vitest';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
} from '../../../src/two-factor/recovery.js';

describe('two-factor recovery', () => {
  // -------------------------------------------------------------------------
  // generateRecoveryCodes
  // -------------------------------------------------------------------------

  describe('generateRecoveryCodes', () => {
    it('should generate 10 codes by default', () => {
      const codes = generateRecoveryCodes();
      expect(codes).toHaveLength(10);
    });

    it('should generate the specified number of codes', () => {
      const codes = generateRecoveryCodes(5);
      expect(codes).toHaveLength(5);
    });

    it('should produce codes in XXXX-XXXX format', () => {
      const codes = generateRecoveryCodes();
      for (const code of codes) {
        // Pattern: 4 uppercase-alnum chars, dash, 4 uppercase-alnum chars
        expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      }
    });

    it('should exclude ambiguous characters (0, O, 1, I, L)', () => {
      // Generate many codes and check none contain ambiguous chars
      const codes = generateRecoveryCodes(50);
      const allChars = codes.join('').replace(/-/g, '');
      expect(allChars).not.toMatch(/[01OIL]/);
    });

    it('should generate unique codes within a set', () => {
      const codes = generateRecoveryCodes();
      const unique = new Set(codes);
      // With 8-char codes from 30-char alphabet, collisions are astronomically unlikely
      expect(unique.size).toBe(codes.length);
    });

    it('should return an empty array when count is 0', () => {
      const codes = generateRecoveryCodes(0);
      expect(codes).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // hashRecoveryCode
  // -------------------------------------------------------------------------

  describe('hashRecoveryCode', () => {
    it('should return an Argon2id hash string', async () => {
      const hash = await hashRecoveryCode('ABCD-1234');
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('should produce different hashes for the same code (random salt)', async () => {
      const hash1 = await hashRecoveryCode('ABCD-1234');
      const hash2 = await hashRecoveryCode('ABCD-1234');
      // Argon2id includes random salt, so hashes differ
      expect(hash1).not.toBe(hash2);
    });
  });

  // -------------------------------------------------------------------------
  // verifyRecoveryCode
  // -------------------------------------------------------------------------

  describe('verifyRecoveryCode', () => {
    it('should return true for a matching code', async () => {
      const code = 'ABCD-1234';
      const hash = await hashRecoveryCode(code);
      expect(await verifyRecoveryCode(code, hash)).toBe(true);
    });

    it('should return false for a non-matching code', async () => {
      const hash = await hashRecoveryCode('ABCD-1234');
      expect(await verifyRecoveryCode('WXYZ-5678', hash)).toBe(false);
    });

    it('should be case-insensitive (lowercase input matches uppercase hash)', async () => {
      const code = 'ABCD-1234';
      const hash = await hashRecoveryCode(code);
      // Verify with lowercase version
      expect(await verifyRecoveryCode('abcd-1234', hash)).toBe(true);
    });

    it('should be dash-insensitive (no dash matches dashed hash)', async () => {
      const code = 'ABCD-1234';
      const hash = await hashRecoveryCode(code);
      // Verify without the dash
      expect(await verifyRecoveryCode('ABCD1234', hash)).toBe(true);
    });

    it('should handle mixed case and missing dash', async () => {
      const code = 'XYZW-5678';
      const hash = await hashRecoveryCode(code);
      // Verify with lowercase and no dash
      expect(await verifyRecoveryCode('xyzw5678', hash)).toBe(true);
    });

    it('should return false for a malformed hash', async () => {
      // A non-Argon2id string should not throw — just return false
      expect(await verifyRecoveryCode('ABCD-1234', 'not-a-hash')).toBe(false);
    });

    it('should work with generated codes (round-trip)', async () => {
      const codes = generateRecoveryCodes(3);
      for (const code of codes) {
        const hash = await hashRecoveryCode(code);
        expect(await verifyRecoveryCode(code, hash)).toBe(true);
      }
    });
  });
});
