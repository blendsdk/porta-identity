/**
 * Session tracking repository.
 *
 * PostgreSQL authority record for Redis-backed OIDC sessions. Session
 * publication waits for this record so a Redis payload cannot outlive the
 * database state used to revoke it.
 *
 * The Redis adapter calls these hooks when modelName === 'Session'.
 *
 * @module session-tracking
 */

import { getPool } from './database.js';
import { logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

/** Input for creating or updating a session tracking record. */
export interface SessionTrackingInput {
  /** OIDC Session identifier, shared with the Redis payload key. */
  sessionId: string;
  /** User that authenticated the Session, when authentication has completed. */
  userId?: string;
  /** Internal client UUID when a single client can be identified. */
  clientId?: string;
  /** Organization that owns the authenticated user. */
  organizationId?: string;
  /** Current grant identifier when one is available at publication time. */
  grantId?: string;
  /** Source IP address retained for administrative session inspection. */
  ipAddress?: string;
  /** Source user agent retained for administrative session inspection. */
  userAgent?: string;
  /** Absolute time after which the Session no longer has authority. */
  expiresAt: Date;
}

/** A tracked session record returned from PostgreSQL. */
export interface TrackedSession {
  /** OIDC Session identifier. */
  sessionId: string;
  /** Authenticated user UUID, or null before authentication completes. */
  userId: string | null;
  /** Internal client UUID when the Session has one tracked client. */
  clientId: string | null;
  /** Organization UUID associated with the Session. */
  organizationId: string | null;
  /** Grant identifier captured for administrative inspection. */
  grantId: string | null;
  /** Source IP address, when captured. */
  ipAddress: string | null;
  /** Source user agent, when captured. */
  userAgent: string | null;
  /** Time the tracking row was first created. */
  createdAt: Date;
  /** Absolute authority expiry. */
  expiresAt: Date;
  /** Time the tracking row was last refreshed. */
  lastActivityAt: Date;
  /** Revocation time, or null while the Session remains live. */
  revokedAt: Date | null;
}

/** Filters and pagination controls for session listing. */
export interface ListSessionsOptions {
  /** Limit results to one user UUID. */
  userId?: string;
  /** Limit results to one organization UUID. */
  organizationId?: string;
  /** Limit results to one internal client UUID. */
  clientId?: string;
  /** Include revoked and expired rows when false. Defaults to true. */
  activeOnly?: boolean;
  /** One-based result page. */
  page?: number;
  /** Number of rows per page, clamped to 1 through 100. */
  pageSize?: number;
}

// ============================================================================
// Repository functions
// ============================================================================

/**
 * Create or update the authority record for an OIDC Session.
 *
 * The caller must await this operation before publishing the corresponding
 * Redis payload. Database errors intentionally propagate because an
 * untracked Session could otherwise continue after administrative revocation.
 *
 * @param input - Session identifiers and absolute expiry.
 * @throws The PostgreSQL error when the authority record cannot be persisted.
 */
export async function upsertSession(input: SessionTrackingInput): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO admin_sessions (session_id, user_id, client_id, organization_id, grant_id, ip_address, user_agent, expires_at, last_activity_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (session_id) DO UPDATE SET
         user_id = COALESCE(EXCLUDED.user_id, admin_sessions.user_id),
         client_id = COALESCE(EXCLUDED.client_id, admin_sessions.client_id),
         organization_id = COALESCE(EXCLUDED.organization_id, admin_sessions.organization_id),
         grant_id = COALESCE(EXCLUDED.grant_id, admin_sessions.grant_id),
         expires_at = EXCLUDED.expires_at,
         last_activity_at = NOW()`,
    [
      input.sessionId,
      input.userId ?? null,
      input.clientId ?? null,
      input.organizationId ?? null,
      input.grantId ?? null,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      input.expiresAt,
    ],
  );
}

/**
 * Mark a session as revoked (called on session destroy).
 * Fire-and-forget — errors are logged but never thrown.
 *
 * @param sessionId - OIDC Session identifier.
 */
export async function revokeSession(sessionId: string): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `UPDATE admin_sessions SET revoked_at = NOW() WHERE session_id = $1 AND revoked_at IS NULL`,
      [sessionId],
    );
  } catch (err) {
    logger.warn({ err, sessionId }, 'Failed to revoke session tracking record');
  }
}

/**
 * Revoke all active sessions for a user.
 *
 * @param userId - User UUID whose active tracking rows are revoked.
 * Returns the number of sessions revoked.
 * @returns Number of rows changed by PostgreSQL.
 */
export async function revokeUserSessions(userId: string): Promise<number> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE admin_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
  return rowCount ?? 0;
}

/**
 * Get a single tracked session by ID.
 *
 * @param sessionId - OIDC Session identifier.
 * @returns The tracking record, or null when no record exists.
 */
export async function getSession(sessionId: string): Promise<TrackedSession | null> {
  const pool = getPool();
  const { rows } = await pool.query<TrackedSession>(
    `SELECT session_id AS "sessionId", user_id AS "userId", client_id AS "clientId",
            organization_id AS "organizationId", grant_id AS "grantId",
            ip_address AS "ipAddress", user_agent AS "userAgent",
            created_at AS "createdAt", expires_at AS "expiresAt",
            last_activity_at AS "lastActivityAt", revoked_at AS "revokedAt"
     FROM admin_sessions WHERE session_id = $1`,
    [sessionId],
  );
  return rows[0] ?? null;
}

/**
 * List tracked sessions with filtering and pagination.
 *
 * @param options - Optional filters and bounded pagination controls.
 * @returns Matching tracking rows and pagination metadata.
 */
export async function listSessions(options: ListSessionsOptions = {}): Promise<{
  data: TrackedSession[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const pool = getPool();
  const page = Math.max(options.page ?? 1, 1);
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (options.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(options.userId);
  }
  if (options.organizationId) {
    conditions.push(`organization_id = $${paramIndex++}`);
    params.push(options.organizationId);
  }
  if (options.clientId) {
    conditions.push(`client_id = $${paramIndex++}`);
    params.push(options.clientId);
  }
  if (options.activeOnly !== false) {
    // Default: only active sessions
    conditions.push('revoked_at IS NULL');
    conditions.push(`expires_at > NOW()`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countResult, dataResult] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM admin_sessions ${where}`,
      params,
    ),
    pool.query<TrackedSession>(
      `SELECT session_id AS "sessionId", user_id AS "userId", client_id AS "clientId",
              organization_id AS "organizationId", grant_id AS "grantId",
              ip_address AS "ipAddress", user_agent AS "userAgent",
              created_at AS "createdAt", expires_at AS "expiresAt",
              last_activity_at AS "lastActivityAt", revoked_at AS "revokedAt"
       FROM admin_sessions ${where}
       ORDER BY last_activity_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSize, offset],
    ),
  ]);

  return {
    data: dataResult.rows,
    total: parseInt(countResult.rows[0].count, 10),
    page,
    pageSize,
  };
}

/**
 * Clean up expired session tracking records older than 7 days.
 * Keeps revoked sessions for audit purposes for 7 days.
 * Fire-and-forget — designed to be called periodically.
 *
 * @returns Number of expired rows removed, or zero when cleanup fails.
 */
export async function purgeExpiredSessions(): Promise<number> {
  try {
    const pool = getPool();
    const { rowCount } = await pool.query(
      `DELETE FROM admin_sessions WHERE expires_at < NOW() - INTERVAL '7 days'`,
    );
    return rowCount ?? 0;
  } catch (err) {
    logger.warn({ err }, 'Failed to purge expired session tracking records');
    return 0;
  }
}
