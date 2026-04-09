/**
 * HTTP test client for E2E tests.
 *
 * Manages cookie jar, follows redirects intelligently for OIDC flows,
 * and provides convenience methods for GET/POST requests with optional
 * form body, JSON body, or custom headers.
 *
 * Designed for testing OIDC flows where redirect chains, cookies, and
 * CSRF tokens are critical to correct behavior.
 *
 * @example
 *   const client = new TestHttpClient('http://localhost:49123');
 *   const res = await client.get('/health');
 *   expect(res.status).toBe(200);
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for individual requests */
export interface RequestOptions {
  /** Additional headers to include */
  headers?: Record<string, string>;
  /** Whether to follow redirects (default: false — return the redirect response) */
  followRedirects?: boolean;
  /** Maximum redirects to follow when followRedirects is true (default: 10) */
  maxRedirects?: number;
}

/** Parsed response from a test HTTP request */
export interface TestResponse {
  /** HTTP status code */
  status: number;
  /** Response headers (lowercase keys) */
  headers: Record<string, string>;
  /** Response body as string */
  body: string;
  /** Parsed JSON body (if Content-Type is JSON), otherwise undefined */
  json?: unknown;
  /** Redirect location header (if present) */
  location?: string;
}

/** A recorded redirect hop in a redirect chain */
export interface RedirectHop {
  /** The URL that was requested */
  url: string;
  /** The HTTP status of the redirect response */
  status: number;
  /** The Location header pointing to the next hop */
  location: string;
}

/** Result of following a redirect chain */
export interface RedirectChain {
  /** All intermediate redirect hops */
  hops: RedirectHop[];
  /** The final response after all redirects */
  finalResponse: TestResponse;
  /** The final URL after all redirects */
  finalUrl: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * HTTP client for E2E test requests.
 *
 * Manages a per-instance cookie jar for maintaining session state
 * across requests. Provides GET, POST, redirect following, and
 * CSRF token extraction utilities.
 */
export class TestHttpClient {
  /** Base URL of the test server (e.g., http://localhost:49123) */
  protected baseUrl: string;
  /** Cookie jar — stores cookies by name */
  protected cookies: Map<string, string>;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  /**
   * GET request.
   *
   * @param path - URL path (relative to baseUrl) or absolute URL
   * @param options - Request options (headers, redirect behavior)
   * @returns Parsed test response
   */
  async get(path: string, options?: RequestOptions): Promise<TestResponse> {
    const url = this.resolveUrl(path);
    return this.request(url, { method: 'GET', ...options });
  }

