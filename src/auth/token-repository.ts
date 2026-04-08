/**
 * Token repository — PostgreSQL CRUD for all three token tables.
 *
 * Handles magic_link_tokens, password_reset_tokens, and invitation_tokens
 * using a shared implementation with a validated table name parameter.
 * The table name is checked against an allowlist to prevent SQL injection.
 *
 * Token lifecycle:
 *   1. insertToken()          → store hash + expiry for a user
 *   2. findValidToken()       → look up unused, non-expired token by hash
 *   3. markTokenUsed()        → set used_at = NOW() after successful verification
 *   4. invalidateUserTokens() → expire all active tokens for a user (when new token issued)
 *   5. deleteExpiredTokens()  → cleanup old rows (housekeeping)
 */

import { getPool } from '../lib/database.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Allowed token table names — used as an allowlist to prevent SQL injection */
export type TokenTable = 'magic_link_tokens' | 'password_reset_tokens' | 'invitation_tokens';

/** Row shape returned from any of the three token tables */
export interface TokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/** Raw database row shape (snake_case) from the token tables */
interface TokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Allowlist validation
// ---------------------------------------------------------------------------

/** Set of valid token table names for runtime validation */
const VALID_TABLES = new Set<string>([
  'magic_link_tokens',
  'password_reset_tokens',
  'invitation_tokens',
]);

/**
 * Validate that the table name is in the allowlist.
 * Throws immediately on invalid names — this is a programming error, not a user error.
 *
 * @param table - Table name to validate
 * @throws Error if table name is not in the allowlist
 */
function assertValidTable(table: string): void {
  if (!VALID_TABLES.has(table)) {
    throw new Error(`Invalid token table: "${table}". Must be one of: ${[...VALID_TABLES].join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

/**
 * Map a snake_case database row to a camelCase TokenRecord.
 *
 * @param row - Raw database row
 * @returns Mapped TokenRecord with camelCase properties
 */
function mapRowToToken(row: TokenRow): TokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Insert a new token into the specified table.
 *
 * @param table - Target token table (magic_link_tokens | password_reset_tokens | invitation_tokens)
 * @param userId - UUID of the user this token belongs to
 * @param tokenHash - SHA-256 hex hash of the plaintext token
 * @param expiresAt - When this token expires
 */
export async function insertToken(
  table: TokenTable,
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  assertValidTable(table);
  const pool = getPool();

  await pool.query(
    `INSERT INTO ${table} (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );

  logger.debug({ table, userId }, 'Token inserted');
}

/**
 * Find a valid (unused, not expired) token by its hash.
 *
 * Checks both `used_at IS NULL` and `expires_at > NOW()` in a single query
 * for efficiency. Returns null if no matching valid token exists.
 *
 * @param table - Target token table
 * @param tokenHash - SHA-256 hex hash to look up
 * @returns The token record if valid, or null if not found/expired/used
 */
export async function findValidToken(
  table: TokenTable,
  tokenHash: string,
): Promise<TokenRecord | null> {
  assertValidTable(table);
  const pool = getPool();

  const result = await pool.query<TokenRow>(
    `SELECT id, user_id, token_hash, expires_at, used_at, created_at
     FROM ${table}
     WHERE token_hash = $1
       AND used_at IS NULL
       AND expires_at > NOW()`,
    [tokenHash],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToToken(result.rows[0]);
}

/**
 * Mark a token as used by setting used_at = NOW().
 *
 * Called after successful token verification to prevent reuse.
 * This is a single-use pattern — once marked, the token cannot be found by findValidToken.
 *
 * @param table - Target token table
 * @param tokenId - UUID of the token row to mark
 */
export async function markTokenUsed(table: TokenTable, tokenId: string): Promise<void> {
  assertValidTable(table);
  const pool = getPool();

  await pool.query(
    `UPDATE ${table} SET used_at = NOW() WHERE id = $1`,
    [tokenId],
  );

  logger.debug({ table, tokenId }, 'Token marked as used');
}

/**
 * Delete expired or used tokens older than a given cutoff date.
 *
 * Housekeeping function to prevent token tables from growing indefinitely.
 * Removes tokens where expires_at < cutoff OR (used_at IS NOT NULL AND used_at < cutoff).
 *
 * @param table - Target token table
 * @param olderThan - Cutoff date — tokens expired/used before this are deleted
 * @returns Number of rows deleted
 */
export async function deleteExpiredTokens(table: TokenTable, olderThan: Date): Promise<number> {
  assertValidTable(table);
  const pool = getPool();

  const result = await pool.query(
    `DELETE FROM ${table}
     WHERE expires_at < $1
        OR (used_at IS NOT NULL AND used_at < $1)`,
    [olderThan],
  );

  const count = result.rowCount ?? 0;
  if (count > 0) {
    logger.info({ table, count, olderThan: olderThan.toISOString() }, 'Expired tokens cleaned up');
  }

  return count;
}

/**
 * Invalidate all unused tokens for a user in a table.
 *
 * Sets used_at = NOW() on all active (unused, non-expired) tokens.
 * Called when a new token is issued to ensure only the latest token is valid.
 * This prevents token accumulation and confusion from multiple active tokens.
 *
 * @param table - Target token table
 * @param userId - UUID of the user whose tokens should be invalidated
 */
export async function invalidateUserTokens(table: TokenTable, userId: string): Promise<void> {
  assertValidTable(table);
  const pool = getPool();

  const result = await pool.query(
    `UPDATE ${table}
     SET used_at = NOW()
     WHERE user_id = $1
       AND used_at IS NULL`,
    [userId],
  );

  const count = result.rowCount ?? 0;
  if (count > 0) {
    logger.debug({ table, userId, count }, 'User tokens invalidated');
  }
}
