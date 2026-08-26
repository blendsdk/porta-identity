/**
 * Token generation and hashing utilities.
 *
 * Used by all token-based auth flows: magic links, password resets, and invitations.
 * Tokens are generated as cryptographically secure random bytes, then hashed with
 * SHA-256 for storage. The plaintext goes in the email/URL; only the hash is stored
 * in the database — so a DB breach never leaks usable tokens.
 *
 * @example
 *   const { plaintext, hash } = generateToken();
 *   // plaintext → email link
 *   // hash → INSERT INTO magic_link_tokens (token_hash, ...)
 *
 *   // Later, when verifying:
 *   const lookupHash = hashToken(plaintextFromUrl);
 *   // SELECT ... WHERE token_hash = lookupHash
 */

import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of generating a new token — plaintext for the URL, hash for the DB */
export interface GeneratedToken {
  /** Base64url-encoded plaintext — included in the email/URL sent to the user */
  plaintext: string;
  /** SHA-256 hex digest — stored in the database for lookup */
  hash: string;
}

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically secure token.
 *
 * Returns both the plaintext (for the email/URL) and the SHA-256 hash (for DB storage).
 * Uses 32 bytes of randomness (256 bits) which provides ample collision resistance
 * and brute-force protection.
 *
 * @returns Object with `plaintext` (base64url) and `hash` (hex SHA-256)
 */
export function generateToken(): GeneratedToken {
  const plaintext = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, hash };
}

// ---------------------------------------------------------------------------
// Token hashing
// ---------------------------------------------------------------------------

/**
 * Hash a plaintext token for database lookup.
 *
 * Used during verification — the user provides the plaintext via URL, we hash it
 * and look up the matching row in the token table.
 *
 * @param plaintext - The base64url token string from the URL
 * @returns SHA-256 hex digest for database lookup
 */
export function hashToken(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}
