/**
 * Database helper Playwright fixture — direct DB/Redis access for UI test setup.
 *
 * Provides a `dbHelpers` fixture for test operations that cannot be done
 * through the browser UI: creating tokens directly in DB, querying user
 * records, resetting rate limits in Redis, and updating user status.
 *
 * IMPORTANT: This module creates its OWN database and Redis connections,
 * separate from the Porta server. Playwright test workers run in a
 * different process than the server started by global-setup, so the
 * shared singletons (getPool/getRedis) are NOT available here.
 *
 * Key design decisions:
 *   - Uses standalone pg.Pool and ioredis.Redis (NOT shared singletons)
 *   - Connections use the same URLs from test constants
 *   - Token creation follows production flow: generate raw → SHA-256 hash → store hash → return raw
 *   - Rate limit reset uses Redis SCAN + DEL for pattern matching
 *   - Each operation is a standalone function — no stateful fixture lifecycle
 *
 * @example
 * ```ts
 * import { test, expect } from '../fixtures/test-fixtures.js';
 *
 * test('reset password with valid token', async ({ dbHelpers, testData }) => {
 *   const token = await dbHelpers.createPasswordResetToken(
 *     testData.resettableUserId,
 *     testData.orgSlug,
 *   );
 *   // Navigate to /org/auth/reset-password/{token} ...
 * });
 * ```
 */

import crypto from 'node:crypto';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from '../../helpers/constants.js';

// ---------------------------------------------------------------------------
// Standalone Connections (separate from Porta server process)
// ---------------------------------------------------------------------------

/** Lazy-initialized pg pool for test helpers */
let pool: Pool | null = null;

/** Lazy-initialized Redis client for test helpers */
let redis: Redis | null = null;

/**
 * Get or create a standalone pg.Pool for the test database.
 * This is separate from the Porta server's pool.
 */
function getTestPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
  }
  return pool;
}

/**
 * Get or create a standalone Redis client for test helpers.
 * This is separate from the Porta server's Redis client.
 */
function getTestRedis(): Redis {
  if (!redis) {
    redis = new Redis(TEST_REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: false, // Connect immediately
    });
  }
  return redis;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for token creation — control expiry and pre-expiration */
export interface TokenCreateOptions {
  /** Expiry time in minutes (default: 60 for reset, 15 for magic link, 10080 for invitation) */
  expiresIn?: number;
  /** Create an already-expired token for negative testing */
  expired?: boolean;
}

/** Minimal user record returned from DB queries */
export interface UserRecord {
  /** User UUID */
  id: string;
  /** User status (active, inactive, suspended, locked) */
  status: string;
  /** Whether the user's email has been verified */
  emailVerified: boolean;
}

// ---------------------------------------------------------------------------
// DbHelpers Interface (exposed as fixture)
// ---------------------------------------------------------------------------

/**
 * Database helper fixture interface — methods available in test functions.
 *
 * Provides direct DB/Redis access for test setup that cannot be done
 * through the browser UI alone.
 */
export interface DbHelpers {
  /** Create a password reset token, returns the raw (unhashed) token */
  createPasswordResetToken(userId: string, orgId: string, options?: TokenCreateOptions): Promise<string>;

  /** Create a magic link token, returns the raw (unhashed) token */
  createMagicLinkToken(userId: string, orgId: string, interactionUid?: string, options?: TokenCreateOptions): Promise<string>;

  /** Create an invitation token for a user email */
  createInvitationToken(email: string, orgId: string, options?: TokenCreateOptions): Promise<string>;

  /** Mark a token as used (for replay testing) */
  markTokenUsed(tokenHash: string, table: 'password_reset_tokens' | 'magic_link_tokens' | 'invitation_tokens'): Promise<void>;

  /** Get user by email within an org (by org ID) */
  getUserByEmail(email: string, orgId: string): Promise<UserRecord | null>;

  /** Update user status directly in the database */
  updateUserStatus(userId: string, status: 'active' | 'inactive' | 'suspended' | 'locked'): Promise<void>;

  /** Reset rate limit counters for a key pattern in Redis */
  resetRateLimits(pattern: string): Promise<void>;

  /** Reset all rate limits in Redis */
  resetAllRateLimits(): Promise<void>;

  /** Check if email was verified for a user */
  isEmailVerified(userId: string): Promise<boolean>;

  /** Get user's password hash (for verifying password was actually changed) */
  getUserPasswordHash(userId: string): Promise<string>;

