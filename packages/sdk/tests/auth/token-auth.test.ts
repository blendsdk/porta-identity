/**
 * Tests for TokenAuth — static Bearer token authentication provider.
 *
 * Verifies that createTokenAuth() returns the correct interface and
 * always provides the same static token without refresh capability.
 *
 * @module tests/auth/token-auth
 */

import { describe, it, expect } from 'vitest';
import { createTokenAuth } from '../../src/auth/token-auth.js';

describe('createTokenAuth', () => {
  const TEST_TOKEN = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.test-payload';

  // -------------------------------------------------------------------------
  // getToken()
  // -------------------------------------------------------------------------

  describe('getToken()', () => {
    it('should return the provided static token', async () => {
      const auth = createTokenAuth({ token: TEST_TOKEN });

      const token = await auth.getToken();

      expect(token).toBe(TEST_TOKEN);
    });

    it('should return the same token on multiple calls', async () => {
      const auth = createTokenAuth({ token: TEST_TOKEN });

      const token1 = await auth.getToken();
      const token2 = await auth.getToken();
      const token3 = await auth.getToken();

      expect(token1).toBe(TEST_TOKEN);
      expect(token2).toBe(TEST_TOKEN);
      expect(token3).toBe(TEST_TOKEN);
    });

    it('should handle empty string token', async () => {
      const auth = createTokenAuth({ token: '' });

      const token = await auth.getToken();

      expect(token).toBe('');
    });

    it('should handle token with special characters', async () => {
      const specialToken = 'Bearer token/with+special=chars&more';
      const auth = createTokenAuth({ token: specialToken });

      const token = await auth.getToken();

      expect(token).toBe(specialToken);
    });

    it('should return a promise (async interface)', () => {
      const auth = createTokenAuth({ token: TEST_TOKEN });

      const result = auth.getToken();

      expect(result).toBeInstanceOf(Promise);
    });
  });

  // -------------------------------------------------------------------------
  // refreshToken
  // -------------------------------------------------------------------------

  describe('refreshToken', () => {
    it('should not define refreshToken', () => {
      const auth = createTokenAuth({ token: TEST_TOKEN });

      // TokenAuth intentionally omits refreshToken — on 401, the
      // transport should throw immediately instead of attempting refresh
      expect(auth.refreshToken).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // AuthProvider interface compliance
  // -------------------------------------------------------------------------

  describe('AuthProvider interface', () => {
    it('should have getToken as a function', () => {
      const auth = createTokenAuth({ token: TEST_TOKEN });

      expect(typeof auth.getToken).toBe('function');
    });

    it('should satisfy the AuthProvider contract', () => {
      const auth = createTokenAuth({ token: TEST_TOKEN });

      // AuthProvider requires getToken(): Promise<string>
      // and optionally refreshToken?(): Promise<string>
      expect(auth).toHaveProperty('getToken');
      expect(typeof auth.getToken).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // Concurrent calls
  // -------------------------------------------------------------------------

  describe('concurrent calls', () => {
    it('should handle concurrent getToken() calls', async () => {
      const auth = createTokenAuth({ token: TEST_TOKEN });

      // Fire multiple calls simultaneously
      const results = await Promise.all([
        auth.getToken(),
        auth.getToken(),
        auth.getToken(),
        auth.getToken(),
        auth.getToken(),
      ]);

      // All should return the same token
      expect(results).toEqual([
        TEST_TOKEN,
        TEST_TOKEN,
        TEST_TOKEN,
        TEST_TOKEN,
        TEST_TOKEN,
      ]);
    });
  });
});
