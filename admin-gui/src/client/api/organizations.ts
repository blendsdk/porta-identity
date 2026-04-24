/**
 * Organizations API hooks.
 * React Query hooks for organization CRUD operations.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Organization } from '../types';
import type { PaginatedResponse, ListParams } from '../../shared/types';

const KEYS = {
  all: ['organizations'] as const,
  list: (p?: ListParams) => [...KEYS.all, 'list', p] as const,
  detail: (id: string) => [...KEYS.all, id] as const,
};

/** Fetch a paginated list of organizations */
export function useOrganizations(params?: ListParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () =>
      api.get<PaginatedResponse<Organization>>(
        '/organizations',
        params as Record<string, string>,
      ),
  });
}

/** Fetch a single organization by ID */
export function useOrganization(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => api.get<Organization>(`/organizations/${id}`),
    enabled: !!id,
  });
}

/** Create a new organization */
export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Organization>) =>
      api.post<Organization>('/organizations', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Update an existing organization (supports optimistic concurrency via ETag) */
export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
      etag,
    }: {
      id: string;
      data: Partial<Organization>;
      etag?: string;
    }) => api.patch<Organization>(`/organizations/${id}`, data, etag),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(v.id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Suspend an organization */
export function useSuspendOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<Organization>(`/organizations/${id}/suspend`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Activate an organization */
export function useActivateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<Organization>(`/organizations/${id}/activate`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Archive an organization */
export function useArchiveOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<Organization>(`/organizations/${id}/archive`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}
