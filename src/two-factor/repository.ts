/**
 * Two-factor authentication repository — PostgreSQL data access layer.
 *
 * Provides CRUD operations for the three 2FA tables:
 *   - user_totp: TOTP configuration per user (encrypted secrets)
 *   - two_factor_otp_codes: Email OTP codes (SHA-256 hashed, short-lived)
 *   - two_factor_recovery_codes: Single-use recovery codes (Argon2id hashed)
 *
 * Each function acquires the pool via `getPool()` and returns mapped
 * objects using the mapping functions from types.ts. Follows the same
 * patterns as the organization and user repositories.
 */

import { getPool } from '../lib/database.js';
import type {
  UserTotp,
  UserTotpRow,
  OtpCode,
  OtpCodeRow,
  RecoveryCode,
  RecoveryCodeRow,
  InsertTotpData,
} from './types.js';
import {
  mapRowToUserTotp,
  mapRowToOtpCode,
  mapRowToRecoveryCode,
} from './types.js';

// ===========================================================================
// TOTP operations
// ===========================================================================

/**
 * Insert a new TOTP configuration for a user.
 *
 * The encrypted secret, IV, and auth tag are stored as-is (hex-encoded
 * strings from the crypto module). The UNIQUE constraint on user_id
 * ensures only one TOTP config per user.
 *
 * @param data - TOTP configuration data (secrets already encrypted)
 * @returns The newly created TOTP configuration
 * @throws If user already has a TOTP config (unique constraint violation)
 */
export async function insertTotp(data: InsertTotpData): Promise<UserTotp> {
  const pool = getPool();

  const result = await pool.query<UserTotpRow>(
    `INSERT INTO user_totp (
       user_id, encrypted_secret, encryption_iv, encryption_tag,
       algorithm, digits, period
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.userId,
      data.encryptedSecret,
      data.encryptionIv,
      data.encryptionTag,
      data.algorithm ?? 'SHA1',
      data.digits ?? 6,
      data.period ?? 30,
    ],
  );

  return mapRowToUserTotp(result.rows[0]);
}

/**
 * Find TOTP configuration for a user.
 *
 * Returns the encrypted TOTP config if one exists, or null.
 * The caller must decrypt the secret using the crypto module.
 *
 * @param userId - User UUID
 * @returns TOTP configuration or null if not configured
 */
export async function findTotpByUserId(userId: string): Promise<UserTotp | null> {
  const pool = getPool();

  const result = await pool.query<UserTotpRow>(
    'SELECT * FROM user_totp WHERE user_id = $1',
    [userId],
  );

  if (result.rows.length === 0) return null;
  return mapRowToUserTotp(result.rows[0]);
}

/**
 * Mark a user's TOTP configuration as verified.
 *
 * Called after the user successfully enters their first TOTP code
 * during setup. This confirms that the user's authenticator app
 * is correctly configured.
 *
 * @param userId - User UUID
 */
export async function markTotpVerified(userId: string): Promise<void> {
  const pool = getPool();

  await pool.query(
    'UPDATE user_totp SET verified = true WHERE user_id = $1',
    [userId],
  );
}

/**
 * Delete a user's TOTP configuration.
 *
 * Called when disabling 2FA or resetting TOTP setup.
 * The CASCADE on user_id means this is also cleaned up if the user is deleted.
 *
 * @param userId - User UUID
 */
export async function deleteTotp(userId: string): Promise<void> {
  const pool = getPool();

  await pool.query(
    'DELETE FROM user_totp WHERE user_id = $1',
    [userId],
  );
}

// ===========================================================================
// OTP code operations
// ===========================================================================

/**
 * Insert a new email OTP code.
 *
 * The code is stored as a SHA-256 hash — the plaintext is only sent
 * via email. The expires_at timestamp determines when the code becomes
 * invalid (typically 10 minutes from creation).
 *
 * @param userId - User UUID
 * @param codeHash - SHA-256 hex hash of the 6-digit OTP code
 * @param expiresAt - Expiration timestamp
 * @returns The newly created OTP code record
 */
export async function insertOtpCode(
  userId: string,
  codeHash: string,
  expiresAt: Date,
): Promise<OtpCode> {
  const pool = getPool();

  const result = await pool.query<OtpCodeRow>(
    `INSERT INTO two_factor_otp_codes (user_id, code_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, codeHash, expiresAt],
  );

  return mapRowToOtpCode(result.rows[0]);
}

/**
 * Find all active (unused, not expired) OTP codes for a user.
 *
 * Returns codes that are both unused (used_at IS NULL) and not yet
 * expired (expires_at > NOW()). Ordered by creation time descending
 * so the most recent code is first.
 *
 * @param userId - User UUID
 * @returns Array of active OTP codes (may be empty)
 */
