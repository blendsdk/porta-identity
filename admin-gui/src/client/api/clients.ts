/**
 * Clients API hooks.
 * React Query hooks for OAuth2/OIDC client CRUD operations.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Client } from '../types';
import type { PaginatedResponse, ListParams } from '../../shared/types';

const KEYS = {
  all: ['clients'] as const,
  list: (p?: ListParams) => [...KEYS.all, 'list', p] as const,
  detail: (id: string) => [...KEYS.all, id] as const,
};

/** Fetch a paginated list of clients */
export function useClients(params?: ListParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () =>
      api.get<PaginatedResponse<Client>>(
        '/clients',
        params as Record<string, string>,
      ),
  });
}

/** Fetch a single client by ID */
export function useClient(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => api.get<Client>(`/clients/${id}`),
    enabled: !!id,
  });
}

/** Create a new client */
export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Client>) =>
      api.post<Client>('/clients', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Update an existing client (supports optimistic concurrency via ETag) */
export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
      etag,
    }: {
      id: string;
      data: Partial<Client>;
      etag?: string;
    }) => api.patch<Client>(`/clients/${id}`, data, etag),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(v.id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Revoke a client */
export function useRevokeClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<Client>(`/clients/${id}/revoke`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}
