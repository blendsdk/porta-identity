/**
 * System configuration API hooks.
 *
 * Provides React Query hooks for reading and updating
 * global Porta system configuration key-value entries.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { SystemConfig } from '../types';

/** Query key factory for system configuration */
const KEYS = {
  all: ['config'] as const,
};

/**
 * Fetch all system configuration entries.
 *
 * @returns React Query result containing an array of {@link SystemConfig} entries.
 */
export function useSystemConfig() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn: () => api.get<SystemConfig[]>('/config'),
  });
}

/**
 * Update (or create) a system configuration entry.
 *
 * Automatically invalidates the config cache on success.
 *
 * @returns React Query mutation for posting a key-value pair.
 */
export function useUpdateConfig() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: { key: string; value: string }) =>
      api.post<SystemConfig>('/config', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}
