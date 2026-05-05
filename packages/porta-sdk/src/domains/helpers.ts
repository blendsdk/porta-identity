/**
 * Shared domain helpers for the Porta SDK.
 *
 * These utility functions are used by all domain factory functions
 * to handle common patterns: response envelope unwrapping, ETag
 * extraction, header construction, and query string building.
 */

import type { TransportResponse } from '../transport/types.js';

/**
 * Unwraps a `{ data: T }` response envelope.
 *
 * Most Porta API endpoints return entities wrapped in a `data` field.
 * This function extracts the inner value, or returns the body as-is
 * if it's not wrapped.
 *
 * @param body - The parsed response body
 * @returns The unwrapped entity
 */
export function unwrapData<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

/**
 * Unwraps a `{ data: T }` response and extracts the ETag header.
 *
 * Used by domains that support optimistic concurrency (Organizations,
 * Applications, Clients, Users, TwoFactor policy). Returns both the
 * entity and its ETag for subsequent `update()` calls with `If-Match`.
 *
 * @param response - The full transport response
 * @returns Object containing the unwrapped entity and its ETag
 */
export function unwrapWithEtag<T>(response: TransportResponse): { data: T; etag: string | null } {
  const data = unwrapData<T>(response.body);
  const etag = response.headers['etag'] ?? null;
  return { data, etag };
}

/**
 * Builds an `If-Match` header object from an optional ETag.
 *
 * Returns an empty object if no ETag is provided, allowing callers
 * to spread it into the headers without conditional logic:
 *
 * ```typescript
 * headers: { ...etagHeaders(etag) }
 * ```
 *
 * @param etag - Optional ETag value from a previous `get()` call
 * @returns Header object with `If-Match` or empty object
 */
export function etagHeaders(etag?: string): Record<string, string> {
  if (etag) {
    return { 'If-Match': etag };
  }
  return {};
}

/**
 * Builds a query string record from a params object.
 *
 * Filters out `null` and `undefined` values, converting all
 * remaining values to strings. Returns a clean record suitable
 * for the `params` field of `TransportRequest`.
 *
 * @param params - Raw parameter object (may contain null/undefined values)
 * @returns Clean record with string values only
 */
export function buildQueryParams(
  params?: Record<string, string | number | boolean | undefined | null>,
): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined;

  const result: Record<string, string | number | boolean> = {};
  let hasKeys = false;

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      result[key] = value;
      hasKeys = true;
    }
  }

  return hasKeys ? result : undefined;
}
