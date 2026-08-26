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

/** Closed request-completion record exposed to owner-controlled operational sinks. */
export interface OperationalRequestRecord {
  /** Server-created request correlation identifier. */
  readonly requestId: string;
  /** Public HTTP method. */
  readonly method: string;
  /** Registered route template or closed unmatched fallback. */
  readonly routeTemplate: string;
  /** Final public status. */
  readonly status: number;
  /** Bounded request duration in milliseconds. */
  readonly duration: number;
}

/** Sink for a normalized request-completion record. */
export type OperationalRequestSink = (record: OperationalRequestRecord) => void;

/** Emit one request-completion record through the production logger. */
const logOperationalRequest: OperationalRequestSink = (record) => {
  logger.info(record, 'HTTP request completed');
};

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
export function requestLogger(
  decisionSink?: SecurityDecisionSink,
  operationalSink: OperationalRequestSink = logOperationalRequest,
): Middleware {
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
      operationalSink({
        requestId,
        method: ctx.method,
        routeTemplate,
        status: ctx.status,
        duration,
      });
      await finalizeSecurityDecision(ctx, decisionSink);
    }
  };
}
