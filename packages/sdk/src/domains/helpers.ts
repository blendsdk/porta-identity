/**
 * Shared domain helper functions for response unwrapping and ETag handling.
 *
 * @module domains/helpers
 */

import type { TransportResponse } from '../transport/types.js';
import type { ETagResponse, PaginatedResponse } from '../types/index.js';
import { PortaError } from '../errors/index.js';

/** Return whether a value is a non-null object record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Return whether every array entry is a string. */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/** Create the fixed SDK error used when a successful response has an invalid public shape. */
function invalidResponseError(): PortaError {
  return new PortaError('Porta API returned an invalid response.');
}

/**
 * Require a `{ data: T }` response envelope and validate its payload.
 *
 * @param body - Raw response body
 * @param isData - Feature-specific payload guard
 * @returns Validated payload
 * @throws {PortaError} When the envelope or payload is invalid
 */
export function requireData<T>(body: unknown, isData: (value: unknown) => value is T): T {
  if (!isRecord(body) || !('data' in body) || !isData(body.data)) {
    throw invalidResponseError();
  }
  return body.data;
}

/**
 * Require a paginated response whose every item passes the supplied guard.
 *
 * @param body - Raw response body
 * @param isItem - Feature-specific item guard
 * @returns Validated pagination response
 * @throws {PortaError} When pagination metadata or an item is invalid
 */
export function requirePaginatedData<T>(
  body: unknown,
  isItem: (value: unknown) => value is T,
): PaginatedResponse<T> {
  if (
    !isRecord(body) ||
    !Array.isArray(body.data) ||
    !body.data.every(isItem) ||
    typeof body.total !== 'number' ||
    (body.page !== undefined && typeof body.page !== 'number') ||
    (body.pageSize !== undefined && typeof body.pageSize !== 'number') ||
    (body.totalPages !== undefined && typeof body.totalPages !== 'number') ||
    (body.cursor !== undefined && body.cursor !== null && typeof body.cursor !== 'string') ||
    (body.hasMore !== undefined && typeof body.hasMore !== 'boolean')
  ) {
    throw invalidResponseError();
  }

  return {
    data: body.data,
    total: body.total,
    ...(body.page !== undefined ? { page: body.page } : {}),
    ...(body.pageSize !== undefined ? { pageSize: body.pageSize } : {}),
    ...(body.totalPages !== undefined ? { totalPages: body.totalPages } : {}),
    ...(typeof body.cursor === 'string' ? { cursor: body.cursor } : {}),
    ...(body.hasMore !== undefined ? { hasMore: body.hasMore } : {}),
  };
}

/**
 * Require a validated data envelope while preserving its ETag header.
 *
 * @param response - Raw transport response
 * @param isData - Feature-specific payload guard
 * @returns Validated payload and optional ETag
 */
export function requireDataWithEtag<T>(
  response: TransportResponse,
  isData: (value: unknown) => value is T,
): ETagResponse<T> {
  const data = requireData(response.body, isData);
  const etag = response.headers?.['etag'] ?? response.headers?.['ETag'] ?? null;
  return { data, etag };
}

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
    if (
      value !== undefined &&
      value !== null &&
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    ) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