  /** Get organization ID by slug */
  getOrgIdBySlug(slug: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographic token and its SHA-256 hash.
 *
 * Follows the same pattern as src/auth/tokens.ts:
 * - 32 bytes of randomness → base64url plaintext
 * - SHA-256 hex digest for database storage
 *
 * @returns Object with plaintext (for URLs) and hash (for DB)
 */
function generateTokenPair(): { plaintext: string; hash: string } {
  const plaintext = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, hash };
}

/**
 * Calculate token expiry date based on options.
 *
 * @param defaultMinutes - Default expiry in minutes if not specified
 * @param options - Token creation options (expiresIn, expired)
 * @returns Date when the token expires
 */
function calculateExpiry(defaultMinutes: number, options?: TokenCreateOptions): Date {
  if (options?.expired) {
    // Already expired — 1 hour in the past
    return new Date(Date.now() - 60 * 60 * 1000);
  }
  const minutes = options?.expiresIn ?? defaultMinutes;
  return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Create a password reset token in the database.
 *
 * Generates a raw token, SHA-256 hashes it, stores the hash in
 * password_reset_tokens, and returns the raw token for use in URLs.
 *
 * @param userId - UUID of the user requesting the reset
 * @param _orgId - Organization ID (unused but kept for interface consistency)
 * @param options - Expiry control options
 * @returns Raw plaintext token for constructing the reset URL
 */
async function createPasswordResetToken(
  userId: string,
  _orgId: string,
  options?: TokenCreateOptions,
): Promise<string> {
  const db = getTestPool();
  const { plaintext, hash } = generateTokenPair();
  const expiresAt = calculateExpiry(60, options); // Default: 60 minutes

  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt],
  );

  return plaintext;
}

/**
 * Create a magic link token in the database.
 *
 * @param userId - UUID of the user
 * @param _orgId - Organization ID (unused but kept for interface consistency)
 * @param _interactionUid - Optional OIDC interaction UID (unused in DB, but part of the flow)
 * @param options - Expiry control options
 * @returns Raw plaintext token for constructing the magic link URL
 */
