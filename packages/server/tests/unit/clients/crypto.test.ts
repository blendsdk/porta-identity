import { describe, it, expect } from 'vitest';
import {
  generateClientId,
  generateSecret,
  hashSecret,
  verifySecretHash,
  sha256Secret,
} from '../../../src/clients/crypto.js';

describe('client crypto', () => {
  // -------------------------------------------------------------------------
  // generateClientId
  // -------------------------------------------------------------------------

  describe('generateClientId', () => {
    it('should generate a base64url string', () => {
      const id = generateClientId();

      // base64url: only [A-Za-z0-9_-] characters
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate ~43 character string (32 bytes in base64url)', () => {
      const id = generateClientId();

      // 32 bytes → ceil(32 * 4/3) = 43 chars in base64url (no padding)
      expect(id.length).toBe(43);
    });

    it('should generate unique values', () => {
      const ids = new Set(Array.from({ length: 10 }, () => generateClientId()));

      expect(ids.size).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // generateSecret
  // -------------------------------------------------------------------------

  describe('generateSecret', () => {
    it('should generate a base64url string', () => {
      const secret = generateSecret();

      expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate ~64 character string (48 bytes in base64url)', () => {
      const secret = generateSecret();

      // 48 bytes → 64 chars in base64url (no padding)
      expect(secret.length).toBe(64);
    });

    it('should generate unique values', () => {
      const secrets = new Set(Array.from({ length: 10 }, () => generateSecret()));

      expect(secrets.size).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // hashSecret / verifySecretHash
  // -------------------------------------------------------------------------

  describe('hashSecret', () => {
    it('should produce an Argon2id hash string', async () => {
      const hash = await hashSecret('test-secret');

      // Argon2id hashes start with $argon2id$
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('should produce different hashes for same input (random salt)', async () => {
      const hash1 = await hashSecret('same-secret');
      const hash2 = await hashSecret('same-secret');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifySecretHash', () => {
    it('should return true for matching secret', async () => {
      const plaintext = 'my-super-secret-value';
      const hash = await hashSecret(plaintext);

      const result = await verifySecretHash(hash, plaintext);

      expect(result).toBe(true);
    });

    it('should return false for non-matching secret', async () => {
      const hash = await hashSecret('correct-secret');

      const result = await verifySecretHash(hash, 'wrong-secret');

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // End-to-end: generate + hash + verify
  // -------------------------------------------------------------------------

  describe('end-to-end secret flow', () => {
    it('should generate, hash, and verify a secret successfully', async () => {
      const plaintext = generateSecret();
      const hash = await hashSecret(plaintext);
      const verified = await verifySecretHash(hash, plaintext);

      expect(verified).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // sha256Secret
  // -------------------------------------------------------------------------

  describe('sha256Secret', () => {
    it('should return a 64-character hex string', () => {
      const hash = sha256Secret('test-secret');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should be deterministic (same input → same output)', () => {
      const hash1 = sha256Secret('identical-secret');
      const hash2 = sha256Secret('identical-secret');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = sha256Secret('secret-one');
      const hash2 = sha256Secret('secret-two');
      expect(hash1).not.toBe(hash2);
    });
  });
});
