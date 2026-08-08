/**
 * Dashboard statistics types for the Porta SDK.
 *
 * Mirrors the server `src/lib/stats.ts` — `StatsOverview` (system-wide) and
 * `OrgStats` (per-organization). The old flat `DashboardStats`/`EntityCount`
 * shapes were SDK drift (AR-18) and have been replaced.
 *
 * @module types/stats
 */

/**
 * Count breakdown by entity status. Always includes `total`; additional keys
 * are per-status counts (e.g. `active`, `suspended`) discovered at runtime.
 */
export interface StatusCounts {
  total: number;
  [status: string]: number;
}

/** Login activity for a time window. */
export interface LoginActivity {
  successful: number;
  failed: number;
}

/** System health check results. */
export interface SystemHealth {
  database: boolean;
  redis: boolean;
}

/** Login activity broken down by rolling time window. */
export interface LoginActivityWindows {
  last24h: LoginActivity;
  last7d: LoginActivity;
  last30d: LoginActivity;
}

/** User counts plus growth/activity metrics. */
export type UserStatsCounts = StatusCounts & {
  newLast7d: number;
  newLast30d: number;
  activeLast30d: number;
};

/**
 * System-wide dashboard statistics — mirrors the server `StatsOverview`,
 * returned by `GET /stats/overview` (unwrapped from `{ data }`).
 */
export interface StatsOverview {
  organizations: StatusCounts;
  users: UserStatsCounts;
  applications: StatusCounts;
  clients: StatusCounts;
  loginActivity: LoginActivityWindows;
  systemHealth: SystemHealth;
  generatedAt: string;
}

/**
 * Per-organization dashboard statistics — mirrors the server `OrgStats`,
 * returned by `GET /stats/organization/:orgId` (unwrapped from `{ data }`).
 */
export interface OrgStats {
  organizationId: string;
  users: UserStatsCounts;
  clients: StatusCounts;
  loginActivity: LoginActivityWindows;
  generatedAt: string;
}

/**
 * Backwards-compatible alias — the SDK `stats.get()` return type is
 * `DashboardStats`, which is the system-wide `StatsOverview`.
 */
export type DashboardStats = StatsOverview;
