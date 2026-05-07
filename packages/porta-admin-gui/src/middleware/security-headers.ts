/**
 * Security headers middleware for the BFF server.
 *
 * Sets security headers on ALL responses per RD-30 §Security Headers:
 * - Content-Security-Policy (CSP with 'unsafe-inline' for FluentUI compatibility)
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - Referrer-Policy: strict-origin-when-cross-origin
 *
 * No HSTS header — the BFF runs on HTTP localhost (RFC 8252 loopback exception).
 *
 * @module middleware/security-headers
 */

import type { Context, Next } from 'koa';

/**
 * Koa middleware that injects security headers on every response.
 */
export function securityHeaders(): (ctx: Context, next: Next) => Promise<void> {
  return async (ctx: Context, next: Next): Promise<void> => {
    // CSP: allow 'self' + 'unsafe-inline' for FluentUI style injection
    ctx.set(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'",
    );

    // Prevent MIME type sniffing
    ctx.set('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking — BFF should never be framed
    ctx.set('X-Frame-Options', 'DENY');

    // Limit referrer information sent to external sites
    ctx.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    await next();
  };
}
