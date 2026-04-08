import { describe, it, expect } from 'vitest';
import { generateCsrfToken, verifyCsrfToken } from '../../../src/auth/csrf.js';

describe('generateCsrfToken', () => {
  it('should return a non-empty string', () => {
    const token = generateCsrfToken();
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });

  it('should return a base64url-encoded string', () => {
    const token = generateCsrfToken();
    // base64url uses only [A-Za-z0-9_-] characters (no +, /, or =)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('should generate a 43-character string (32 bytes base64url)', () => {
    const token = generateCsrfToken();
    // 32 bytes → 43 base64url characters (no padding)
    expect(token.length).toBe(43);
  });

  it('should produce different tokens on each call', () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();
    expect(token1).not.toBe(token2);
  });
});

describe('verifyCsrfToken', () => {
  it('should return true when tokens match', () => {
    const token = generateCsrfToken();
    expect(verifyCsrfToken(token, token)).toBe(true);
  });

  it('should return false when tokens do not match', () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();
    expect(verifyCsrfToken(token1, token2)).toBe(false);
  });

  it('should return false when expected is undefined', () => {
    expect(verifyCsrfToken(undefined, 'some-token')).toBe(false);
  });

  it('should return false when actual is undefined', () => {
    expect(verifyCsrfToken('some-token', undefined)).toBe(false);
  });

  it('should return false when both are undefined', () => {
    expect(verifyCsrfToken(undefined, undefined)).toBe(false);
  });

  it('should return false when expected is empty string', () => {
    expect(verifyCsrfToken('', 'some-token')).toBe(false);
  });

  it('should return false when actual is empty string', () => {
    expect(verifyCsrfToken('some-token', '')).toBe(false);
  });

  it('should return false when both are empty strings', () => {
    expect(verifyCsrfToken('', '')).toBe(false);
  });

  it('should return false for tokens with different lengths', () => {
    expect(verifyCsrfToken('short', 'much-longer-token')).toBe(false);
  });

  it('should use constant-time comparison (no early exit on partial match)', () => {
    // This test verifies the function works correctly with similar tokens —
    // actual timing attack resistance is a property of crypto.timingSafeEqual
    const token = generateCsrfToken();
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(verifyCsrfToken(token, tampered)).toBe(false);
  });

  it('should handle unicode strings correctly', () => {
    // Both strings are the same unicode — should match
    expect(verifyCsrfToken('token-with-émojis', 'token-with-émojis')).toBe(true);
  });

  it('should reject different unicode strings', () => {
    expect(verifyCsrfToken('token-α', 'token-β')).toBe(false);
  });
});
