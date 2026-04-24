/**
 * Users API hooks.
 * React Query hooks for user CRUD and status lifecycle operations.
 * Users are scoped to an organization via orgId.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { User } from '../types';
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
    queryFn: () => api.get<User>(`/users/${id}`),
    enabled: !!id,
  });
}

/** Create a new user within an organization */
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, data }: { orgId: string; data: Partial<User> }) =>
      api.post<User>(`/organizations/${orgId}/users`, data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Update an existing user (supports optimistic concurrency via ETag) */
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
      etag,
    }: {
      id: string;
      data: Partial<User>;
      etag?: string;
    }) => api.patch<User>(`/users/${id}`, data, etag),
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
    mutationFn: (id: string) => api.post<User>(`/users/${id}/suspend`),
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
    mutationFn: (id: string) => api.post<User>(`/users/${id}/activate`),
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
    mutationFn: (id: string) => api.post<User>(`/users/${id}/lock`),
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
    mutationFn: (id: string) => api.post<User>(`/users/${id}/archive`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}
