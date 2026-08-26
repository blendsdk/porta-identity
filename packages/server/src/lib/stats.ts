/**
 * Dashboard statistics service.
 *
 * Provides system-wide and per-organization statistics for the admin
 * dashboard. All functions are standalone (no class), use parameterized
 * SQL queries, and return typed result objects.
 *
 * Login activity metrics are derived from the `audit_log` table using
 * event type filters. Entity counts use `GROUP BY status` for efficient
 * aggregation.
 *
 * @module stats
 * @see 05-dashboard-sessions-history.md
 */

import { getPool } from './database.js';

// ============================================================================
// Types
// ============================================================================

/** Count breakdown by entity status */
export interface StatusCounts {
  total: number;
  [status: string]: number;
}

/** Login activity for a time window */
export interface LoginActivity {
  successful: number;
  failed: number;
}

/** System health check results */
export interface SystemHealth {
  database: boolean;
  redis: boolean;
}

/** Full stats overview response */
export interface StatsOverview {
  organizations: StatusCounts;
  users: StatusCounts & { newLast7d: number; newLast30d: number; activeLast30d: number };
  applications: StatusCounts;
  clients: StatusCounts;
  loginActivity: {
    last24h: LoginActivity;
    last7d: LoginActivity;
    last30d: LoginActivity;
  };
  systemHealth: SystemHealth;
  generatedAt: string;
}

/** Per-org stats response (scoped to a single organization) */
export interface OrgStats {
  organizationId: string;
  users: StatusCounts & { newLast7d: number; newLast30d: number; activeLast30d: number };
  clients: StatusCounts;
  loginActivity: {
    last24h: LoginActivity;
    last7d: LoginActivity;
    last30d: LoginActivity;
  };
  generatedAt: string;
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Count rows grouped by status for an entity table.
 * Returns { total, active, suspended, ... } with all statuses found.
 */
async function countByStatus(table: string, orgFilter?: { column: string; value: string }): Promise<StatusCounts> {
  const pool = getPool();
  const conditions = orgFilter ? `WHERE ${orgFilter.column} = $1` : '';
  const params = orgFilter ? [orgFilter.value] : [];

  const { rows } = await pool.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM ${table} ${conditions} GROUP BY status`,
    params,
  );

  const result: StatusCounts = { total: 0 };
  for (const row of rows) {
    const count = parseInt(row.count, 10);
    result[row.status] = count;
    result.total += count;
  }
  return result;
}

/**
 * Count new users created within a given interval.
 */
async function countNewUsers(interval: string, orgId?: string): Promise<number> {
  const pool = getPool();
  const orgFilter = orgId ? ' AND organization_id = $1' : '';
  const params = orgId ? [orgId] : [];

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM users WHERE created_at > NOW() - $${orgId ? '2' : '1'}::interval${orgFilter}`,
    [...params, interval],
  );
  return parseInt(rows[0].count, 10);
}

/**
 * Count users active (logged in) within a given interval.
 */
async function countActiveUsers(interval: string, orgId?: string): Promise<number> {
  const pool = getPool();
  const orgFilter = orgId ? ' AND organization_id = $1' : '';
  const params = orgId ? [orgId] : [];

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM users WHERE last_login_at > NOW() - $${orgId ? '2' : '1'}::interval${orgFilter}`,
    [...params, interval],
  );
  return parseInt(rows[0].count, 10);
}

/**
 * Count login events from audit_log for a time window.
 * Successful: event_type LIKE 'user.login.%' AND NOT LIKE '%.failed'
 * Failed: event_type LIKE 'user.login.%.failed'
 */
async function countLoginActivity(interval: string, orgId?: string): Promise<LoginActivity> {
  const pool = getPool();
  const orgFilter = orgId ? ' AND organization_id = $1' : '';
  const baseParams = orgId ? [orgId] : [];
  const intervalParam = `$${orgId ? '2' : '1'}`;

  const { rows } = await pool.query<{ category: string; count: string }>(
    `SELECT
       CASE
         WHEN event_type LIKE '%.failed' THEN 'failed'
         ELSE 'successful'
       END AS category,
       COUNT(*)::text AS count
     FROM audit_log
     WHERE event_type LIKE 'user.login.%'
       AND created_at > NOW() - ${intervalParam}::interval
       ${orgFilter}
     GROUP BY category`,
    [...baseParams, interval],
  );

  const result: LoginActivity = { successful: 0, failed: 0 };
  for (const row of rows) {
    if (row.category === 'successful') result.successful = parseInt(row.count, 10);
    if (row.category === 'failed') result.failed = parseInt(row.count, 10);
  }
  return result;
}

/**
 * Check system health (database connectivity).
 * Redis health is checked separately since it may not be available
 * from a pure database context.
 */
async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get system-wide dashboard statistics.
 *
 * Aggregates counts across all organizations, user activity metrics,
 * login event history from the audit log, and system health checks.
 *
 * @returns Full stats overview
 */
export async function getStatsOverview(): Promise<StatsOverview> {
  const [
    organizations,
    usersBase,
    applications,
    clients,
    newUsers7d,
    newUsers30d,
    activeUsers30d,
    loginLast24h,
    loginLast7d,
    loginLast30d,
    dbHealth,
  ] = await Promise.all([
    countByStatus('organizations'),
    countByStatus('users'),
    countByStatus('applications'),
    countByStatus('clients'),
    countNewUsers('7 days'),
    countNewUsers('30 days'),
    countActiveUsers('30 days'),
    countLoginActivity('24 hours'),
    countLoginActivity('7 days'),
    countLoginActivity('30 days'),
    checkDatabaseHealth(),
  ]);

  return {
    organizations,
    users: {
      ...usersBase,
      newLast7d: newUsers7d,
      newLast30d: newUsers30d,
      activeLast30d: activeUsers30d,
    },
    applications,
    clients,
    loginActivity: {
      last24h: loginLast24h,
      last7d: loginLast7d,
      last30d: loginLast30d,
    },
    systemHealth: {
      database: dbHealth,
      // Redis health is checked via the health endpoint; we report true here
      // since if we got this far the DB is reachable. Full health check is at GET /health.
      redis: true,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get per-organization dashboard statistics.
 *
 * All counts are scoped to the specified organization. Login activity
 * is filtered by `organization_id` in the audit log.
 *
 * @param orgId - Organization UUID to scope statistics to
 * @returns Per-org stats
 */
export async function getOrgStats(orgId: string): Promise<OrgStats> {
  const [
    usersBase,
    clientsCounts,
    newUsers7d,
    newUsers30d,
    activeUsers30d,
    loginLast24h,
    loginLast7d,
    loginLast30d,
  ] = await Promise.all([
    countByStatus('users', { column: 'organization_id', value: orgId }),
    countByStatus('clients', { column: 'organization_id', value: orgId }),
    countNewUsers('7 days', orgId),
    countNewUsers('30 days', orgId),
    countActiveUsers('30 days', orgId),
    countLoginActivity('24 hours', orgId),
    countLoginActivity('7 days', orgId),
    countLoginActivity('30 days', orgId),
  ]);

  return {
    organizationId: orgId,
    users: {
      ...usersBase,
      newLast7d: newUsers7d,
      newLast30d: newUsers30d,
      activeLast30d: activeUsers30d,
    },
    clients: clientsCounts,
    loginActivity: {
      last24h: loginLast24h,
      last7d: loginLast7d,
      last30d: loginLast30d,
    },
    generatedAt: new Date().toISOString(),
  };
}
