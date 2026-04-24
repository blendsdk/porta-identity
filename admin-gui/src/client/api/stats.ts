/**
 * Dashboard statistics API hooks.
 *
 * Provides a React Query hook for fetching aggregated
 * dashboard statistics displayed on the admin home page.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './client';

/** Aggregated counts shown on the admin dashboard */
export interface DashboardStats {
  /** Total number of organizations */
  organizations: number;
  /** Total number of users */
  users: number;
  /** Total number of applications */
  applications: number;
  /** Total number of OIDC clients */
  clients: number;
  /** Currently active session count */
  activeSessions: number;
  /** Number of audit events recorded today */
  auditEventsToday: number;
}

/** Query key factory for dashboard statistics */
const KEYS = {
  all: ['stats'] as const,
};

/**
 * Fetch aggregated dashboard statistics.
 *
 * Results are considered fresh for 60 seconds to reduce
 * unnecessary refetches on the dashboard page.
 *
 * @returns React Query result containing {@link DashboardStats}.
 */
export function useDashboardStats() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn: () => api.get<DashboardStats>('/stats'),
    staleTime: 60_000,
  });
}
