/**
 * Bulk operation types for the Porta SDK.
 *
 * Types mirror the server's bulk-operations module and route schemas.
 * Server has two separate endpoints:
 *   POST /api/admin/bulk/organizations/status
 *   POST /api/admin/bulk/users/status
 *
 * @module types/bulk
 */

/** Organization bulk status actions (matches server Zod schema) */
export type BulkOrgAction = 'activate' | 'suspend' | 'archive';

/** User bulk status actions (matches server Zod schema) */
export type BulkUserAction = 'activate' | 'deactivate' | 'suspend' | 'lock' | 'unlock';

/** Input for bulk organization status change */
export interface BulkOrgStatusInput {
  /** Organization IDs (1–100 UUIDs) */
  ids: string[];
  /** Status action to apply */
  action: BulkOrgAction;
  /** Optional reason for the action */
  reason?: string;
}

/** Input for bulk user status change */
export interface BulkUserStatusInput {
  /** User IDs (1–100 UUIDs) */
  ids: string[];
  /** Status action to apply */
  action: BulkUserAction;
  /** Optional reason for the action */
  reason?: string;
  /** Organization ID scope — required for user bulk operations */
  organizationId: string;
}

/** Result of a single item in a bulk operation */
export interface BulkItemResult {
  /** Entity ID */
  id: string;
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Status before the operation */
  previousStatus?: string;
  /** Status after the operation */
  newStatus?: string;
}

/** Summary result of a bulk operation — matches server BulkOperationResult */
export interface BulkOperationResult {
  /** Total items processed */
  total: number;
  /** Number of successful operations */
  succeeded: number;
  /** Number of failed operations */
  failed: number;
  /** Per-item results */
  results: BulkItemResult[];
}