  /**
   * POST request with form body (application/x-www-form-urlencoded).
   *
   * @param path - URL path or absolute URL
   * @param body - Form data key-value pairs
   * @param options - Request options
   * @returns Parsed test response
   */
  async post(
    path: string,
    body: Record<string, string>,
    options?: RequestOptions,
  ): Promise<TestResponse> {
    const url = this.resolveUrl(path);
    const formBody = new URLSearchParams(body).toString();

    return this.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...options?.headers,
      },
      body: formBody,
      ...options,
    });
  }

  /**
   * POST request with JSON body.
   *
   * @param path - URL path or absolute URL
   * @param body - JSON payload
   * @param options - Request options
   * @returns Parsed test response
   */
  async postJson(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<TestResponse> {
    const url = this.resolveUrl(path);

    return this.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: JSON.stringify(body),
      ...options,
    });
  }

  /**
   * Follow a redirect chain from an initial URL.
   *
   * Records each redirect hop (URL, status, location) and returns
   * the final response after all redirects are followed.
   *
   * @param url - Starting URL (absolute or relative)
   * @param maxRedirects - Maximum redirect hops (default: 10)
   * @returns The complete redirect chain and final response
   */
  async followRedirects(url: string, maxRedirects = 10): Promise<RedirectChain> {
    const hops: RedirectHop[] = [];
    let currentUrl = this.resolveUrl(url);

    for (let i = 0; i < maxRedirects; i++) {
      const response = await this.request(currentUrl, {
        method: 'GET',
        followRedirects: false,
      });

      // If it's not a redirect, we've reached the end
      if (!response.location || response.status < 300 || response.status >= 400) {
        return { hops, finalResponse: response, finalUrl: currentUrl };
      }

      hops.push({
        url: currentUrl,
        status: response.status,
        location: response.location,
      });

      // Follow the redirect
      currentUrl = this.resolveUrl(response.location);
    }

    throw new Error(`Too many redirects (>${maxRedirects})`);
  }

  /**
   * Extract a CSRF token from an HTML page.
   *
   * Looks for a hidden input field with name="_csrf" or "csrf" in the HTML.
   *
   * @param html - HTML body to search
   * @returns The CSRF token value, or null if not found
   */
  extractCsrfToken(html: string): string | null {
    // Match hidden input with name="_csrf" or name="csrf"
    const match = html.match(
      /<input[^>]*name=["']_?csrf["'][^>]*value=["']([^"']+)["']/i,
    );
    return match?.[1] ?? null;
  }

  /** Clear the cookie jar (reset session state) */
  clearCookies(): void {
    this.cookies.clear();
  }

  // ── Internal ─────────────────────────────────────────────────

  /**
   * Execute an HTTP request with cookie management.
   *
   * Sends stored cookies in the Cookie header, captures Set-Cookie
   * headers from the response, and optionally follows redirects.
   */
  protected async request(
    url: string,
    options: RequestOptions & {
      method: string;
      body?: string;
      headers?: Record<string, string>;
    },
  ): Promise<TestResponse> {
    const headers: Record<string, string> = {
      ...options.headers,
    };

    // Attach cookies from jar
    if (this.cookies.size > 0) {
      const cookieStr = Array.from(this.cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
      headers['Cookie'] = cookieStr;
    }

    const fetchOptions: RequestInit = {
      method: options.method,
      headers,
      redirect: 'manual', // Always manual — we handle redirects ourselves
    };

    if (options.body) {
      fetchOptions.body = options.body;
    }

    const response = await fetch(url, fetchOptions);

    // Capture Set-Cookie headers
    this.captureCookies(response);

    // Parse response body
    const body = await response.text();

    // Build headers map (lowercase keys)
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });

    // Try to parse JSON if content type indicates it
    let json: unknown;
    const contentType = responseHeaders['content-type'] ?? '';
    if (contentType.includes('application/json')) {
      try {
        json = JSON.parse(body);
      } catch {
        // Not valid JSON — leave json undefined
      }
    }

    const testResponse: TestResponse = {
      status: response.status,
      headers: responseHeaders,
      body,
      json,
      location: responseHeaders['location'],
    };

    // Optionally follow redirects
    if (
      options.followRedirects &&
      testResponse.location &&
      testResponse.status >= 300 &&
      testResponse.status < 400
    ) {
      const redirectUrl = this.resolveUrl(testResponse.location);
      return this.request(redirectUrl, {
        method: 'GET',
        followRedirects: true,
        maxRedirects: (options.maxRedirects ?? 10) - 1,
      });
    }

    return testResponse;
  }

  /**
   * Capture Set-Cookie headers from a response and store in the jar.
   * Handles multiple Set-Cookie headers.
   */
  protected captureCookies(response: Response): void {
    // fetch API makes Set-Cookie available through headers.getSetCookie()
    const setCookies = response.headers.getSetCookie?.() ?? [];

    for (const setCookie of setCookies) {
      // Parse "name=value" from the Set-Cookie string
      const [nameValue] = setCookie.split(';');
      const eqIndex = nameValue.indexOf('=');
      if (eqIndex > 0) {
        const name = nameValue.substring(0, eqIndex).trim();
        const value = nameValue.substring(eqIndex + 1).trim();
        this.cookies.set(name, value);
      }
    }
  }

  /**
   * Resolve a URL path to an absolute URL.
   * If the path is already absolute (http/https), return as-is.
   * Otherwise, prepend the baseUrl.
   */
  protected resolveUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    return `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }
}
