/**
 * PostgreSQL adapter for node-oidc-provider.
 *
 * Stores long-lived OIDC artifacts (AccessToken, RefreshToken, Grant, DeviceCode)
 * in the oidc_payloads table. Uses parameterized queries to prevent SQL injection.
 *
 * Table schema (from migration 010_oidc_adapter.sql):
 *   id          VARCHAR(255) NOT NULL  — artifact ID
 *   type        VARCHAR(50) NOT NULL   — model name (e.g., 'AccessToken')
 *   payload     JSONB NOT NULL         — full OIDC artifact payload
 *   grant_id    VARCHAR(255)           — for grant-based revocation
 *   user_code   VARCHAR(255)           — for device flow lookups
 *   uid         VARCHAR(255)           — for session lookups
 *   expires_at  TIMESTAMPTZ            — when the artifact expires
 *   consumed_at TIMESTAMPTZ            — when the artifact was consumed (e.g., auth code used)
 *   created_at  TIMESTAMPTZ NOT NULL   — row creation timestamp
 *   PRIMARY KEY (id, type)
 */

import { errors } from 'oidc-provider';
import { getPool } from '../lib/database.js';
import { logger } from '../lib/logger.js';

/**
 * Extra retention applied to a DeviceCode row beyond the provider payload lifetime.
 *
 * The provider expires the device code after 600 seconds, but the token endpoint must still be able
 * to distinguish `expired_token` from a code that never existed. Keeping the row for 900 additional
 * seconds provides that answer while still removing it through {@link purgeExpired}.
 */
export const DEVICE_CODE_RETENTION_SECONDS = 900;

/** PostgreSQL unique-violation SQLSTATE. */
const POSTGRES_UNIQUE_VIOLATION = '23505';

/** Index that enforces one DeviceCode row per normalized user code. */
const DEVICE_CODE_USER_CODE_INDEX = 'idx_oidc_payloads_device_user_code';

/**
 * Public error raised when a generated user code collides with a retained code.
 *
 * Collisions are rare, but returning a generic 500 would tell the caller that something internal
 * failed and would not invite a safe retry. The provider renders an exposed error with this status
 * and OAuth error name, and never includes code material.
 */
export class DeviceCodeCollisionError extends errors.OIDCProviderError {
  constructor() {
    super(503, 'temporarily_unavailable');
    // Base errors expose only 4xx responses. This condition is safe to retry and carries no data,
    // so the generic name is intentionally visible to the client.
    this.expose = true;
  }
}

/**
 * Public error raised when another request already started approving the same code.
 *
 * The provider re-renders the code-entry page for this error. The error carries no code material
 * and is deliberately a 200 response, matching the provider's own re-render states.
 */
export class DeviceCodeConflictError extends errors.OIDCProviderError {
  constructor() {
    super(200, 'invalid_request');
    this.status = 200;
    this.statusCode = 200;
    this.expose = true;
  }
}

/** Return true only for a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Identify the DeviceCode user-code uniqueness violation without matching unrelated errors. */
function isDeviceCodeUserCodeCollision(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return (
    error['code'] === POSTGRES_UNIQUE_VIOLATION &&
    error['constraint'] === DEVICE_CODE_USER_CODE_INDEX
  );
}

/** OIDC adapter payload — the data node-oidc-provider stores and retrieves */
export interface AdapterPayload {
  [key: string]: unknown;
  accountId?: string;
  clientId?: string;
  grantId?: string;
  iat?: number;
  exp?: number;
  uid?: string;
  userCode?: string;
  jti?: string;
  kind?: string;
  consumed?: number | boolean;
}

/**
 * PostgreSQL adapter implementing the node-oidc-provider storage interface.
 *
 * Each instance is created per-model (e.g., new PostgresAdapter('AccessToken')).
 * The model name is used as the `type` column to partition artifacts in the
 * shared oidc_payloads table.
 */
export class PostgresAdapter {
  /** Model name — used as the `type` column value (e.g., 'AccessToken', 'RefreshToken') */
  protected name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Create or update an OIDC artifact.
   *
   * Uses INSERT ... ON CONFLICT to handle both initial creation and updates.
   * Extracts grant_id, user_code, uid from payload for indexed lookups.
   * Calculates expires_at from the current time + expiresIn seconds.
   *
   * @param id - Artifact ID (e.g., token jti)
   * @param payload - Full OIDC artifact payload
   * @param expiresIn - TTL in seconds from now
   */
  async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
    const pool = getPool();

    // Extract indexed fields from payload for efficient lookups.
    // These are stored as separate columns in addition to the full JSONB payload.
    const grantId = payload.grantId ?? null;
    const userCode = payload.userCode ?? null;
    const uid = payload.uid ?? null;

