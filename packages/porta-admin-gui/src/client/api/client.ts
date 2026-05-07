/**
 * Typed API client for BFF API calls (standalone version).
 *
 * Forked from admin-gui/src/client/api/client.ts with CSRF code removed.
 * The standalone BFF uses SameSite=Strict cookies instead of CSRF tokens.
 *
 * ## Request flow
 *
 * ```
 * SPA component → api.get/post/put/patch/del()
 *     → apiRequest() adds Accept, Content-Type headers
 *         → fetch(/api/...) hits the BFF proxy
 *             → BFF injects Bearer token, forwards to Porta server
 * ```
 *
 * ## ETag support
 *
 * The client tracks the latest ETag per URL. For state-changing requests
 * (PUT, PATCH, DELETE) it includes `If-Match` to enable optimistic
 * concurrency. The SPA does not need to manage ETags explicitly.
 *
 * ## Authentication / 401 handling
 *
 * If any request receives a `401` response, the client redirects to
 * `/auth/login`. This is a hard redirect — no error is thrown.
 *
 * @module api/client
 */

/** Shape returned by every `api.*` call. */
export interface ApiResponse<T = unknown> {
  /** HTTP status code. */
  status: number;
  /** Parsed JSON response body (or undefined for 204). */
  data: T | undefined;
  /** ETag value if present in the response. */
  etag?: string;
}

/** Error body shape from the BFF/Porta. */
export interface ApiErrorBody {
  error: string;
  code?: string;
}

// ETag tracking per URL
const etagCache = new Map<string, string>();

/**
 * Core request function — all API calls go through here.
 */
async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  // Include body as JSON for state-changing methods
  if (body !== undefined && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  // Include If-Match for optimistic concurrency on writes
  if (method !== 'GET' && method !== 'POST') {
    const etag = etagCache.get(path);
    if (etag) {
      headers['If-Match'] = etag;
    }
  }

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined,
    credentials: 'same-origin', // Include session cookie
  });

  // 401 → session expired, redirect to login
  if (res.status === 401) {
    window.location.href = '/auth/login';
    // Return a dummy response — the redirect will happen before this is used
    return { status: 401, data: undefined };
  }

  // Track ETag from response
  const etag = res.headers.get('etag');
  if (etag) {
    etagCache.set(path, etag);
  }

  // Parse response body
  let data: T | undefined;
  if (res.status !== 204) {
    try {
      data = (await res.json()) as T;
    } catch {
      data = undefined;
    }
  }

  return { status: res.status, data, etag: etag ?? undefined };
}

/** Convenience API object with typed HTTP methods. */
export const api = {
  get: <T = unknown>(path: string) => apiRequest<T>('GET', path),
  post: <T = unknown>(path: string, body?: unknown) => apiRequest<T>('POST', path, body),
  put: <T = unknown>(path: string, body?: unknown) => apiRequest<T>('PUT', path, body),
  patch: <T = unknown>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, body),
  del: <T = unknown>(path: string) => apiRequest<T>('DELETE', path),
};
