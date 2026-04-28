/**
 * Typed API client for BFF API calls.
 *
 * This module provides all HTTP communication between the React SPA and the
 * BFF (Backend-for-Frontend) proxy server. The BFF in turn forwards requests
 * to the Porta admin API with Bearer token injection.
 *
 * ## Request flow
 *
 * ```
 * SPA component → api.get/post/put/patch/del()
 *     → apiRequest() adds Accept, Content-Type, X-CSRF-Token headers
 *         → fetch(/api/...) hits the BFF proxy
 *             → BFF injects Bearer token, forwards to Porta server
 * ```
 *
 * ## CSRF protection
 *
 * A module-level CSRF token is set once by {@link AuthProvider} (via
 * `setCsrfToken()`) after fetching `/auth/me`. All state-changing requests
 * (`POST`, `PUT`, `PATCH`, `DELETE`) automatically include the token as
 * an `X-CSRF-Token` header. GET requests do not send the token.
 *
 * ## Authentication / 401 handling
 *
 * If any request receives a `401` response, the client assumes the session
 * has expired and immediately redirects to `/auth/login`. This is a hard
 * redirect — no error is surfaced to the UI.
 *
 * ## ETag / Optimistic concurrency
 *
 * For entities that support optimistic concurrency (most Porta entities),
 * use `api.getWithEtag()` to fetch both the data and the `ETag` header.
 * Then pass the ETag to `api.put()` or `api.patch()` as the third argument
 * to set the `If-Match` header. A `409 Conflict` response means the entity
 * was modified by someone else.
 *
 * ## Response envelope
 *
 * All Porta admin API detail/create/update endpoints wrap their response in
 * `{ data: entity }`. Use {@link unwrapData} to extract the inner entity.
 *
 * @example
 * ```tsx
 * import { api, ApiError, unwrapData } from '../api/client';
 *
 * // Simple GET
 * const orgs = await api.get<OrgListResponse>('/organizations');
 *
 * // GET with ETag for optimistic concurrency
 * const { data, etag } = await api.getWithEtag<OrgResponse>('/organizations/acme');
 * const org = unwrapData(data);
 *
 * // PUT with If-Match
 * await api.put('/organizations/acme', { name: 'Acme Corp' }, etag);
 *
 * // Error handling
 * try {
 *   await api.del('/organizations/acme');
 * } catch (err) {
 *   if (err instanceof ApiError && err.status === 409) {
 *     toast.error('Conflict', 'Entity was modified by another user.');
 *   }
 * }
 * ```
 *
 * @module api/client
 */

let csrfToken: string | null = null;

/** Set the CSRF token (called by AuthProvider after /auth/me) */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/**
 * Typed API error thrown when a fetch response is not OK (status >= 400).
 *
 * Consumers can check `err.status` for HTTP status codes and `err.body`
 * for the parsed JSON error body from the server (if available).
 *
 * @example
 * ```ts
 * try {
 *   await api.post('/organizations', { name: '' });
 * } catch (err) {
 *   if (err instanceof ApiError) {
 *     console.log(err.status);  // 422
 *     console.log(err.message); // "Validation failed"
 *     console.log(err.body);    // { error: "Validation failed", details: [...] }
 *   }
 * }
 * ```
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Response wrapper that includes ETag for optimistic concurrency */
export interface ApiResponse<T> {
  data: T;
  etag?: string;
}

/**
 * Low-level fetch wrapper that calls the BFF proxy.
 *
 * Automatically adds `Accept: application/json`, CSRF token for state-changing
 * methods, and `Content-Type: application/json` when appropriate. Handles 401
 * by redirecting to login and 204 by returning `undefined`.
 *
 * **Prefer using the `api.*` convenience methods** over calling this directly.
 *
 * @typeParam T - Expected response body type
 * @param path - Request URL path (relative or absolute)
 * @param options - Standard `RequestInit` options (method, body, headers, etc.)
 * @returns Parsed JSON response body
 * @throws {ApiError} When response status >= 400 (except 401, which redirects)
 */
