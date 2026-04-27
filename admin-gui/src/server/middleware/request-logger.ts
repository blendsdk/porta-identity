import type { Middleware } from 'koa';
import type { Logger } from 'pino';
import crypto from 'node:crypto';

/**
 * Request logging middleware.
 *
 * Logs each request with:
 * - Method, path, status, response time
 * - X-Request-Id (generated if not present)
 * - No sensitive data (no tokens, no session IDs)
 *
 * Static asset requests are skipped to reduce log noise.
 *
 * @param logger - Pino logger instance
 * @returns Koa middleware
 */
export function requestLogger(logger: Logger): Middleware {
  return async (ctx, next) => {
    // Generate or use existing request ID for tracing
    const requestId = ctx.get('X-Request-Id') || crypto.randomUUID();
    ctx.set('X-Request-Id', requestId);

    const start = Date.now();

    try {
      await next();
    } finally {
      const duration = Date.now() - start;

      // Skip logging for static asset requests to reduce noise
      if (!ctx.path.match(/\.(js|css|ico|png|svg|woff|woff2|map)$/)) {
        logger.info(
          {
            requestId,
            method: ctx.method,
            path: ctx.path,
            status: ctx.status,
            duration,
          },
          `${ctx.method} ${ctx.path} ${ctx.status} ${duration}ms`,
        );
      }
    }
  };
}
