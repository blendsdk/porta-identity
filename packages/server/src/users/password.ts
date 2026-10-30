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

import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';

// ---------------------------------------------------------------------------
// Password constraints (NIST SP 800-63B)
// ---------------------------------------------------------------------------

/** Minimum password length per NIST SP 800-63B recommendation */
export const MIN_PASSWORD_LENGTH = 8;

/** Maximum password length to prevent denial-of-service via huge inputs */
export const MAX_PASSWORD_LENGTH = 128;

/** Process-owned dummy hash used when no eligible account password exists. */
let dummyPasswordHash: string | null = null;

/** Shared initialization promise preventing duplicate concurrent Argon2id work. */
let dummyPasswordHashInitialization: Promise<string> | null = null;

// ---------------------------------------------------------------------------
// Validation result type
// ---------------------------------------------------------------------------

/** Closed internal reasons used to select localized messages without matching English text. */
export enum PasswordValidationFailureReason {
  /** The password contains fewer characters than the existing minimum. */
  TooShort = 'too_short',
  /** The password exceeds the existing maximum length. */
  TooLong = 'too_long',
}

/** Result of password validation, retaining the legacy English message for existing callers. */
export interface PasswordValidationResult {
  /** Whether the password satisfies the existing length policy. */
  isValid: boolean;
  /** Legacy English validation message, present only on failure. */
  error?: string;
  /** Internal presentation discriminator; absent on successful validation. */
  reason?: PasswordValidationFailureReason;
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
 * @returns Validation flag plus the legacy English error and internal reason on failure
 * @example
 * const result = validatePassword(candidatePassword);
 * if (!result.isValid) selectLocalizedMessage(result.reason);
 */
export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      reason: PasswordValidationFailureReason.TooShort,
    };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters`,
      reason: PasswordValidationFailureReason.TooLong,
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

/**
 * Initialize the process-owned Argon2id dummy hash.
 *
 * Startup awaits this operation so an authentication process never serves requests with a cheap
 * missing-account branch. Repeated calls are idempotent for the lifetime of the process.
 */
export async function initializeDummyPasswordHash(): Promise<void> {
  if (dummyPasswordHash !== null) return;
  dummyPasswordHashInitialization ??= hashPassword(randomBytes(32).toString('base64url'));
  dummyPasswordHash = await dummyPasswordHashInitialization;
}

/**
 * Read the initialized process-owned dummy hash.
 *
 * @returns Argon2id hash with no authentication authority.
 * @throws Error when startup did not initialize the dummy hash.
 */
export function getDummyPasswordHash(): string {
  if (dummyPasswordHash === null) {
    throw new Error('Dummy password hash has not been initialized');
  }
  return dummyPasswordHash;
}

/**
 * Return the process-owned dummy hash, initializing it when an embedded app bypassed the entry
 * point. Production startup still awaits initialization before listening.
 *
 * @returns Initialized non-authoritative Argon2id hash.
 */
export async function ensureDummyPasswordHash(): Promise<string> {
  await initializeDummyPasswordHash();
  return getDummyPasswordHash();
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
