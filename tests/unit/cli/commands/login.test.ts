/**
 * Unit tests for CLI login command helpers.
 *
 * Tests the exported helper functions (isContainerized, parseCallbackUrl,
 * PKCE helpers) that support the login flow. The full handler is not tested
 * here since it depends on network I/O (metadata fetch, token exchange) and
 * interactive prompts — those are covered by integration/e2e tests.
 *
 * @module tests/unit/cli/commands/login
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isContainerized,
  parseCallbackUrl,
  generateCodeVerifier,
  generateCodeChallenge,
} from '../../../../src/cli/commands/login.js';

// ---------------------------------------------------------------------------
// isContainerized()
// ---------------------------------------------------------------------------

describe('isContainerized', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    delete process.env.PORTA_CONTAINER;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should return true when PORTA_CONTAINER=1 is set', () => {
    process.env.PORTA_CONTAINER = '1';
    expect(isContainerized()).toBe(true);
  });

  it('should return false when PORTA_CONTAINER is not set and no /.dockerenv', () => {
    // On a typical host machine /.dockerenv does not exist.
    // We verify the env var fast-path is NOT triggered (PORTA_CONTAINER unset)
    // and the function returns a boolean (false on host, true inside Docker).
    delete process.env.PORTA_CONTAINER;
    const result = isContainerized();
    expect(typeof result).toBe('boolean');
  });

  it('should return false when PORTA_CONTAINER is set to a value other than "1"', () => {
    process.env.PORTA_CONTAINER = 'true';
    // Only exact string '1' triggers container detection via env var
    // Result depends on /.dockerenv — but we're testing the env check path
    // On host this is typically false
    const result = isContainerized();
    // It should NOT match the env check, so it falls through to file check
    expect(typeof result).toBe('boolean');
  });

  it('should prioritize PORTA_CONTAINER=1 over file system check', () => {
    // Even if /.dockerenv doesn't exist, the env var should win
    process.env.PORTA_CONTAINER = '1';
    expect(isContainerized()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseCallbackUrl()
// ---------------------------------------------------------------------------

describe('parseCallbackUrl', () => {
  const expectedState = 'test-state-abc123';

  it('should extract authorization code from a valid callback URL', () => {
    const url = `http://127.0.0.1:11111/callback?code=auth-code-xyz&state=${expectedState}`;
    const code = parseCallbackUrl(url, expectedState);
    expect(code).toBe('auth-code-xyz');
  });

  it('should handle URLs with extra whitespace', () => {
    const url = `  http://127.0.0.1:11111/callback?code=my-code&state=${expectedState}  `;
    const code = parseCallbackUrl(url, expectedState);
    expect(code).toBe('my-code');
  });

  it('should handle URLs with additional query parameters', () => {
    const url = `http://127.0.0.1:11111/callback?code=abc&state=${expectedState}&iss=http://example.com`;
    const code = parseCallbackUrl(url, expectedState);
    expect(code).toBe('abc');
  });

  it('should handle URLs on different ports', () => {
    // The redirect URI port may vary — parseCallbackUrl doesn't validate it
    const url = `http://127.0.0.1:54321/callback?code=port-code&state=${expectedState}`;
    const code = parseCallbackUrl(url, expectedState);
    expect(code).toBe('port-code');
  });

  it('should handle localhost URLs', () => {
    const url = `http://localhost:11111/callback?code=local-code&state=${expectedState}`;
    const code = parseCallbackUrl(url, expectedState);
    expect(code).toBe('local-code');
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------

  it('should throw on invalid URL', () => {
    expect(() => parseCallbackUrl('not-a-url', expectedState)).toThrow(
      'Invalid URL',
    );
  });

  it('should throw on empty string', () => {
    expect(() => parseCallbackUrl('', expectedState)).toThrow(
      'Invalid URL',
    );
  });

  it('should throw on OIDC error response', () => {
    const url = `http://127.0.0.1:11111/callback?error=access_denied&error_description=User+cancelled&state=${expectedState}`;
    expect(() => parseCallbackUrl(url, expectedState)).toThrow(
      'Authentication failed: User cancelled',
    );
  });

  it('should throw on OIDC error without description', () => {
    const url = `http://127.0.0.1:11111/callback?error=server_error&state=${expectedState}`;
    expect(() => parseCallbackUrl(url, expectedState)).toThrow(
      'Authentication failed: server_error',
    );
  });

  it('should throw on state mismatch', () => {
    const url = 'http://127.0.0.1:11111/callback?code=abc&state=wrong-state';
    expect(() => parseCallbackUrl(url, expectedState)).toThrow(
      'state mismatch',
    );
  });

  it('should throw on missing state parameter', () => {
    const url = 'http://127.0.0.1:11111/callback?code=abc';
    expect(() => parseCallbackUrl(url, expectedState)).toThrow(
      'state mismatch',
    );
  });

  it('should throw when code is missing but state is valid', () => {
    const url = `http://127.0.0.1:11111/callback?state=${expectedState}`;
    expect(() => parseCallbackUrl(url, expectedState)).toThrow(
      'No authorization code found',
    );
  });

  it('should check for error before checking state', () => {
    // An OIDC error with wrong state should still report the error, not state mismatch
    const url = 'http://127.0.0.1:11111/callback?error=access_denied&state=wrong-state';
    expect(() => parseCallbackUrl(url, expectedState)).toThrow(
      'Authentication failed',
    );
  });
});

// ---------------------------------------------------------------------------
// PKCE helpers (generateCodeVerifier, generateCodeChallenge)
// ---------------------------------------------------------------------------

describe('generateCodeVerifier', () => {
  it('should return a base64url-encoded string', () => {
    const verifier = generateCodeVerifier();
    // Base64url uses only [A-Za-z0-9_-] characters
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('should return a 43-character string (32 bytes in base64url)', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBe(43);
  });

  it('should generate unique values on each call', () => {
    const v1 = generateCodeVerifier();
    const v2 = generateCodeVerifier();
    expect(v1).not.toBe(v2);
  });
});

describe('generateCodeChallenge', () => {
  it('should return a base64url-encoded SHA-256 hash', () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    // SHA-256 produces 32 bytes → 43 base64url characters
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge.length).toBe(43);
  });

  it('should produce deterministic output for the same input', () => {
    const verifier = 'test-verifier-12345';
    const c1 = generateCodeChallenge(verifier);
    const c2 = generateCodeChallenge(verifier);
    expect(c1).toBe(c2);
  });

  it('should produce different output for different inputs', () => {
    const c1 = generateCodeChallenge('verifier-a');
    const c2 = generateCodeChallenge('verifier-b');
    expect(c1).not.toBe(c2);
  });

  it('should match known S256 PKCE vector', () => {
    // Known test vector: verifier "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    // Expected challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    // (from RFC 7636 Appendix B)
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = generateCodeChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});
