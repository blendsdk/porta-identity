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

import { getPool } from '../lib/database.js';

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

    // Calculate absolute expiration time using PostgreSQL interval arithmetic
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

    await pool.query(
      `INSERT INTO oidc_payloads (id, type, payload, grant_id, user_code, uid, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id, type)
       DO UPDATE SET payload = $3, grant_id = $4, user_code = $5, uid = $6, expires_at = $7`,
      [id, this.name, JSON.stringify(payload), grantId, userCode, uid, expiresAt],
    );
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

    await pool.query(
      `UPDATE oidc_payloads SET consumed_at = NOW() WHERE id = $1 AND type = $2`,
      [id, this.name],
    );
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
