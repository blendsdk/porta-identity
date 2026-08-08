/**
 * Unit tests for ETag generation and optimistic concurrency control utility.
 *
 * Tests cover:
 * - Deterministic ETag generation
 * - Different entities produce different ETags
 * - If-Match comparison (exact, W/ prefix, quoted, wildcard, multiple)
 * - setETagHeader helper
 * - checkIfMatch helper (match, conflict, absent header)
 *
 * @module tests/unit/lib/etag
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateETag,
  matchesETag,
  setETagHeader,
  checkIfMatch,
} from '../../../src/lib/etag.js';

// ============================================================================
// generateETag
// ============================================================================

describe('generateETag', () => {
  const fixedDate = new Date('2026-01-15T10:00:00.000Z');

  it('should produce a weak ETag in W/"..." format', () => {
    const etag = generateETag('organization', 'abc-123', fixedDate);
    expect(etag).toMatch(/^W\/"[a-f0-9]{16}"$/);
  });

  it('should be deterministic (same input → same output)', () => {
    const etag1 = generateETag('user', 'def-456', fixedDate);
    const etag2 = generateETag('user', 'def-456', fixedDate);
    expect(etag1).toBe(etag2);
  });

  it('should produce different ETags for different entity types', () => {
    const etag1 = generateETag('organization', 'id-1', fixedDate);
    const etag2 = generateETag('user', 'id-1', fixedDate);
    expect(etag1).not.toBe(etag2);
  });

  it('should produce different ETags for different IDs', () => {
    const etag1 = generateETag('organization', 'id-1', fixedDate);
    const etag2 = generateETag('organization', 'id-2', fixedDate);
    expect(etag1).not.toBe(etag2);
  });

  it('should produce different ETags for different timestamps', () => {
    const date1 = new Date('2026-01-15T10:00:00.000Z');
    const date2 = new Date('2026-01-15T10:00:01.000Z');
    const etag1 = generateETag('organization', 'id-1', date1);
    const etag2 = generateETag('organization', 'id-1', date2);
    expect(etag1).not.toBe(etag2);
  });

  it('should handle millisecond precision in timestamps', () => {
    const date1 = new Date('2026-01-15T10:00:00.000Z');
    const date2 = new Date('2026-01-15T10:00:00.001Z');
    const etag1 = generateETag('organization', 'id-1', date1);
    const etag2 = generateETag('organization', 'id-1', date2);
    expect(etag1).not.toBe(etag2);
  });
});

// ============================================================================
// matchesETag
// ============================================================================

describe('matchesETag', () => {
  const currentETag = 'W/"a1b2c3d4e5f67890"';

  it('should match exact ETag (weak)', () => {
    expect(matchesETag('W/"a1b2c3d4e5f67890"', currentETag)).toBe(true);
  });

  it('should match without W/ prefix (strong → weak comparison)', () => {
    expect(matchesETag('"a1b2c3d4e5f67890"', currentETag)).toBe(true);
  });

  it('should match with wildcard *', () => {
    expect(matchesETag('*', currentETag)).toBe(true);
  });

  it('should not match different hash', () => {
    expect(matchesETag('W/"ffffffffffffffff"', currentETag)).toBe(false);
  });

  it('should handle multiple ETags (comma-separated)', () => {
    expect(matchesETag('"aaa", "a1b2c3d4e5f67890", "bbb"', currentETag)).toBe(true);
  });

  it('should not match when none of multiple ETags match', () => {
    expect(matchesETag('"aaa", "bbb", "ccc"', currentETag)).toBe(false);
  });

  it('should handle whitespace around ETags', () => {
    expect(matchesETag('  W/"a1b2c3d4e5f67890"  ', currentETag)).toBe(true);
  });

  it('should handle whitespace in comma-separated list', () => {
    expect(matchesETag('"aaa" , W/"a1b2c3d4e5f67890" , "bbb"', currentETag)).toBe(true);
  });

  it('should not match empty string', () => {
    expect(matchesETag('', currentETag)).toBe(false);
  });

  it('should not match just quotes with no content', () => {
    expect(matchesETag('""', currentETag)).toBe(false);
  });

  it('should handle strong ETag on current (match against weak If-Match)', () => {
    // Current is strong (no W/), If-Match is weak
    expect(matchesETag('W/"a1b2c3d4e5f67890"', '"a1b2c3d4e5f67890"')).toBe(true);
  });
});

// ============================================================================
// setETagHeader
// ============================================================================

describe('setETagHeader', () => {
  it('should set the ETag header on the context', () => {
    const ctx = {
      set: vi.fn(),
      get: vi.fn().mockReturnValue(''),
      status: 200,
      body: null as unknown,
    };

    const date = new Date('2026-01-15T10:00:00.000Z');
    setETagHeader(ctx, 'organization', 'id-1', date);

    expect(ctx.set).toHaveBeenCalledOnce();
    expect(ctx.set).toHaveBeenCalledWith('ETag', expect.stringMatching(/^W\/"[a-f0-9]{16}"$/));
  });
});

// ============================================================================
// checkIfMatch
// ============================================================================

describe('checkIfMatch', () => {
  const fixedDate = new Date('2026-01-15T10:00:00.000Z');
  const entity = { id: 'id-1', name: 'Test' };

  function createMockCtx(ifMatchValue: string) {
    return {
      set: vi.fn(),
      get: vi.fn().mockImplementation((field: string) => {
        if (field === 'If-Match') return ifMatchValue;
        return '';
      }),
      status: 200,
      body: null as unknown,
    };
  }

  it('should return true when If-Match header is absent', () => {
    const ctx = createMockCtx('');
    const result = checkIfMatch(ctx, 'organization', 'id-1', fixedDate, entity);
    expect(result).toBe(true);
    expect(ctx.status).toBe(200); // unchanged
  });

  it('should return true when If-Match matches', () => {
    const etag = generateETag('organization', 'id-1', fixedDate);
    const ctx = createMockCtx(etag);
    const result = checkIfMatch(ctx, 'organization', 'id-1', fixedDate, entity);
    expect(result).toBe(true);
  });

  it('should return false and set 409 when If-Match does not match', () => {
    const ctx = createMockCtx('W/"stale-etag-value1"');
    const result = checkIfMatch(ctx, 'organization', 'id-1', fixedDate, entity);
    expect(result).toBe(false);
    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({
      error: 'Conflict',
      message: 'Entity has been modified since your last read. Please refresh and try again.',
      currentEntity: entity,
      currentETag: expect.stringMatching(/^W\/"[a-f0-9]{16}"$/),
    });
  });

  it('should return true when If-Match is wildcard *', () => {
    const ctx = createMockCtx('*');
    const result = checkIfMatch(ctx, 'organization', 'id-1', fixedDate, entity);
    expect(result).toBe(true);
  });

  it('should return true when If-Match matches without W/ prefix', () => {
    const etag = generateETag('organization', 'id-1', fixedDate);
    // Remove W/ prefix to simulate a strong ETag from the client
    const strongETag = etag.replace('W/', '');
    const ctx = createMockCtx(strongETag);
    const result = checkIfMatch(ctx, 'organization', 'id-1', fixedDate, entity);
    expect(result).toBe(true);
  });

  it('should detect conflict when entity was updated between read and write', () => {
    // Client read entity at time1
    const time1 = new Date('2026-01-15T10:00:00.000Z');
    const clientETag = generateETag('user', 'u-1', time1);

    // Entity was updated at time2 (1 second later)
    const time2 = new Date('2026-01-15T10:00:01.000Z');
    const updatedEntity = { id: 'u-1', name: 'Updated' };

    const ctx = createMockCtx(clientETag);
    const result = checkIfMatch(ctx, 'user', 'u-1', time2, updatedEntity);
    expect(result).toBe(false);
    expect(ctx.status).toBe(409);
  });
});
