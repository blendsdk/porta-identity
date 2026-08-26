import { describe, it, expect } from 'vitest';
import { unwrapData, unwrapWithEtag, etagHeaders, toQueryParams } from '../../src/domains/helpers.js';
import type { TransportResponse } from '../../src/transport/types.js';

describe('domains/helpers', () => {
  // ── unwrapData ──────────────────────────────────────────────
  describe('unwrapData', () => {
    it('extracts data from { data: T } envelope', () => {
      const body = { data: { id: '1', name: 'Test' } };
      expect(unwrapData(body)).toEqual({ id: '1', name: 'Test' });
    });

    it('returns body as-is if no data property', () => {
      const body = { id: '1', name: 'Test' };
      expect(unwrapData(body)).toEqual({ id: '1', name: 'Test' });
    });

    it('extracts arrays from { data: T[] } envelope', () => {
      const body = { data: [{ id: '1' }, { id: '2' }] };
      expect(unwrapData(body)).toEqual([{ id: '1' }, { id: '2' }]);
    });

    it('handles null body', () => {
      expect(unwrapData(null)).toBeNull();
    });

    it('handles undefined body', () => {
      expect(unwrapData(undefined)).toBeUndefined();
    });

    it('handles primitive body', () => {
      expect(unwrapData('hello')).toBe('hello');
    });
  });

  // ── unwrapWithEtag ──────────────────────────────────────────
  describe('unwrapWithEtag', () => {
    it('extracts data and etag from response', () => {
      const response: TransportResponse = {
        status: 200,
        headers: { etag: '"abc123"' },
        body: { data: { id: '1', name: 'Org' } },
      };
      const result = unwrapWithEtag(response);
      expect(result.data).toEqual({ id: '1', name: 'Org' });
      expect(result.etag).toBe('"abc123"');
    });

    it('returns null etag when no etag header', () => {
      const response: TransportResponse = {
        status: 200,
        headers: {},
        body: { data: { id: '1' } },
      };
      expect(unwrapWithEtag(response).etag).toBeNull();
    });

    it('handles uppercase ETag header', () => {
      const response: TransportResponse = {
        status: 200,
        headers: { ETag: '"xyz789"' },
        body: { data: { id: '1' } },
      };
      expect(unwrapWithEtag(response).etag).toBe('"xyz789"');
    });

    it('handles missing headers', () => {
      const response: TransportResponse = {
        status: 200,
        headers: undefined as unknown as Record<string, string>,
        body: { data: { id: '1' } },
      };
      expect(unwrapWithEtag(response).etag).toBeNull();
    });
  });

  // ── etagHeaders ─────────────────────────────────────────────
  describe('etagHeaders', () => {
    it('returns If-Match header when etag provided', () => {
      expect(etagHeaders('"abc"')).toEqual({ 'If-Match': '"abc"' });
    });

    it('returns empty object when no etag', () => {
      expect(etagHeaders()).toEqual({});
      expect(etagHeaders(undefined)).toEqual({});
    });

    it('returns empty object for empty string', () => {
      expect(etagHeaders('')).toEqual({});
    });
  });

  // ── toQueryParams ───────────────────────────────────────────
  describe('toQueryParams', () => {
    it('converts params to query record', () => {
      const result = toQueryParams({ page: 1, pageSize: 10, search: 'test' });
      expect(result).toEqual({ page: 1, pageSize: 10, search: 'test' });
    });

    it('filters out undefined values', () => {
      const result = toQueryParams({ page: 1, search: undefined, sort: 'name' });
      expect(result).toEqual({ page: 1, sort: 'name' });
    });

    it('filters out null values', () => {
      const result = toQueryParams({ page: 1, search: null });
      expect(result).toEqual({ page: 1 });
    });

    it('returns undefined for undefined input', () => {
      expect(toQueryParams(undefined)).toBeUndefined();
    });

    it('returns undefined when all values are null/undefined', () => {
      expect(toQueryParams({ a: undefined, b: null })).toBeUndefined();
    });

    it('handles boolean values', () => {
      const result = toQueryParams({ active: true, deleted: false });
      expect(result).toEqual({ active: true, deleted: false });
    });

    it('handles string values', () => {
      const result = toQueryParams({ search: 'hello' });
      expect(result).toEqual({ search: 'hello' });
    });

    it('filters non-primitive values (objects, arrays)', () => {
      const result = toQueryParams({ page: 1, nested: { a: 1 } as unknown });
      expect(result).toEqual({ page: 1 });
    });
  });
});
