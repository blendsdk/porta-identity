/**
 * Audit Log API hooks.
 *
 * React Query hooks for querying and filtering the audit trail.
 * Supports date range, event type, actor search, entity type,
 * and organization filtering with cursor pagination.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { AuditEntry } from '../types';
import type { PaginatedResponse, ListParams } from '../../shared/types';

/** Filter parameters for the audit log */
export interface AuditFilters extends ListParams {
  /** Filter by event type (e.g. "user.created") */
  eventType?: string;
  /** Search by actor email */
  actorEmail?: string;
  /** Filter by target entity type (e.g. "user", "organization") */
  targetType?: string;
  /** Filter by organization ID */
  organizationId?: string;
  /** Start date (ISO string) for date range filter */
  startDate?: string;
  /** End date (ISO string) for date range filter */
  endDate?: string;
}

/** Query key factory for audit log queries */
const KEYS = {
  all: ['audit'] as const,
  list: (p?: AuditFilters | ListParams) => [...KEYS.all, 'list', p] as const,
};

/**
 * Fetch a paginated, optionally filtered audit log.
 *
 * @param params - Pagination and filter parameters.
 * @returns React Query result containing paginated {@link AuditEntry} list.
 */
export function useAuditLog(params?: AuditFilters | ListParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () =>
      api.get<PaginatedResponse<AuditEntry>>(
        '/audit',
        params as Record<string, string>,
      ),
  });
}
