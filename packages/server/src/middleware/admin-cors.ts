/**
 * Admin API CORS allow-list middleware.
 *
 * Implements a strict CORS policy for `/api/admin/*` endpoints.
 * By default (empty `adminCorsOrigins` config), **no CORS headers are
 * emitted** — all cross-origin requests are blocked by the browser.
 *
 * When `ADMIN_CORS_ORIGINS` is configured with one or more origin URLs,
 * only those exact origins receive CORS headers.  This is intended for
 * operators who deploy a web-based admin dashboard on a different origin.
 *
 * Non-browser clients (CLI, same-origin requests) never send an `Origin`
 * header, so they pass through this middleware untouched.
 *
 * Placement: mount after the admin metadata router and before
 * `setAdminAuthProvider()` — preflight `OPTIONS` requests don't carry
 * an `Authorization` header, so CORS must respond before auth runs.
 *
 * @module middleware/admin-cors
 */

import type { Middleware } from 'koa';
import type { AppConfig } from '../config/schema.js';

// ---------------------------------------------------------------------------
// Constants — exported for test assertions
// ---------------------------------------------------------------------------

/** HTTP methods allowed for cross-origin admin API requests. */
export const CORS_ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

/** HTTP headers allowed in cross-origin admin API requests. */
export const CORS_ALLOWED_HEADERS = 'Authorization, Content-Type';

/** Preflight cache duration in seconds (24 hours). */
export const CORS_MAX_AGE = '86400';

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create admin CORS middleware with the given application config.
 *
 * Uses a `Set` for O(1) origin lookup.  The `Vary: Origin` header is
 * required by the CORS specification when `Access-Control-Allow-Origin`
 * is not the wildcard `*` — it tells caches that the response varies by
 * the request's `Origin` header.
 *
 * @param config - Application config (reads `adminCorsOrigins`)
 * @returns Koa middleware that handles CORS for `/api/admin/*` routes
 */
export function adminCors(config: AppConfig): Middleware {
  // Pre-compute the Set once at middleware creation time —
  // config doesn't change at runtime.
  const allowedOrigins = new Set(config.adminCorsOrigins);

  return async function adminCorsMiddleware(ctx, next) {
    // Only process requests to admin API paths.
    // Non-admin paths (health, OIDC, interactions, etc.) are unaffected.
    if (!ctx.path.startsWith('/api/admin')) {
      return next();
    }

    const origin = ctx.get('Origin');

    // No Origin header → not a cross-origin request (same-origin browser
    // request, CLI tool, or server-to-server call).  Pass through.
    if (!origin) {
      return next();
    }

    // Check if the requesting origin is in the allow-list.
    // Only emit CORS headers when there's an explicit match.
    if (allowedOrigins.size > 0 && allowedOrigins.has(origin)) {
      ctx.set('Access-Control-Allow-Origin', origin);
      ctx.set('Access-Control-Allow-Credentials', 'true');
      ctx.set('Access-Control-Allow-Methods', CORS_ALLOWED_METHODS);
      ctx.set('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS);
      ctx.set('Access-Control-Max-Age', CORS_MAX_AGE);
      // Vary: Origin is required by CORS spec — responses differ per origin.
      ctx.set('Vary', 'Origin');
    }

    // Handle preflight requests — browsers send OPTIONS before the real
    // request to check CORS policy.  Respond with 204 regardless of
    // whether the origin matched: if headers weren't set, the browser
    // sees no CORS permission and blocks the follow-up request.
    if (ctx.method === 'OPTIONS') {
      ctx.status = 204;
      ctx.body = '';
      return;
    }

    return next();
  };
}
