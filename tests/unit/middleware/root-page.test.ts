/**
 * Unit tests for the root-page router.
 *
 * The router owns three narrow paths:
 *   GET  /
 *   GET  /robots.txt
 *   GET  /favicon.ico
 *
 * Tests exercise the handlers directly (no network round-trip) by invoking
 * each @koa/router layer with a minimal mock context. This matches the
 * project's existing middleware test style and keeps the suite fast and
 * dependency-free.
 *
 * Coverage goals:
 *   - Correct status + Content-Type + body for each path
 *   - Security response headers present and values match constants
 *   - No product/vendor strings leaked in the HTML body or robots.txt
 *   - Unknown paths are NOT handled (they should fall through to the app's
 *     default 404, so the router must be safe to mount at app root)
 */

import { describe, it, expect } from 'vitest';
import type Router from '@koa/router';
import {
  createRootPageRouter,
  ROOT_PAGE_HEADERS,
} from '../../../src/middleware/root-page.js';

type AnyContext = Record<string, unknown>;

/**
 * Build a minimal Koa-like context for a handler invocation. The root-page
 * handlers only read/write status, type, body, and use ctx.set() for
 * response headers — nothing else.
 */
function createMockContext(): AnyContext {
  const headers: Record<string, string> = {};
  return {
    status: 404,
    body: undefined,
    type: undefined,
    _headers: headers,
    set(key: string, value: string) {
      headers[key] = value;
    },
  };
}

/**
 * Find a layer in the router by HTTP method + path. Mirrors the helper used
 * in tests/unit/routes/*.test.ts.
 */
function findLayer(router: Router, method: string, path: string) {
  const layer = router.stack.find(
    (l) => l.methods.includes(method.toUpperCase()) && l.path === path,
  );
  if (!layer) {
    throw new Error(`Layer not found: ${method} ${path}`);
  }
  return layer;
}

/**
 * Invoke a router layer's handler stack against a mock context and return
 * the context so tests can assert on the resulting state.
 */
async function invoke(
  router: Router,
  method: string,
  path: string,
): Promise<AnyContext> {
  const layer = findLayer(router, method, path);
  const ctx = createMockContext();
  for (const handler of layer.stack) {
    // The handlers are simple sync/async functions that take (ctx, next).
    // None of them call next(), so we pass a noop.
    await (handler as (c: AnyContext, n: () => Promise<void>) => unknown)(
      ctx,
      async () => {},
    );
  }
  return ctx;
}

describe('root-page router', () => {
  describe('GET /', () => {
    it('returns 200 with HTML content type', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/');
      expect(ctx.status).toBe(200);
      expect(ctx.type).toBe('text/html; charset=utf-8');
    });

    it('body is a complete HTML document', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/');
      const body = ctx.body as string;
      expect(body).toContain('<!DOCTYPE html>');
      expect(body).toContain('<html');
      expect(body).toContain('</html>');
    });

    it('body contains a generic, non-product message', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/');
      const body = ctx.body as string;
      expect(body).toContain('This endpoint does not provide a public interface.');
    });

    it('does not leak product, vendor, or protocol names', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/');
      // Lower-case compare so a future styled "Porta" header fails too.
      const body = (ctx.body as string).toLowerCase();
      const forbidden = [
        'porta',
        'truesoftware',
        'oidc',
        'openid',
        'oauth',
        'koa',
        'node',
        'express',
        'admin',
        'login',
        'signin',
        'sign in',
        'log in',
        'authenticate',
        'support',
        'contact',
      ];
      for (const term of forbidden) {
        expect(body, `body must not contain "${term}"`).not.toContain(term);
      }
    });

    it('includes robots noindex meta tag', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/');
      const body = ctx.body as string;
      expect(body).toContain('name="robots"');
      expect(body).toContain('noindex, nofollow');
    });

    it('renders self-contained with no external assets', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/');
      const body = ctx.body as string;
      // No external images, scripts, stylesheets, or font links
      expect(body).not.toMatch(/<img\s/i);
      expect(body).not.toMatch(/<script\s/i);
      expect(body).not.toMatch(/<link\s/i);
      expect(body).not.toMatch(/https?:\/\//i);
    });

    it('sets all security response headers', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/');
      const headers = ctx._headers as Record<string, string>;
      for (const [name, value] of Object.entries(ROOT_PAGE_HEADERS)) {
        expect(headers[name], `header ${name}`).toBe(value);
      }
    });

    it('Cache-Control prevents intermediate caching', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/');
      const headers = ctx._headers as Record<string, string>;
      expect(headers['Cache-Control']).toBe('no-store');
    });

    it('CSP disallows external resources', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/');
      const headers = ctx._headers as Record<string, string>;
      const csp = headers['Content-Security-Policy'];
      expect(csp).toContain("default-src 'none'");
      // Inline style is the one exception (the <style> block in the page).
      expect(csp).toContain("style-src 'unsafe-inline'");
    });
  });

  describe('GET /robots.txt', () => {
    it('returns 200 with plain text content type', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/robots.txt');
      expect(ctx.status).toBe(200);
      expect(ctx.type).toBe('text/plain; charset=utf-8');
    });

    it('disallows all crawlers from all paths', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/robots.txt');
      const body = ctx.body as string;
      expect(body).toContain('User-agent: *');
      expect(body).toContain('Disallow: /');
    });

    it('does not leak product or sitemap hints', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/robots.txt');
      const body = (ctx.body as string).toLowerCase();
      expect(body).not.toContain('sitemap');
      expect(body).not.toContain('porta');
      expect(body).not.toContain('admin');
    });

    it('sets all security response headers', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/robots.txt');
      const headers = ctx._headers as Record<string, string>;
      for (const [name, value] of Object.entries(ROOT_PAGE_HEADERS)) {
        expect(headers[name], `header ${name}`).toBe(value);
      }
    });
  });

  describe('GET /favicon.ico', () => {
    it('returns 204 No Content with an empty body', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/favicon.ico');
      expect(ctx.status).toBe(204);
      expect(ctx.body).toBeNull();
    });

    it('sets all security response headers', async () => {
      const ctx = await invoke(createRootPageRouter(), 'GET', '/favicon.ico');
      const headers = ctx._headers as Record<string, string>;
      for (const [name, value] of Object.entries(ROOT_PAGE_HEADERS)) {
        expect(headers[name], `header ${name}`).toBe(value);
      }
    });
  });

  describe('router surface', () => {
    it('exposes exactly three routes', () => {
      const router = createRootPageRouter();
      const paths = router.stack
        .filter((l) => l.methods.includes('GET'))
        .map((l) => l.path)
        .sort();
      expect(paths).toEqual(['/', '/favicon.ico', '/robots.txt']);
    });

    it('does not register any catch-all or prefix routes', () => {
      const router = createRootPageRouter();
      // Every registered path must be an exact literal — no params, no wildcards.
      for (const layer of router.stack) {
        expect(layer.path).not.toContain(':');
        expect(layer.path).not.toContain('*');
      }
    });

    it('does not handle unknown paths', () => {
      const router = createRootPageRouter();
      const paths = router.stack.map((l) => l.path);
      expect(paths).not.toContain('/.well-known/openid-configuration');
      expect(paths).not.toContain('/api/admin/organizations');
      expect(paths).not.toContain('/health');
      expect(paths).not.toContain('/foo');
    });
  });
});
