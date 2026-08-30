/**
 * Secret repository — PostgreSQL data access for client_secrets table.
 *
 * Manages the storage of hashed client secrets. The plaintext secret
 * is NEVER stored — only the Argon2id hash. The secret_hash field
 * is only accessible here in the repository layer; the mapRowToClientSecret
 * function intentionally excludes it from the domain model.
 *
 * Key operations:
 * - Insert hashed secret
 * - List secrets (metadata only, no hashes)
 * - Find active secrets with hashes (for verification only)
 * - Revoke secrets
 * - Update last_used_at timestamp
 * - Cleanup expired secrets
 */

import { getPool, runDatabaseTransaction } from '../lib/database.js';
import { ClientNotFoundError, ClientValidationError } from './errors.js';
import type { ClientSecret, ClientSecretRow } from './types.js';
import { mapRowToClientSecret } from './types.js';

// ===========================================================================
// Insert
// ===========================================================================

/** Data required to insert a new secret */
export interface InsertSecretData {
  /** Internal UUID of the client that owns the credential. */
  clientId: string;
  /** Argon2id hash used only by bounded legacy verification. */
  secretHash: string;
  /** Indexed SHA-256 digest used for modern high-entropy credential matching. */
  secretSha256: string | null;
  /** Optional operator-facing label stored with the credential metadata. */
  label: string | null;
  /** Optional instant after which the credential is no longer active. */
  expiresAt: Date | null;
}

/**
 * Insert a new client secret.
 *
 * Stores the Argon2id hash — never the plaintext. The client row is locked while
 * counting and inserting so concurrent callers cannot exceed ten active,
 * unexpired secrets.
 *
 * @param data - Secret data including the hash
 * @returns The created secret metadata (without hash)
 * @throws ClientNotFoundError when the client is absent, public, or revoked
 * @throws ClientValidationError when the client already has ten active secrets
 */
