/**
 * Node.js / server-side HTTP transport for the Porta SDK.
 *
 * Designed for CLI tools, automation scripts, and server-to-server
 * communication. Features:
 * - Bearer token authentication via AuthProvider
 * - Automatic 401 retry with token refresh (when provider supports it)
 * - Binary response support (`responseType: 'raw'`)
 * - FormData upload support (`contentType: null`)
 * - AbortSignal for request cancellation
 */

import type { HttpTransport, TransportRequest, TransportResponse } from './types.js';
import type { AuthProvider } from '../auth/types.js';
import { mapResponseToError } from '../errors/index.js';
import {
  buildRequestUrl,
  extractResponseHeaders,
  buildCommonHeaders,
  serializeBody,
  safeParseJson,
} from './utils.js';

/**
 * Configuration options for the Node.js transport.
 */
export interface NodeTransportOptions {
  /**
   * Base URL of the Porta instance.
   * Must include the protocol and host (e.g., 'https://porta.example.com').
   */
  baseUrl: string;

  /**
   * Authentication provider for Bearer token injection.
   * Tokens are fetched via `auth.getToken()` for each request.
   * If `auth.refreshToken()` is available, 401 responses trigger
   * a token refresh and one automatic retry.
   */
  auth: AuthProvider;
}

/**
 * Creates a Node.js / server-side HTTP transport.
 *
 * Uses Bearer token authentication with optional automatic retry
 * on 401 responses when the auth provider supports token refresh.
 * Does NOT use `credentials: 'include'` — authentication is purely
 * token-based (no cookies).
 *
 * @param options - Transport configuration
 * @returns An HttpTransport instance for Node.js environments
 *
 * @example
 * ```typescript
 * const transport = createNodeTransport({
 *   baseUrl: 'https://porta.example.com',
 *   auth: createTokenAuth('my-access-token'),
 * });
 * ```
 */
export function createNodeTransport(options: NodeTransportOptions): HttpTransport {
  const { baseUrl, auth } = options;

  return {
    async request(req: TransportRequest): Promise<TransportResponse> {
      // Get access token from auth provider
      const token = await auth.getToken();

      // Execute the initial request
      const response = await executeRequest(baseUrl, req, token);

      // 401 + refreshToken available → attempt token refresh and retry once
      if (response.status === 401 && auth.refreshToken) {
        const newToken = await auth.refreshToken();
        const retryResponse = await executeRequest(baseUrl, req, newToken);
        return processResponse(retryResponse, req);
      }

      return processResponse(response, req);
    },
  };
}

// ── Internal helpers ──────────────────────────────────────────────

/**
 * Executes a single HTTP request with Bearer token authentication.
 *
 * Builds the full URL, sets common headers plus the Authorization
 * header, serializes the body, and calls fetch().
 *
 * @param baseUrl - Base URL of the Porta instance
 * @param req - The transport request to execute
 * @param token - Bearer access token
 * @returns The raw fetch Response
 */
async function executeRequest(
  baseUrl: string,
  req: TransportRequest,
  token: string,
): Promise<Response> {
  // Build full URL with /api/admin prefix and query params
  const url = buildRequestUrl(baseUrl, req.path, req.params);

  // Build common headers (Accept, Content-Type, SDK version)
  const headers = buildCommonHeaders(req);

  // Add Bearer token authentication
  headers['Authorization'] = `Bearer ${token}`;

  // Execute fetch (no credentials: 'include' — server-side uses tokens only)
  return fetch(url, {
    method: req.method,
    headers,
    body: serializeBody(req.body, req.contentType),
    signal: req.signal,
  });
}

/**
 * Processes a fetch Response into a TransportResponse.
 *
 * Handles 204 (no content), non-2xx errors (throws typed errors),
 * raw responses (binary streaming), and JSON parsing.
 *
 * @param response - The raw fetch Response
 * @param req - The original transport request (for responseType check)
 * @returns A TransportResponse for successful requests
 * @throws PortaHttpError subclass for non-2xx responses
 */
async function processResponse(
  response: Response,
  req: TransportRequest,
): Promise<TransportResponse> {
  const responseHeaders = extractResponseHeaders(response);

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
}
