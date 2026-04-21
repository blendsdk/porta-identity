/**
 * Unit tests for the admin CORS allow-list middleware.
 *
 * The middleware emits CORS headers for `/api/admin/*` requests only when
 * the requesting origin is explicitly listed in `adminCorsOrigins`.
 * By default (empty config), no CORS headers are emitted — all
 * cross-origin requests are denied by the browser.
 *
 * Tests verify:
 *   C1  — Empty config → no CORS headers (deny-all default)
 *   C2  — Listed origin → all CORS headers set correctly
 *   C3  — Unlisted origin → no CORS headers
 *   C4  — Preflight (OPTIONS) with listed origin → 204 + CORS headers
 *   C5  — Preflight with unlisted origin → 204, no CORS headers
 *   C6  — No Origin header → passes through without CORS processing
 *   C7  — Non-admin path → passes through without CORS processing
 *   C8  — Multiple origins → correct matching on second origin
 *   C9  — Vary: Origin header is set for listed origins
 *   C10 — Access-Control-Allow-Credentials: true for listed origins
 */

import { describe, it, expect } from 'vitest';
import {
  adminCors,
  CORS_ALLOWED_METHODS,
  CORS_ALLOWED_HEADERS,
  CORS_MAX_AGE,
} from '../../../src/middleware/admin-cors.js';
import type { AppConfig } from '../../../src/config/schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal Koa-like context for testing the admin CORS middleware. */
interface MockContext {
  path: string;
  method: string;
  status: number;
  body: unknown;
  _headers: Record<string, string>;
  _requestHeaders: Record<string, string>;
  get(name: string): string;
  set(name: string, value: string): void;
}

/**
 * Build a mock Koa context with configurable path, method, and Origin header.
 *
 * @param path - Request path (e.g., '/api/admin/organizations')
 * @param method - HTTP method (e.g., 'GET', 'OPTIONS')
 * @param origin - Origin header value (empty string = no Origin)
 */
function createMockContext(
  path: string,
  method: string,
  origin = '',
): MockContext {
  const responseHeaders: Record<string, string> = {};
  const requestHeaders: Record<string, string> = {};
  if (origin) {
    requestHeaders['Origin'] = origin;
  }

  return {
    path,
    method,
    status: 200,
    body: null,
    _headers: responseHeaders,
    _requestHeaders: requestHeaders,
    get(name: string): string {
      // Case-insensitive header lookup (Koa normalises to lowercase)
      const lower = name.toLowerCase();
      for (const [key, value] of Object.entries(requestHeaders)) {
        if (key.toLowerCase() === lower) return value;
      }
      return '';
    },
    set(name: string, value: string) {
      responseHeaders[name] = value;
    },
  };
}

/**
 * Build a minimal AppConfig-like object with only the fields the
 * admin CORS middleware needs.
 */
function createConfig(origins: string[]): AppConfig {
  return { adminCorsOrigins: origins } as unknown as AppConfig;
}

/**
 * Invoke the admin CORS middleware with the given config and context.
 *
 * @param origins - List of allowed CORS origins
 * @param ctx - Mock Koa context
 * @returns Whether the `next()` callback was called
 */
