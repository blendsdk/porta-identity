/**
 * Porta SDK error hierarchy.
 *
 * All SDK errors extend from PortaError → PortaHttpError.
 * Specific error classes map to HTTP status codes, making it
 * easy to catch and handle specific failure types:
 *
 * ```typescript
 * try {
 *   await client.organizations.get('unknown');
 * } catch (err) {
 *   if (err instanceof PortaNotFoundError) {
 *     // Handle 404
 *   } else if (err instanceof PortaValidationError) {
 *     // Handle 400 — err.details has field-level errors
 *   }
 * }
 * ```
 */

import type { TransportResponse } from '../transport/types.js';

/**
 * Base error class for all Porta SDK errors.
 * Extends native Error with optional cause chaining.
 */
export class PortaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PortaError';
  }
}

/**
 * HTTP error from the Porta API.
 * Contains the HTTP status code and the raw response body.
 */
export class PortaHttpError extends PortaError {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'PortaHttpError';
    this.status = status;
    this.body = body;
  }
}

/** Validation error detail — one entry per invalid field */
export interface ValidationDetail {
  path: string;
  message: string;
  code?: string;
}

/**
 * 400 Bad Request — input validation failed.
 * The `details` array contains field-level error information
 * extracted from the server's Zod validation response.
 */
export class PortaValidationError extends PortaHttpError {
  readonly details: ValidationDetail[];

  constructor(body: unknown) {
    const message = extractMessage(body, 'Validation failed');
    super(400, message, body);
    this.name = 'PortaValidationError';
    this.details = extractDetails(body);
  }
}

/**
 * 401 Unauthorized — authentication required or token expired.
 * Transports typically handle 401 first (redirect or retry),
 * so this error surfaces only when recovery fails.
 */
export class PortaAuthenticationError extends PortaHttpError {
  constructor(body?: unknown) {
    const message = extractMessage(body, 'Authentication required');
    super(401, message, body);
    this.name = 'PortaAuthenticationError';
  }
}

/**
 * 403 Forbidden — insufficient permissions.
 * The authenticated user lacks the required RBAC role or permission.
 */
export class PortaForbiddenError extends PortaHttpError {
  constructor(body?: unknown) {
    const message = extractMessage(body, 'Forbidden');
    super(403, message, body);
    this.name = 'PortaForbiddenError';
  }
}

/**
 * 404 Not Found — the requested resource does not exist.
 */
export class PortaNotFoundError extends PortaHttpError {
  constructor(body?: unknown) {
    const message = extractMessage(body, 'Not found');
    super(404, message, body);
    this.name = 'PortaNotFoundError';
  }
}

/**
 * 409 Conflict — state conflict or ETag mismatch.
 * Common causes: concurrent update (If-Match failed),
 * or entity already in the requested state.
 */
export class PortaConflictError extends PortaHttpError {
  constructor(body?: unknown) {
    const message = extractMessage(body, 'Conflict');
    super(409, message, body);
    this.name = 'PortaConflictError';
  }
}

/**
 * 429 Too Many Requests — rate limit exceeded.
 * The `retryAfter` field (seconds) is extracted from the
 * `Retry-After` response header when present.
 */
export class PortaRateLimitError extends PortaHttpError {
  readonly retryAfter: number | null;

  constructor(body?: unknown, retryAfter?: number | null) {
    const message = extractMessage(body, 'Rate limit exceeded');
    super(429, message, body);
    this.name = 'PortaRateLimitError';
    this.retryAfter = retryAfter ?? null;
  }
}

/**
 * 500-599 Server Error — internal server failure.
 * The specific status code is preserved for debugging.
 */
export class PortaServerError extends PortaHttpError {
  constructor(status: number, body?: unknown) {
    const message = extractMessage(body, 'Server error');
    super(status, message, body);
    this.name = 'PortaServerError';
  }
}

/**
 * Maps a non-2xx TransportResponse to the appropriate error class.
 *
 * Called by both BrowserTransport and NodeTransport after detecting
 * a non-successful HTTP response. The error hierarchy allows callers
 * to use `instanceof` checks for specific error handling.
 *
 * @param response - The transport response with a non-2xx status code
 * @returns A typed PortaHttpError subclass
 */
export function mapResponseToError(response: TransportResponse): PortaHttpError {
  const { status, body, headers } = response;

  switch (status) {
    case 400:
      return new PortaValidationError(body);
    case 401:
      return new PortaAuthenticationError(body);
    case 403:
      return new PortaForbiddenError(body);
    case 404:
      return new PortaNotFoundError(body);
    case 409:
      return new PortaConflictError(body);
    case 429: {
      const retryAfterHeader = headers['retry-after'];
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;
      return new PortaRateLimitError(body, Number.isNaN(retryAfter) ? null : retryAfter);
    }
    default:
      // 500-599 → PortaServerError; all other 4xx → generic PortaHttpError
      if (status >= 500 && status <= 599) {
        return new PortaServerError(status, body);
      }
      return new PortaHttpError(status, extractMessage(body, `HTTP ${status}`), body);
  }
}

// ── Internal helpers ──────────────────────────────────────────────

/**
 * Extracts a human-readable message from a response body.
 * Looks for common server response shapes: { error: string },
 * { message: string }, or { error: { message: string } }.
 */
function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;

    // { error: "message" }
    if (typeof obj.error === 'string') return obj.error;

    // { message: "message" }
    if (typeof obj.message === 'string') return obj.message;

    // { error: { message: "message" } }
    if (obj.error && typeof obj.error === 'object') {
      const nested = obj.error as Record<string, unknown>;
      if (typeof nested.message === 'string') return nested.message;
    }
  }

  return fallback;
}

/**
 * Extracts validation details from a 400 response body.
 * Looks for { details: [{ path, message, code? }] } or
 * { errors: [{ path, message, code? }] }.
 */
function extractDetails(body: unknown): ValidationDetail[] {
  if (!body || typeof body !== 'object') return [];

  const obj = body as Record<string, unknown>;
  const raw = Array.isArray(obj.details) ? obj.details : Array.isArray(obj.errors) ? obj.errors : [];

  return raw
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => ({
      path: typeof item.path === 'string' ? item.path : String(item.path ?? ''),
      message: typeof item.message === 'string' ? item.message : String(item.message ?? ''),
      ...(typeof item.code === 'string' ? { code: item.code } : {}),
    }));
}
