/**
 * Root / public-surface handlers.
 *
 * Without these, a bare `GET /` would fall through to Koa's default 404
 * handler and render "Not Found" — ugly, and the exact shape of that
 * response (status code + header set) is a small fingerprint signal for
 * scanners. This module serves an intentionally generic, no-information
 * response at the public root so the deployment looks deliberate without
 * disclosing anything about the software running behind it.
 *
 * Endpoints:
 *   GET  /            — 200 with a neutral HTML page
 *   HEAD /            — 200, no body (mirrors GET /)
 *   GET  /robots.txt  — `User-agent: *\nDisallow: /` (keep crawlers out)
 *   GET  /favicon.ico — 204 No Content (suppresses the browser's auto-request)
 *
 * Security properties:
 *   • No product name, version, vendor, or capability description.
 *   • No external asset references — page renders offline, nothing to
 *     fingerprint via network requests.
 *   • `X-Robots-Tag: noindex, nofollow` prevents accidental indexing.
 *   • `Cache-Control: no-store` avoids intermediate caches persisting
 *     the response (keeps future changes in our control).
 *   • `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`
 *     disables script execution and disallows any remote resource.
 *   • Inline `<style>` block — no external CSS, no JS.
 *
 * The body copy is intentionally terse and abstract. Do NOT add branding,
 * support contacts, tenant hints, or links to admin/docs here.
 */

import Router from '@koa/router';

/**
 * Minimal HTML served at `GET /` and `HEAD /`.
 *
 * Kept as a single-line template to avoid accidental whitespace drift in
 * tests that assert on the response body. The message deliberately says
 * nothing: it does not name the product, the vendor, the protocol, or the
 * purpose of the service. Anyone who arrived here intentionally already
 * knows the URL they need; anyone who didn't gets a clean "nothing to see
 * here" page instead of a stack-trace-adjacent 404.
 */
const ROOT_HTML = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="robots" content="noindex, nofollow">',
  '<title>\u00A0</title>',
  '<style>',
  'html,body{height:100%;margin:0;padding:0;background:#fafafa;color:#555;',
  'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,',
  'Helvetica,Arial,sans-serif;}',
  'main{display:flex;align-items:center;justify-content:center;height:100%;',
  'padding:2rem;box-sizing:border-box;text-align:center;}',
  'p{margin:0;font-size:0.95rem;line-height:1.5;max-width:32rem;}',
  '</style>',
  '</head>',
  '<body>',
  '<main><p>This endpoint does not provide a public interface.</p></main>',
  '</body>',
  '</html>',
  '',
].join('\n');

/**
 * Root-page-specific response headers applied to `/`, `/robots.txt`, and
 * `/favicon.ico` only.
 *
 * General security headers (X-Content-Type-Options, X-Frame-Options,
 * Referrer-Policy, Content-Security-Policy, etc.) are handled globally
 * by the `securityHeaders()` middleware in `src/middleware/security-headers.ts`.
 * This object only contains headers that are unique to the root-page surface:
 *
 *   - `Cache-Control: no-store` — prevents proxies from caching the
 *     neutral root-page response.
 *   - `X-Robots-Tag: noindex, nofollow` — prevents accidental search
 *     engine indexing of the root endpoint.
 *
 * Exported for test assertions; kept as a plain object (not a Map) so
 * tests can snapshot it directly.
 */
export const ROOT_PAGE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
});

/**
 * Create the Koa router that serves `/`, `/robots.txt`, and `/favicon.ico`.
 *
 * Mount this router early in the middleware stack — **after** `/health`
 * (health takes priority for load-balancer probes) but **before** any
 * `/:orgSlug/*` catch-all. The paths it owns are exact string matches, so
 * it cannot accidentally shadow tenant or admin routes.
 *
 * The handlers are standalone and take no dependencies, so the router is
 * safe to construct at app-factory time (no DB, Redis, or config access).
 */
export function createRootPageRouter(): Router {
  const router = new Router();

  // GET / → neutral HTML. Also handles HEAD / because @koa/router
  // automatically derives HEAD from GET with an empty body.
  router.get('/', (ctx) => {
    for (const [name, value] of Object.entries(ROOT_PAGE_HEADERS)) {
      ctx.set(name, value);
    }
    ctx.type = 'text/html; charset=utf-8';
    ctx.status = 200;
    ctx.body = ROOT_HTML;
  });

  // GET /robots.txt → blanket Disallow.
  // Explicit rule so scanners that respect robots.txt skip the whole host
  // instead of probing every path looking for a 404 signature.
  router.get('/robots.txt', (ctx) => {
    for (const [name, value] of Object.entries(ROOT_PAGE_HEADERS)) {
      ctx.set(name, value);
    }
    ctx.type = 'text/plain; charset=utf-8';
    ctx.status = 200;
    ctx.body = 'User-agent: *\nDisallow: /\n';
  });

  // GET /favicon.ico → 204 No Content.
  // Browsers auto-fetch favicon.ico for every host; a 204 stops them
  // retrying (which a 404 would log on every page load) and returns no
  // identifying content.
  router.get('/favicon.ico', (ctx) => {
    for (const [name, value] of Object.entries(ROOT_PAGE_HEADERS)) {
      ctx.set(name, value);
    }
    ctx.status = 204;
    // Explicitly null the body so Koa doesn't set a default payload.
    ctx.body = null;
  });

  return router;
}
