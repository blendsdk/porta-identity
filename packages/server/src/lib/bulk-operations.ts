/**
 * Tenant-safe bulk status operations with ordered partial results.
 *
 * Whole-request validation completes before the first mutation. Each admitted item then owns one
 * database transaction containing its lock, transition, update, and durable audit record. Domain
 * rejections are isolated to that item. Dependency failures stop the operation and mark the
 * current and remaining items as not attempted.
 */

import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from './database.js';
import { logger } from './logger.js';
import { writeAuditLogInTransaction } from './audit-log.js';
import { invalidateOrganizationCache } from '../organizations/cache.js';
import { invalidateUserCache } from '../users/cache.js';
import { SUPER_ADMIN_USER_ID_KEY } from './super-admin-protection.js';

/** Supported entity types for bulk operations. */
export type BulkEntityType = 'organization' | 'user';

/** Supported actions across both bulk entity types. */
export type BulkAction = 'activate' | 'suspend' | 'deactivate';

/** Closed public outcome for one requested item. */
export type BulkItemOutcome = 'succeeded' | 'failed' | 'not_attempted';

/** Closed public reason for an unsuccessful item. */
export type BulkItemCode = 'not_found_or_not_authorized' | 'invalid_transition' | 'not_attempted';

/** Input for a validated bulk status operation. */
export interface BulkStatusChangeInput {
  readonly entityType: BulkEntityType;
  readonly entityIds: readonly string[];
  readonly action: BulkAction;
  readonly reason?: string;
  /** Required tenant scope for user operations. */
  readonly organizationId?: string;
  /** Authenticated administrator recorded in each committed audit entry. */
  readonly actorId?: string;
}

/** Public result for one item, preserving the original compatibility fields. */
export interface BulkItemResult {
  readonly id: string;
  readonly success: boolean;
  readonly outcome: BulkItemOutcome;
  readonly code: BulkItemCode | null;
  readonly error?: string;
  readonly previousStatus?: string;
  readonly newStatus?: string;
}

/** Ordered public summary for one bulk operation. */
export interface BulkOperationResult {
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly results: readonly BulkItemResult[];
  /** Present only when infrastructure stopped processing. */
  readonly correlationId?: string;
}

interface StatusTransition {
  readonly from: readonly string[];
  readonly to: string;
}

const ORGANIZATION_TRANSITIONS: Readonly<Record<string, StatusTransition>> = Object.freeze({
  activate: { from: ['suspended'], to: 'active' },
  suspend: { from: ['active'], to: 'suspended' },
});

const USER_TRANSITIONS: Readonly<Record<string, StatusTransition>> = Object.freeze({
  activate: { from: ['inactive'], to: 'active' },
  deactivate: { from: ['active'], to: 'inactive' },
});

const MAXIMUM_ITEMS = 100;
const MAXIMUM_REASON_CHARACTERS = 500;

/** Validate every request-level invariant before opening an item transaction. */
function requireValidInput(input: BulkStatusChangeInput): StatusTransition | undefined {
  if (input.entityIds.length === 0) return undefined;
  if (input.entityIds.length > MAXIMUM_ITEMS) {
    throw new Error('Bulk operations are limited to 100 items at a time');
  }
  if (new Set(input.entityIds).size !== input.entityIds.length) {
    throw new Error('Bulk operations require unique entity identifiers');
  }
  if (input.reason !== undefined && input.reason.length > MAXIMUM_REASON_CHARACTERS) {
    throw new Error('Bulk operation reason is limited to 500 characters');
  }
  if (input.entityType === 'user' && !input.organizationId) {
    throw new Error('Organization scope is required for user bulk operations');
  }

  const transitions =
    input.entityType === 'organization' ? ORGANIZATION_TRANSITIONS : USER_TRANSITIONS;
  const transition = transitions[input.action];
  if (!transition) {
    throw new Error(`Invalid action '${input.action}' for entity type '${input.entityType}'`);
  }
  return transition;
}

/** Roll back an open item transaction before returning a domain rejection. */
async function rollback(client: PoolClient): Promise<void> {
  await client.query('ROLLBACK');
}

/** One locked target; protected identities are indistinguishable from missing ones in the result. */
interface LockedTarget {
  readonly status: string;
  readonly protected: boolean;
  readonly slug?: string;
}

/**
 * Build tenant-qualified locks.
 *
 * The protected flag is read under the same row lock as the status. A protected target is rejected
 * before any write, using the existing concealed result code so bulk callers cannot learn that a
 * bootstrap identity exists. Permanent service users remain excluded before any row lock.
 */
async function lockCurrentStatus(
  client: PoolClient,
  input: BulkStatusChangeInput,
  id: string,
): Promise<LockedTarget | undefined> {
  if (input.entityType === 'user') {
    const result = await client.query<LockedTarget>(
      `SELECT users.status,
              (users.id::text = (
                SELECT (config.value #>> '{}')
                FROM system_config AS config
                WHERE config.key = $3
              )) AS protected
       FROM users
       WHERE users.id = $1 AND users.organization_id = $2 AND NOT users.is_service_account
       FOR UPDATE`,
      [id, input.organizationId, SUPER_ADMIN_USER_ID_KEY],
    );
    return result.rows[0];
  }

  const result = await client.query<LockedTarget>(
    `SELECT status, is_super_admin AS protected, slug
     FROM organizations
     WHERE id = $1
     FOR UPDATE`,
    [id],
  );
  return result.rows[0];
}

