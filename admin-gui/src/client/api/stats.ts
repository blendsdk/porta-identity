/**
 * Dashboard statistics API hooks.
 *
 * Provides React Query hooks for fetching aggregated dashboard
 * statistics (system-wide and per-organization) displayed on the
 * admin home page.
 *
 * Backend endpoints:
 * - GET /api/admin/stats/overview → StatsOverview (system-wide)
 * - GET /api/admin/stats/organization/:orgId → OrgStats (per-org)
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { StatsOverview, OrgStats } from '../types';

/** Query key factory for dashboard statistics */
const KEYS = {
  all: ['stats'] as const,
  overview: () => [...KEYS.all, 'overview'] as const,
  org: (orgId: string) => [...KEYS.all, 'org', orgId] as const,
};

/**
 * Fetch system-wide dashboard statistics (all organizations).
 *
 * Includes entity counts by status, login activity windows
 * (24h/7d/30d), and system health indicators.
 * Results are considered fresh for 60 seconds to reduce
 * unnecessary refetches on the dashboard page.
 *
 * @returns React Query result containing {@link StatsOverview}.
 */
export function useOverviewStats() {
  return useQuery({
    queryKey: KEYS.overview(),
    queryFn: () =>
      api.get<{ data: StatsOverview }>('/stats/overview').then((r) => r.data),
    staleTime: 60_000,
  });
}

/**
 * Fetch per-organization dashboard statistics.
 *
 * Includes org-scoped user/client counts, login activity,
 * and application count.
 * Only enabled when an orgId is provided (non-null).
 *
 * @param orgId - Organization ID to scope stats to, or null to disable.
 * @returns React Query result containing {@link OrgStats}.
 */
export function useOrgStats(orgId: string | null) {
  return useQuery({
    queryKey: KEYS.org(orgId ?? ''),
    queryFn: () =>
      api
        .get<{ data: OrgStats }>(`/stats/organization/${orgId}`)
        .then((r) => r.data),
    enabled: !!orgId,
    staleTime: 60_000,
  });
}

/**
 * Legacy hook for backwards-compatible dashboard stats.
 * Maps StatsOverview to the simplified DashboardStats shape.
 *
 * @deprecated Use {@link useOverviewStats} directly for richer data.
 */
export function useDashboardStats() {
  return useOverviewStats();
}
