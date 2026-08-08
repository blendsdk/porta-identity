/**
 * Pagination types and helpers for the Porta SDK.
 *
 * The server uses two pagination strategies:
 * - **Offset-based**: `page`, `pageSize`, `totalPages` (legacy endpoints)
 * - **Cursor-based**: `cursor`, `hasMore`, `limit` (newer endpoints)
 *
 * The `listAll` helper auto-detects the strategy from the first
 * response and fetches all remaining pages sequentially.
 */

/**
 * Paginated response from the server.
 *
 * The response shape varies by pagination strategy — offset-based
 * endpoints include `page`/`totalPages`, cursor-based include
 * `cursor`/`hasMore`. Both always include `data` and `total`.
 */
export interface PaginatedResult<T> {
  /** Array of entities for the current page */
  data: T[];

  /** Total number of entities across all pages */
  total: number;

  // ── Offset-based pagination fields ──

  /** Current page number (1-based). Present for offset-based pagination. */
  page?: number;

  /** Number of items per page. Present for offset-based pagination. */
  pageSize?: number;

  /** Total number of pages. Present for offset-based pagination. */
  totalPages?: number;

  // ── Cursor-based pagination fields ──

  /** Cursor for the next page. Null when on the last page. */
  cursor?: string | null;

  /** Whether more pages exist after this one. */
  hasMore?: boolean;
}

/**
 * Parameters for paginated list endpoints.
 *
 * Domain methods accept these to control pagination, filtering,
 * and sorting. Not all fields apply to all endpoints — the domain
 * method passes only what the server supports.
 */
export interface PaginatedListParams {
  // ── Offset-based ──

  /** Page number (1-based) for offset pagination */
  page?: number;

  /** Items per page for offset pagination */
  pageSize?: number;

  // ── Cursor-based ──

  /** Cursor for cursor-based pagination */
  cursor?: string;

  /** Items per page for cursor-based pagination */
  limit?: number;

  // ── Common filters ──

  /** Free-text search query */
  search?: string;

  /** Field to sort by */
  sortBy?: string;

  /** Sort direction */
  sortOrder?: 'asc' | 'desc';

  /** Additional domain-specific filter parameters */
  [key: string]: string | number | boolean | undefined | null;
}

/**
 * Fetches all pages of a paginated endpoint and returns the
 * combined results as a flat array.
 *
 * Auto-detects the pagination strategy from the first response:
 * - If `cursor`/`hasMore` fields are present → cursor-based iteration
 * - If `totalPages` is present → offset-based iteration
 * - Otherwise → returns just the first page's data
 *
 * @param fetchPage - Function that fetches a single page
 * @param params - Base parameters (page/cursor excluded — managed internally)
 * @param options - Optional AbortSignal for cancellation
 * @returns Combined array of all entities across all pages
 *
 * @throws Immediately on any page fetch error (no partial results)
 * @throws {DOMException} If the AbortSignal is triggered
 *
 * @example
 * ```typescript
 * const allOrgs = await listAll(
 *   (p) => client.organizations.list(p),
 *   { search: 'acme', sortBy: 'name' },
 * );
 * ```
 */
export async function listAll<T>(
  fetchPage: (params: PaginatedListParams) => Promise<PaginatedResult<T>>,
  params?: Omit<PaginatedListParams, 'page' | 'cursor'>,
  options?: { signal?: AbortSignal },
): Promise<T[]> {
  const baseParams = { ...params } as PaginatedListParams;
  const signal = options?.signal;

  // Fetch the first page to detect pagination strategy
  const firstPage = await fetchPage({ ...baseParams, page: 1 });
  const allData = [...firstPage.data];

  // Detect cursor-based pagination (hasMore field present)
  if (typeof firstPage.hasMore === 'boolean') {
    let nextCursor = firstPage.cursor;
    let hasMore = firstPage.hasMore;

    while (hasMore && nextCursor) {
      signal?.throwIfAborted();
      const nextPage = await fetchPage({ ...baseParams, cursor: nextCursor });
      allData.push(...nextPage.data);
      nextCursor = nextPage.cursor;
      hasMore = nextPage.hasMore ?? false;
    }

    return allData;
  }

  // Detect offset-based pagination (totalPages field present)
  if (typeof firstPage.totalPages === 'number' && firstPage.totalPages > 1) {
    for (let page = 2; page <= firstPage.totalPages; page++) {
      signal?.throwIfAborted();
      const nextPage = await fetchPage({ ...baseParams, page });
      allData.push(...nextPage.data);
    }

    return allData;
  }

  // Single page or unknown strategy — return what we have
  return allData;
}
