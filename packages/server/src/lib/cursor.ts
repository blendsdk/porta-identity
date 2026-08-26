/**
 * Cursor-based pagination utility.
 *
 * Provides opaque cursor encoding and decoding for keyset pagination.
 * Cursors encode the sort value and entity ID of the last item in a
 * result set, enabling efficient "next page" queries using:
 *
 *   WHERE (sort_column, id) > ($cursor_sort, $cursor_id)
 *
 * Cursors are base64url-encoded JSON strings — opaque to API consumers
 * but decodable by the server. Invalid or tampered cursors are safely
 * rejected (returns null from decodeCursor).
 *
 * @module lib/cursor
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Internal cursor payload — the data encoded inside an opaque cursor string.
 *
 * @property s - Sort field value at the cursor position (string, number, or null for NULLs)
 * @property i - Entity ID at the cursor position (UUID) — ensures stable ordering for ties
 */
export interface CursorPayload {
  /** Sort field value at the cursor position */
  s: string | number | null;
  /** Entity ID (UUID) — tie-breaker for stable ordering */
  i: string;
}

/**
 * Options for cursor-based pagination.
 *
 * When `cursor` is provided, keyset pagination is used.
 * When `page` is provided (without cursor), offset pagination is used.
 * When neither is provided, defaults to offset pagination page 1.
 */
export interface CursorPaginationOptions {
  /** Opaque cursor string from a previous response */
  cursor?: string;
  /** Maximum items per page (default 25, max 100) */
  limit?: number;
  /** Sort column (must be whitelisted per-entity) */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Result shape for cursor-paginated queries.
 *
 * Includes the data array, navigation cursors, and a hasMore flag.
 * `nextCursor` is null when there are no more results.
 * `previousCursor` is the cursor of the first item (for potential reverse navigation).
 */
export interface CursorPaginatedResult<T> {
  /** The page of results */
  data: T[];
  /** Cursor to fetch the next page — null if no more results */
  nextCursor: string | null;
  /** Cursor of the first item in this page — null if the page is empty */
  previousCursor: string | null;
  /** Whether there are more results after this page */
  hasMore: boolean;
}

// ============================================================================
// Encoding / Decoding
// ============================================================================

/**
 * Encode a cursor from the last item in a result set.
 *
 * Produces an opaque base64url string safe for URL query parameters.
 * The cursor encodes the sort value and entity ID, which together
 * define the exact position in the ordered result set.
 *
 * @param sortValue - The sort field value of the item (string, number, or null)
 * @param id - The entity UUID of the item
 * @returns Opaque cursor string
 *
 * @example
 * const cursor = encodeCursor('2026-01-15T10:00:00Z', 'abc-123');
 * // → 'eyJzIjoiMjAyNi0wMS0xNVQxMDowMDowMFoiLCJpIjoiYWJjLTEyMyJ9'
 */
export function encodeCursor(sortValue: string | number | null, id: string): string {
  const payload: CursorPayload = { s: sortValue, i: id };
  const json = JSON.stringify(payload);
  // Use base64url encoding (no padding) for URL safety
  return Buffer.from(json, 'utf-8').toString('base64url');
}

/**
 * Decode an opaque cursor string back to a CursorPayload.
 *
 * Returns null if the cursor is invalid — malformed base64, invalid JSON,
 * missing fields, or wrong types. This ensures tampered or corrupted
 * cursors are safely rejected without throwing exceptions.
 *
 * @param cursor - The opaque cursor string to decode
 * @returns Decoded payload, or null if invalid
 *
 * @example
 * const payload = decodeCursor('eyJzIjoiMjAyNi0wMS0xNVQxMDowMDowMFoiLCJpIjoiYWJjLTEyMyJ9');
 * // → { s: '2026-01-15T10:00:00Z', i: 'abc-123' }
 *
 * const invalid = decodeCursor('not-a-cursor');
 * // → null
 */
export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed: unknown = JSON.parse(json);

    // Validate shape: must be an object with 's' and 'i' fields
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('s' in parsed) ||
      !('i' in parsed)
    ) {
      return null;
    }

    const obj = parsed as Record<string, unknown>;

    // Validate 'i' is a non-empty string (entity ID)
    if (typeof obj.i !== 'string' || obj.i.length === 0) {
      return null;
    }

    // Validate 's' is string, number, or null (sort value)
    const sortType = typeof obj.s;
    if (obj.s !== null && sortType !== 'string' && sortType !== 'number') {
      return null;
    }

    return {
      s: obj.s as string | number | null,
      i: obj.i as string,
    };
  } catch {
    // JSON parse error, base64 decode error, etc.
    return null;
  }
}

// ============================================================================
// Result Builder
// ============================================================================

/**
 * Build a CursorPaginatedResult from a query result set.
 *
 * The caller should query for `limit + 1` rows. If the extra row exists,
 * `hasMore` is true and the extra row is stripped from the result.
 * Cursors are generated using the provided sort value extractor function.
 *
 * @param rows - Raw query rows (may include the extra hasMore row)
 * @param limit - The requested page size
 * @param getSortValue - Function to extract the sort value from a row
 * @param getId - Function to extract the entity ID from a row
 * @returns CursorPaginatedResult with cursors and hasMore flag
 */
export function buildCursorResult<T>(
  rows: T[],
  limit: number,
  getSortValue: (row: T) => string | number | null,
  getId: (row: T) => string,
): CursorPaginatedResult<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  const nextCursor = hasMore && data.length > 0
    ? encodeCursor(getSortValue(data[data.length - 1]), getId(data[data.length - 1]))
    : null;

  const previousCursor = data.length > 0
    ? encodeCursor(getSortValue(data[0]), getId(data[0]))
    : null;

  return { data, nextCursor, previousCursor, hasMore };
}
