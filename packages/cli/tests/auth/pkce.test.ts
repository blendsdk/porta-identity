/**
 * Tests for PKCE (Proof Key for Code Exchange) helpers.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from '../../src/auth/pkce.js';

describe('PKCE helpers', () => {
  describe('generateCodeVerifier', () => {
    it('returns a base64url-encoded string', () => {
      const verifier = generateCodeVerifier();
      // base64url characters: A-Z, a-z, 0-9, -, _
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('returns a 43-character string (32 random bytes)', () => {
      const verifier = generateCodeVerifier();
      expect(verifier.length).toBe(43);
    });

    it('generates unique values on each call', () => {
      const v1 = generateCodeVerifier();
      const v2 = generateCodeVerifier();
      expect(v1).not.toBe(v2);
    });

    it('meets RFC 7636 length requirement (43-128 chars)', () => {
      const verifier = generateCodeVerifier();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    });
  });

  describe('generateCodeChallenge', () => {
    it('returns a base64url-encoded SHA-256 hash', () => {
      const verifier = 'test-verifier-12345';
      const challenge = generateCodeChallenge(verifier);
      // base64url characters only
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('matches the expected SHA-256 hash for a known input', () => {
      const verifier = 'test-verifier-value';
      const expected = createHash('sha256')
        .update(verifier)
        .digest('base64url');
      expect(generateCodeChallenge(verifier)).toBe(expected);
    });

    it('produces different challenges for different verifiers', () => {
      const c1 = generateCodeChallenge('verifier-a');
      const c2 = generateCodeChallenge('verifier-b');
      expect(c1).not.toBe(c2);
    });

    it('produces consistent results for the same input', () => {
      const verifier = 'consistent-verifier';
      expect(generateCodeChallenge(verifier)).toBe(
        generateCodeChallenge(verifier),
      );
    });
  });

  describe('generateState', () => {
    it('returns a base64url-encoded string', () => {
      const state = generateState();
      expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('returns a 22-character string (16 random bytes)', () => {
      const state = generateState();
      expect(state.length).toBe(22);
    });

    it('generates unique values on each call', () => {
      const s1 = generateState();
      const s2 = generateState();
      expect(s1).not.toBe(s2);
    });
  });
});
