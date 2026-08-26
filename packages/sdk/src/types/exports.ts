/**
 * Data export types for the Porta SDK.
 *
 * @module types/exports
 */

/** Closed administrative entity catalog supported by the export API. */
export type ExportEntityType = 'organizations' | 'clients' | 'users' | 'roles' | 'audit';

/** Public export representation. */
export type ExportFormat = 'csv' | 'json';

/** Exact scope and representation for one administrative export. */
export interface ExportParams {
  /** Supported entity catalog. */
  entityType: ExportEntityType;
  /** Output representation; defaults to JSON on the server. */
  format?: ExportFormat;
  /** Required tenant scope for users, clients, roles, and audit. */
  organizationId?: string;
  /** Required application relationship for role exports. */
  applicationId?: string;
  /** Required inclusive audit-window start. */
  startDate?: string;
  /** Required inclusive audit-window end. */
  endDate?: string;
}
