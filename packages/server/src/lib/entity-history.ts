/**
 * Entity change history helper.
 *
 * Provides per-entity audit trail queries by filtering the `audit_log`
 * table on the appropriate FK column (organization_id or user_id).
 * Supports cursor-based pagination for efficient scrolling through
 * large audit trails.
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
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/** Options for querying entity history */
export interface HistoryOptions {
  /** Maximum number of entries to return (default: 20, max: 100) */
  limit?: number;
  /** Opaque cursor for pagination (pass nextCursor from previous response) */
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
// Entity type → audit_log FK column mapping
// ============================================================================

/**
 * Maps entity types to the corresponding audit_log FK column.
 * The audit_log table stores references via organization_id and user_id
 * columns — there is no generic entity_type/entity_id pair.
 */
const ENTITY_FK_COLUMN: Record<string, string> = {
  organization: 'organization_id',
  user: 'user_id',
};

// ============================================================================
// Cursor helpers
// ============================================================================

/** Decoded cursor containing both sort-key fields */
interface DecodedCursor {
  createdAt: string;
  id: string;
}

/**
 * Encode a composite pagination cursor from the last row's created_at and id.
 *
 * The cursor is a base64url-encoded JSON object `{ c, i }` where `c` is the
 * ISO 8601 timestamp and `i` is the UUID. This ensures keyset pagination
 * works correctly even with random UUIDs (v4), because the row-value
 * comparison `(created_at, id) < (cursor.c, cursor.i)` respects the
 * `ORDER BY created_at DESC, id DESC` ordering.
 */
function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ c: createdAt.toISOString(), i: id })).toString('base64url');
}

/**
 * Decode a composite pagination cursor back into its constituent fields.
 *
 * @throws Error if the cursor is malformed or missing required fields
 */
function decodeCursor(cursor: string): DecodedCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      c?: string;
      i?: string;
    };
    if (!parsed.c || !parsed.i) {
      throw new Error('Missing cursor fields');
    }
    return { createdAt: parsed.c, id: parsed.i };
  } catch {
    throw new Error('Invalid pagination cursor');
  }
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Get the change history for a specific entity from the audit log.
 *
 * Queries the `audit_log` table filtered by the appropriate FK column
 * for the given entity type, returning entries in reverse chronological
 * order (newest first). Supports cursor-based pagination via the
 * `after` parameter.
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

  const fkColumn = ENTITY_FK_COLUMN[entityType];
  if (!fkColumn) {
    throw new Error(`Unsupported entity type for history: ${entityType}`);
  }

  const conditions: string[] = [`${fkColumn} = $1`];
  const params: unknown[] = [entityId];
  let paramIndex = 2;

  if (options.after) {
    // Decode composite cursor: base64-encoded JSON { c: ISO timestamp, i: UUID }
    // Row-value comparison ensures correct keyset pagination with the
    // ORDER BY created_at DESC, id DESC sort order, regardless of random UUID values.
    const cursor = decodeCursor(options.after);
    conditions.push(`(created_at, id) < ($${paramIndex}, $${paramIndex + 1})`);
    params.push(cursor.createdAt, cursor.id);
    paramIndex += 2;
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
    metadata: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT id, event_type, actor_id, metadata, created_at
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
    metadata: row.metadata,
    createdAt: row.created_at,
  }));

  return {
    data,
    hasMore,
    nextCursor:
      hasMore && data.length > 0
        ? encodeCursor(data[data.length - 1].createdAt, data[data.length - 1].id)
        : null,
  };
}
