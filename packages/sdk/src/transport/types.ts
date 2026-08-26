/**
 * Transport abstraction types for the Porta SDK.
 *
 * The transport layer handles environment-specific HTTP execution.
 * Two implementations exist: BrowserTransport (for SPA/BFF) and
 * NodeTransport (for server-side / CLI automation).
 *
 * Both transports prepend `/api/admin` to all request paths —
 * domain methods only need to specify the resource path
 * (e.g., `/organizations`).
 */

/** HTTP methods supported by the SDK */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Request passed to the transport.
 *
 * Domain methods construct these objects; the transport handles
 * URL construction, authentication, headers, and serialization.
 */
export interface TransportRequest {
  /** HTTP method */
  method: HttpMethod;

  /**
   * Resource path (e.g., '/organizations', '/users/123').
   * The transport prepends `baseUrl + '/api/admin'` to this path.
   */
  path: string;

  /** JSON request body (serialized by the transport) */
  body?: unknown;

  /** Additional headers to include in the request */
  headers?: Record<string, string>;

  /**
   * Query parameters appended to the URL.
   * Null/undefined values are skipped; all others are stringified.
   */
  params?: Record<string, string | number | boolean | undefined | null>;

  /** AbortSignal for request cancellation */
  signal?: AbortSignal;

  /**
   * Response parsing mode:
   * - 'json' (default): parses response body as JSON
   * - 'raw': skips parsing, stores native Response in `raw` field
   *
   * Use 'raw' for binary downloads (exports, branding assets).
   */
  responseType?: 'json' | 'raw';

  /**
   * Override the Content-Type header:
   * - string: use this value as Content-Type
   * - null: omit Content-Type entirely (lets runtime set it for FormData)
   * - undefined (default): use 'application/json'
   */
  contentType?: string | null;
}

/**
 * Response returned by the transport.
 *
 * Contains parsed response data and headers. For raw responses,
 * the native Response object is available in the `raw` field.
 */
export interface TransportResponse {
  /** HTTP status code */
  status: number;

  /** Response headers (lowercased keys) */
  headers: Record<string, string>;

  /** Parsed response body (undefined for 204 and raw responses) */
  body: unknown;

  /**
   * Original Response object — available when `responseType` is 'raw'.
   * Used for streaming binary data (exports, branding assets).
   */
  raw?: Response;
}

/**
 * Transport interface — environment-specific HTTP execution.
 *
 * Implementations handle URL construction, authentication,
 * CSRF tokens, error mapping, and retry logic.
 */
export interface HttpTransport {
  /** Execute an HTTP request and return the response */
  request(req: TransportRequest): Promise<TransportResponse>;
}
