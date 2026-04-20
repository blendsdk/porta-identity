/**
 * Authenticated HTTP client for CLI commands.
 *
 * Reads stored credentials, automatically refreshes expired tokens,
 * attaches Bearer authorization headers, and maps HTTP errors to
 * CLI-friendly error classes.
 *
 * Uses Node.js built-in fetch (available in Node 22+) — no external
 * HTTP library needed.
 *
 * Key behaviors:
 *   1. Auto-refresh: before each request, checks token expiry. If expired,
 *      attempts refresh. If refresh fails, throws HttpAuthError.
 *   2. Error mapping: maps HTTP status codes to specific error classes:
 *      - 401 → HttpAuthError ("Authentication required. Run `porta login`")
 *      - 403 → HttpForbiddenError ("Insufficient permissions")
 *      - 404 → HttpNotFoundError (extracts message from response body)
 *      - 400 → HttpValidationError (extracts details from response body)
 *      - 5xx → HttpServerError ("Server error")
 *   3. Base URL: reads `server` from stored credentials or constructor option.
 *
 * @module cli/http-client
 */

import {
  readCredentials,
  isTokenExpired,
  refreshAccessToken,
  type StoredCredentials,
} from './token-store.js';

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/**
 * Base class for all HTTP client errors.
 * Carries the HTTP status code and optional response body details.
 */
export class HttpClientError extends Error {
  /** HTTP status code from the server response */
  readonly status: number;

  /** Optional validation error details (from 400 responses) */
  readonly details?: Array<{ path: string; message: string }>;

  constructor(
    message: string,
    status: number,
    details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'HttpClientError';
    this.status = status;
    this.details = details;
  }
}

/** 401 — token invalid or expired, user must re-authenticate */
export class HttpAuthError extends HttpClientError {
  constructor(message = 'Authentication required. Run "porta login" to authenticate.') {
    super(message, 401);
    this.name = 'HttpAuthError';
  }
}

/** 403 — user lacks required permissions */
export class HttpForbiddenError extends HttpClientError {
  constructor(message = 'Insufficient permissions for this operation.') {
    super(message, 403);
    this.name = 'HttpForbiddenError';
  }
}

/** 404 — requested resource does not exist */
export class HttpNotFoundError extends HttpClientError {
  constructor(message = 'Resource not found.') {
    super(message, 404);
    this.name = 'HttpNotFoundError';
  }
}

/** 400 — validation error with optional field-level details */
export class HttpValidationError extends HttpClientError {
  constructor(
    message: string,
    details?: Array<{ path: string; message: string }>,
  ) {
    super(message, 400, details);
    this.name = 'HttpValidationError';
  }
}