    // A DeviceCode row outlives the provider payload so the token endpoint can report
    // `expired_token` during the retention window. Every re-save (confirmation/abort) refreshes the
    // retention from that save, keeping the row available for the same grace period.
    //
    // A non-finite or non-positive TTL would otherwise create a never-expiring row. Device codes
    // are short-lived credentials, so the safe fallback is the retention window itself.
    let expiresAt: Date | null;
    if (this.name === 'DeviceCode') {
      const retentionSeconds =
        Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn + DEVICE_CODE_RETENTION_SECONDS : DEVICE_CODE_RETENTION_SECONDS;
      expiresAt = new Date(Date.now() + retentionSeconds * 1000);
    } else {
      // Calculate absolute expiration time using PostgreSQL interval arithmetic
      expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
    }

    const values = [id, this.name, JSON.stringify(payload), grantId, userCode, uid, expiresAt];
    const hasAccountOrGrant = payload.accountId !== undefined || payload.grantId !== undefined;
    const hasError = payload.error !== undefined || payload.errorDescription !== undefined;

    // A confirmation sets only `inFlight`. Two requests can both pass the provider's read-side
    // check, so the durable decision must be a conditional write. The completion save carries an
    // account and grant and is allowed to update the winning row.
    if (
      this.name === 'DeviceCode' &&
      payload.inFlight === true &&
      !hasAccountOrGrant &&
      !hasError
    ) {
      const result = await pool.query(
        `UPDATE oidc_payloads
            SET payload = $3, grant_id = $4, user_code = $5, uid = $6, expires_at = $7
          WHERE id = $1 AND type = $2
            AND (expires_at IS NULL OR expires_at > NOW())
            AND payload->>'inFlight' IS DISTINCT FROM 'true'
          RETURNING id`,
        values,
      );
      if (result.rowCount !== 1) throw new DeviceCodeConflictError();
      return;
    }

    // The provider persists a user denial or a post-confirmation failure as `inFlight=true` plus
    // an error. That save must succeed while the row is still unapproved; once an account or grant
    // exists, the approval wins and the late error is ignored.
    if (
      this.name === 'DeviceCode' &&
      hasError &&
      !hasAccountOrGrant
    ) {
      await pool.query(
        `UPDATE oidc_payloads
            SET payload = $3, grant_id = $4, user_code = $5, uid = $6, expires_at = $7
          WHERE id = $1 AND type = $2
            AND payload->>'accountId' IS NULL
            AND payload->>'grantId' IS NULL`,
        values,
      );
      return;
    }

