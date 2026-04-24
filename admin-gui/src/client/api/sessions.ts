/**
 * Sessions API hooks.
 * React Query hooks for admin session management.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { AdminSession } from '../types';
import type { PaginatedResponse, ListParams } from '../../shared/types';

const KEYS = {
  all: ['sessions'] as const,
  list: (p?: ListParams) => [...KEYS.all, 'list', p] as const,
};

/** Fetch a paginated list of active sessions */
export function useSessions(params?: ListParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () =>
      api.get<PaginatedResponse<AdminSession>>(
        '/sessions',
        params as Record<string, string>,
      ),
  });
}

/** Revoke (terminate) a session by ID */
export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}