/** 5xx — server-side error */
export class HttpServerError extends HttpClientError {
  constructor(message = 'Server error. Try again or check server logs.') {
    super(message, 500);
    this.name = 'HttpServerError';
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for creating an AdminHttpClient */
export interface HttpClientOptions {
  /** Server URL override (default: from stored credentials) */
  server?: string;
}

/** Parsed HTTP response with status and typed data */
export interface HttpResponse<T = unknown> {
  /** HTTP status code */
  status: number;
  /** Parsed JSON response body */
  data: T;
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

/**
 * Authenticated HTTP client for the Porta admin API.
 *
 * Manages token lifecycle (auto-refresh) and provides typed HTTP methods
 * (get, post, put, delete) that attach Bearer authorization headers.
 *
 * Created via the `createHttpClient()` factory function which reads
 * stored credentials and validates the user is logged in.
 */
export class AdminHttpClient {
  /** Base server URL (e.g., "http://localhost:3000") */
  private readonly server: string;

  /** Current credentials — mutated when tokens are refreshed */
  private credentials: StoredCredentials;

  constructor(server: string, credentials: StoredCredentials) {
    this.server = server;
    this.credentials = credentials;
  }

  /**
   * GET request to the admin API.
   *
   * @param path - API path (e.g., "/api/admin/organizations")
   * @param params - Optional query string parameters
   * @returns Parsed response with status and data
   */
  async get<T = unknown>(
    path: string,
    params?: Record<string, string>,
  ): Promise<HttpResponse<T>> {
    let url = `${this.server}${path}`;
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(params).toString();
      url += `?${qs}`;
    }
    return this.request<T>(url, { method: 'GET' });
  }

  /**
   * POST request to the admin API.
   *
   * @param path - API path
   * @param body - Optional JSON request body
   * @returns Parsed response with status and data
   */
  async post<T = unknown>(
    path: string,
    body?: unknown,
  ): Promise<HttpResponse<T>> {
    const url = `${this.server}${path}`;
    return this.request<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PUT request to the admin API.
   *
   * @param path - API path
   * @param body - Optional JSON request body
   * @returns Parsed response with status and data
   */
  async put<T = unknown>(
    path: string,
    body?: unknown,
  ): Promise<HttpResponse<T>> {
    const url = `${this.server}${path}`;
    return this.request<T>(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * DELETE request to the admin API.
   *
   * @param path - API path
   * @returns Parsed response with status and data
   */
  async delete<T = unknown>(path: string): Promise<HttpResponse<T>> {
    const url = `${this.server}${path}`;
    return this.request<T>(url, { method: 'DELETE' });
  }

  /**
   * Internal request handler.
   *
   * Ensures the token is fresh (auto-refresh if expired), attaches the
   * Bearer authorization header, performs the fetch, and maps errors.
   *
   * @param url - Full request URL
   * @param init - Fetch RequestInit options
   * @returns Parsed response
   * @throws HttpClientError subclass on non-2xx responses
   */
  private async request<T>(
    url: string,
    init: RequestInit,
  ): Promise<HttpResponse<T>> {
    // Auto-refresh expired tokens before sending the request
    await this.ensureFreshToken();

    const response = await fetch(url, {
      ...init,
      headers: {
        ...((init.headers as Record<string, string>) ?? {}),
        Authorization: `Bearer ${this.credentials.accessToken}`,
      },
    });

    // 2xx — parse and return the JSON body
    if (response.ok) {
      // Handle 204 No Content — no body to parse
      if (response.status === 204) {
        return { status: 204, data: undefined as T };
      }
      const data = (await response.json()) as T;
      return { status: response.status, data };
    }

    // Non-2xx — map to typed error
    await this.handleErrorResponse(response);

    // TypeScript doesn't know handleErrorResponse always throws
    throw new HttpClientError('Unexpected error', response.status);
  }

  /**
   * Ensure the stored access token is still valid.
   *
   * If the token is expired, attempts a refresh via the refresh_token
   * grant. If refresh fails, throws HttpAuthError so the caller knows
   * the user must re-authenticate.
   */
  private async ensureFreshToken(): Promise<void> {
    if (!isTokenExpired(this.credentials)) return;

    const refreshed = await refreshAccessToken(this.credentials);
    if (!refreshed) {
      throw new HttpAuthError(
        'Session expired. Run "porta login" to re-authenticate.',
      );
    }
    // Update in-memory credentials with the refreshed tokens
    this.credentials = refreshed;
  }

  /**
   * Map a non-2xx HTTP response to a typed error and throw it.
   *
   * Attempts to parse the JSON error body for structured error info.
   * Falls back to status-based generic messages if parsing fails.
   *
   * @param response - The failed fetch Response
   * @throws HttpClientError subclass based on status code
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    // Type for the parsed JSON error body from the server
    interface ErrorBody {
      error?: string;
      message?: string;
      details?: Array<{ path: string[]; message: string }>;
    }

    // Try to parse JSON error body for structured error details
    let errorBody: ErrorBody | null = null;
    try {
      errorBody = (await response.json()) as ErrorBody;
    } catch {
      // Response may not be JSON — use status-based fallback
    }

    const message =
      errorBody?.error ?? errorBody?.message ?? response.statusText;

    switch (response.status) {
      case 401:
        throw new HttpAuthError();

      case 403:
        throw new HttpForbiddenError();

      case 404:
        throw new HttpNotFoundError(message || 'Resource not found.');

      case 400: {
        // Map Zod-style details (path is an array) to flat string paths
        const details = errorBody?.details?.map((d: { path: string[]; message: string }) => ({
          path: Array.isArray(d.path) ? d.path.join('.') : String(d.path),
          message: d.message,
        }));
        throw new HttpValidationError(
          message || 'Validation error.',
          details,
        );
      }

      default:
        if (response.status >= 500) {
          throw new HttpServerError(message || undefined);
        }
        throw new HttpClientError(
          message || `HTTP ${response.status}`,
          response.status,
        );
    }
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create an authenticated HTTP client.
 *
 * Reads stored credentials from disk. If no credentials are found,
 * throws HttpAuthError — the user must run `porta login` first.
 *
 * @param options - Optional overrides (e.g., server URL)
 * @returns Configured AdminHttpClient ready for API requests
 * @throws HttpAuthError if not logged in
 */
export function createHttpClient(
  options?: HttpClientOptions,
): AdminHttpClient {
  const creds = readCredentials();
  if (!creds) {
    throw new HttpAuthError(
      'Not logged in. Run "porta login" to authenticate.',
    );
  }

  const server = options?.server ?? creds.server;
  return new AdminHttpClient(server, creds);
}
