import type { Middleware } from 'koa';
import type { BffConfig } from '../config.js';

/**
 * Security headers middleware.
 *
 * Sets standard security headers on all responses:
 * - Content-Security-Policy (strict for admin GUI)
 * - X-Frame-Options (prevent framing / clickjacking)
 * - X-Content-Type-Options (prevent MIME sniffing)
 * - Referrer-Policy (don't leak URLs)
 * - Strict-Transport-Security (HTTPS in production)
 * - X-XSS-Protection (legacy browsers)
 * - Cache-Control (no caching for API/auth routes)
 *
 * @param config - BFF configuration (used for production-specific headers)
 * @returns Koa middleware
 */
export function securityHeaders(config: BffConfig): Middleware {
  const isProduction = config.nodeEnv === 'production';

  return async (ctx, next) => {
    // Content Security Policy — strict for admin console
    ctx.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'", // FluentUI uses inline styles
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "base-uri 'self'",
      ].join('; '),
    );

    // Prevent framing (clickjacking protection)
    ctx.set('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    ctx.set('X-Content-Type-Options', 'nosniff');

    // Control referrer information
    ctx.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // HSTS in production (force HTTPS)
    if (isProduction) {
      ctx.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Legacy XSS protection
    ctx.set('X-XSS-Protection', '1; mode=block');

    // Prevent caching of security-sensitive admin pages
    if (ctx.path.startsWith('/api/') || ctx.path.startsWith('/auth/')) {
      ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      ctx.set('Pragma', 'no-cache');
    }

    await next();
  };
}
