/**
 * Fetch wrapper for BFF API calls.
 * Includes CSRF token in headers for state-changing requests.
 * Handles 401 responses by redirecting to login.
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

  return response.json() as Promise<T>;
}
