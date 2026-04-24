/**
 * Roles API hooks.
 * React Query hooks for role CRUD operations.
 * Roles are scoped to an application via appId.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Role } from '../types';
import type { PaginatedResponse, ListParams } from '../../shared/types';

const KEYS = {
  all: ['roles'] as const,
  list: (appId: string, p?: ListParams) =>
    [...KEYS.all, 'list', appId, p] as const,
  detail: (id: string) => [...KEYS.all, id] as const,
};

/** Fetch a paginated list of roles for an application */
export function useRoles(appId: string, params?: ListParams) {
  return useQuery({
    queryKey: KEYS.list(appId, params),
    queryFn: () =>
      api.get<PaginatedResponse<Role>>(
        `/applications/${appId}/roles`,
        params as Record<string, string>,
      ),
    enabled: !!appId,
  });
}

/** Fetch a single role by ID */
export function useRole(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => api.get<Role>(`/roles/${id}`),
    enabled: !!id,
  });
}

/** Create a new role within an application */
export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ appId, data }: { appId: string; data: Partial<Role> }) =>
      api.post<Role>(`/applications/${appId}/roles`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Update an existing role (supports optimistic concurrency via ETag) */
export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
      etag,
    }: {
      id: string;
      data: Partial<Role>;
      etag?: string;
    }) => api.patch<Role>(`/roles/${id}`, data, etag),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(v.id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Archive a role */
export function useArchiveRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/roles/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}
