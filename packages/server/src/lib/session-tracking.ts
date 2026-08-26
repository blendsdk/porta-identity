/**
 * Session tracking repository.
 *
 * PostgreSQL mirror of Redis OIDC sessions for admin listing, filtering,
 * and revocation. All operations are fire-and-forget — tracking failures
 * must NEVER break the OIDC flow.
 *
 * The Redis adapter calls these hooks when modelName === 'Session'.
 *
 * @module session-tracking
 * @see 05-dashboard-sessions-history.md
 */

import { getPool } from './database.js';
import { logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

/** Input for creating/upserting a session tracking record */
export interface SessionTrackingInput {
  sessionId: string;
  userId?: string;
  clientId?: string;
  organizationId?: string;
  grantId?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
}

/** A tracked session record */
export interface TrackedSession {
  sessionId: string;
  userId: string | null;
  clientId: string | null;
  organizationId: string | null;
  grantId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  revokedAt: Date | null;
}

/** Options for listing sessions */
export interface ListSessionsOptions {
  userId?: string;
  organizationId?: string;
  clientId?: string;
  activeOnly?: boolean;
  page?: number;
  pageSize?: number;
}

// ============================================================================
// Repository functions
// ============================================================================

/**
 * Upsert a session tracking record (called on session create/update).
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function upsertSession(input: SessionTrackingInput): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO admin_sessions (session_id, user_id, client_id, organization_id, grant_id, ip_address, user_agent, expires_at, last_activity_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (session_id) DO UPDATE SET
         user_id = COALESCE(EXCLUDED.user_id, admin_sessions.user_id),
         client_id = COALESCE(EXCLUDED.client_id, admin_sessions.client_id),
         organization_id = COALESCE(EXCLUDED.organization_id, admin_sessions.organization_id),
         grant_id = COALESCE(EXCLUDED.grant_id, admin_sessions.grant_id),
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
  } catch (err) {
    logger.warn({ err, sessionId: input.sessionId }, 'Failed to upsert session tracking record');
  }
}

/**
 * Mark a session as revoked (called on session destroy).
 * Fire-and-forget — errors are logged but never thrown.
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
 * Returns the number of sessions revoked.
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
    pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM admin_sessions ${where}`, params),
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
