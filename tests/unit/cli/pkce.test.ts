/**
 * Unit tests for PKCE code_verifier and code_challenge generation.
 *
 * Validates that the PKCE helpers produce correctly formatted values
 * per RFC 7636 — base64url encoding, correct length, and that the
 * S256 challenge is a valid SHA-256 hash of the verifier.
 *
 * @module tests/unit/cli/pkce
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  generateCodeVerifier,
  generateCodeChallenge,
} from '../../../src/cli/commands/login.js';

describe('PKCE helpers', () => {
  // =========================================================================
  // generateCodeVerifier
  // =========================================================================

  describe('generateCodeVerifier()', () => {
    it('should return a base64url-encoded string', () => {
      const verifier = generateCodeVerifier();
      // Base64url uses only A-Z, a-z, 0-9, -, _ (no +, /, or =)
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should produce a 43-character string (32 bytes base64url)', () => {
      // 32 bytes → ceil(32 * 4/3) = 43 base64url characters (no padding)
      const verifier = generateCodeVerifier();
      expect(verifier.length).toBe(43);
    });

    it('should meet RFC 7636 length requirements (43–128 chars)', () => {
      const verifier = generateCodeVerifier();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    });

    it('should generate unique values on each call', () => {
      const v1 = generateCodeVerifier();
      const v2 = generateCodeVerifier();
      expect(v1).not.toBe(v2);
    });
  });

  // =========================================================================
  // generateCodeChallenge
  // =========================================================================

  describe('generateCodeChallenge()', () => {
    it('should return a base64url-encoded string', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      // Base64url characters only
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should produce a 43-character string (SHA-256 hash base64url)', () => {
      // SHA-256 produces 32 bytes → 43 base64url characters
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      expect(challenge.length).toBe(43);
    });

    it('should match manual SHA-256 computation', () => {
      const verifier = 'test-verifier-string-for-pkce-validation';
      const challenge = generateCodeChallenge(verifier);

      // Compute the expected challenge manually
      const expected = createHash('sha256')
        .update(verifier)
        .digest('base64url');

      expect(challenge).toBe(expected);
    });

    it('should produce different challenges for different verifiers', () => {
      const v1 = generateCodeVerifier();
      const v2 = generateCodeVerifier();
      const c1 = generateCodeChallenge(v1);
      const c2 = generateCodeChallenge(v2);
      expect(c1).not.toBe(c2);
    });

    it('should produce the same challenge for the same verifier', () => {
      const verifier = 'deterministic-test-verifier';
      const c1 = generateCodeChallenge(verifier);
      const c2 = generateCodeChallenge(verifier);
      expect(c1).toBe(c2);
    });
  });
});
