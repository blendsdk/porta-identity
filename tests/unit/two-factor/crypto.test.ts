/**
 * Unit tests for the two-factor crypto module (AES-256-GCM).
 *
 * Tests encrypt/decrypt round-trips, key validation, tamper detection,
 * and unique IV generation. All operations use real crypto — no mocking.
 */

import { describe, it, expect } from 'vitest';
import { encryptTotpSecret, decryptTotpSecret } from '../../../src/two-factor/crypto.js';
import { TwoFactorCryptoError } from '../../../src/two-factor/errors.js';

/** Valid 32-byte encryption key (64 hex characters) */
const VALID_KEY = 'a'.repeat(64);

/** Alternative valid key for cross-key tests */
const ALT_KEY = 'b'.repeat(64);

describe('two-factor crypto', () => {
  // -------------------------------------------------------------------------
  // encryptTotpSecret
  // -------------------------------------------------------------------------

  describe('encryptTotpSecret', () => {
    it('should return encrypted data, IV, and tag as hex strings', () => {
      const result = encryptTotpSecret('JBSWY3DPEHPK3PXP', VALID_KEY);

      expect(result).toHaveProperty('encrypted');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('tag');

      // All outputs should be hex-encoded strings
      expect(result.encrypted).toMatch(/^[0-9a-f]+$/);
      expect(result.iv).toMatch(/^[0-9a-f]+$/);
      expect(result.tag).toMatch(/^[0-9a-f]+$/);
    });

    it('should produce a 24-character IV (12 bytes hex)', () => {
      const result = encryptTotpSecret('test-secret', VALID_KEY);
      // 12 bytes = 24 hex chars
      expect(result.iv).toHaveLength(24);
    });

    it('should produce a 32-character auth tag (16 bytes hex)', () => {
      const result = encryptTotpSecret('test-secret', VALID_KEY);
      // 16 bytes = 32 hex chars
      expect(result.tag).toHaveLength(32);
    });

    it('should generate unique IVs for each encryption', () => {
      const result1 = encryptTotpSecret('same-secret', VALID_KEY);
      const result2 = encryptTotpSecret('same-secret', VALID_KEY);

      // IVs must be different — same plaintext should not produce same ciphertext
      expect(result1.iv).not.toBe(result2.iv);
      expect(result1.encrypted).not.toBe(result2.encrypted);
    });

    it('should throw TwoFactorCryptoError for an empty key', () => {
      expect(() => encryptTotpSecret('secret', '')).toThrow(TwoFactorCryptoError);
    });

    it('should throw TwoFactorCryptoError for a key that is too short', () => {
      expect(() => encryptTotpSecret('secret', 'aabbcc')).toThrow(TwoFactorCryptoError);
    });

    it('should throw TwoFactorCryptoError for a key with invalid hex chars', () => {
      // 64 chars but includes non-hex characters
      const invalidKey = 'g'.repeat(64);
      expect(() => encryptTotpSecret('secret', invalidKey)).toThrow(TwoFactorCryptoError);
    });
  });

  // -------------------------------------------------------------------------
  // decryptTotpSecret
  // -------------------------------------------------------------------------

  describe('decryptTotpSecret', () => {
    it('should round-trip encrypt → decrypt to the original plaintext', () => {
      const plaintext = 'JBSWY3DPEHPK3PXP';
      const { encrypted, iv, tag } = encryptTotpSecret(plaintext, VALID_KEY);

      const decrypted = decryptTotpSecret(encrypted, iv, tag, VALID_KEY);

      expect(decrypted).toBe(plaintext);
    });

    it('should round-trip with various plaintext lengths', () => {
      const plaintexts = ['A', 'short', 'JBSWY3DPEHPK3PXP', 'a'.repeat(256)];

      for (const pt of plaintexts) {
        const { encrypted, iv, tag } = encryptTotpSecret(pt, VALID_KEY);
        const decrypted = decryptTotpSecret(encrypted, iv, tag, VALID_KEY);
        expect(decrypted).toBe(pt);
      }
    });

    it('should throw TwoFactorCryptoError when using wrong key', () => {
      const { encrypted, iv, tag } = encryptTotpSecret('secret', VALID_KEY);

      expect(() => decryptTotpSecret(encrypted, iv, tag, ALT_KEY))
        .toThrow(TwoFactorCryptoError);
    });

    it('should throw TwoFactorCryptoError when ciphertext is tampered', () => {
      const { encrypted, iv, tag } = encryptTotpSecret('secret', VALID_KEY);

      // Flip a character in the encrypted data to simulate tampering
      const tampered = encrypted[0] === 'a'
        ? 'b' + encrypted.slice(1)
        : 'a' + encrypted.slice(1);

      expect(() => decryptTotpSecret(tampered, iv, tag, VALID_KEY))
        .toThrow(TwoFactorCryptoError);
    });

    it('should throw TwoFactorCryptoError when auth tag is tampered', () => {
      const { encrypted, iv, tag } = encryptTotpSecret('secret', VALID_KEY);

      // Flip a character in the auth tag
      const tamperedTag = tag[0] === 'a'
        ? 'b' + tag.slice(1)
        : 'a' + tag.slice(1);

      expect(() => decryptTotpSecret(encrypted, iv, tamperedTag, VALID_KEY))
        .toThrow(TwoFactorCryptoError);
    });

    it('should throw TwoFactorCryptoError for an invalid key', () => {
      const { encrypted, iv, tag } = encryptTotpSecret('secret', VALID_KEY);

      expect(() => decryptTotpSecret(encrypted, iv, tag, 'bad'))
        .toThrow(TwoFactorCryptoError);
    });
  });
});