async function createMagicLinkToken(
  userId: string,
  _orgId: string,
  _interactionUid?: string,
  options?: TokenCreateOptions,
): Promise<string> {
  const db = getTestPool();
  const { plaintext, hash } = generateTokenPair();
  const expiresAt = calculateExpiry(15, options); // Default: 15 minutes

  await db.query(
    `INSERT INTO magic_link_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt],
  );

  return plaintext;
}

/**
 * Create an invitation token in the database.
 *
 * For invitation tokens, we need the user ID. The caller should look up
 * the user by email first if they only have the email address.
 *
 * @param email - Email of the invited user (used to look up user_id)
 * @param orgId - Organization ID to find the user in
 * @param options - Expiry control options
 * @returns Raw plaintext token for constructing the invitation URL
 */
async function createInvitationToken(
  email: string,
  orgId: string,
  options?: TokenCreateOptions,
): Promise<string> {
  const db = getTestPool();
  const { plaintext, hash } = generateTokenPair();
  const expiresAt = calculateExpiry(10080, options); // Default: 7 days (10080 minutes)

  // Look up user by email + org to get their ID
  const userResult = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 AND organization_id = $2`,
    [email, orgId],
  );
  if (userResult.rows.length === 0) {
    throw new Error(`User not found: ${email} in org ${orgId}`);
  }
  const userId = userResult.rows[0].id;

  await db.query(
    `INSERT INTO invitation_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt],
  );

  return plaintext;
}

/**
 * Mark a token as used by setting used_at = NOW().
 *
 * Used for replay attack testing — marks a token as already consumed
 * so subsequent verification attempts should fail.
 *
 * @param tokenHash - SHA-256 hash of the token to mark
 * @param table - Which token table to update
 */
async function markTokenUsed(
  tokenHash: string,
  table: 'password_reset_tokens' | 'magic_link_tokens' | 'invitation_tokens',
): Promise<void> {
  // Validate table name against allowlist to prevent SQL injection
  const validTables = new Set(['password_reset_tokens', 'magic_link_tokens', 'invitation_tokens']);
  if (!validTables.has(table)) {
    throw new Error(`Invalid token table: ${table}`);
  }

  const db = getTestPool();
  await db.query(`UPDATE ${table} SET used_at = NOW() WHERE token_hash = $1`, [tokenHash]);
}

/**
 * Get a user record by email within an organization.
 *
 * @param email - User's email address
 * @param orgId - Organization ID
 * @returns Minimal user record, or null if not found
 */
async function getUserByEmail(email: string, orgId: string): Promise<UserRecord | null> {
  const db = getTestPool();
  const result = await db.query<{ id: string; status: string; email_verified: boolean }>(
    `SELECT id, status, email_verified FROM users WHERE email = $1 AND organization_id = $2`,
    [email, orgId],
  );

  if (result.rows.length === 0) return null;

  return {
    id: result.rows[0].id,
    status: result.rows[0].status,
    emailVerified: result.rows[0].email_verified,
  };
}

/**
 * Update a user's status directly in the database.
 *
 * Bypasses the service layer's status transition validation — useful
 * for setting up test preconditions (e.g., suspending a user before test).
 *
 * @param userId - UUID of the user to update
 * @param status - New status value
 */
async function updateUserStatus(
  userId: string,
  status: 'active' | 'inactive' | 'suspended' | 'locked',
): Promise<void> {
  const db = getTestPool();
  await db.query(`UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`, [status, userId]);
}

/**
 * Reset rate limit counters in Redis matching a key pattern.
 *
 * Uses SCAN to find matching keys (non-blocking), then DEL to remove them.
 * This is a no-op if no matching keys exist.
 *
 * @param pattern - Redis key pattern to match (e.g., "rate:login:*")
 */
async function resetRateLimits(pattern: string): Promise<void> {
  const r = getTestRedis();
  let cursor = '0';

  // Use SCAN to find keys matching the pattern (non-blocking)
  do {
    const [nextCursor, keys] = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;

    if (keys.length > 0) {
      await r.del(...keys);
    }
  } while (cursor !== '0');
}

/**
 * Reset ALL rate limit counters in Redis.
 *
 * Matches the common rate limit key prefix pattern used by Porta.
 * Call this before tests that exercise rate limiting to ensure clean state.
 */
async function resetAllRateLimits(): Promise<void> {
  await resetRateLimits('rate:*');
}

/**
 * Check if a user's email has been verified.
 *
 * @param userId - UUID of the user
 * @returns true if email_verified is true in the database
 */
async function isEmailVerified(userId: string): Promise<boolean> {
  const db = getTestPool();
  const result = await db.query<{ email_verified: boolean }>(
    `SELECT email_verified FROM users WHERE id = $1`,
    [userId],
  );

  if (result.rows.length === 0) {
    throw new Error(`User not found: ${userId}`);
  }

  return result.rows[0].email_verified;
}

/**
 * Get the password hash for a user.
 *
 * Used to verify that a password was actually changed after a reset flow.
 * Compare the hash before and after the reset to confirm the change.
 *
 * @param userId - UUID of the user
 * @returns The Argon2id password hash string
 */
async function getUserPasswordHash(userId: string): Promise<string> {
  const db = getTestPool();
  const result = await db.query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [userId],
  );

  if (result.rows.length === 0) {
    throw new Error(`User not found: ${userId}`);
  }

  return result.rows[0].password_hash;
}

/**
 * Get an organization's ID by its slug.
 *
 * Used to resolve org slugs (from testData) to UUIDs for DB operations.
 *
 * @param slug - Organization slug
 * @returns Organization UUID
 * @throws Error if organization not found
 */
async function getOrgIdBySlug(slug: string): Promise<string> {
  const db = getTestPool();
  const result = await db.query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1`,
    [slug],
  );

  if (result.rows.length === 0) {
    throw new Error(`Organization not found: ${slug}`);
  }

  return result.rows[0].id;
}

// ---------------------------------------------------------------------------
// Fixture Factory
// ---------------------------------------------------------------------------

/**
 * Create a DbHelpers instance with all methods bound.
 *
 * Used by the Playwright fixture extension in test-fixtures.ts.
 * Returns a plain object implementing the DbHelpers interface.
 *
 * @returns DbHelpers instance ready for use in tests
 */
export function createDbHelpers(): DbHelpers {
  return {
    createPasswordResetToken,
    createMagicLinkToken,
    createInvitationToken,
    markTokenUsed,
    getUserByEmail,
    updateUserStatus,
    resetRateLimits,
    resetAllRateLimits,
    isEmailVerified,
    getUserPasswordHash,
    getOrgIdBySlug,
  };
}
