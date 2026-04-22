/**
 * Global HTTP security headers middleware.
 *
 * Adds defence-in-depth security headers to every response produced by
 * the Porta application.  The headers mitigate a broad class of browser-
 * side attacks (clickjacking, MIME-sniffing, cross-origin information
 * leakage, protocol downgrade) without depending on an upstream reverse
 * proxy — if the proxy is a dumb passthrough, these headers still reach
 * the browser.
 *
 * Headers set on every response:
 *   X-Content-Type-Options: nosniff          — prevent MIME-sniffing
 *   X-Frame-Options: DENY                    — prevent clickjacking
 *   Referrer-Policy: strict-origin-when-cross-origin
 *                                            — limit referrer leakage
 *   X-XSS-Protection: 0                      — disable legacy XSS filter
 *                                              (buggy; rely on CSP instead)
 *   Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
 *                                            — restrict browser APIs
 *   Content-Security-Policy                  — strict default, relaxed for
 *                                              HTML pages (see below)
 *
 * Conditional headers:
 *   Strict-Transport-Security                — only emitted when the
 *     configured issuer URL uses https://
 *
 * Content-Security-Policy strategy:
 *   - Default (JSON / non-HTML responses):
 *       `default-src 'none'`  — nothing to render, nothing to load.
 *   - HTML responses (login, consent, 2FA, password-reset, etc.):
 *       `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'`
 *     The interaction templates use inline `<style>` blocks and may
 *     inject custom branding CSS via `{{{branding.customCss}}}`, hence
 *     `style-src 'unsafe-inline'` is required.  Login pages must never
 *     be embedded in iframes (`frame-ancestors 'none'`).
 *
 *     Note: `form-action` is intentionally omitted.  Chrome enforces
 *     `form-action` on the entire redirect chain of a form submission,
 *     not just the immediate target.  After login, the OIDC provider
 *     redirects through the authorization endpoint and then to the
 *     client's `redirect_uri` (a different origin).  Chrome blocks
 *     this final redirect as a `form-action 'self'` violation, while
 *     Firefox only checks the immediate action URL.  CSRF tokens are
 *     the primary defence against cross-site form attacks; removing
 *     `form-action` has negligible security impact given that
 *     `script-src 'unsafe-inline'` already allows fetch/XHR exfiltration.
 *
 * Placement:
 *   Mount early in the middleware stack — after `errorHandler()` and
 *   `requestLogger()` but before any route-specific middleware. This
 *   ensures headers are present even on error responses.
 */

import type { Middleware } from 'koa';
import { config } from '../config/index.js';

// ---------------------------------------------------------------------------
// Exported constants — consumed by tests and by other middleware that may
// need to reference or override specific values.
// ---------------------------------------------------------------------------

/**
 * Static security headers applied to every response regardless of
 * content type or route.
 */
export const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-XSS-Protection': '0',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
});

/**
 * Strict Content-Security-Policy for non-HTML (JSON, plain-text) responses.
 * Disallows all resource loading — there is nothing for a browser to render
 * in a JSON API response.
 */
export const DEFAULT_CSP = "default-src 'none'";

/**
 * Relaxed Content-Security-Policy for HTML pages (login, consent, 2FA,
 * password reset, invitation, magic-link confirmation, etc.).
 *
 * - `style-src 'unsafe-inline'`   — templates use inline `<style>` blocks,
 *                                    inline style attributes, and custom
 *                                    branding CSS injection.
 * - `script-src 'unsafe-inline'`  — login.hbs uses an inline `<script>` for
 *                                    dual-method email copying, and
 *                                    two-factor-verify.hbs uses one for
 *                                    OTP/recovery mode toggling.
 * - `frame-ancestors 'none'`      — prevents embedding in iframes
 *                                    (modern replacement for X-Frame-Options).
 *
 * `form-action` is intentionally omitted — see module-level doc comment.
 */
export const HTML_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'";

/**
 * HSTS header value — one year, include subdomains.
 * Only emitted when the configured issuer URL uses https.
 */
export const HSTS_VALUE = 'max-age=31536000; includeSubDomains';

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Determine whether HSTS should be emitted based on the configured
 * issuer URL.  Returns `true` when the issuer starts with `https://`.
 *
 * Evaluated once at middleware creation time (issuer doesn't change
 * at runtime).
 */
function shouldEmitHsts(): boolean {
  try {
    return config.issuerBaseUrl.startsWith('https://');
  } catch {
    // Config may not be available in test environments — safe to skip.
    return false;
  }
}

/**
 * Create the global security-headers Koa middleware.
 *
 * Sets static security headers on every response **before** downstream
 * handlers run, then adjusts the Content-Security-Policy after the
 * response body is produced — if the response is HTML, the CSP is
 * relaxed to allow inline styles and form submissions.
 *
 * @returns Koa middleware function
 */
export function securityHeaders(): Middleware {
  const emitHsts = shouldEmitHsts();

  return async function securityHeadersMiddleware(ctx, next) {
    // -----------------------------------------------------------------------
    // Phase 1 — set all static headers before downstream processing.
    // This ensures headers are present even when a downstream handler
    // throws and the error handler generates the final response.
    // -----------------------------------------------------------------------
    for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
      ctx.set(name, value);
    }

    // Default strict CSP — overridden post-response for HTML pages.
    ctx.set('Content-Security-Policy', DEFAULT_CSP);

    // HSTS — only when the deployment uses HTTPS.
    if (emitHsts) {
      ctx.set('Strict-Transport-Security', HSTS_VALUE);
    }

    // -----------------------------------------------------------------------
    // Phase 2 — run downstream middleware / route handlers.
    // -----------------------------------------------------------------------
    await next();

    // -----------------------------------------------------------------------
    // Phase 3 — adjust CSP for HTML responses.
    // After the response body and content-type have been set by the route
    // handler, check if the response is HTML and apply the relaxed CSP
    // that allows inline styles and form submissions.
    // -----------------------------------------------------------------------
    const contentType = ctx.response.get('Content-Type') || '';
    if (contentType.includes('text/html')) {
      ctx.set('Content-Security-Policy', HTML_CSP);
    }
  };
}
