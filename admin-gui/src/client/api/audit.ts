/**
 * Audit Log API hooks.
 * React Query hooks for querying the audit trail.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { AuditEntry } from '../types';
import type { PaginatedResponse, ListParams } from '../../shared/types';

const KEYS = {
  all: ['audit'] as const,
  list: (p?: ListParams) => [...KEYS.all, 'list', p] as const,
};

/** Fetch a paginated audit log */
export function useAuditLog(params?: ListParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () =>
      api.get<PaginatedResponse<AuditEntry>>(
        '/audit',
        params as Record<string, string>,
      ),
  });
}
