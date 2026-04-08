import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { generateToken, hashToken } from '../../../src/auth/tokens.js';

describe('generateToken', () => {
  it('should return an object with plaintext and hash properties', () => {
    const result = generateToken();
    expect(result).toHaveProperty('plaintext');
    expect(result).toHaveProperty('hash');
  });

  it('should generate a base64url-encoded plaintext string', () => {
    const { plaintext } = generateToken();
    // base64url uses only [A-Za-z0-9_-] characters (no +, /, or =)
    expect(plaintext).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('should generate a 43-character base64url string (32 bytes)', () => {
    const { plaintext } = generateToken();
    // 32 bytes → ceil(32/3)*4 = 44, but base64url trims padding → 43 chars
    expect(plaintext.length).toBe(43);
  });

  it('should generate a 64-character hex SHA-256 hash', () => {
    const { hash } = generateToken();
    // SHA-256 produces 32 bytes = 64 hex characters
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce different tokens on each call', () => {
    const token1 = generateToken();
    const token2 = generateToken();
    expect(token1.plaintext).not.toBe(token2.plaintext);
    expect(token1.hash).not.toBe(token2.hash);
  });

  it('should produce a hash that matches SHA-256 of the plaintext', () => {
    const { plaintext, hash } = generateToken();
    const expectedHash = crypto.createHash('sha256').update(plaintext).digest('hex');
    expect(hash).toBe(expectedHash);
  });
});

describe('hashToken', () => {
  it('should return a 64-character hex string', () => {
    const result = hashToken('test-token-value');
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce the same hash for the same input (deterministic)', () => {
    const hash1 = hashToken('same-input');
    const hash2 = hashToken('same-input');
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different inputs', () => {
    const hash1 = hashToken('input-a');
    const hash2 = hashToken('input-b');
    expect(hash1).not.toBe(hash2);
  });

  it('should match crypto.createHash SHA-256 directly', () => {
    const input = 'known-plaintext-token';
    const expected = crypto.createHash('sha256').update(input).digest('hex');
    expect(hashToken(input)).toBe(expected);
  });

  it('should correctly round-trip with generateToken', () => {
    // Verify that hashToken(plaintext) matches the hash from generateToken
    const { plaintext, hash } = generateToken();
    expect(hashToken(plaintext)).toBe(hash);
  });

  it('should handle empty string input', () => {
    // SHA-256 of empty string is a well-known constant
    const emptyHash = crypto.createHash('sha256').update('').digest('hex');
    expect(hashToken('')).toBe(emptyHash);
  });

  it('should handle unicode input', () => {
    const result = hashToken('token-with-émojis-🔑');
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should handle very long input', () => {
    const longInput = 'a'.repeat(10000);
    const result = hashToken(longInput);
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });
});
