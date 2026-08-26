/**
 * Shared domain helper functions for response unwrapping and ETag handling.
 *
 * @module domains/helpers
 */

import type { TransportResponse } from '../transport/types.js';

/**
 * Unwrap a `{ data: T }` response envelope.
 * If the body already has a `data` property, extracts it; otherwise returns as-is.
 */
export function unwrapData<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

/**
 * Unwrap a `{ data: T }` response with ETag extraction from headers.
 */
export function unwrapWithEtag<T>(response: TransportResponse): { data: T; etag: string | null } {
  const data = unwrapData<T>(response.body);
  const etag = response.headers?.['etag'] ?? response.headers?.['ETag'] ?? null;
  return { data, etag };
}

/**
 * Build If-Match header object if an etag is provided.
 */
export function etagHeaders(etag?: string): Record<string, string> {
  if (!etag) return {};
  return { 'If-Match': etag };
}

/**
 * Convert ListParams to query string params, filtering out undefined values.
 */
export function toQueryParams(
  params?: Record<string, unknown>,
): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined;
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
