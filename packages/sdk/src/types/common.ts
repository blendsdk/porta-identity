/**
 * Common types shared across all SDK entity domains.
 *
 * @module types/common
 */

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Standard paginated list parameters accepted by all `list()` methods.
 */
export interface ListParams {
  /** Page number (1-based, offset pagination) */
  page?: number;
  /** Items per page (default: 20, max: 100) */
  pageSize?: number;
  /** Cursor for keyset pagination (alternative to page) */
  cursor?: string;
  /** Search query (searches name/email/slug depending on entity) */
  search?: string;
  /** Sort field (entity-specific) */
  sort?: string;
  /** Sort direction */
  order?: 'asc' | 'desc';
  /** Additional filter parameters */
  [key: string]: string | number | boolean | undefined | null;
}

/**
 * Paginated response shape returned by the API.
 */
export interface PaginatedResponse<T> {
  /** Array of entity items */
  data: T[];
  /** Total number of matching items */
  total: number;
  /** Current page number (offset pagination) */
  page?: number;
  /** Items per page */
  pageSize?: number;
  /** Total pages (offset pagination) */
  totalPages?: number;
  /** Next cursor value (keyset pagination) */
  cursor?: string;
  /** Whether more items exist after this page */
  hasMore?: boolean;
}

// ---------------------------------------------------------------------------
// ETag support
// ---------------------------------------------------------------------------

/**
 * Response wrapper for entities that support ETag concurrency.
 */
export interface ETagResponse<T> {
  /** The entity data */
  data: T;
  /** ETag value for optimistic concurrency (If-Match header) */
  etag: string | null;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/**
 * Entity change history entry returned by `getHistory()` methods.
 *
 * Mirrors the server `HistoryEntry` (src/lib/entity-history.ts) — entries are
 * audit-log rows projected to `{ id, eventType, actorId, metadata, createdAt }`.
 * The server has no `entityType`/`entityId`/`action`/`changes`/`performedBy`
 * fields; those were SDK drift (AR-18).
 */
export interface HistoryEntry {
  /** History entry (audit-log) ID */
  id: string;
  /** Event type (e.g., 'user.login', 'org.updated') */
  eventType: string;
  /** ID of the actor who triggered the event, or null for system events */
  actorId: string | null;
  /** Arbitrary event metadata recorded with the audit entry */
  metadata: Record<string, unknown> | null;
  /** ISO 8601 timestamp */
  createdAt: string;
}

