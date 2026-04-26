/**
 * Users API hooks.
 * React Query hooks for user CRUD and status lifecycle operations.
 * Users are scoped to an organization via orgId.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiRequest, unwrapData } from './client';
import type { User, Role } from '../types';
import type { PaginatedResponse, ListParams } from '../../shared/types';

const KEYS = {
  all: ['users'] as const,
  list: (orgId: string, p?: ListParams) =>
    [...KEYS.all, 'list', orgId, p] as const,
  detail: (id: string) => [...KEYS.all, id] as const,
};

/** Fetch a paginated list of users within an organization */
export function useUsers(orgId: string, params?: ListParams) {
  return useQuery({
    queryKey: KEYS.list(orgId, params),
    queryFn: () =>
      api.get<PaginatedResponse<User>>(
        `/organizations/${orgId}/users`,
        params as Record<string, string>,
      ),
    enabled: !!orgId,
  });
}

/** Fetch a single user by ID */
export function useUser(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: async () => unwrapData<User>(await api.get(`/users/${id}`)),
    enabled: !!id,
  });
}

/** Create a new user within an organization */
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, data }: { orgId: string; data: Partial<User> }) =>
      unwrapData<User>(await api.post(`/organizations/${orgId}/users`, data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Update an existing user (supports optimistic concurrency via ETag) */
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
      etag,
    }: {
      id: string;
      data: Partial<User>;
      etag?: string;
    }) => unwrapData<User>(await api.patch(`/users/${id}`, data, etag)),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(v.id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Suspend a user */
export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrapData<User>(await api.post(`/users/${id}/suspend`)),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Activate a user */
export function useActivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrapData<User>(await api.post(`/users/${id}/activate`)),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Lock a user */
export function useLockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrapData<User>(await api.post(`/users/${id}/lock`)),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Archive a user */
export function useArchiveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrapData<User>(await api.post(`/users/${id}/archive`)),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Invitation hooks
// ---------------------------------------------------------------------------

/** Request body for inviting a user */
export interface InviteUserRequest {
  email: string;
  displayName?: string;
  personalMessage?: string;
  roles?: Array<{ applicationId: string; roleId: string }>;
  claims?: Array<{ applicationId: string; claimDefinitionId: string; value: unknown }>;
  locale?: string;
}

/** Request body for invitation preview */
export interface InvitePreviewRequest {
  email: string;
  displayName?: string;
  personalMessage?: string;
  locale?: string;
}

/** Invitation preview response */
export interface InvitePreviewResponse {
  subject: string;
  html: string;
  text: string;
}

/** Send an invitation to a user within an organization */
export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, data }: { orgId: string; data: InviteUserRequest }) =>
      api.post<User>(`/organizations/${orgId}/users/invite`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Preview invitation email (without sending) */
export function useInvitePreview() {
  return useMutation({
    mutationFn: ({ orgId, data }: { orgId: string; data: InvitePreviewRequest }) =>
      api.post<{ data: InvitePreviewResponse }>(
        `/organizations/${orgId}/users/invite/preview`,
        data,
      ),
  });
}

// ---------------------------------------------------------------------------
// Additional status transition hooks
// ---------------------------------------------------------------------------

/** Deactivate a user (active → inactive) */
export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<User>(`/users/${id}/deactivate`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Unlock a user (locked → active) */
export function useUnlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<User>(`/users/${id}/unlock`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Password & email verification hooks
// ---------------------------------------------------------------------------

/** Set or change a user's password */
export function useSetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      api.post(`/users/${userId}/password`, { password }),
    onSuccess: (_d, { userId }) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(userId) });
    },
  });
}

/** Clear a user's password (make passwordless) */
export function useClearPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.del(`/users/${userId}/password`),
    onSuccess: (_d, userId) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(userId) });
    },
  });
}

/** Mark a user's email as verified */
export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.post(`/users/${userId}/verify-email`),
    onSuccess: (_d, userId) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(userId) });
    },
  });
}

// ---------------------------------------------------------------------------
// User role hooks
// ---------------------------------------------------------------------------

/** Fetch roles assigned to a user within an organization */
export function useUserRoles(orgId: string, userId: string) {
  return useQuery({
    queryKey: [...KEYS.detail(userId), 'roles'],
    queryFn: () =>
      api.get<Role[]>(
        `/organizations/${orgId}/users/${userId}/roles`,
      ),
    enabled: !!orgId && !!userId,
  });
}

/** Assign roles to a user */
export function useAssignUserRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      userId,
      roleIds,
    }: {
      orgId: string;
      userId: string;
      roleIds: string[];
    }) =>
      api.put(`/organizations/${orgId}/users/${userId}/roles`, { roleIds }),
    onSuccess: (_d, { userId }) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(userId) });
    },
  });
}

/** Remove roles from a user (uses apiRequest for DELETE with body) */
export function useRemoveUserRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      userId,
      roleIds,
    }: {
      orgId: string;
      userId: string;
      roleIds: string[];
    }) =>
      apiRequest(`/api/organizations/${orgId}/users/${userId}/roles`, {
        method: 'DELETE',
        body: JSON.stringify({ roleIds }),
      }),
    onSuccess: (_d, { userId }) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(userId) });
    },
  });
}
