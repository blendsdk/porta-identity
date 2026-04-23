/**
 * Unit tests for cursor-based pagination utility.
 *
 * Tests cover:
 * - Round-trip encoding/decoding with various value types
 * - NULL sort values
 * - Special characters in sort values
 * - Invalid/malformed cursor rejection
 * - buildCursorResult helper
 *
 * @module tests/unit/lib/cursor
 */

import { describe, it, expect } from 'vitest';
import {
  encodeCursor,
  decodeCursor,
  buildCursorResult,
} from '../../../src/lib/cursor.js';

// ============================================================================
// encodeCursor / decodeCursor
// ============================================================================

describe('encodeCursor / decodeCursor', () => {
  it('should round-trip a string sort value', () => {
    const cursor = encodeCursor('2026-01-15T10:00:00Z', 'abc-123');
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({ s: '2026-01-15T10:00:00Z', i: 'abc-123' });
  });

  it('should round-trip a numeric sort value', () => {
    const cursor = encodeCursor(42, 'def-456');
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({ s: 42, i: 'def-456' });
  });

  it('should round-trip a NULL sort value', () => {
    const cursor = encodeCursor(null, 'ghi-789');
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({ s: null, i: 'ghi-789' });
  });

  it('should round-trip a zero numeric sort value', () => {
    const cursor = encodeCursor(0, 'zero-id');
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({ s: 0, i: 'zero-id' });
  });

  it('should round-trip an empty string sort value', () => {
    const cursor = encodeCursor('', 'empty-sort');
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({ s: '', i: 'empty-sort' });
  });

  it('should handle special characters in sort values', () => {
    const specialValues = [
      'O\'Brien',
      'name with spaces',
      'email@example.com',
      'value=with&query+chars',
      'unicode: 日本語',
      'emoji: 🎉',
      'line\nbreak',
      'tab\there',
    ];

    for (const value of specialValues) {
      const cursor = encodeCursor(value, 'special-id');
      const decoded = decodeCursor(cursor);
      expect(decoded).toEqual({ s: value, i: 'special-id' });
    }
  });

  it('should handle a UUID as the entity ID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const cursor = encodeCursor('test', uuid);
    const decoded = decodeCursor(cursor);
    expect(decoded?.i).toBe(uuid);
  });

  it('should produce URL-safe base64url output (no +, /, or =)', () => {
    const cursor = encodeCursor('value with special chars: +/=', 'test-id');
    expect(cursor).not.toMatch(/[+/=]/);
  });

  it('should produce different cursors for different inputs', () => {
    const c1 = encodeCursor('a', 'id-1');
    const c2 = encodeCursor('b', 'id-1');
    const c3 = encodeCursor('a', 'id-2');
    expect(c1).not.toBe(c2);
    expect(c1).not.toBe(c3);
    expect(c2).not.toBe(c3);
  });

  it('should handle negative numeric sort values', () => {
    const cursor = encodeCursor(-99.5, 'neg-id');
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({ s: -99.5, i: 'neg-id' });
  });

  it('should handle very large numeric sort values', () => {
    const cursor = encodeCursor(Number.MAX_SAFE_INTEGER, 'big-id');
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({ s: Number.MAX_SAFE_INTEGER, i: 'big-id' });
  });
});

// ============================================================================
// decodeCursor — invalid input
// ============================================================================

