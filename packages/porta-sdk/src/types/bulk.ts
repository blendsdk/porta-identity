/**
 * Bulk operation types for the Porta SDK.
 *
 * @module types/bulk
 */

export type BulkEntityType = 'organizations' | 'users';
export type BulkAction = 'suspend' | 'activate' | 'deactivate' | 'lock' | 'unlock';

export interface BulkOperationInput {
  entityType: BulkEntityType;
  action: BulkAction;
  ids: string[];
}

export interface BulkOperationResult {
  succeeded: number;
  failed: number;
  errors: BulkItemError[];
}

export interface BulkItemError {
  id: string;
  error: string;
}
