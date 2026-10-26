import type { Context } from 'koa';

import { normalizedRouteTemplate } from '../security/decision-context.js';
import { logger } from './logger.js';

/** Bounded failure classes for administrative audit or transaction errors. */
export type AdminMutationFailureClass =
  | 'audit_schema_missing'
  | 'audit_constraint_violation'
  | 'database_error'
  | 'runtime_error';

/** Safe structured fields derived from one unknown failure. */
interface AdminMutationFailure {
  readonly errorName: string;
  readonly errorCode?: string;
  readonly failureClass: AdminMutationFailureClass;
}

/**
 * Classify an admin mutation failure without retaining SQL text, stack traces, or request data.
 *
 * PostgreSQL SQLSTATE values are safe operational identifiers. Known schema and constraint codes
 * become stable failure classes so operators can diagnose audit mismatches from structured logs.
 *
 * @param error Unknown error thrown by an administrative mutation or its audit transaction.
 * @returns Safe fields for one structured log entry.
 */
export function classifyAdminMutationFailure(error: unknown): AdminMutationFailure {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  const rawCode = error instanceof Error ? Reflect.get(error, 'code') : undefined;
  const errorCode =
    typeof rawCode === 'string' && /^[0-9A-Z]{5}$/u.test(rawCode) ? rawCode : undefined;

  if (errorCode === '42P01' || errorCode === '42703') {
    return { errorName, errorCode, failureClass: 'audit_schema_missing' };
  }
  if (errorCode === '23502' || errorCode === '23514') {
    return { errorName, errorCode, failureClass: 'audit_constraint_violation' };
  }
  if (errorCode) {
    return { errorName, errorCode, failureClass: 'database_error' };
  }
  return { errorName, failureClass: 'runtime_error' };
}

/**
 * Emit one sanitized diagnostic for a failed administrative mutation.
 *
 * The public response remains the caller's existing generic error. Only request identity, route
 * template, error name, known SQLSTATE, and the bounded failure class are logged.
 *
 * @param ctx Request context used for the public request ID and route template.
 * @param error Unknown thrown value.
 * @param event Stable event name for the owning admin surface.
 */
export function logAdminMutationFailure(
  ctx: Context,
  error: unknown,
  event: string,
): void {
  const failure = classifyAdminMutationFailure(error);

  logger.error(
    {
      event,
      requestId: ctx.state.requestId,
      method: ctx.method,
      routeTemplate: normalizedRouteTemplate(ctx),
      errorName: failure.errorName,
      ...(failure.errorCode === undefined ? {} : { errorCode: failure.errorCode }),
      failureClass: failure.failureClass,
    },
    'Administrative mutation transaction failed',
  );
}
