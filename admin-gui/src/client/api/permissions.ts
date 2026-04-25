/**
 * Permissions API hooks.
 * React Query hooks for permission CRUD operations.
 * Permissions are scoped to an application via appId.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Permission } from '../types';
import type { PaginatedResponse, ListParams } from '../../shared/types';

const KEYS = {
  all: ['permissions'] as const,
  list: (appId: string, p?: ListParams) =>
    [...KEYS.all, 'list', appId, p] as const,
  detail: (appId: string, id: string) =>
    [...KEYS.all, appId, id] as const,
};

/** Fetch a paginated list of permissions for an application */
export function usePermissions(appId: string, params?: ListParams) {
  return useQuery({
    queryKey: KEYS.list(appId, params),
    queryFn: () =>
      api.get<PaginatedResponse<Permission>>(
        `/applications/${appId}/permissions`,
        params as Record<string, string>,
      ),
    enabled: !!appId,
  });
}

/** Fetch a single permission by appId and permissionId */
export function usePermission(appId: string, permissionId: string) {
  return useQuery({
    queryKey: KEYS.detail(appId, permissionId),
    queryFn: () =>
      api.get<Permission>(
        `/applications/${appId}/permissions/${permissionId}`,
      ),
    enabled: !!appId && !!permissionId,
  });
}

/** Create a new permission within an application */
export function useCreatePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      appId,
      data,
    }: {
      appId: string;
      data: Partial<Permission>;
    }) => api.post<Permission>(`/applications/${appId}/permissions`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Archive (delete) a permission */
export function useArchivePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ appId, id }: { appId: string; id: string }) =>
      api.del(`/applications/${appId}/permissions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}
