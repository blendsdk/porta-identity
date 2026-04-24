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

/** Fetch a paginated list of claim definitions for an application */
export function useClaimDefinitions(appId: string, params?: ListParams) {
  return useQuery({
    queryKey: KEYS.definitionList(appId, params),
    queryFn: () =>
      api.get<PaginatedResponse<ClaimDefinition>>(
        `/applications/${appId}/claim-definitions`,
        params as Record<string, string>,
      ),
    enabled: !!appId,
  });
}

/** Fetch a single claim definition by ID */
export function useClaimDefinition(id: string) {
  return useQuery({
    queryKey: KEYS.definitionDetail(id),
    queryFn: () => api.get<ClaimDefinition>(`/claim-definitions/${id}`),
    enabled: !!id,
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
        `/applications/${appId}/claim-definitions`,
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
    mutationFn: (id: string) => api.del(`/claim-definitions/${id}`),
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