/** Persist the status transition using only closed table and field choices. */
async function updateStatus(
  client: PoolClient,
  input: BulkStatusChangeInput,
  id: string,
  nextStatus: string,
): Promise<void> {
  if (input.entityType === 'user') {
    await client.query(
      `UPDATE users SET status = $1, updated_at = NOW()
        WHERE id = $2 AND organization_id = $3 AND NOT is_service_account`,
      [nextStatus, id, input.organizationId],
    );
    return;
  }

  await client.query('UPDATE organizations SET status = $1, updated_at = NOW() WHERE id = $2', [
    nextStatus,
    id,
  ]);
}

/** Insert the per-item audit record through the same transaction as the mutation. */
async function insertAudit(
  client: PoolClient,
  input: BulkStatusChangeInput,
  id: string,
  previousStatus: string,
  nextStatus: string,
): Promise<void> {
  const organizationId = input.entityType === 'organization' ? id : input.organizationId;
  const userId = input.entityType === 'user' ? id : null;
  await writeAuditLogInTransaction(client, {
    organizationId,
    ...(userId === null ? {} : { userId }),
    ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
    eventType: `admin.bulk.${input.entityType}.status_changed`,
    eventCategory: 'admin',
    metadata: { action: input.action, previousStatus, newStatus: nextStatus },
  });
}

/** Create one concealed missing/foreign item result. */
function concealedResult(id: string): BulkItemResult {
  return {
    id,
    success: false,
    outcome: 'failed',
    code: 'not_found_or_not_authorized',
    error: 'Entity not found or not authorized',
  };
}

/** Create one closed invalid-transition result. */
function invalidTransitionResult(id: string, previousStatus: string): BulkItemResult {
  return {
    id,
    success: false,
    outcome: 'failed',
    code: 'invalid_transition',
    error: 'Status transition not allowed',
    previousStatus,
  };
}

/** Create an explicit result for work skipped after dependency failure. */
function notAttemptedResult(id: string): BulkItemResult {
  return {
    id,
    success: false,
    outcome: 'not_attempted',
    code: 'not_attempted',
    error: 'Operation not attempted',
  };
}

/**
 * Execute an ordered partial-result bulk status operation.
 *
 * @param input - Fully validated entity, action, scope, and actor input.
 * @returns Ordered item outcomes. A dependency stop includes one server correlation ID.
 */
export async function bulkStatusChange(input: BulkStatusChangeInput): Promise<BulkOperationResult> {
  const transition = requireValidInput(input);
  if (!transition) {
    return { total: 0, succeeded: 0, failed: 0, results: [] };
  }

  const pool = getPool();
  const results: BulkItemResult[] = [];
  let correlationId: string | undefined;

  for (let index = 0; index < input.entityIds.length; index += 1) {
    const id = input.entityIds[index];
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const target = await lockCurrentStatus(client, input, id);
      if (target === undefined || target.protected) {
        await rollback(client);
        results.push(concealedResult(id));
        continue;
      }
      if (!transition.from.includes(target.status)) {
        await rollback(client);
        results.push(invalidTransitionResult(id, target.status));
        continue;
      }

      await updateStatus(client, input, id, transition.to);
      await insertAudit(client, input, id, target.status, transition.to);
      await client.query('COMMIT');
      // Cache invalidation is intentionally post-commit and non-fatal. A stale entry is preferable
      // to reporting a committed status change as failed because Redis or its callback is absent.
      try {
        if (input.entityType === 'user') await invalidateUserCache(id);
        else if (target.slug) await invalidateOrganizationCache(target.slug, id);
      } catch {
        logger.warn(
          { entityType: input.entityType, action: input.action },
          'Bulk status cache invalidation failed after commit',
        );
      }
      results.push({
        id,
        success: true,
        outcome: 'succeeded',
        code: null,
        previousStatus: target.status,
        newStatus: transition.to,
      });
    } catch {
      if (client) {
        try {
          await rollback(client);
        } catch {
          // The public result remains the same when rollback outcome is unknown.
        }
      }
      correlationId = randomUUID();
      logger.warn(
        { correlationId, entityType: input.entityType, action: input.action },
        'Bulk operation stopped after a dependency failure',
      );
      for (let pending = index; pending < input.entityIds.length; pending += 1) {
        results.push(notAttemptedResult(input.entityIds[pending]));
      }
      break;
    } finally {
      client?.release();
    }
  }

  const succeeded = results.filter((result) => result.outcome === 'succeeded').length;
  return {
    total: input.entityIds.length,
    succeeded,
    failed: input.entityIds.length - succeeded,
    results,
    ...(correlationId ? { correlationId } : {}),
  };
}
