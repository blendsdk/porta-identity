/**
 * Fetch wrapper for BFF API calls.
 * Includes CSRF token in headers for state-changing requests.
 * Handles 401 responses by redirecting to login.
 * Provides typed convenience methods (get, post, put, patch, del).
 */

let csrfToken: string | null = null;

/** Set the CSRF token (called by AuthProvider after /auth/me) */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/** Typed API error with status and server error body */
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

/** Base API client that calls the BFF proxy */
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

/** Typed API client with convenience methods */
export const api = {
  /** GET request */
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
