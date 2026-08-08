/**
 * Data export types for the Porta SDK.
 *
 * @module types/exports
 */

export type ExportEntityType =
  | 'organizations'
  | 'applications'
  | 'clients'
  | 'users'
  | 'roles'
  | 'permissions'
  | 'audit';

export type ExportFormat = 'csv' | 'json';

export interface ExportParams {
  entityType: ExportEntityType;
  format?: ExportFormat;
  organizationId?: string;
  applicationId?: string;
}