async function invokeMiddleware(
  origins: string[],
  ctx: MockContext,
): Promise<{ nextCalled: boolean }> {
  const middleware = adminCors(createConfig(origins));
  let nextCalled = false;

  await middleware(
    ctx as unknown as Parameters<typeof middleware>[0],
    async () => {
      nextCalled = true;
    },
  );

  return { nextCalled };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('admin-cors middleware', () => {
  // -------------------------------------------------------------------------
  // C1: Empty config → deny-all default
  // -------------------------------------------------------------------------
  it('C1: should emit no CORS headers when adminCorsOrigins is empty', async () => {
    const ctx = createMockContext('/api/admin/organizations', 'GET', 'https://admin.example.com');
    const { nextCalled } = await invokeMiddleware([], ctx);

    expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(ctx._headers['Access-Control-Allow-Credentials']).toBeUndefined();
    expect(ctx._headers['Access-Control-Allow-Methods']).toBeUndefined();
    expect(nextCalled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // C2: Listed origin → full CORS headers
  // -------------------------------------------------------------------------
  it('C2: should set all CORS headers when origin is in the allow-list', async () => {
    const origin = 'https://admin.example.com';
    const ctx = createMockContext('/api/admin/organizations', 'GET', origin);
    const { nextCalled } = await invokeMiddleware([origin], ctx);

    expect(ctx._headers['Access-Control-Allow-Origin']).toBe(origin);
    expect(ctx._headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(ctx._headers['Access-Control-Allow-Methods']).toBe(CORS_ALLOWED_METHODS);
    expect(ctx._headers['Access-Control-Allow-Headers']).toBe(CORS_ALLOWED_HEADERS);
    expect(ctx._headers['Access-Control-Max-Age']).toBe(CORS_MAX_AGE);
    expect(nextCalled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // C3: Unlisted origin → no CORS headers
  // -------------------------------------------------------------------------
  it('C3: should emit no CORS headers when origin is not in the allow-list', async () => {
    const ctx = createMockContext(
      '/api/admin/organizations',
      'GET',
      'https://evil.com',
    );
    const { nextCalled } = await invokeMiddleware(
      ['https://admin.example.com'],
      ctx,
    );

    expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(ctx._headers['Access-Control-Allow-Credentials']).toBeUndefined();
    expect(nextCalled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // C4: Preflight with listed origin → 204 + CORS headers
  // -------------------------------------------------------------------------
  it('C4: should respond 204 with CORS headers on preflight from listed origin', async () => {
    const origin = 'https://admin.example.com';
    const ctx = createMockContext('/api/admin/organizations', 'OPTIONS', origin);
    const { nextCalled } = await invokeMiddleware([origin], ctx);

    expect(ctx.status).toBe(204);
    expect(ctx.body).toBe('');
    expect(ctx._headers['Access-Control-Allow-Origin']).toBe(origin);
    expect(ctx._headers['Access-Control-Allow-Methods']).toBe(CORS_ALLOWED_METHODS);
    expect(ctx._headers['Access-Control-Allow-Headers']).toBe(CORS_ALLOWED_HEADERS);
    // Preflight should NOT call next() — response is complete
    expect(nextCalled).toBe(false);
  });

  // -------------------------------------------------------------------------
  // C5: Preflight with unlisted origin → 204, no CORS headers
  // -------------------------------------------------------------------------
  it('C5: should respond 204 without CORS headers on preflight from unlisted origin', async () => {
    const ctx = createMockContext(
      '/api/admin/organizations',
      'OPTIONS',
      'https://evil.com',
    );
    const { nextCalled } = await invokeMiddleware(
      ['https://admin.example.com'],
      ctx,
    );

    expect(ctx.status).toBe(204);
    expect(ctx.body).toBe('');
    expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
    // Preflight should NOT call next()
    expect(nextCalled).toBe(false);
  });

  // -------------------------------------------------------------------------
  // C6: No Origin header → passes through
  // -------------------------------------------------------------------------
  it('C6: should pass through without CORS processing when no Origin header is present', async () => {
    const ctx = createMockContext('/api/admin/organizations', 'GET');
    const { nextCalled } = await invokeMiddleware(
      ['https://admin.example.com'],
      ctx,
    );

    // No CORS headers should be set
    expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(ctx._headers['Vary']).toBeUndefined();
    expect(nextCalled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // C7: Non-admin path → passes through
  // -------------------------------------------------------------------------
  it('C7: should pass through without CORS processing for non-admin paths', async () => {
    const ctx = createMockContext(
      '/health',
      'GET',
      'https://admin.example.com',
    );
    const { nextCalled } = await invokeMiddleware(
      ['https://admin.example.com'],
      ctx,
    );

    // Middleware should skip entirely — no CORS headers
    expect(ctx._headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(nextCalled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // C8: Multiple origins → correct matching
  // -------------------------------------------------------------------------
  it('C8: should match the correct origin when multiple origins are configured', async () => {
    const origins = [
      'https://admin.example.com',
      'https://admin-staging.example.com',
    ];
    const ctx = createMockContext(
      '/api/admin/applications',
      'GET',
      'https://admin-staging.example.com',
    );
    const { nextCalled } = await invokeMiddleware(origins, ctx);

    // Second origin should match
    expect(ctx._headers['Access-Control-Allow-Origin']).toBe(
      'https://admin-staging.example.com',
    );
    expect(nextCalled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // C9: Vary: Origin header
  // -------------------------------------------------------------------------
  it('C9: should set Vary: Origin when origin is in the allow-list', async () => {
    const origin = 'https://admin.example.com';
    const ctx = createMockContext('/api/admin/organizations', 'GET', origin);
    await invokeMiddleware([origin], ctx);

    expect(ctx._headers['Vary']).toBe('Origin');
  });

  // -------------------------------------------------------------------------
  // C10: Access-Control-Allow-Credentials
  // -------------------------------------------------------------------------
  it('C10: should set Access-Control-Allow-Credentials: true for listed origins', async () => {
    const origin = 'https://admin.example.com';
    const ctx = createMockContext('/api/admin/config', 'POST', origin);
    await invokeMiddleware([origin], ctx);

    expect(ctx._headers['Access-Control-Allow-Credentials']).toBe('true');
  });
});