export async function findActiveOtpCodes(userId: string): Promise<OtpCode[]> {
  const pool = getPool();

  const result = await pool.query<OtpCodeRow>(
    `SELECT * FROM two_factor_otp_codes
     WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [userId],
  );

  return result.rows.map(mapRowToOtpCode);
}

/**
 * Mark an OTP code as used.
 *
 * Sets the used_at timestamp to the current time, preventing reuse.
 * Called after successful verification.
 *
 * @param codeId - OTP code UUID
 */
export async function markOtpCodeUsed(codeId: string): Promise<void> {
  const pool = getPool();

  await pool.query(
    'UPDATE two_factor_otp_codes SET used_at = NOW() WHERE id = $1',
    [codeId],
  );
}

/**
 * Delete expired OTP codes for a user.
 *
 * Cleans up codes that have passed their expires_at timestamp or
 * have already been used. Prevents table bloat over time.
 *
 * @param userId - User UUID
 * @returns Number of codes deleted
 */
export async function deleteExpiredOtpCodes(userId: string): Promise<number> {
  const pool = getPool();

  const result = await pool.query(
    `DELETE FROM two_factor_otp_codes
     WHERE user_id = $1 AND (expires_at <= NOW() OR used_at IS NOT NULL)`,
    [userId],
  );

  return result.rowCount ?? 0;
}

/**
 * Count active (unused, not expired) OTP codes for a user.
 *
 * Used for rate limiting — prevents generating too many codes
 * in a short time period.
 *
 * @param userId - User UUID
 * @returns Number of active OTP codes
 */
export async function countActiveOtpCodes(userId: string): Promise<number> {
  const pool = getPool();

  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM two_factor_otp_codes
     WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [userId],
  );

  return parseInt(result.rows[0].count, 10);
}

// ===========================================================================
// Recovery code operations
// ===========================================================================

/**
 * Insert a batch of recovery codes for a user.
 *
 * Inserts all code hashes in a single query using a multi-row VALUES
 * clause for efficiency. Called during 2FA setup and regeneration.
 *
 * @param userId - User UUID
 * @param codeHashes - Array of Argon2id hashes of recovery codes
 */
export async function insertRecoveryCodes(
  userId: string,
  codeHashes: string[],
): Promise<void> {
  if (codeHashes.length === 0) return;

  const pool = getPool();

  // Build multi-row VALUES clause: ($1, $2), ($1, $3), ($1, $4), ...
  // $1 is always the userId; each hash gets its own parameter
  const valuePlaceholders: string[] = [];
  const params: unknown[] = [userId];

  for (let i = 0; i < codeHashes.length; i++) {
    valuePlaceholders.push(`($1, $${i + 2})`);
    params.push(codeHashes[i]);
  }

  await pool.query(
    `INSERT INTO two_factor_recovery_codes (user_id, code_hash)
     VALUES ${valuePlaceholders.join(', ')}`,
    params,
  );
}

/**
 * Find all unused recovery codes for a user.
 *
 * Returns codes where used_at IS NULL. The caller iterates these
 * and verifies each hash to find a match (since Argon2id hashes
 * include random salt, we can't do a direct DB lookup).
 *
 * @param userId - User UUID
 * @returns Array of unused recovery codes (may be empty)
 */
export async function findUnusedRecoveryCodes(userId: string): Promise<RecoveryCode[]> {
  const pool = getPool();

  const result = await pool.query<RecoveryCodeRow>(
    `SELECT * FROM two_factor_recovery_codes
     WHERE user_id = $1 AND used_at IS NULL
     ORDER BY created_at ASC`,
    [userId],
  );

  return result.rows.map(mapRowToRecoveryCode);
}

/**
 * Mark a recovery code as used.
 *
 * Sets the used_at timestamp to the current time, preventing reuse.
 * Recovery codes are single-use — once used, they cannot be used again.
 *
 * @param codeId - Recovery code UUID
 */
export async function markRecoveryCodeUsed(codeId: string): Promise<void> {
  const pool = getPool();

  await pool.query(
    'UPDATE two_factor_recovery_codes SET used_at = NOW() WHERE id = $1',
    [codeId],
  );
}

/**
 * Delete all recovery codes for a user.
 *
 * Called when disabling 2FA or regenerating recovery codes
 * (old codes are deleted, then new ones are inserted).
 *
 * @param userId - User UUID
 */
export async function deleteAllRecoveryCodes(userId: string): Promise<void> {
  const pool = getPool();

  await pool.query(
    'DELETE FROM two_factor_recovery_codes WHERE user_id = $1',
    [userId],
  );
}

/**
 * Count unused recovery codes for a user.
 *
 * Used in the 2FA status response to show how many codes remain.
 *
 * @param userId - User UUID
 * @returns Number of unused recovery codes
 */
export async function countUnusedRecoveryCodes(userId: string): Promise<number> {
  const pool = getPool();

  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM two_factor_recovery_codes
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );

  return parseInt(result.rows[0].count, 10);
}
