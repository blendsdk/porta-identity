/**
 * Entity change history helper.
 *
 * Provides per-entity audit trail queries by filtering the `audit_log`
 * table on `entity_type` and `entity_id`. Supports cursor-based pagination
 * for efficient scrolling through large audit trails.
 *
 * Used by entity route handlers (organizations, applications, clients, users)
 * to expose GET /:id/history endpoints.
 *
 * @module entity-history
 * @see 05-dashboard-sessions-history.md
 */

import { getPool } from './database.js';

// ============================================================================
// Types
// ============================================================================

/** A single audit log entry for entity history */
export interface HistoryEntry {
  id: string;
  eventType: string;
  actorId: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/** Options for querying entity history */
export interface HistoryOptions {
  /** Maximum number of entries to return (default: 20, max: 100) */
  limit?: number;
  /** Cursor for pagination (audit log ID to start after) */
  after?: string;
  /** Filter by event type prefix (e.g., 'org.' for all org events) */
  eventTypePrefix?: string;
}

/** Paginated history response */
export interface HistoryResult {
  data: HistoryEntry[];
  hasMore: boolean;
  nextCursor: string | null;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Get the change history for a specific entity from the audit log.
 *
 * Queries the `audit_log` table filtered by entity type and ID,
 * returning entries in reverse chronological order (newest first).
 * Supports cursor-based pagination via the `after` parameter.
 *
 * @param entityType - The entity type (e.g., 'organization', 'user')
 * @param entityId - The entity's UUID
 * @param options - Pagination and filter options
 * @returns Paginated history entries
 */
export async function getEntityHistory(
  entityType: string,
  entityId: string,
  options: HistoryOptions = {},
): Promise<HistoryResult> {
  const pool = getPool();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  // Fetch one extra to determine hasMore
  const fetchLimit = limit + 1;

  const conditions: string[] = ['entity_type = $1', 'entity_id = $2'];
  const params: unknown[] = [entityType, entityId];
  let paramIndex = 3;

  if (options.after) {
    conditions.push(`id < $${paramIndex}`);
    params.push(options.after);
    paramIndex++;
  }

  if (options.eventTypePrefix) {
    conditions.push(`event_type LIKE $${paramIndex}`);
    params.push(`${options.eventTypePrefix}%`);
    paramIndex++;
  }

  params.push(fetchLimit);

  const { rows } = await pool.query<{
    id: string;
    event_type: string;
    actor_id: string | null;
    actor_email: string | null;
    metadata: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT id, event_type, actor_id, actor_email, metadata, created_at
     FROM audit_log
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT $${paramIndex}`,
    params,
  );

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((row) => ({
    id: row.id,
    eventType: row.event_type,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));

  return {
    data,
    hasMore,
    nextCursor: hasMore && data.length > 0 ? data[data.length - 1].id : null,
  };
}
