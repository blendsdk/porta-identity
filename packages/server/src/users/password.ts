/**
 * Password management utilities.
 *
 * Provides password validation (NIST SP 800-63B compliant length checks),
 * Argon2id hashing, and verification. Follows the same pattern as
 * `src/clients/crypto.ts` but with password-specific naming and a
 * validation function.
 *
 * Design decisions:
 * - No complexity rules (uppercase, special chars) per NIST SP 800-63B
 *   guidance — length is the primary strength factor
 * - Argon2id with library defaults (OWASP compliant parameters)
 * - verifyPassword returns false on any error (invalid hash format, etc.)
 *   to prevent timing side-channels from leaking hash validity info
 */

import * as argon2 from 'argon2';

// ---------------------------------------------------------------------------
// Password constraints (NIST SP 800-63B)
// ---------------------------------------------------------------------------

/** Minimum password length per NIST SP 800-63B recommendation */
export const MIN_PASSWORD_LENGTH = 8;

/** Maximum password length to prevent denial-of-service via huge inputs */
export const MAX_PASSWORD_LENGTH = 128;

// ---------------------------------------------------------------------------
// Validation result type
// ---------------------------------------------------------------------------

/** Result of password validation — includes error message when invalid */
export interface PasswordValidationResult {
  isValid: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a password against length constraints.
 *
 * Checks min/max length per NIST SP 800-63B. No complexity rules
 * (uppercase, numbers, special chars) are enforced — NIST recommends
 * against them as they don't meaningfully improve security and
 * frustrate users.
 *
 * @param password - The plaintext password to validate
 * @returns Validation result with `isValid` flag and optional `error` message
 */
export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters`,
    };
  }

  return { isValid: true };
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Hash a password using Argon2id.
 *
 * Argon2id combines Argon2d (GPU-resistant) and Argon2i (side-channel
 * resistant). The argon2 library's default parameters follow OWASP
 * recommendations for password hashing.
 *
 * The returned hash string includes the algorithm, salt, and parameters
 * in PHC format — everything needed for verification.
 *
 * @param plaintext - The password to hash
 * @returns Argon2id hash string (PHC format)
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, {
    type: argon2.argon2id,
  });
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Verify a plaintext password against a stored Argon2id hash.
 *
 * Returns true if the password matches, false otherwise. Any errors
 * during verification (e.g., invalid hash format) are caught and
 * treated as a non-match to prevent timing side-channels from
 * leaking information about hash validity.
 *
 * @param hash - Stored Argon2id hash (PHC format)
 * @param plaintext - Password to verify
 * @returns true if the password matches the hash, false otherwise
 */
export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    // Return false on any error (invalid hash format, etc.)
    // to prevent timing side-channels
    return false;
  }
}
