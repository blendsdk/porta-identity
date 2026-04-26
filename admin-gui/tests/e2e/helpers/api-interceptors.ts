/**
 * API interceptor helpers for Admin GUI E2E tests.
 *
 * Provides utilities to capture outgoing API requests (for verifying
 * correct HTTP methods and payloads) and to mock API error responses
 * (for testing error handling and edge cases).
 *
 * Uses Playwright's route interception to inspect or modify network
 * traffic between the browser and the BFF.
 *
 * @see plans/admin-gui-testing/03-test-infrastructure.md
 */

import type { Page, Request, Route } from '@playwright/test';
import { expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Captured API request details for inspection in tests */
export interface CapturedRequest {
  /** HTTP method (GET, POST, PUT, PATCH, DELETE) */
  method: string;
  /** Full request URL */
  url: string;
  /** Parsed request body (null for GET/HEAD requests) */
  body: unknown;
  /** Request headers as key-value pairs */
  headers: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Request capture helpers
// ---------------------------------------------------------------------------

/**
 * Capture the next API request matching a URL pattern.
 *
 * Sets up a one-shot route interceptor that records the request details
 * and then lets the request continue to the server. Resolves once the
 * matching request is intercepted.
 *
 * Usage:
 * ```typescript
 * const [request] = await Promise.all([
 *   captureApiRequest(page, '/api/organizations'),
 *   clickButton(page, 'Save'),
 * ]);
 * expect(request.method).toBe('PUT');
 * ```
 *
 * @param page - Playwright page instance
 * @param urlPattern - Substring to match against the request URL
 * @returns Promise resolving to the captured request details
 */
export async function captureApiRequest(
  page: Page,
  urlPattern: string,
): Promise<CapturedRequest> {
  return new Promise<CapturedRequest>((resolve) => {
    // Use page.route for one-shot interception
    const handler = async (route: Route, request: Request) => {
      const captured: CapturedRequest = {
        method: request.method(),
        url: request.url(),
        body: parseRequestBody(request),
        headers: request.headers(),
      };

      // Let the request continue to the server
      await route.continue();

      // Unregister this route handler after capture
      await page.unroute(`**/*`, handler);

      resolve(captured);
    };

    // Match any URL containing the pattern
    page.route(
      (url) => url.toString().includes(urlPattern),
      handler,
    );
  });
}

/**
 * Capture all API requests matching a URL pattern during an action.
 *
 * Useful when an action triggers multiple API calls and you want to
 * inspect all of them.
 *
 * Usage:
 * ```typescript
 * const requests = await captureAllApiRequests(page, '/api/', async () => {
 *   await clickButton(page, 'Save');
 *   await page.waitForLoadState('networkidle');
 * });
 * ```
 *
 * @param page - Playwright page instance
 * @param urlPattern - Substring to match against request URLs
 * @param action - Async function that triggers the API calls
 * @returns Array of captured request details
 */
export async function captureAllApiRequests(
  page: Page,
  urlPattern: string,
  action: () => Promise<void>,
): Promise<CapturedRequest[]> {
  const captured: CapturedRequest[] = [];

  const handler = async (route: Route, request: Request) => {
    captured.push({
      method: request.method(),
      url: request.url(),
      body: parseRequestBody(request),
      headers: request.headers(),
    });
    await route.continue();
  };

  await page.route(
    (url) => url.toString().includes(urlPattern),
    handler,
  );

  await action();

  await page.unroute(
    (url) => url.toString().includes(urlPattern),
    handler,
  );

  return captured;
}

// ---------------------------------------------------------------------------
// Mock response helpers
// ---------------------------------------------------------------------------

/**
 * Mock an API endpoint to return an error response.
 *
 * Intercepts the next request matching the URL pattern and returns
 * the specified error status and body. The mock is one-shot — it
 * only applies to the next matching request.
 *
 * Usage:
 * ```typescript
 * await mockApiError(page, '/api/organizations/123', 404, {
 *   error: 'Not Found',
 *   message: 'Organization not found',
 * });
 * await clickButton(page, 'Save');
 * await expectToast(page, 'Organization not found');
 * ```
 *
 * @param page - Playwright page instance
 * @param urlPattern - Substring to match against the request URL
 * @param status - HTTP status code to return (e.g., 400, 404, 500)
 * @param body - Response body object
 */
export async function mockApiError(
  page: Page,
  urlPattern: string,
  status: number,
  body: object,
): Promise<void> {
  const handler = async (route: Route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
    // One-shot: unregister after first match
    await page.unroute(
      (url) => url.toString().includes(urlPattern),
      handler,
    );
  };

  await page.route(
    (url) => url.toString().includes(urlPattern),
    handler,
  );
}

/**
 * Mock an API endpoint to simulate a timeout.
 *
 * Intercepts the next matching request and aborts it, simulating
 * a network timeout. The mock is one-shot.
 *
 * @param page - Playwright page instance
 * @param urlPattern - Substring to match against the request URL
 */
export async function mockApiTimeout(
  page: Page,
  urlPattern: string,
): Promise<void> {
  const handler = async (route: Route) => {
    await route.abort('timedout');
    await page.unroute(
      (url) => url.toString().includes(urlPattern),
      handler,
    );
  };

  await page.route(
    (url) => url.toString().includes(urlPattern),
    handler,
  );
}

/**
 * Mock an API endpoint to simulate a slow response.
 *
 * Intercepts the next matching request, delays for the specified
 * duration, then lets it continue to the server. Useful for testing
 * loading states and timeout handling.
 *
 * @param page - Playwright page instance
 * @param urlPattern - Substring to match against the request URL
 * @param delayMs - Delay in milliseconds before forwarding the request
 */
export async function mockApiDelay(
  page: Page,
  urlPattern: string,
  delayMs: number,
): Promise<void> {
  const handler = async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
    await page.unroute(
      (url) => url.toString().includes(urlPattern),
      handler,
    );
  };

  await page.route(
    (url) => url.toString().includes(urlPattern),
    handler,
  );
}

/**
 * Mock an API endpoint to simulate a network disconnection.
 *
 * Intercepts the next matching request and aborts it with a
 * connection refused error. The mock is one-shot.
 *
 * @param page - Playwright page instance
 * @param urlPattern - Substring to match against the request URL
 */
export async function mockApiDisconnect(
  page: Page,
  urlPattern: string,
): Promise<void> {
  const handler = async (route: Route) => {
    await route.abort('connectionrefused');
    await page.unroute(
      (url) => url.toString().includes(urlPattern),
      handler,
    );
  };

  await page.route(
    (url) => url.toString().includes(urlPattern),
    handler,
  );
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/**
 * Assert that an API call was made with the expected method and body.
 *
 * Convenience wrapper that captures a request and asserts its properties.
 * Must be called BEFORE the action that triggers the API call (use
 * Promise.all pattern).
 *
 * Usage:
 * ```typescript
 * const [request] = await Promise.all([
 *   expectApiCall(page, '/api/organizations', 'PUT'),
 *   clickButton(page, 'Save'),
 * ]);
 * ```
 *
 * @param page - Playwright page instance
 * @param urlPattern - Substring to match against the request URL
 * @param method - Expected HTTP method
 * @param body - Optional expected body shape (partial match via toMatchObject)
 * @returns The captured request for further assertions
 */
export async function expectApiCall(
  page: Page,
  urlPattern: string,
  method: string,
  body?: object,
): Promise<CapturedRequest> {
  const request = await captureApiRequest(page, urlPattern);

  expect(request.method).toBe(method.toUpperCase());

  if (body) {
    expect(request.body).toMatchObject(body);
  }

  return request;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse the request body from a Playwright Request.
 * Returns null for GET/HEAD requests or if no body is present.
 *
 * @param request - Playwright Request object
 * @returns Parsed body or null
 */
function parseRequestBody(request: Request): unknown {
  const method = request.method().toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return null;
  }

  const postData = request.postData();
  if (!postData) {
    return null;
  }

  try {
    return JSON.parse(postData);
  } catch {
    // Return raw string if not JSON
    return postData;
  }
}
