/**
 * Custom Claims API hooks.
 * React Query hooks for claim definition and user claim value operations.
 * Claim definitions are scoped to an application via appId.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { ClaimDefinition, UserClaimValue } from '../types';
import type { PaginatedResponse, ListParams } from '../../shared/types';

const KEYS = {
  definitions: ['claim-definitions'] as const,
  definitionList: (appId: string, p?: ListParams) =>
    [...KEYS.definitions, 'list', appId, p] as const,
  definitionDetail: (id: string) => [...KEYS.definitions, id] as const,
  userClaims: ['user-claim-values'] as const,
  userClaimList: (userId: string) =>
    [...KEYS.userClaims, 'list', userId] as const,
};

/**
 * Map backend claim definition response to SPA ClaimDefinition type.
 * Backend uses claimName/claimType; SPA uses name/valueType/slug.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApiClaim(raw: any): ClaimDefinition {
  return {
    ...raw,
    name: raw.name ?? raw.claimName ?? '',
    slug: raw.slug ?? raw.claimName ?? '',
    valueType: raw.valueType ?? raw.claimType ?? 'string',
    isRequired: raw.isRequired ?? false,
    defaultValue: raw.defaultValue ?? null,
    validationRules: raw.validationRules ?? null,
  };
}

/** Fetch a paginated list of claim definitions for an application */
export function useClaimDefinitions(appId: string, params?: ListParams) {
  return useQuery({
    queryKey: KEYS.definitionList(appId, params),
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<ClaimDefinition>>(
        `/applications/${appId}/claims`,
        params as Record<string, string>,
      );
      if (res?.data) {
        res.data = res.data.map(mapApiClaim);
      }
      return res;
    },
    enabled: !!appId,
  });
}

/** Fetch a single claim definition by ID (requires appId for scoped endpoint) */
export function useClaimDefinition(appId: string, id: string) {
  return useQuery({
    queryKey: KEYS.definitionDetail(id),
    queryFn: async () => {
      const res = await api.get<ClaimDefinition>(`/applications/${appId}/claims/${id}`);
      const raw = (res as { data?: unknown })?.data ?? res;
      return mapApiClaim(raw);
    },
    enabled: !!appId && !!id,
  });
}

/** Create a new claim definition within an application */
export function useCreateClaimDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      appId,
      data,
    }: {
      appId: string;
      data: Partial<ClaimDefinition>;
    }) =>
      api.post<ClaimDefinition>(
        `/applications/${appId}/claims`,
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.definitions });
    },
  });
}

/** Archive (delete) a claim definition */
export function useArchiveClaimDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ appId, id }: { appId: string; id: string }) =>
      api.del(`/applications/${appId}/claims/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.definitions });
    },
  });
}

/** Fetch all claim values for a specific user */
export function useUserClaimValues(userId: string) {
  return useQuery({
    queryKey: KEYS.userClaimList(userId),
    queryFn: () =>
      api.get<UserClaimValue[]>(`/users/${userId}/claim-values`),
    enabled: !!userId,
  });
}

/** Set (create or update) a claim value for a user */
export function useSetUserClaimValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      claimDefinitionId,
      value,
    }: {
      userId: string;
      claimDefinitionId: string;
      value: unknown;
    }) =>
      api.post<UserClaimValue>(`/users/${userId}/claim-values`, {
        claimDefinitionId,
        value,
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEYS.userClaimList(v.userId) });
    },
  });
}
