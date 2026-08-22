import type { Middleware } from 'koa';
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { registerProtocolRequestCorrelation } from '../oidc/protocol-security-observer.js';
import {
  finalizeSecurityDecision,
  initializeSecurityDecision,
  normalizedRouteTemplate,
  type SecurityDecisionSink,
} from '../security/decision-context.js';

/**
 * Replace bearer and interaction path segments before they reach structured or rendered logs.
 *
 * @param path - Public request path before operational logging.
 * @returns A stable route-shaped path without bearer or interaction values.
 */
export function sanitizeRequestPath(path: string): string {
  return path
    .replace(
      /^\/[^/]+\/auth\/magic-link\/[^/]+(?=\/|$)/,
      '/:organization/auth/magic-link/:artifact',
    )
    .replace(/^\/interaction\/[^/]+(?=\/|$)/, '/interaction/:interaction');
}

/** Create request-correlation middleware that emits only sanitized route-shaped paths. */
export function requestLogger(decisionSink?: SecurityDecisionSink): Middleware {
  return async (ctx, next) => {
    const requestId = randomUUID();
    ctx.state.requestId = requestId;
    initializeSecurityDecision(ctx, requestId);
    ctx.set('X-Request-Id', requestId);
    registerProtocolRequestCorrelation(ctx.req, requestId);

    const start = Date.now();
    try {
      await next();
    } finally {
      const duration = Date.now() - start;
      const routeTemplate = normalizedRouteTemplate(ctx);
      logger.info(
        { requestId, method: ctx.method, routeTemplate, status: ctx.status, duration },
        'HTTP request completed',
      );
      await finalizeSecurityDecision(ctx, decisionSink);
    }
  };
}
