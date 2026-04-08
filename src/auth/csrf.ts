/**
 * CSRF token generation and verification.
 *
 * Provides double-submit cookie protection for server-rendered forms.
 * Tokens are generated with crypto.randomBytes and verified using
 * crypto.timingSafeEqual to prevent timing attacks.
 *
 * Usage in forms:
 *   1. Generate token → store in session and embed in hidden form field
 *   2. On submit → compare session token with form field token
 *   3. Reject if mismatch (CSRF attack) or missing
 *
 * @example
 *   // In route handler (render form):
 *   const token = generateCsrfToken();
 *   ctx.session.csrfToken = token;
 *   await renderPage('login', { csrfToken: token });
 *
 *   // In route handler (process form):
 *   const valid = verifyCsrfToken(ctx.session.csrfToken, ctx.request.body._csrf);
 *   if (!valid) ctx.throw(403, 'Invalid CSRF token');
 */

import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of random bytes for CSRF tokens (32 bytes = 256 bits of entropy) */
const CSRF_TOKEN_BYTES = 32;

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically secure CSRF token.
 *
 * Returns a base64url-encoded string suitable for embedding in HTML forms
 * and storing in session data.
 *
 * @returns Base64url-encoded CSRF token string
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_BYTES).toString('base64url');
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Verify a CSRF token using constant-time comparison.
 *
 * Uses crypto.timingSafeEqual to prevent timing side-channel attacks
 * that could allow an attacker to guess the token byte-by-byte.
 *
 * Returns false (rather than throwing) for any mismatch, missing value,
 * or length difference — the caller decides whether to throw 403.
 *
 * @param expected - The token stored in the user's session (trusted)
 * @param actual - The token submitted in the form field (untrusted)
 * @returns true if tokens match, false otherwise
 */
export function verifyCsrfToken(expected: string | undefined, actual: string | undefined): boolean {
  // Both must be present and non-empty
  if (!expected || !actual) {
    return false;
  }

  // Convert to buffers for timingSafeEqual
  const expectedBuf = Buffer.from(expected, 'utf-8');
  const actualBuf = Buffer.from(actual, 'utf-8');

  // timingSafeEqual requires equal-length buffers — different lengths = guaranteed mismatch
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