    try {
      await pool.query(
        `INSERT INTO oidc_payloads (id, type, payload, grant_id, user_code, uid, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id, type)
         DO UPDATE SET payload = $3, grant_id = $4, user_code = $5, uid = $6, expires_at = $7`,
        values,
      );
    } catch (error) {
      if (this.name === 'DeviceCode' && isDeviceCodeUserCodeCollision(error)) {
        throw new DeviceCodeCollisionError();
      }
      throw error;
    }
  }

  /**
   * Find an artifact by its ID.
   *
   * Returns undefined if not found or if the artifact has expired.
   * Merges consumed_at into the payload as `consumed` (epoch seconds)
   * which is the format node-oidc-provider expects.
   *
   * @param id - Artifact ID to look up
   * @returns The artifact payload, or undefined if not found/expired
   */
  async find(id: string): Promise<AdapterPayload | undefined> {
    const pool = getPool();

    const result = await pool.query<{ payload: AdapterPayload; consumed_at: Date | null }>(
      `SELECT payload, consumed_at FROM oidc_payloads
       WHERE id = $1 AND type = $2 AND (expires_at IS NULL OR expires_at > NOW())`,
      [id, this.name],
    );

    if (result.rows.length === 0) return undefined;

    return this.withConsumed(result.rows[0]);
  }

  /**
   * Find an artifact by user code (device flow).
   *
   * Used for OAuth 2.0 Device Authorization Grant where the user
   * enters a code on a separate device.
   *
   * @param userCode - The user-facing device code
   * @returns The artifact payload, or undefined if not found/expired
   */
  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    const pool = getPool();

    const result = await pool.query<{ payload: AdapterPayload; consumed_at: Date | null }>(
      `SELECT payload, consumed_at FROM oidc_payloads
       WHERE user_code = $1 AND type = $2 AND (expires_at IS NULL OR expires_at > NOW())`,
      [userCode, this.name],
    );

    if (result.rows.length === 0) return undefined;

    return this.withConsumed(result.rows[0]);
  }

  /**
   * Find an artifact by UID (sessions).
   *
   * Used to look up sessions by their unique identifier when
   * the session ID is not directly available.
   *
   * @param uid - The unique identifier
   * @returns The artifact payload, or undefined if not found/expired
   */
  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const pool = getPool();

    const result = await pool.query<{ payload: AdapterPayload; consumed_at: Date | null }>(
      `SELECT payload, consumed_at FROM oidc_payloads
       WHERE uid = $1 AND type = $2 AND (expires_at IS NULL OR expires_at > NOW())`,
      [uid, this.name],
    );

    if (result.rows.length === 0) return undefined;

    return this.withConsumed(result.rows[0]);
  }

  /**
   * Mark an artifact as consumed.
   *
   * Sets consumed_at to the current time. Used primarily for authorization
   * code replay detection — once a code is consumed, subsequent attempts
   * to use it are rejected by the provider.
   *
   * @param id - Artifact ID to mark as consumed
   */
  async consume(id: string): Promise<void> {
    const pool = getPool();

    const result = await pool.query(
      `UPDATE oidc_payloads SET consumed_at = NOW()
       WHERE id = $1 AND type = $2 AND consumed_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING id`,
      [id, this.name],
    );

    // The conditional write is the durable single-use decision. A preceding read cannot provide
    // that guarantee because two requests may both observe the artifact before either consumes it.
    if (result.rowCount !== 1) throw new errors.InvalidGrant();
  }

  /**
   * Delete an artifact by its ID.
   *
   * Permanently removes the artifact from the database.
   *
   * @param id - Artifact ID to delete
   */
  async destroy(id: string): Promise<void> {
    const pool = getPool();

    await pool.query(
      `DELETE FROM oidc_payloads WHERE id = $1 AND type = $2`,
      [id, this.name],
    );
  }

  /**
   * Revoke all artifacts associated with a grant.
   *
   * Deletes all rows matching the given grant_id for this model type.
   * Used when a grant is revoked (e.g., user revokes consent) to clean up
   * all associated tokens and artifacts.
   *
   * @param grantId - Grant ID whose artifacts should be deleted
   */
  async revokeByGrantId(grantId: string): Promise<void> {
    const pool = getPool();

    await pool.query(
      `DELETE FROM oidc_payloads WHERE grant_id = $1 AND type = $2`,
      [grantId, this.name],
    );
  }

  /**
   * Merge consumed_at into the payload as `consumed` (epoch seconds).
   *
   * node-oidc-provider expects the `consumed` field to be an epoch timestamp
   * (number of seconds since Unix epoch) in the payload. The database stores
   * it as a separate TIMESTAMPTZ column which we convert here.
   *
   * @param row - Database row with payload and consumed_at
   * @returns The payload with consumed field merged if applicable
   */
  protected withConsumed(row: {
    payload: AdapterPayload;
    consumed_at: Date | null;
  }): AdapterPayload {
    const payload = row.payload;

    if (row.consumed_at) {
      // Convert TIMESTAMPTZ to epoch seconds as expected by node-oidc-provider
      payload.consumed = Math.floor(row.consumed_at.getTime() / 1000);
    }

    return payload;
  }
}

// ---------------------------------------------------------------------------
// Standalone helpers for session lifecycle management
// ---------------------------------------------------------------------------

/**
 * Delete all oidc_payloads records matching any of the given grant_ids.
 *
 * Used for cascade cleanup when a session is destroyed during explicit logout.
 * Deletes across ALL types (AccessToken, RefreshToken, Grant, etc.) in a single
 * query — the grant_id column links tokens back to their originating grant.
 *
 * This is the critical step that ensures "logout = total cleanup": when a user
 * clicks "Sign Out", all grants and tokens issued during that session are removed
 * from PostgreSQL so they can no longer be used.
 *
 * @param grantIds - Array of grant IDs whose artifacts should be deleted
 */
export async function revokeGrantsByIds(grantIds: string[]): Promise<void> {
  if (grantIds.length === 0) return;

  const pool = getPool();
  await pool.query(
    'DELETE FROM oidc_payloads WHERE grant_id = ANY($1)',
    [grantIds],
  );
}

/**
 * Delete all expired oidc_payloads records (fire-and-forget).
 *
 * Called opportunistically on auth flow start to keep the oidc_payloads table
 * clean without requiring a cron job or external scheduler. This pattern is
 * proven from Porta v4 — self-regulating cleanup tied to actual usage.
 *
 * The function is intentionally fire-and-forget: it does NOT return a promise
 * that callers should await. Errors are silently caught and logged — a failed
 * cleanup is harmless (expired rows are already inert) and will be retried on
 * the next auth flow start.
 *
 * Uses the expires_at index for efficient deletion.
 */
export function purgeExpired(): void {
  const pool = getPool();
  pool
    .query('DELETE FROM oidc_payloads WHERE expires_at IS NOT NULL AND expires_at < NOW()')
    .catch((err) => {
      // Fire-and-forget — log but don't interrupt the auth flow
      logger.warn({ err }, 'Failed to purge expired oidc_payloads (will retry on next auth flow)');
    });
}
