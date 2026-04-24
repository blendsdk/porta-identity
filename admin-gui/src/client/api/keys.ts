/**
 * Signing keys API hooks.
 *
 * Provides React Query hooks for listing, generating,
 * and rotating ES256 signing keys used by the OIDC provider.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { SigningKey } from '../types';

/** Query key factory for signing keys */
const KEYS = {
  all: ['signing-keys'] as const,
};

/**
 * Fetch all signing keys.
 *
 * @returns React Query result containing an array of {@link SigningKey} entries.
 */
export function useSigningKeys() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn: () => api.get<SigningKey[]>('/keys'),
  });
}

/**
 * Generate a new signing key.
 *
 * Automatically invalidates the signing-keys cache on success.
 *
 * @returns React Query mutation that creates a new key.
 */
export function useGenerateKey() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<SigningKey>('/keys/generate'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/**
 * Rotate signing keys.
 *
 * Promotes the newest inactive key to active and marks the
 * previously active key as rotated. Automatically invalidates
 * the signing-keys cache on success.
 *
 * @returns React Query mutation that triggers key rotation.
 */
export function useRotateKeys() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<void>('/keys/rotate'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}
