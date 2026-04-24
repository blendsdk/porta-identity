/**
 * Import/Export API hooks.
 *
 * Provides React Query mutations for bulk-exporting and
 * bulk-importing Porta entities in CSV or JSON format.
 */
import { useMutation } from '@tanstack/react-query';
import { api } from './client';

/** Supported export file formats */
export type ExportFormat = 'csv' | 'json';

/** Entity types that support bulk import/export */
export type EntityType =
  | 'organizations'
  | 'applications'
  | 'clients'
  | 'users'
  | 'roles'
  | 'permissions';

/**
 * Export entities of a given type in the requested format.
 *
 * @returns React Query mutation that downloads a {@link Blob}
 *          containing the exported data.
 */
export function useExportData() {
  return useMutation({
    mutationFn: ({
      entityType,
      format,
    }: {
      entityType: EntityType;
      format: ExportFormat;
    }) => api.get<Blob>(`/export/${entityType}`, { format }),
  });
}

/**
 * Import an array of entity records into the system.
 *
 * @returns React Query mutation that posts the data array and
 *          returns the number of successfully imported records.
 */
export function useImportData() {
  return useMutation({
    mutationFn: ({
      entityType,
      data,
    }: {
      entityType: EntityType;
      data: unknown[];
    }) => api.post<{ imported: number }>(`/import/${entityType}`, { data }),
  });
}
