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
        error: publicErrorMessage(ctx.status),
        status: ctx.status,
      };

      if (ctx.status === 401) {
        recordSecurityDecision(ctx, {
          decisionPoint: 'authentication',
          reasonCode: 'authentication-required',
          outcome: 'deny',
        });
      } else if (ctx.status === 403) {
        recordSecurityDecision(ctx, {
          decisionPoint: 'permission',
          reasonCode: 'permission-required',
          outcome: 'deny',
        });
      } else if (ctx.status === 413) {
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
      } else if (ctx.status === 404) {
        recordSecurityDecision(ctx, {
          decisionPoint: 'resource',
          reasonCode: 'resource-not-found',
          outcome: 'deny',
        });
      } else if (ctx.status === 405) {
        recordSecurityDecision(ctx, {
          decisionPoint: 'validation',
          reasonCode: 'method-not-allowed',
          outcome: 'deny',
        });
      } else if (ctx.status < 500) {
        recordSecurityDecision(ctx, {
          decisionPoint: 'validation',
          reasonCode: 'schema-invalid',
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

/** Return one minimal public error label without exposing a thrown diagnostic. */
function publicErrorMessage(status: number): string {
  if (status === 400) return 'Bad Request';
  if (status === 401) return 'Unauthorized';
  if (status === 403) return 'Forbidden';
  if (status === 404) return 'Not Found';
  if (status === 405) return 'Method Not Allowed';
  if (status === 413) return 'Payload Too Large';
  return status < 500 ? 'Request Rejected' : 'Internal Server Error';
}
