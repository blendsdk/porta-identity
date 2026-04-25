/**
 * Sessions API hooks.
 *
 * React Query hooks for admin session management including
 * list, single revoke, and bulk revoke operations.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { AdminSession } from '../types';
import type { PaginatedResponse, ListParams } from '../../shared/types';

/** Query key factory for session queries */
const KEYS = {
  all: ['sessions'] as const,
  list: (p?: ListParams) => [...KEYS.all, 'list', p] as const,
};

/**
 * Fetch a paginated list of active sessions.
 *
 * Supports optional refetchInterval for auto-refresh.
 *
 * @param params - Pagination parameters.
 * @param refetchInterval - Auto-refresh interval in ms (0 to disable).
 * @returns React Query result containing paginated {@link AdminSession} list.
 */
export function useSessions(params?: ListParams, refetchInterval = 0) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () =>
      api.get<PaginatedResponse<AdminSession>>(
        '/sessions',
        params as Record<string, string>,
      ),
    refetchInterval: refetchInterval > 0 ? refetchInterval : false,
  });
}

/**
 * Revoke (terminate) a single session by ID.
 * Invalidates session list cache on success.
 */
export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Parameters for bulk session revocation */
export interface BulkRevokeParams {
  /** Revoke all sessions for a specific user */
  userId?: string;
  /** Revoke all sessions for a specific organization */
  organizationId?: string;
  /** If true, revoke ALL sessions (dangerous — requires TypeToConfirm) */
  all?: boolean;
}

/**
 * Bulk revoke sessions by user, organization, or all.
 * Invalidates session list cache on success.
 */
export function useBulkRevokeSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: BulkRevokeParams) =>
      api.post('/sessions/bulk-revoke', params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}
