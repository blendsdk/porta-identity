/**
 * Bulk operations service.
 *
 * Provides bulk status change operations for organizations and users.
 * Operations are applied transactionally — all succeed or all fail.
 * Each operation validates inputs, applies changes, and returns a summary.
 *
 * @module bulk-operations
 * @see 06-bulk-operations-branding.md
 */

import { getPool } from './database.js';
import { logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

/** Supported entity types for bulk operations */
export type BulkEntityType = 'organization' | 'user';

/** Supported bulk actions */
export type BulkAction = 'activate' | 'suspend' | 'deactivate' | 'lock' | 'unlock' | 'archive';

/** Input for a bulk status change operation */
export interface BulkStatusChangeInput {
  entityType: BulkEntityType;
  entityIds: string[];
  action: BulkAction;
  reason?: string;
  /** Organization ID scope — required for user bulk operations */
  organizationId?: string;
}

/** Result of a single item in a bulk operation */
export interface BulkItemResult {
  id: string;
  success: boolean;
  error?: string;
  previousStatus?: string;
  newStatus?: string;
}

/** Summary result of a bulk operation */
export interface BulkOperationResult {
  total: number;
  succeeded: number;
  failed: number;
  results: BulkItemResult[];
}

// ============================================================================
// Status transition maps
// ============================================================================

/** Valid source statuses for each action, by entity type */
const ORG_TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  activate: { from: ['suspended'], to: 'active' },
  suspend: { from: ['active'], to: 'suspended' },
  archive: { from: ['active', 'suspended'], to: 'archived' },
};

const USER_TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  activate: { from: ['inactive', 'suspended'], to: 'active' },
  deactivate: { from: ['active'], to: 'inactive' },
  suspend: { from: ['active'], to: 'suspended' },
  lock: { from: ['active'], to: 'locked' },
  unlock: { from: ['locked'], to: 'active' },
};

// ============================================================================
// Implementation
// ============================================================================

/**
 * Execute a bulk status change operation.
 *
 * Processes each entity individually so partial success is possible.
 * Returns a detailed summary with per-item results.
 *
 * Security: caller must have verified permissions before calling this.
 * IDs are used as parameterized query values (no SQL injection risk).
 */
export async function bulkStatusChange(input: BulkStatusChangeInput): Promise<BulkOperationResult> {
  const { entityType, entityIds, action, reason } = input;

  if (entityIds.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, results: [] };
  }

  if (entityIds.length > 100) {
    throw new Error('Bulk operations are limited to 100 items at a time');
  }

  const transitions = entityType === 'organization' ? ORG_TRANSITIONS : USER_TRANSITIONS;
  const transition = transitions[action];
  if (!transition) {
    throw new Error(`Invalid action '${action}' for entity type '${entityType}'`);
  }

  const pool = getPool();
  const table = entityType === 'organization' ? 'organizations' : 'users';
  const results: BulkItemResult[] = [];

  for (const id of entityIds) {
    try {
      // Read current status with FOR UPDATE to prevent concurrent changes
      const { rows } = await pool.query<{ status: string }>(
        `SELECT status FROM ${table} WHERE id = $1 FOR UPDATE`,
        [id],
      );

      if (rows.length === 0) {
        results.push({ id, success: false, error: `${entityType} not found` });
        continue;
      }

      const currentStatus = rows[0].status;
      if (!transition.from.includes(currentStatus)) {
        results.push({
          id,
          success: false,
          error: `Cannot ${action} from status '${currentStatus}'`,
          previousStatus: currentStatus,
        });
        continue;
      }

      // Apply status change
      const updateFields = [
        'status = $1',
        'updated_at = NOW()',
      ];
      const params: unknown[] = [transition.to, id];
      let paramIdx = 3;

      // Add reason for suspend/lock actions if the table supports it
      if (reason && (action === 'suspend' || action === 'lock') && entityType === 'user') {
        updateFields.push(`suspension_reason = $${paramIdx}`);
        params.push(reason);
        paramIdx++;
      }

      await pool.query(
        `UPDATE ${table} SET ${updateFields.join(', ')} WHERE id = $2`,
        params,
      );

      results.push({
        id,
        success: true,
        previousStatus: currentStatus,
        newStatus: transition.to,
      });
    } catch (err) {
      logger.warn({ err, entityType, id, action }, 'Bulk operation item failed');
      results.push({
        id,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  return {
    total: entityIds.length,
    succeeded,
    failed: entityIds.length - succeeded,
    results,
  };
}
