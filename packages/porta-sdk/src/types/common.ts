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
 */
export interface HistoryEntry {
  /** History entry ID */
  id: string;
  /** Entity type (e.g., 'organization', 'user') */
  entityType: string;
  /** Entity ID */
  entityId: string;
  /** Action performed (e.g., 'created', 'updated', 'status_changed') */
  action: string;
  /** Changes made (field → { old, new }) */
  changes: Record<string, { old: unknown; new: unknown }>;
  /** User who made the change */
  performedBy: string | null;
  /** ISO 8601 timestamp */
  createdAt: string;
}
