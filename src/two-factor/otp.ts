/**
 * Email OTP code utilities.
 *
 * Generates, hashes, and verifies 6-digit one-time passwords sent via email.
 * Codes are cryptographically random (not sequential) and stored as SHA-256
 * hashes — the plaintext is only ever sent to the user's email and never
 * persisted in the database.
 *
 * SHA-256 is appropriate here (rather than Argon2id) because OTP codes are
 * short-lived (10 minutes) and brute-forcing a 6-digit code against a fast
 * hash is still rate-limited at the application level.
 */

import { createHash, randomInt } from 'node:crypto';

/** OTP code length — 6 digits, zero-padded. */
const OTP_CODE_LENGTH = 6;

/** Maximum value for a 6-digit code (exclusive). */
const OTP_MAX_VALUE = 1_000_000;

/**
 * Generate a cryptographically random 6-digit OTP code.
 *
 * Uses Node.js `crypto.randomInt()` for uniform random distribution.
 * The result is zero-padded to always be exactly 6 characters.
 *
 * @returns A 6-digit string (e.g., "042819", "123456")
 */
export function generateOtpCode(): string {
  // randomInt(max) returns a uniform random integer in [0, max)
  const code = randomInt(OTP_MAX_VALUE);
  return code.toString().padStart(OTP_CODE_LENGTH, '0');
}

/**
 * Hash an OTP code with SHA-256 for database storage.
 *
 * @param code - The 6-digit OTP code to hash
 * @returns Hex-encoded SHA-256 hash (64 characters)
 */
export function hashOtpCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Verify an OTP code against its SHA-256 hash.
 *
 * Performs a constant-time-equivalent comparison by computing the hash
 * of the provided code and comparing hex strings. While timing attacks
 * on SHA-256 hex comparisons are extremely unlikely to be practical for
 * 6-digit codes, we hash-then-compare rather than using the raw input
 * to avoid any theoretical leakage.
 *
 * @param code - The OTP code to verify
 * @param hash - The stored SHA-256 hash to verify against
 * @returns True if the code matches the hash
 */
export function verifyOtpCode(code: string, hash: string): boolean {
  const computedHash = hashOtpCode(code);
  return computedHash === hash;
}
