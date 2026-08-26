/**
 * PKCE (Proof Key for Code Exchange) helpers.
 *
 * Implements RFC 7636 for the CLI login flow. PKCE prevents
 * authorization code interception attacks by binding the code
 * exchange to a cryptographically random verifier.
 *
 * INV1 resolution: PKCE functions were originally inline in
 * `src/cli/commands/login.ts`. Extracted here as standalone
 * helpers for the standalone CLI package.
 *
 * @module auth/pkce
 */

import { randomBytes, createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// PKCE Generation
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random PKCE code_verifier.
 *
 * Per RFC 7636 §4.1: 32 random bytes encoded as base64url produces
 * a 43-character string, well within the 43–128 character requirement.
 *
 * @returns Base64url-encoded code verifier
 */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Generate the PKCE code_challenge from a code_verifier using S256.
 *
 * Per RFC 7636 §4.2: code_challenge = BASE64URL(SHA256(code_verifier))
 *
 * @param verifier - The code_verifier to hash
 * @returns Base64url-encoded SHA-256 hash of the verifier
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Generate a cryptographically random state parameter.
 *
 * Used to prevent CSRF attacks on the OAuth callback. The CLI
 * generates this value before opening the browser and validates
 * it when the callback is received.
 *
 * @returns Base64url-encoded random state string
 */
export function generateState(): string {
  return randomBytes(16).toString('base64url');
}
