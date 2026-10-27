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
  /** Porta user identifier for a user actor. */
  actorId: string | null;
  /** Actor class: a Porta user, an OAuth service client, or the system. */
  actorType: 'user' | 'client' | 'system';
  /** OAuth client identifier for a client actor. */
  actorClientId: string | null;
  /** OAuth client name captured at event time for a client actor. */
  actorClientName: string | null;
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

/** Supported entity types for change-history queries. */
export type HistoryEntityType = 'organization' | 'user' | 'application' | 'client';

/** Paginated history response */
export interface HistoryResult {
  data: HistoryEntry[];
  hasMore: boolean;
  nextCursor: string | null;
}

// ============================================================================
// Entity type → audit_log scope mapping
// ============================================================================

/**
 * Describes how one entity type is referenced from the audit log.
 *
 * Organizations and users have dedicated FK columns. Applications and clients are deployment-global
 * records without audit FK columns, so their events store the identifier in JSONB metadata. Those
 * families also carry a mandatory event-type prefix to prevent a client event from appearing in an
 * application history (or the reverse).
 */
interface HistoryScope {
  /** SQL expression compared to the entity id parameter */
  referenceExpression: string;
  /** Mandatory event-type prefix for metadata-backed entity families */
  eventTypeFamily?: string;
}

/** Entity-specific audit scopes. */
const ENTITY_SCOPES: Record<HistoryEntityType, HistoryScope> = {
  organization: { referenceExpression: 'organization_id' },
  user: { referenceExpression: 'user_id' },
  application: {
    referenceExpression: "metadata->>'applicationId'",
    eventTypeFamily: 'app.',
  },
  client: {
    referenceExpression: "COALESCE(metadata->>'clientDbId', metadata->>'clientId')",
    eventTypeFamily: 'client.',
  },
};

/**
 * Resolve the audit scope for one entity type.
 *
 * @param entityType - Entity type supplied by a route
 * @returns The matching scope
 * @throws Error when the entity type is not supported
 */
function resolveHistoryScope(entityType: string): HistoryScope {
  const scope = (ENTITY_SCOPES as Record<string, HistoryScope | undefined>)[entityType];
  if (!scope) {
    throw new Error(`Unsupported entity type for history: ${entityType}`);
  }
  return scope;
}

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
 * @param entityType - The entity type (organization, user, application, or client)
 * @param entityId - The entity's UUID
 * @param options - Pagination and filter options
 * @returns Paginated history entries
 */
export async function getEntityHistory(
  entityType: HistoryEntityType,
  entityId: string,
  options: HistoryOptions = {},
): Promise<HistoryResult> {
  const pool = getPool();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  // Fetch one extra to determine hasMore
  const fetchLimit = limit + 1;

  const scope = resolveHistoryScope(entityType);
  const conditions: string[] = [`${scope.referenceExpression} = $1`];
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

  if (scope.eventTypeFamily) {
    conditions.push(`event_type LIKE $${paramIndex}`);
    params.push(`${scope.eventTypeFamily}%`);
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
    actor_type: 'user' | 'client' | 'system';
    actor_client_id: string | null;
    actor_client_name: string | null;
    metadata: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT id, event_type, actor_id, actor_type, actor_client_id, actor_client_name,
            metadata, created_at
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
    actorType: row.actor_type,
    actorClientId: row.actor_client_id,
    actorClientName: row.actor_client_name,
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
