import type { Middleware } from 'koa';
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';

export function requestLogger(): Middleware {
  return async (ctx, next) => {
    const requestId = randomUUID();
    ctx.state.requestId = requestId;
    ctx.set('X-Request-Id', requestId);

    const start = Date.now();
    await next();
    const duration = Date.now() - start;

    logger.info(
      {
        requestId,
        method: ctx.method,
        url: ctx.url,
        status: ctx.status,
        duration,
      },
      `${ctx.method} ${ctx.url} ${ctx.status} ${duration}ms`,
    );
  };
}