describe('decodeCursor — invalid input', () => {
  it('should return null for empty string', () => {
    expect(decodeCursor('')).toBeNull();
  });

  it('should return null for non-base64 string', () => {
    expect(decodeCursor('not-valid-base64!!!')).toBeNull();
  });

  it('should return null for valid base64 but invalid JSON', () => {
    const notJson = Buffer.from('hello world', 'utf-8').toString('base64url');
    expect(decodeCursor(notJson)).toBeNull();
  });

  it('should return null for JSON missing "s" field', () => {
    const cursor = Buffer.from(JSON.stringify({ i: 'id' }), 'utf-8').toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('should return null for JSON missing "i" field', () => {
    const cursor = Buffer.from(JSON.stringify({ s: 'val' }), 'utf-8').toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('should return null for empty entity ID', () => {
    const cursor = Buffer.from(JSON.stringify({ s: 'val', i: '' }), 'utf-8').toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('should return null for non-string entity ID', () => {
    const cursor = Buffer.from(JSON.stringify({ s: 'val', i: 123 }), 'utf-8').toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('should return null for boolean sort value', () => {
    const cursor = Buffer.from(JSON.stringify({ s: true, i: 'id' }), 'utf-8').toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('should return null for object sort value', () => {
    const cursor = Buffer.from(JSON.stringify({ s: { nested: true }, i: 'id' }), 'utf-8').toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('should return null for array sort value', () => {
    const cursor = Buffer.from(JSON.stringify({ s: [1, 2], i: 'id' }), 'utf-8').toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('should return null for JSON null (not an object)', () => {
    const cursor = Buffer.from('null', 'utf-8').toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('should return null for JSON array', () => {
    const cursor = Buffer.from('[1, 2]', 'utf-8').toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('should return null for JSON string', () => {
    const cursor = Buffer.from('"hello"', 'utf-8').toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });
});

// ============================================================================
// buildCursorResult
// ============================================================================

describe('buildCursorResult', () => {
  interface TestEntity {
    id: string;
    name: string;
    createdAt: string;
  }

  const getSortValue = (row: TestEntity) => row.createdAt;
  const getId = (row: TestEntity) => row.id;

  it('should return hasMore=false when rows ≤ limit', () => {
    const rows: TestEntity[] = [
      { id: '1', name: 'A', createdAt: '2026-01-01' },
      { id: '2', name: 'B', createdAt: '2026-01-02' },
    ];

    const result = buildCursorResult(rows, 5, getSortValue, getId);
    expect(result.data).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.previousCursor).not.toBeNull();
  });

  it('should return hasMore=true and strip extra row when rows > limit', () => {
    const rows: TestEntity[] = [
      { id: '1', name: 'A', createdAt: '2026-01-01' },
      { id: '2', name: 'B', createdAt: '2026-01-02' },
      { id: '3', name: 'C', createdAt: '2026-01-03' }, // extra row
    ];

    const result = buildCursorResult(rows, 2, getSortValue, getId);
    expect(result.data).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();

    // Verify the next cursor encodes the LAST item in data (not the extra row)
    const decoded = decodeCursor(result.nextCursor!);
    expect(decoded?.s).toBe('2026-01-02');
    expect(decoded?.i).toBe('2');
  });

  it('should return null cursors for empty result set', () => {
    const result = buildCursorResult([], 10, getSortValue, getId);
    expect(result.data).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.previousCursor).toBeNull();
  });

  it('should set previousCursor from the first item', () => {
    const rows: TestEntity[] = [
      { id: '5', name: 'E', createdAt: '2026-01-05' },
      { id: '6', name: 'F', createdAt: '2026-01-06' },
    ];

    const result = buildCursorResult(rows, 10, getSortValue, getId);
    const decoded = decodeCursor(result.previousCursor!);
    expect(decoded?.s).toBe('2026-01-05');
    expect(decoded?.i).toBe('5');
  });

  it('should handle single-item result correctly', () => {
    const rows: TestEntity[] = [
      { id: '1', name: 'Only', createdAt: '2026-01-01' },
    ];

    const result = buildCursorResult(rows, 10, getSortValue, getId);
    expect(result.data).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.previousCursor).not.toBeNull();
    // previousCursor and no nextCursor for single item
    const decoded = decodeCursor(result.previousCursor!);
    expect(decoded?.i).toBe('1');
  });

  it('should handle exactly limit+1 rows (boundary case)', () => {
    const rows: TestEntity[] = [
      { id: '1', name: 'A', createdAt: '2026-01-01' },
      { id: '2', name: 'B', createdAt: '2026-01-02' },
    ];

    // limit = 1, rows = 2 → hasMore = true, data = [first row only]
    const result = buildCursorResult(rows, 1, getSortValue, getId);
    expect(result.data).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();
  });
});