export async function insertSecret(data: InsertSecretData): Promise<ClientSecret> {
  return runDatabaseTransaction(async () => {
    const db = getPool();
    const parent = await db.query<{ id: string; client_type: string; status: string }>(
      'SELECT id, client_type, status FROM clients WHERE id = $1 FOR UPDATE',
      [data.clientId],
    );
    const eligible = parent.rows[0];
    if (
      eligible === undefined ||
      eligible.client_type !== 'confidential' ||
      eligible.status === 'revoked'
    ) {
      throw new ClientNotFoundError(data.clientId);
    }
    const active = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM client_secrets
       WHERE client_id = $1
         AND status = 'active'
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [data.clientId],
    );
    if (Number(active.rows[0]?.count ?? '0') >= 10) {
      throw new ClientValidationError('Client secret active limit reached');
    }
    const result = await db.query<ClientSecretRow>(
      `INSERT INTO client_secrets (client_id, secret_hash, secret_sha256, label, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.clientId, data.secretHash, data.secretSha256, data.label, data.expiresAt],
    );
    return mapRowToClientSecret(result.rows[0]);
  });
}

// ===========================================================================
// Find / List
// ===========================================================================

/**
 * List all secrets for a client (metadata only, no hashes).
 *
 * @param clientId - Client internal UUID
 * @returns Array of secret metadata
 */
export async function listSecretsByClient(clientId: string): Promise<ClientSecret[]> {
  const pool = getPool();

  const result = await pool.query<ClientSecretRow>(
    `SELECT * FROM client_secrets WHERE client_id = $1 ORDER BY created_at DESC`,
    [clientId],
  );

  return result.rows.map(mapRowToClientSecret);
}

/**
 * Find a specific secret by ID.
 *
 * @param clientId - Authoritative parent client UUID
 * @param id - Secret UUID
 * @returns Secret metadata or null
 */
export async function findSecretById(clientId: string, id: string): Promise<ClientSecret | null> {
  const pool = getPool();

  const result = await pool.query<ClientSecretRow>(
    'SELECT * FROM client_secrets WHERE client_id = $1 AND id = $2',
    [clientId, id],
  );

  if (result.rows.length === 0) return null;
  return mapRowToClientSecret(result.rows[0]);
}

/**
 * Get active secret hashes for verification.
 *
 * This is the ONLY function that returns secret_hash values.
 * Used exclusively by the secret service for Argon2id verification.
 * Returns secrets that are active AND not expired.
 *
 * @param clientId - Client internal UUID
 * @returns Array of {id, hash} pairs for active secrets
 */
export async function getActiveSecretHashes(
  clientId: string,
): Promise<Array<{ id: string; hash: string }>> {
  const pool = getPool();

  const result = await pool.query<{ id: string; secret_hash: string }>(
    `SELECT id, secret_hash FROM client_secrets
     WHERE client_id = $1
       AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC`,
    [clientId],
  );

  return result.rows.map((row) => ({ id: row.id, hash: row.secret_hash }));
}

// ===========================================================================
// Update
// ===========================================================================

/**
 * Revoke a secret (set status = 'revoked').
 *
 * This is a permanent operation — revoked secrets cannot be reactivated.
 *
 * @param clientId - Authoritative parent client UUID
 * @param id - Secret UUID
 * @returns Updated secret metadata, or null if absent, cross-parent, or already revoked
 */
export async function revokeSecret(clientId: string, id: string): Promise<ClientSecret | null> {
  const pool = getPool();

  const result = await pool.query<ClientSecretRow>(
    `UPDATE client_secrets SET status = 'revoked'
     WHERE client_id = $1 AND id = $2 AND status = 'active'
     RETURNING *`,
    [clientId, id],
  );

  if (result.rows.length === 0) return null;
  return mapRowToClientSecret(result.rows[0]);
}

/**
 * Update the last_used_at timestamp for a secret.
 *
 * Called after successful secret verification to track usage.
 *
 * @param id - Secret UUID
 */
export async function updateLastUsedAt(id: string): Promise<void> {
  const pool = getPool();

  await pool.query(`UPDATE client_secrets SET last_used_at = NOW() WHERE id = $1`, [id]);
}

// ===========================================================================
// Cleanup
// ===========================================================================

/**
 * Delete expired secrets that have been expired for more than the given days.
 *
 * Only deletes secrets where expires_at is in the past by at least `retentionDays`.
 * This prevents premature deletion of recently-expired secrets that might
 * still appear in audit logs.
 *
 * @param retentionDays - Number of days to retain expired secrets (default: 30)
 * @returns Number of deleted secrets
 */
export async function cleanupExpiredSecrets(retentionDays: number = 30): Promise<number> {
  const pool = getPool();

  const result = await pool.query(
    `DELETE FROM client_secrets
     WHERE status = 'revoked'
       OR (expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '1 day' * $1)`,
    [retentionDays],
  );

  return result.rowCount ?? 0;
}

/**
 * Get the SHA-256 hash of the most recent active, non-expired secret.
 *
 * Used by findForOidc() to include the SHA-256 hash as client_secret
 * in oidc-provider metadata. Returns null if no active secret has a
 * SHA-256 hash (e.g., secrets created before migration 013).
 *
 * @param clientId - Client internal UUID
 * @returns SHA-256 hex hash string, or null if none available
 */
export async function getLatestActiveSha256(clientId: string): Promise<string | null> {
  const pool = getPool();

  const result = await pool.query<{ secret_sha256: string }>(
    `SELECT secret_sha256 FROM client_secrets
     WHERE client_id = $1
       AND status = 'active'
       AND secret_sha256 IS NOT NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [clientId],
  );

  if (result.rows.length === 0) return null;
  return result.rows[0].secret_sha256;
}

/**
 * Find an active modern secret by its indexed SHA-256 value.
 *
 * @param clientId - Parent client UUID
 * @param secretSha256 - SHA-256 digest of the presented credential
 * @returns Matching secret ID, or null when no active credential matches
 */
export async function findActiveSecretIdBySha256(
  clientId: string,
  secretSha256: string,
): Promise<string | null> {
  const result = await getPool().query<{ id: string }>(
    `SELECT id FROM client_secrets
     WHERE client_id = $1
       AND secret_sha256 = $2
       AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [clientId, secretSha256],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Load at most eleven active Argon2-only credentials so callers can reject over-limit data.
 *
 * @param clientId - Parent client UUID
 * @returns Active legacy secret identifiers and hashes, newest first
 */
export async function getActiveLegacySecretHashes(
  clientId: string,
): Promise<Array<{ id: string; hash: string }>> {
  const result = await getPool().query<{ id: string; secret_hash: string }>(
    `SELECT id, secret_hash FROM client_secrets
     WHERE client_id = $1
       AND secret_sha256 IS NULL
       AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC
     LIMIT 11`,
    [clientId],
  );
  return result.rows.map((row) => ({ id: row.id, hash: row.secret_hash }));
}

/**
 * Count active secrets for a client.
 *
 * @param clientId - Client internal UUID
 * @returns Number of active (non-revoked, non-expired) secrets
 */
export async function countActiveSecrets(clientId: string): Promise<number> {
  const pool = getPool();

  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM client_secrets
     WHERE client_id = $1
       AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [clientId],
  );

  return parseInt(result.rows[0].count, 10);
}
