/**
 * Dashboard statistics types for the Porta SDK.
 *
 * @module types/stats
 */

export interface DashboardStats {
  organizations: EntityCount;
  applications: EntityCount;
  clients: EntityCount;
  users: EntityCount;
  activeSessionCount: number;
  auditEventCount: number;
}

export interface EntityCount {
  total: number;
  active: number;
}
