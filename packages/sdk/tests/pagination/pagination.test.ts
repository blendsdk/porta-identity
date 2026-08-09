/**
 * Tests for the Porta SDK pagination module.
 *
 * Verifies: listAll helper for offset-based, cursor-based, single-page,
 * empty results, error propagation, and AbortSignal cancellation.
 */
import { describe, it, expect, vi } from 'vitest';
import { listAll } from '../../src/pagination/index.js';
import type { PaginatedResult, PaginatedListParams } from '../../src/pagination/index.js';

// ── Helper types ────────────────────────────────────────────────

interface TestEntity {
  id: number;
  name: string;
}

// ── Offset-based pagination ─────────────────────────────────────

describe('listAll — offset-based', () => {
  it('returns all data from a single page', async () => {
    const fetchPage = vi.fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>().mockResolvedValue({
      data: [{ id: 1, name: 'one' }],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    const result = await listAll(fetchPage);

    expect(result).toEqual([{ id: 1, name: 'one' }]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('fetches all pages when totalPages > 1', async () => {
    const fetchPage = vi.fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>()
      .mockResolvedValueOnce({
        data: [{ id: 1, name: 'one' }, { id: 2, name: 'two' }],
        total: 5,
        page: 1,
        pageSize: 2,
        totalPages: 3,
      })
      .mockResolvedValueOnce({
        data: [{ id: 3, name: 'three' }, { id: 4, name: 'four' }],
        total: 5,
        page: 2,
        pageSize: 2,
        totalPages: 3,
      })
      .mockResolvedValueOnce({
        data: [{ id: 5, name: 'five' }],
        total: 5,
        page: 3,
        pageSize: 2,
        totalPages: 3,
      });

    const result = await listAll(fetchPage);

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    // First call should include page: 1
    expect(fetchPage).toHaveBeenNthCalledWith(1, expect.objectContaining({ page: 1 }));
    // Subsequent calls should include incrementing page numbers
    expect(fetchPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2 }));
    expect(fetchPage).toHaveBeenNthCalledWith(3, expect.objectContaining({ page: 3 }));
  });

  it('passes base params to all page fetches', async () => {
    const fetchPage = vi.fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>().mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    await listAll(fetchPage, { search: 'test', sortBy: 'name', sortOrder: 'asc' });

    expect(fetchPage).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'test',
        sortBy: 'name',
        sortOrder: 'asc',
        page: 1,
      }),
    );
  });
});

// ── Cursor-based pagination ─────────────────────────────────────

describe('listAll — cursor-based', () => {
  it('returns all data when cursor pagination has multiple pages', async () => {
    const fetchPage = vi.fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>()
      .mockResolvedValueOnce({
        data: [{ id: 1, name: 'one' }],
        total: 3,
        cursor: 'cursor-1',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        data: [{ id: 2, name: 'two' }],
        total: 3,
        cursor: 'cursor-2',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        data: [{ id: 3, name: 'three' }],
        total: 3,
        cursor: null,
        hasMore: false,
      });

    const result = await listAll(fetchPage);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('stops when hasMore is false', async () => {
    const fetchPage = vi.fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>().mockResolvedValue({
      data: [{ id: 1, name: 'one' }],
      total: 1,
      cursor: null,
      hasMore: false,
    });

    const result = await listAll(fetchPage);

    expect(result).toHaveLength(1);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('passes cursor to subsequent page fetches', async () => {
    const fetchPage = vi.fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>()
      .mockResolvedValueOnce({
        data: [{ id: 1, name: 'one' }],
        total: 2,
        cursor: 'abc123',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        data: [{ id: 2, name: 'two' }],
        total: 2,
        cursor: null,
        hasMore: false,
      });

    await listAll(fetchPage);

    // Second call should include the cursor from the first response
    expect(fetchPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: 'abc123' }));
  });
});

// ── Empty results ───────────────────────────────────────────────

describe('listAll — empty results', () => {
  it('returns empty array for empty first page (offset)', async () => {
    const fetchPage = vi.fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>().mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    const result = await listAll(fetchPage);

    expect(result).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('returns empty array for empty first page (cursor)', async () => {
    const fetchPage = vi.fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>().mockResolvedValue({
      data: [],
      total: 0,
      cursor: null,
      hasMore: false,
    });

    const result = await listAll(fetchPage);

    expect(result).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('returns first page data when no pagination fields present', async () => {
    // Neither totalPages nor hasMore — unknown strategy, return first page
    const fetchPage = vi.fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>().mockResolvedValue({
      data: [{ id: 1, name: 'one' }],
      total: 1,
    });

    const result = await listAll(fetchPage);

    expect(result).toEqual([{ id: 1, name: 'one' }]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

// ── Error handling ──────────────────────────────────────────────

describe('listAll — error handling', () => {
  it('throws immediately on first page error', async () => {
    const fetchPage = vi.fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>().mockRejectedValue(
      new Error('Network error'),
    );

    await expect(listAll(fetchPage)).rejects.toThrow('Network error');
  });

  it('throws on second page error (no partial results)', async () => {
    const fetchPage = vi.fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>()
      .mockResolvedValueOnce({
        data: [{ id: 1, name: 'one' }],
        total: 4,
        page: 1,
        pageSize: 2,
        totalPages: 2,
      })
      .mockRejectedValueOnce(new Error('Server failed'));

    await expect(listAll(fetchPage)).rejects.toThrow('Server failed');
  });
});

// ── AbortSignal ─────────────────────────────────────────────────

describe('listAll — AbortSignal', () => {
  it('respects abort signal between pages (offset)', async () => {
    const controller = new AbortController();

    const fetchPage = vi.fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>()
      .mockResolvedValueOnce({
        data: [{ id: 1, name: 'one' }],
        total: 4,
        page: 1,
        pageSize: 2,
        totalPages: 2,
      })
      .mockImplementation(() => {
        // This should never be called — abort happens before
        return Promise.resolve({ data: [], total: 0, page: 2, pageSize: 2, totalPages: 2 });
      });

    // Abort before the second page fetch
    controller.abort();

    await expect(listAll(fetchPage, undefined, { signal: controller.signal })).rejects.toThrow();
    // Only the first page should have been fetched
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('respects abort signal between pages (cursor)', async () => {
    const controller = new AbortController();

    const fetchPage = vi.fn<(params: PaginatedListParams) => Promise<PaginatedResult<TestEntity>>>()
      .mockResolvedValueOnce({
        data: [{ id: 1, name: 'one' }],
        total: 2,
        cursor: 'next',
        hasMore: true,
      })
      .mockImplementation(() => {
        return Promise.resolve({ data: [], total: 0, cursor: null, hasMore: false });
      });

    // Abort before the second page fetch
    controller.abort();

    await expect(listAll(fetchPage, undefined, { signal: controller.signal })).rejects.toThrow();
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
