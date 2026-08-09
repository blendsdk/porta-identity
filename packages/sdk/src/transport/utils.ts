/**
 * Shared transport utilities.
 *
 * Internal helpers used by both BrowserTransport and NodeTransport
 * for URL construction, header extraction, body serialization,
 * and safe JSON parsing.
 *
 * These functions are NOT exported from the package public API —
 * they are internal implementation details of the transport layer.
 */

import { SDK_VERSION } from '../version.js';

/**
 * Builds the full request URL with `/api/admin` prefix and query parameters.
 *
 * Both transports prepend `/api/admin` to all request paths so that
 * domain methods only specify the resource path (e.g., `/organizations`).
 *
 * @param baseUrl - Base URL (e.g., 'https://porta.example.com' or '' for same-origin)
 * @param path - Resource path (e.g., '/organizations', '/users/123')
 * @param params - Optional query parameters (null/undefined values are skipped)
 * @returns Complete URL string with query parameters
 */
export function buildRequestUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  const url = `${baseUrl}/api/admin${path}`;

  if (!params) return url;

  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts.length > 0 ? `${url}?${parts.join('&')}` : url;
}

/**
 * Extracts response headers as a lowercased-key record.
 *
 * Response header keys are normalized to lowercase for consistent
 * access regardless of how the server formats them (e.g., `ETag`
 * becomes `etag`, `X-CSRF-Token` becomes `x-csrf-token`).
 *
 * @param response - The native fetch Response object
 * @returns Record with lowercased header keys and string values
 */
export function extractResponseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

/**
 * Builds common request headers used by both transports.
 *
 * Sets `Accept`, `Content-Type` (respecting overrides), and the SDK
 * version header. Additional transport-specific headers (CSRF token,
 * Authorization Bearer) are added by individual transport implementations.
 *
 * Content-Type logic:
 * - `contentType: null` → omit entirely (lets runtime set it for FormData)
 * - `contentType: 'some/type'` → use the provided value
 * - `contentType: undefined` + body present → `application/json`
 * - `contentType: undefined` + no body → omit
 *
 * @param req - Partial request with contentType, body, and optional headers
 * @returns Complete headers record ready for fetch()
 */
export function buildCommonHeaders(req: {
  contentType?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
}): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'X-Porta-SDK-Version': SDK_VERSION,
  };

  // Content-Type: null → omit (FormData), string → use it, undefined → json if body
  if (req.contentType === null) {
    // Intentionally omitted — runtime sets boundary for FormData
  } else if (req.contentType) {
    headers['Content-Type'] = req.contentType;
  } else if (req.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // Merge request-specific headers (allows overrides)
  if (req.headers) {
    Object.assign(headers, req.headers);
  }

  return headers;
}

/**
 * Serializes a request body for the fetch API.
 *
 * When `contentType` is null (FormData uploads), the body is passed
 * as-is so the runtime can set the multipart boundary automatically.
 * Otherwise, the body is JSON-serialized.
 *
 * @param body - The request body (undefined means no body)
 * @param contentType - Content-Type override (null for FormData passthrough)
 * @returns Serialized body suitable for fetch(), or undefined
 */
export function serializeBody(body: unknown, contentType?: string | null): BodyInit | undefined {
  if (body === undefined) return undefined;
  // FormData or other raw body types — pass through
  if (contentType === null) return body as BodyInit;
  return JSON.stringify(body);
}

/**
 * Safely parses a Response body as JSON.
 *
 * Returns undefined if parsing fails (e.g., empty body, non-JSON
 * content type, or malformed JSON). Used for error responses where
 * the body format is not guaranteed.
 *
 * @param response - The native fetch Response object
 * @returns Parsed JSON body, or undefined on failure
 */
export async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
