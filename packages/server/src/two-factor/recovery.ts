/**
 * Recovery code utilities.
 *
 * Generates, hashes, and verifies single-use recovery codes for 2FA backup.
 * Users receive 10 codes during 2FA setup, each in XXXX-XXXX format
 * (8 alphanumeric characters). Codes are hashed with Argon2id before storage
 * because they are long-lived and relatively high-entropy — they must resist
 * offline brute-force attacks if the database is compromised.
 *
 * Uses the same Argon2id parameters as password hashing (via the `argon2`
 * library's defaults) for consistency and security.
 */

import { hash, verify } from 'argon2';
import { randomBytes } from 'node:crypto';

/** Default number of recovery codes to generate. */
const DEFAULT_RECOVERY_CODE_COUNT = 10;

/**
 * Characters used in recovery codes — uppercase alphanumeric, excluding
 * visually ambiguous characters (0/O, 1/I/L) for easier manual entry.
 */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Length of each half of a recovery code (XXXX-XXXX). */
const HALF_LENGTH = 4;

/**
 * Generate a set of recovery codes in XXXX-XXXX format.
 *
 * Each code is 8 characters (split into two 4-character groups with a
 * dash separator) drawn from an unambiguous alphanumeric alphabet.
 * The dash is cosmetic and stripped during verification.
 *
 * @param count - Number of codes to generate (default: 10)
 * @returns Array of plaintext recovery codes
 */
export function generateRecoveryCodes(count: number = DEFAULT_RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    codes.push(generateSingleCode());
  }

  return codes;
}

/**
 * Hash a recovery code with Argon2id for database storage.
 *
 * The code is normalized (uppercase, dash stripped) before hashing
 * so that verification is case-insensitive and dash-insensitive.
 *
 * @param code - Plaintext recovery code (e.g., "ABCD-1234")
 * @returns Argon2id hash string
 */
export async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = normalizeCode(code);
  return hash(normalized);
}

/**
 * Verify a recovery code against an Argon2id hash.
 *
 * The code is normalized before verification so that "abcd-1234",
 * "ABCD1234", and "ABCD-1234" are all equivalent.
 *
 * @param code - Plaintext recovery code to verify
 * @param codeHash - Stored Argon2id hash
 * @returns True if the code matches the hash
 */
export async function verifyRecoveryCode(code: string, codeHash: string): Promise<boolean> {
  const normalized = normalizeCode(code);
  try {
    return await verify(codeHash, normalized);
  } catch {
    // Argon2id verify throws on malformed hashes — treat as non-match
    return false;
  }
}

/**
 * Generate a single recovery code in XXXX-XXXX format.
 *
 * Uses crypto.randomBytes to generate random indices into the
 * character set, then formats as two 4-character groups.
 */
function generateSingleCode(): string {
  const totalLength = HALF_LENGTH * 2;
  const bytes = randomBytes(totalLength);
  let code = '';

  for (let i = 0; i < totalLength; i++) {
    // Use modulo to map each random byte to a character index.
    // Slight bias is negligible for this use case (recovery codes
    // don't need perfectly uniform distribution).
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }

  // Insert dash between halves: "ABCD1234" → "ABCD-1234"
  return `${code.slice(0, HALF_LENGTH)}-${code.slice(HALF_LENGTH)}`;
}

/**
 * Normalize a recovery code for hashing/verification.
 * Converts to uppercase and strips dashes so that entry format
 * doesn't matter ("abcd-1234" === "ABCD1234" === "ABCD-1234").
 *
 * @param code - Raw recovery code input
 * @returns Normalized uppercase string without dashes
 */
function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/-/g, '');
}
