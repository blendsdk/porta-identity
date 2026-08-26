/**
 * Browser-oriented HTTP transport for the Porta SDK.
 *
 * Designed for SPAs communicating with a BFF (Backend-for-Frontend).
 * Features:
 * - Cookie-based sessions (`credentials: 'include'`)
 * - CSRF token injection on state-changing requests (POST/PUT/PATCH/DELETE)
 * - CSRF token update from response headers
 * - 401 → configurable unauthorized handler (default: redirect to /auth/login)
 * - Binary response support (`responseType: 'raw'`)
 * - FormData upload support (`contentType: null`)
 * - AbortSignal for request cancellation
 */

import type { HttpTransport, TransportRequest, TransportResponse } from './types.js';
import { mapResponseToError } from '../errors/index.js';
import {
  buildRequestUrl,
  extractResponseHeaders,
  buildCommonHeaders,
  serializeBody,
  safeParseJson,
} from './utils.js';

/**
 * Configuration options for the browser transport.
 */
export interface BrowserTransportOptions {
  /**
   * Base URL for API requests.
   * Use `''` (empty string) for same-origin BFF requests.
   * For cross-origin setups, provide the full origin (e.g., 'https://api.example.com').
   */
  baseUrl: string;

  /**
   * Returns the current CSRF token for state-changing requests.
   * Called on every POST, PUT, PATCH, and DELETE request.
   * Typically reads from a cookie (e.g., `document.cookie`).
   */
  getCsrfToken?: () => string | null;

  /**
   * Called when the server sends a new CSRF token in a response header.
   * Allows the application to update its stored token for future requests.
   * Triggered when the `X-CSRF-Token` response header is present.
   */
  setCsrfToken?: (token: string | null) => void;

  /**
   * Called when a 401 Unauthorized response is received.
   * Default behavior: redirects to `/auth/login` via `window.location.href`.
   * Provide a custom handler to override (e.g., show a login modal).
   */
  onUnauthorized?: () => void;
}

/**
 * Creates a browser-oriented HTTP transport.
 *
 * Uses the browser's native `fetch` with cookie-based sessions,
 * CSRF token management, and configurable 401 handling. All requests
 * include `credentials: 'include'` for cookie transmission.
 *
 * @param options - Transport configuration
 * @returns An HttpTransport instance for browser environments
 *
 * @example
 * ```typescript
 * const transport = createBrowserTransport({
 *   baseUrl: '',  // same-origin BFF
 *   getCsrfToken: () => getCookie('_csrf'),
 *   onUnauthorized: () => router.push('/login'),
 * });
 * ```
 */
export function createBrowserTransport(options: BrowserTransportOptions): HttpTransport {
  const { baseUrl, getCsrfToken, setCsrfToken, onUnauthorized } = options;

  return {
    async request(req: TransportRequest): Promise<TransportResponse> {
      // Build full URL with /api/admin prefix and query params
      const url = buildRequestUrl(baseUrl, req.path, req.params);

      // Build common headers (Accept, Content-Type, SDK version)
      const headers = buildCommonHeaders(req);

      // Add CSRF token for state-changing methods
      if (req.method !== 'GET' && getCsrfToken) {
        const csrfToken = getCsrfToken();
        if (csrfToken) {
          headers['X-CSRF-Token'] = csrfToken;
        }
      }

      // Execute fetch with cookie credentials
      const response = await fetch(url, {
        method: req.method,
        headers,
        body: serializeBody(req.body, req.contentType),
        credentials: 'include',
        signal: req.signal,
      });

      // Extract response headers (lowercased keys)
      const responseHeaders = extractResponseHeaders(response);

      // Update CSRF token if server sent a new one
      const newCsrfToken = responseHeaders['x-csrf-token'];
      if (setCsrfToken && newCsrfToken) {
        setCsrfToken(newCsrfToken);
      }

      // 401 — notify caller and throw authentication error
      if (response.status === 401) {
        const body = await safeParseJson(response);
        if (onUnauthorized) {
          onUnauthorized();
        } else if (typeof window !== 'undefined') {
          // Default: redirect to login page
          window.location.href = '/auth/login';
        }
        throw mapResponseToError({ status: 401, headers: responseHeaders, body });
      }

      // 204 — no content
      if (response.status === 204) {
        return { status: 204, headers: responseHeaders, body: undefined };
      }

      // Non-2xx — parse error body and throw typed error
      if (response.status < 200 || response.status >= 300) {
        const body = await safeParseJson(response);
        throw mapResponseToError({ status: response.status, headers: responseHeaders, body });
      }

      // 2xx + raw — return with native Response for binary streaming
      if (req.responseType === 'raw') {
        return { status: response.status, headers: responseHeaders, body: undefined, raw: response };
      }

      // 2xx + json — parse body and return
      const body = await response.json();
      return { status: response.status, headers: responseHeaders, body };
    },
  };
}
