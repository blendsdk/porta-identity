/**
 * Roles API hooks.
 * React Query hooks for role CRUD operations.
 * Roles are scoped to an application via appId.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiRequest } from './client';
import type { Role, Permission } from '../types';
import type { PaginatedResponse, ListParams } from '../../shared/types';

const KEYS = {
  all: ['roles'] as const,
  list: (appId: string, p?: ListParams) =>
    [...KEYS.all, 'list', appId, p] as const,
  detail: (id: string) => [...KEYS.all, id] as const,
  permissions: (appId: string, roleId: string) =>
    [...KEYS.all, 'permissions', appId, roleId] as const,
  users: (appId: string, roleId: string) =>
    [...KEYS.all, 'users', appId, roleId] as const,
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

/** Fetch a single role by appId and roleId */
export function useRole(appId: string, roleId: string) {
  return useQuery({
    queryKey: KEYS.detail(roleId),
    queryFn: () => api.get<Role>(`/applications/${appId}/roles/${roleId}`),
    enabled: !!appId && !!roleId,
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
      appId,
      id,
      data,
      etag,
    }: {
      appId: string;
      id: string;
      data: Partial<Role>;
      etag?: string;
    }) => api.patch<Role>(`/applications/${appId}/roles/${id}`, data, etag),
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
    mutationFn: ({ appId, id }: { appId: string; id: string }) =>
      api.del(`/applications/${appId}/roles/${id}`),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(v.id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Role–Permission mappings
// ---------------------------------------------------------------------------

/** Fetch permissions assigned to a role */
export function useRolePermissions(appId: string, roleId: string) {
  return useQuery({
    queryKey: KEYS.permissions(appId, roleId),
    queryFn: () =>
      api.get<Permission[]>(`/applications/${appId}/roles/${roleId}/permissions`),
    enabled: !!appId && !!roleId,
  });
}

/** Assign permissions to a role (PUT replaces the full set) */
export function useSetRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      appId,
      roleId,
      permissionIds,
    }: {
      appId: string;
      roleId: string;
      permissionIds: string[];
    }) =>
      api.put(`/applications/${appId}/roles/${roleId}/permissions`, {
        permissionIds,
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEYS.permissions(v.appId, v.roleId) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Remove specific permissions from a role */
export function useRemoveRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      appId,
      roleId,
      permissionIds,
    }: {
      appId: string;
      roleId: string;
      permissionIds: string[];
    }) =>
      apiRequest(`/api/applications/${appId}/roles/${roleId}/permissions`, {
        method: 'DELETE',
        body: JSON.stringify({ permissionIds }),
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEYS.permissions(v.appId, v.roleId) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Role–User lookups
// ---------------------------------------------------------------------------

interface RoleUsersResponse {
  data: Array<{
    userId: string;
    email: string;
    givenName: string | null;
    familyName: string | null;
    organizationId: string;
  }>;
  total: number;
}

/** Fetch users assigned to a role */
export function useRoleUsers(appId: string, roleId: string, orgId?: string) {
  return useQuery({
    queryKey: KEYS.users(appId, roleId),
    queryFn: () => {
      const params: Record<string, string> = {};
      if (orgId) params.orgId = orgId;
      return api.get<RoleUsersResponse>(
        `/applications/${appId}/roles/${roleId}/users`,
        params,
      );
    },
    enabled: !!appId && !!roleId,
  });
}
