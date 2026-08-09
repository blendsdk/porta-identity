import type { Middleware } from 'koa';
import { logger } from '../lib/logger.js';

export function errorHandler(): Middleware {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err: unknown) {
      const error = err as Error & { status?: number; expose?: boolean };
      ctx.status = error.status || 500;
      ctx.body = {
        error: error.expose ? error.message : 'Internal Server Error',
        status: ctx.status,
      };

      if (ctx.status >= 500) {
        logger.error({ err, method: ctx.method, url: ctx.url }, 'Unhandled error');
      }
    }
  };
}
