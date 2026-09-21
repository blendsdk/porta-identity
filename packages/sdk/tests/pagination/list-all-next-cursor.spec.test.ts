/**
 * Contract tests for server-aligned cursor pagination.
 *
 * The Porta server returns the next-page token as `nextCursor`. These immutable
 * specifications pin the `listAll` helper to that wire field so a cursor page
 * can advance, while the legacy `cursor` alias keeps working for older callers.
 */
import { describe, it, expect, vi } from 'vitest';
import { listAll } from '../../src/pagination/index.js';
import type { PaginatedResult, PaginatedListParams } from '../../src/pagination/index.js';

interface TestEntity {
  id: number;
}

describe('listAll — server nextCursor contract', () => {
  it('advances pages using nextCursor when the server omits cursor', async () => {
    const fetchPage = vi
      .fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>()
      .mockResolvedValueOnce({ data: [{ id: 1 }], total: 3, hasMore: true, nextCursor: 'c2' })
      .mockResolvedValueOnce({ data: [{ id: 2 }], total: 3, hasMore: true, nextCursor: 'c3' })
      .mockResolvedValueOnce({ data: [{ id: 3 }], total: 3, hasMore: false, nextCursor: null });

    const result = await listAll(fetchPage);

    expect(result.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: 'c2' }));
    expect(fetchPage).toHaveBeenNthCalledWith(3, expect.objectContaining({ cursor: 'c3' }));
  });

  it('prefers nextCursor over the legacy cursor alias', async () => {
    const fetchPage = vi
      .fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>()
      .mockResolvedValueOnce({
        data: [{ id: 1 }],
        total: 2,
        hasMore: true,
        cursor: 'stale',
        nextCursor: 'fresh',
      })
      .mockResolvedValueOnce({ data: [{ id: 2 }], total: 2, hasMore: false, nextCursor: null });

    await listAll(fetchPage);

    expect(fetchPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: 'fresh' }));
  });
});
