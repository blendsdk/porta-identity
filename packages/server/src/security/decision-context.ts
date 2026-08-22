/** Request-local collection and exactly-once emission of terminal security decisions. */

import type { Context } from 'koa';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import {
  createSecurityDecisionEvent,
  SECURITY_REFERENCE_DOMAINS,
  SecurityReferenceProtector,
  type SecurityDecisionEvent,
  type SecurityDecisionReasonCode,
  type SecurityReferenceDomain,
} from './decision-event.js';

/** Typed normalized facts supplied by a decision boundary. */
export interface SecurityDecisionFact {
  /** Boundary which made the decision. */
  readonly decisionPoint: SecurityDecisionEvent['decisionPoint'];
  /** Closed reason. */
  readonly reasonCode: SecurityDecisionReasonCode;
  /** Explicit outcome when status alone is insufficient. */
  readonly outcome?: SecurityDecisionEvent['outcome'];
  /** Optional closed detail. */
  readonly detail?: SecurityDecisionEvent['detail'];
}

/** Mutable request-local state; raw identifiers never leave finalization. */
interface SecurityDecisionRequestState {
  readonly requestId: string;
  fact?: SecurityDecisionFact;
  readonly identifiers: Partial<Record<SecurityReferenceDomain, string>>;
  emitted: boolean;
}

/** Sink invoked after strict event validation. */
export type SecurityDecisionSink = (event: SecurityDecisionEvent) => void | Promise<void>;

let emergencySinkFailureCount = 0;

declare module 'koa' {
  interface DefaultState {
    /** Internal normalized terminal-decision state. */
    securityDecision?: SecurityDecisionRequestState;
  }
}

/** Create request-local decision state before body parsing or authentication. */
export function initializeSecurityDecision(ctx: Context, requestId: string): void {
  ctx.state.securityDecision = { requestId, identifiers: {}, emitted: false };
}

/** Record a typed terminal fact without accepting raw diagnostics. */
export function recordSecurityDecision(ctx: Context, fact: SecurityDecisionFact): void {
  const state = ctx.state?.securityDecision;
  if (!state || state.emitted) return;
  state.fact = fact;
}

/** Retain one raw identifier only in request-local memory for protected-reference derivation. */
export function recordSecurityReference(
  ctx: Context,
  domain: SecurityReferenceDomain,
  rawIdentifier: string,
): void {
  const state = ctx.state?.securityDecision;
  if (!state || state.emitted || rawIdentifier.length === 0 || rawIdentifier.length > 512) return;
  state.identifiers[domain] = rawIdentifier;
}

/** Return a registered route template without falling back to the raw request path. */
export function normalizedRouteTemplate(ctx: Context): string {
  const matched = Reflect.get(ctx, '_matchedRoute');
  if (
    typeof matched === 'string' &&
    /^\/[A-Za-z0-9:_/*.-]+$/.test(matched) &&
    !matched.includes('..') &&
    !matched.includes('//')
  ) {
    return matched;
  }
  if (ctx.path.startsWith('/api/admin')) return '/api/admin/unmatched';
  if (ctx.path.includes('/auth/')) return '/:organization/auth/unmatched';
  return '/unmatched';
}

/** Read the bounded emergency sink-failure counter for operational monitoring. */
export function getSecurityDecisionSinkFailureCount(): number {
  return emergencySinkFailureCount;
}

/** Increment the bounded fallback counter when a non-Koa decision sink fails. */
export function recordSecurityDecisionSinkFailure(): void {
  emergencySinkFailureCount = Math.min(Number.MAX_SAFE_INTEGER, emergencySinkFailureCount + 1);
}

/** Default structured sink used by production request finalization. */
export const logSecurityDecision: SecurityDecisionSink = (event) => {
  logger.info({ securityDecision: event }, event.eventName);
};

/**
 * Validate and emit one terminal event.
 *
 * Sink failure never changes a denial or other public response. The only fallback is a bounded
 * in-memory counter; raw event material is not copied into a secondary log message.
 */
export async function finalizeSecurityDecision(
  ctx: Context,
  sink: SecurityDecisionSink = logSecurityDecision,
): Promise<SecurityDecisionEvent | null> {
  const state = ctx.state?.securityDecision;
  if (!state || state.emitted) return null;
  state.emitted = true;
  const surface: SecurityDecisionEvent['surface'] | null = ctx.path.startsWith('/api/admin')
    ? 'admin-api'
    : ctx.path.includes('/auth/')
      ? 'public-auth'
      : null;
  if (surface === null) return null;

  const status = ctx.status;
  const fact = state.fact ?? fallbackDecisionFact(status);

  const references: Partial<Record<SecurityReferenceDomain, string>> = {};
  const populatedDomains = SECURITY_REFERENCE_DOMAINS.filter(
    (domain) => state.identifiers[domain] !== undefined,
  );
  let referenceKeyId: string | undefined;
  if (populatedDomains.length > 0) {
    const protector = new SecurityReferenceProtector(config.cookieKeys);
    referenceKeyId = protector.activeKeyId;
    for (const domain of populatedDomains) {
      const rawIdentifier = state.identifiers[domain];
      if (rawIdentifier !== undefined)
        references[domain] = protector.protect(domain, rawIdentifier);
    }
  }
  const event = createSecurityDecisionEvent({
    requestId: state.requestId,
    surface,
    method: normalizeMethod(ctx.method),
    routeTemplate: normalizedRouteTemplate(ctx),
    statusCode: status,
    outcome: fact.outcome ?? outcomeForStatus(status),
    decisionPoint: fact.decisionPoint,
    reasonCode: fact.reasonCode,
    ...(fact.detail === undefined ? {} : { detail: fact.detail }),
    ...(referenceKeyId === undefined ? {} : { references, referenceKeyId }),
  });

  try {
    await sink(event);
  } catch {
    recordSecurityDecisionSinkFailure();
  }
  return event;
}

/** Derive the only compatible terminal outcome from a final HTTP status. */
function outcomeForStatus(status: number): SecurityDecisionEvent['outcome'] {
  if (status >= 500) return 'error';
  if (status >= 400) return 'deny';
  return 'allow';
}

/** Classify a final response when no earlier boundary supplied a more specific fact. */
function fallbackDecisionFact(status: number): SecurityDecisionFact {
  if (status === 404) {
    return { decisionPoint: 'resource', reasonCode: 'route-not-found', outcome: 'deny' };
  }
  if (status === 405) {
    return { decisionPoint: 'validation', reasonCode: 'method-not-allowed', outcome: 'deny' };
  }
  if (status >= 400 && status < 500) {
    return { decisionPoint: 'validation', reasonCode: 'schema-invalid', outcome: 'deny' };
  }
  if (status >= 500) {
    return { decisionPoint: 'handler', reasonCode: 'handler-failed', outcome: 'error' };
  }
  return { decisionPoint: 'handler', reasonCode: 'allowed', outcome: 'allow' };
}

/** Map an arbitrary HTTP method to the closed event vocabulary. */
function normalizeMethod(method: string): SecurityDecisionEvent['method'] {
  switch (method) {
    case 'GET':
    case 'POST':
    case 'PUT':
    case 'DELETE':
    case 'PATCH':
      return method;
    default:
      return 'UNKNOWN';
  }
}
