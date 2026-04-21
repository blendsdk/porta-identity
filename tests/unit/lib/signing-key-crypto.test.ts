import { describe, it, expect } from 'vitest';
import { generateES256KeyPair } from '../../../src/lib/signing-keys.js';
import {
  encryptPrivateKey,
  decryptPrivateKey,
  SigningKeyCryptoError,
} from '../../../src/lib/signing-key-crypto.js';

// Test encryption keys (64 hex chars = 32 bytes each)
const TEST_KEY = 'a'.repeat(64);
const WRONG_KEY = 'b'.repeat(64);

describe('signing-key-crypto', () => {
  describe('encryptPrivateKey', () => {
    it('returns hex-encoded encrypted, iv, and tag', () => {
      const { privateKeyPem } = generateES256KeyPair();
      const result = encryptPrivateKey(privateKeyPem, TEST_KEY);

      expect(result.encrypted).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.tag).toBeDefined();
      // All values should be hex strings
      expect(result.encrypted).toMatch(/^[0-9a-f]+$/);
      expect(result.iv).toMatch(/^[0-9a-f]+$/);
      expect(result.tag).toMatch(/^[0-9a-f]+$/);
    });

    it('produces IV of 24 hex chars (12 bytes)', () => {
      const { privateKeyPem } = generateES256KeyPair();
      const result = encryptPrivateKey(privateKeyPem, TEST_KEY);

      expect(result.iv).toHaveLength(24);
    });

    it('produces tag of 32 hex chars (16 bytes)', () => {
      const { privateKeyPem } = generateES256KeyPair();
      const result = encryptPrivateKey(privateKeyPem, TEST_KEY);

      expect(result.tag).toHaveLength(32);
    });

    it('encrypted output differs from plaintext input', () => {
      const { privateKeyPem } = generateES256KeyPair();
      const result = encryptPrivateKey(privateKeyPem, TEST_KEY);

      // Encrypted hex should not contain the PEM markers
      expect(result.encrypted).not.toContain('BEGIN PRIVATE KEY');
    });

    it('same plaintext produces different ciphertext (random IV)', () => {
      const { privateKeyPem } = generateES256KeyPair();
      const result1 = encryptPrivateKey(privateKeyPem, TEST_KEY);
      const result2 = encryptPrivateKey(privateKeyPem, TEST_KEY);

      // Different IVs mean different ciphertext
      expect(result1.iv).not.toBe(result2.iv);
      expect(result1.encrypted).not.toBe(result2.encrypted);
    });

    it('throws SigningKeyCryptoError for short key', () => {
      const { privateKeyPem } = generateES256KeyPair();
      expect(() => encryptPrivateKey(privateKeyPem, 'a'.repeat(32))).toThrow(
        SigningKeyCryptoError,
      );
    });

    it('throws SigningKeyCryptoError for non-hex key', () => {
      const { privateKeyPem } = generateES256KeyPair();
      expect(() => encryptPrivateKey(privateKeyPem, 'z'.repeat(64))).toThrow(
        SigningKeyCryptoError,
      );
    });

    it('throws SigningKeyCryptoError for empty key', () => {
      const { privateKeyPem } = generateES256KeyPair();
      expect(() => encryptPrivateKey(privateKeyPem, '')).toThrow(
        SigningKeyCryptoError,
      );
    });
  });

  describe('decryptPrivateKey', () => {
    it('round-trip encrypt + decrypt returns original PEM', () => {
      const { privateKeyPem } = generateES256KeyPair();
      const { encrypted, iv, tag } = encryptPrivateKey(privateKeyPem, TEST_KEY);
      const decrypted = decryptPrivateKey(encrypted, iv, tag, TEST_KEY);

      expect(decrypted).toBe(privateKeyPem);
    });

    it('decrypted PEM contains expected markers', () => {
      const { privateKeyPem } = generateES256KeyPair();
      const { encrypted, iv, tag } = encryptPrivateKey(privateKeyPem, TEST_KEY);
      const decrypted = decryptPrivateKey(encrypted, iv, tag, TEST_KEY);

      expect(decrypted).toContain('-----BEGIN PRIVATE KEY-----');
      expect(decrypted).toContain('-----END PRIVATE KEY-----');
    });

    it('throws SigningKeyCryptoError with wrong key', () => {
      const { privateKeyPem } = generateES256KeyPair();
      const { encrypted, iv, tag } = encryptPrivateKey(privateKeyPem, TEST_KEY);

      expect(() => decryptPrivateKey(encrypted, iv, tag, WRONG_KEY)).toThrow(
        SigningKeyCryptoError,
      );
    });

    it('throws SigningKeyCryptoError with tampered ciphertext', () => {
      const { privateKeyPem } = generateES256KeyPair();
      const { encrypted, iv, tag } = encryptPrivateKey(privateKeyPem, TEST_KEY);

      // Flip a character in the ciphertext
      const tampered = encrypted.slice(0, -2) + 'ff';
      expect(() => decryptPrivateKey(tampered, iv, tag, TEST_KEY)).toThrow(
        SigningKeyCryptoError,
      );
    });

    it('throws SigningKeyCryptoError with tampered tag', () => {
      const { privateKeyPem } = generateES256KeyPair();
      const { encrypted, iv, tag } = encryptPrivateKey(privateKeyPem, TEST_KEY);

      // Flip a character in the auth tag
      const tamperedTag = tag.slice(0, -2) + 'ff';
      expect(() => decryptPrivateKey(encrypted, iv, tamperedTag, TEST_KEY)).toThrow(
        SigningKeyCryptoError,
      );
    });

    it('error message includes "Decryption failed"', () => {
      const { privateKeyPem } = generateES256KeyPair();
      const { encrypted, iv, tag } = encryptPrivateKey(privateKeyPem, TEST_KEY);

      try {
        decryptPrivateKey(encrypted, iv, tag, WRONG_KEY);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SigningKeyCryptoError);
        expect((error as SigningKeyCryptoError).message).toContain('Decryption failed');
      }
    });
  });

  describe('SigningKeyCryptoError', () => {
    it('has correct name property', () => {
      const error = new SigningKeyCryptoError('test');
      expect(error.name).toBe('SigningKeyCryptoError');
    });

    it('is an instance of Error', () => {
      const error = new SigningKeyCryptoError('test');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
