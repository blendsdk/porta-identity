import type { Middleware } from 'koa';
import { logger } from '../lib/logger.js';
import { recordSecurityDecision } from '../security/decision-context.js';

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

      if (ctx.status === 413) {
        recordSecurityDecision(ctx, {
          decisionPoint: 'validation',
          reasonCode: 'body-too-large',
          outcome: 'deny',
        });
      } else if (ctx.status === 400) {
        recordSecurityDecision(ctx, {
          decisionPoint: 'validation',
          reasonCode: 'malformed-body',
          outcome: 'deny',
        });
      } else {
        recordSecurityDecision(ctx, {
          decisionPoint: 'handler',
          reasonCode: 'handler-failed',
          outcome: 'error',
        });
      }

      if (ctx.status >= 500) {
        logger.error(
          { event: 'request-handler-failed', requestId: ctx.state.requestId },
          'Request handler failed',
        );
      }
    }
  };
}