export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  // Include CSRF token for state-changing methods
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(path, { ...options, headers });

  // Handle auth expiry — redirect to login
  if (response.status === 401) {
    window.location.href = '/auth/login';
    throw new ApiError(401, 'Session expired');
  }

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(
      response.status,
      error.error || 'Request failed',
      error,
    );
  }

  // Handle 204 No Content — return undefined (no body to parse)
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/**
 * API request that also returns the ETag header.
 * Used for entities that support optimistic concurrency (If-Match).
 */
export async function apiRequestWithEtag<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(path, { ...options, headers });

  if (response.status === 401) {
    window.location.href = '/auth/login';
    throw new ApiError(401, 'Session expired');
  }

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(
      response.status,
      error.error || 'Request failed',
      error,
    );
  }

  const data = (await response.json()) as T;
  const etag = response.headers.get('ETag') ?? undefined;

  return { data, etag };
}

// ── Response envelope helper ───────────────────────────────────────

/**
 * Unwrap a backend `{ data: T }` response envelope.
 * All Porta admin API detail/create/update endpoints wrap their response
 * in `{ data: entity }`. This helper safely extracts the inner entity.
 * If the response is NOT wrapped, it is returned as-is.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unwrapData<T>(response: any): T {
  if (response && typeof response === 'object' && 'data' in response && !Array.isArray(response.data)) {
    return response.data as T;
  }
  return response as T;
}

// ── Typed convenience methods ──────────────────────────────────────

/** BFF API base path — the BFF proxy maps /api/* to /api/admin/* on Porta */
const API_BASE = '/api';

/** Build a full API URL from a relative path */
function url(path: string): string {
  return `${API_BASE}${path}`;
}

/** Build query string from params object (skips null/undefined values) */
function buildQuery(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null,
  );
  if (entries.length === 0) return '';
  const qs = new URLSearchParams(
    entries.map(([k, v]) => [k, String(v)]),
  ).toString();
  return `?${qs}`;
}

/**
 * Typed API client with convenience methods.
 *
 * All paths are relative to the BFF API base (`/api`). The BFF proxy
 * maps `/api/*` to `/api/admin/*` on the Porta server.
 *
 * @example
 * ```ts
 * // List organizations with query params
 * const orgs = await api.get<OrgList>('/organizations', { status: 'active', limit: 20 });
 *
 * // Create a new organization
 * const newOrg = await api.post<OrgResponse>('/organizations', { name: 'Acme' });
 *
 * // Update with optimistic concurrency
 * const { data, etag } = await api.getWithEtag<OrgResponse>('/organizations/acme');
 * await api.put('/organizations/acme', { name: 'Acme Corp' }, etag);
 *
 * // Delete
 * await api.del('/organizations/acme');
 * ```
 */
export const api = {
  /** GET request — fetches JSON data from the given path with optional query params */
  get<T>(path: string, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
    return apiRequest<T>(url(path) + buildQuery(params));
  },

  /** GET with ETag */
  getWithEtag<T>(path: string, params?: Record<string, string | number | boolean | undefined | null>): Promise<ApiResponse<T>> {
    return apiRequestWithEtag<T>(url(path) + buildQuery(params));
  },

  /** POST request */
  post<T>(path: string, body?: unknown): Promise<T> {
    return apiRequest<T>(url(path), {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  /** PUT request */
  put<T>(path: string, body?: unknown, etag?: string): Promise<T> {
    const headers: Record<string, string> = {};
    if (etag) headers['If-Match'] = etag;
    return apiRequest<T>(url(path), {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    });
  },

  /** PATCH request */
  patch<T>(path: string, body?: unknown, etag?: string): Promise<T> {
    const headers: Record<string, string> = {};
    if (etag) headers['If-Match'] = etag;
    return apiRequest<T>(url(path), {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    });
  },

  /** DELETE request */
  del<T = void>(path: string): Promise<T> {
    return apiRequest<T>(url(path), { method: 'DELETE' });
  },
};
