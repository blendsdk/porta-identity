/**
 * CSRF token generation and verification.
 *
 * Provides cookie-based synchronized token protection for server-rendered forms.
 * Tokens are generated with crypto.randomBytes and verified using
 * crypto.timingSafeEqual to prevent timing attacks.
 *
 * Pattern:
 *   1. On GET (render form): generate token → set HttpOnly SameSite=Lax cookie
 *      → embed same token in hidden form field `_csrf`
 *   2. On POST (process form): read `_csrf` from cookie → read `_csrf` from
 *      form body → compare with verifyCsrfToken(cookieValue, formValue)
 *   3. Reject if mismatch (CSRF attack) or missing
 *
 * @example
 *   // In route handler (render form):
 *   const token = generateCsrfToken();
 *   setCsrfCookie(ctx, token);
 *   await renderPage('login', { csrfToken: token });
 *
 *   // In route handler (process form):
 *   const valid = verifyCsrfToken(getCsrfFromCookie(ctx), ctx.request.body._csrf);
 *   if (!valid) ctx.throw(403, 'Invalid CSRF token');
 */

import crypto from 'node:crypto';
import type { Context } from 'koa';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of random bytes for CSRF tokens (32 bytes = 256 bits of entropy) */
const CSRF_TOKEN_BYTES = 32;

/** Cookie name for CSRF token */
const CSRF_COOKIE_NAME = '_csrf';

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

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/**
 * Set the CSRF token as an HttpOnly cookie on the response.
 * Call this in every GET handler that renders a form.
 *
 * The cookie uses:
 *  - `httpOnly: true` — prevents JavaScript access (XSS safe)
 *  - `sameSite: 'lax'` — blocks cross-site POST but allows navigational GET
 *  - `secure` — HTTPS-only when the connection is secure (direct TLS or behind proxy)
 *  - `path: '/'` — available to all routes
 *
 * @param ctx - Koa context
 * @param token - CSRF token (from generateCsrfToken())
 */
export function setCsrfCookie(ctx: Context, token: string): void {
  ctx.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: ctx.secure,
    overwrite: true,
  });
}

/**
 * Read the CSRF token from the request cookie.
 * Call this in every POST handler to get the "expected" (trusted) token.
 *
 * @param ctx - Koa context
 * @returns The CSRF token from the cookie, or undefined if not set
 */
export function getCsrfFromCookie(ctx: Context): string | undefined {
  return ctx.cookies.get(CSRF_COOKIE_NAME) ?? undefined;
}
