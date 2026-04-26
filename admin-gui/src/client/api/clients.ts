/**
 * Clients API hooks.
 * React Query hooks for OAuth2/OIDC client CRUD operations
 * and client secret management (generate, list, revoke).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, unwrapData } from './client';
import type { Client, ClientSecret } from '../types';
import type { PaginatedResponse, ListParams } from '../../shared/types';

const KEYS = {
  all: ['clients'] as const,
  list: (p?: ListParams) => [...KEYS.all, 'list', p] as const,
  detail: (id: string) => [...KEYS.all, id] as const,
  secrets: (clientId: string) => [...KEYS.all, clientId, 'secrets'] as const,
};

/**
 * Map a backend client response to the SPA Client type.
 * Backend uses `clientName` / `clientType` while SPA uses `name` / `isConfidential`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApiClient(raw: any): Client {
  return {
    ...raw,
    name: raw.name ?? raw.clientName ?? '',
    isConfidential:
      raw.isConfidential ?? (raw.clientType === 'confidential'),
    description: raw.description ?? null,
  };
}

/** Fetch a paginated list of clients */
export function useClients(params?: ListParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Client>>(
        '/clients',
        params as Record<string, string>,
      );
      // Map backend field names to SPA field names
      if (res?.data) {
        res.data = res.data.map(mapApiClient);
      }
      return res;
    },
  });
}

/** Fetch a single client by ID */
export function useClient(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: async () => mapApiClient(unwrapData(await api.get(`/clients/${id}`))),
    enabled: !!id,
  });
}

/**
 * Create a new client.
 * Backend returns { data: { client, secret }, warning? }.
 * We unwrap to return { client, secret, warning? } so callers can access both.
 */
export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Client>) => {
      const res = await api.post<Record<string, unknown>>('/clients', data);
      const inner = unwrapData<Record<string, unknown>>(res);
      // inner is { client: {...}, secret: "..." } or the client itself
      const client = inner.client ? mapApiClient(inner.client) : mapApiClient(inner);
      return { ...client, clientSecret: inner.secret as string | undefined };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Update an existing client (supports optimistic concurrency via ETag) */
export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
      etag,
    }: {
      id: string;
      data: Partial<Client>;
      etag?: string;
    }) => mapApiClient(unwrapData(await api.put(`/clients/${id}`, data, etag))),
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
    mutationFn: async (id: string) =>
      mapApiClient(unwrapData(await api.post(`/clients/${id}/revoke`))),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Client Secret Management
// ---------------------------------------------------------------------------

/** Fetch all secrets for a client (returns metadata, never plaintext) */
export function useClientSecrets(clientId: string) {
  return useQuery({
    queryKey: KEYS.secrets(clientId),
    queryFn: () => api.get<ClientSecret[]>(`/clients/${clientId}/secrets`),
    enabled: !!clientId,
  });
}

/** Generate a new secret for a client (returns plaintext once) */
export function useGenerateClientSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      label,
      expiresAt,
    }: {
      clientId: string;
      label?: string;
      expiresAt?: string;
    }) =>
      api.post<ClientSecret>(`/clients/${clientId}/secrets`, {
        label,
        expiresAt,
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEYS.secrets(v.clientId) });
    },
  });
}

/** Revoke a specific client secret */
export function useRevokeClientSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      secretId,
    }: {
      clientId: string;
      secretId: string;
    }) => api.post<void>(`/clients/${clientId}/secrets/${secretId}/revoke`),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEYS.secrets(v.clientId) });
    },
  });
}
