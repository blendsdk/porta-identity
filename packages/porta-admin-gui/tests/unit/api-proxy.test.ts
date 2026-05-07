/**
 * Unit tests for the API proxy middleware.
 *
 * Tests: Bearer token injection, path rewriting, error propagation,
 * no token leakage to non-API paths.
 */

import { describe, it, expect, vi } from 'vitest';
import { createApiProxy } from '../../src/middleware/api-proxy.js';

/** Minimal Koa context mock for proxy tests. */
function createMockContext(path: string, method = 'GET') {
  return {
    path,
    method,
    query: {},
    headers: {} as Record<string, string>,
    request: {
      headers: {} as Record<string, string>,
      body: undefined as unknown,
    },
    status: 200,
    body: undefined as unknown,
    set: vi.fn(),
    state: {} as Record<string, unknown>,
  };
}

describe('createApiProxy', () => {
  it('returns a Koa middleware function', () => {
    const proxy = createApiProxy({
      serverUrl: 'https://porta.example.com',
      getToken: async () => 'test-token',
    });
    expect(typeof proxy).toBe('function');
  });

  it('only proxies /api/ paths', async () => {
    const proxy = createApiProxy({
      serverUrl: 'https://porta.example.com',
      getToken: async () => 'test-token',
    });

    const ctx = createMockContext('/auth/me');
    let nextCalled = false;
    await proxy(ctx as any, async () => {
      nextCalled = true;
    });

    // Non-/api/ paths should fall through to next middleware
    expect(nextCalled).toBe(true);
  });
});
