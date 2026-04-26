/**
 * Audit Log API hooks.
 *
 * React Query hooks for querying and filtering the audit trail.
 * Supports event type, organization, user, and date range filtering.
 *
 * The backend GET /api/admin/audit accepts these query parameters:
 *   - event  — Filter by event_type (exact match)
 *   - org    — Filter by organization_id (UUID)
 *   - user   — Filter by user_id (UUID)
 *   - since  — Filter events created after this ISO 8601 date
 *   - limit  — Maximum number of events (default: 50, max: 500)
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { AuditEntry } from '../types';
import type { PaginatedResponse } from '../../shared/types';

/** Filter parameters for the audit log (server-supported filters) */
export interface AuditFilters {
  /** Filter by event type (e.g. "user.created") — maps to `event` query param */
  eventType?: string;
  /** Filter by organization ID — maps to `org` query param */
  organizationId?: string;
  /** Filter by user ID — maps to `user` query param */
  userId?: string;
  /** Start date (ISO string) for date range filter — maps to `since` query param */
  since?: string;
  /** Maximum entries to return (default: 50, max: 500) */
  limit?: number;
}

/**
 * Map frontend filter names to backend query parameter names.
 * The backend expects: event, org, user, since, limit.
 */
function mapToQueryParams(
  params?: AuditFilters,
): Record<string, string | number | boolean | undefined | null> | undefined {
  if (!params) return undefined;
  return {
    event: params.eventType,
    org: params.organizationId,
    user: params.userId,
    since: params.since,
    limit: params.limit,
  };
}

/** Query key factory for audit log queries */
const KEYS = {
  all: ['audit'] as const,
  list: (p?: AuditFilters) => [...KEYS.all, 'list', p] as const,
};

/**
 * Fetch a paginated, optionally filtered audit log.
 *
 * @param params - Filter parameters (mapped to backend query params).
 * @returns React Query result containing paginated {@link AuditEntry} list.
 */
export function useAuditLog(params?: AuditFilters) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () =>
      api.get<PaginatedResponse<AuditEntry>>(
        '/audit',
        mapToQueryParams(params) as Record<string, string>,
      ),
  });
}
