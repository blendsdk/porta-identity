import type { Middleware } from 'koa';
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { registerProtocolRequestCorrelation } from '../oidc/protocol-security-observer.js';

export function requestLogger(): Middleware {
  return async (ctx, next) => {
    const requestId = randomUUID();
    ctx.state.requestId = requestId;
    ctx.set('X-Request-Id', requestId);
    registerProtocolRequestCorrelation(ctx.req, requestId);

    const start = Date.now();
    await next();
    const duration = Date.now() - start;

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
  };
}
