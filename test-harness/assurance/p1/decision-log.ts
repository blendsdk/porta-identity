/**
 * Parsing and correlation for Porta's structured security logs.
 *
 * The P1 live boundary must prove that a rejected request produced one privacy-safe correlated
 * event. Porta writes those events through pino as JSON lines: covered admin and auth requests use
 * `security.decision.v1`, while every completed request also writes an operational completion
 * record. This module turns a bounded log capture into typed records, correlates a record to one
 * request, and projects the requirement-owned field names that are actually present. It is
 * deliberately pure so it can be tested without Docker or a running server.
 *
 * @module p1/decision-log
 */

/** Closed event name used for covered terminal request decisions. */
export const SECURITY_DECISION_EVENT_NAME = 'security.decision.v1' as const;

/** Closed pino message used for every completed request. */
export const REQUEST_COMPLETION_MESSAGE = 'HTTP request completed' as const;

/** Which Porta log record a parsed line represents. */
export type DecisionLogKind = 'security-decision' | 'request-completion';

/** One privacy-safe Porta decision or completion record parsed from a log line. */
export interface DecisionLogRecord {
  /** Which kind of Porta record this line held. */
  readonly kind: DecisionLogKind;
  /** Stable event or message name used to classify the record. */
  readonly eventName: string;
  /** Server-created request correlation identifier. */
  readonly requestId: string;
  /** Pino epoch-millisecond timestamp when present. */
  readonly time?: number;
  /** Closed public surface for a security decision. */
  readonly surface?: string;
  /** Public HTTP method. */
  readonly method: string;
  /** Registered normalized route template. */
  readonly routeTemplate: string;
  /** Final public status code. */
  readonly statusCode: number;
  /** Final decision outcome when reported. */
  readonly outcome?: string;
  /** Closed reason code when reported. */
  readonly reasonCode?: string;
  /** Protected actor reference when reported. */
  readonly actorRef?: string;
  /** Protected tenant reference when reported. */
  readonly tenantRef?: string;
  /** Protected target reference (the target digest) when reported. */
  readonly resourceRef?: string;
  /** Protected source reference when reported. */
  readonly sourceRef?: string;
  /** Attempted permission action derived from the decision detail. */
  readonly action?: string;
}

/** Returns true when a JSON value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns a finite string value or undefined. */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Returns a finite number value or undefined. */
function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Classifies a status code into the closed outcome vocabulary. */
export function statusClass(status: number): string {
  if (status >= 500) return 'error';
  if (status >= 400) return 'deny';
  return 'allow';
}

/** Derives the attempted action label from a security decision detail. */
function readAction(detail: unknown, reasonCode: string | undefined): string | undefined {
  if (isRecord(detail) && Array.isArray(detail.permissions)) {
    const permissions = detail.permissions.filter(
      (permission): permission is string => typeof permission === 'string' && permission.length > 0,
    );
    if (permissions.length > 0) return permissions.join(' ');
  }
  return reasonCode;
}

/** Parses one pino JSON line into a decision record, or undefined for unrelated lines. */
export function parseDecisionLogLine(line: string): DecisionLogRecord | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || !trimmed.startsWith('{')) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;

  const time = readNumber(parsed.time);
  const decision = parsed.securityDecision;
  if (isRecord(decision)) {
    const reasonCode = readString(decision.reasonCode);
    return {
      kind: 'security-decision',
      eventName: readString(decision.eventName) ?? SECURITY_DECISION_EVENT_NAME,
      requestId: readString(decision.requestId) ?? '',
      ...(time === undefined ? {} : { time }),
      surface: readString(decision.surface),
      method: readString(decision.method) ?? 'UNKNOWN',
      routeTemplate: readString(decision.routeTemplate) ?? '/unmatched',
      statusCode: readNumber(decision.statusCode) ?? 0,
      outcome: readString(decision.outcome),
      reasonCode,
      actorRef: readString(decision.actorRef),
      tenantRef: readString(decision.tenantRef),
      resourceRef: readString(decision.resourceRef),
      sourceRef: readString(decision.sourceRef),
      action: readAction(decision.detail, reasonCode),
    };
  }

  if (
    parsed.msg === REQUEST_COMPLETION_MESSAGE ||
    parsed.eventName === REQUEST_COMPLETION_MESSAGE
  ) {
    return {
      kind: 'request-completion',
      eventName: REQUEST_COMPLETION_MESSAGE,
      requestId: readString(parsed.requestId) ?? '',
      ...(time === undefined ? {} : { time }),
      method: readString(parsed.method) ?? 'UNKNOWN',
      routeTemplate: readString(parsed.routeTemplate) ?? '/unmatched',
      statusCode: readNumber(parsed.status) ?? 0,
    };
  }

  return undefined;
}

/** Parses a bounded log capture, skipping unrelated or non-JSON lines. */
export function parseDecisionLog(text: string): DecisionLogRecord[] {
  const records: DecisionLogRecord[] = [];
  for (const line of text.split('\n')) {
    const record = parseDecisionLogLine(line);
    if (record !== undefined) records.push(record);
  }
  return records;
}

/** Selects the records correlated to one server request identifier. */
export function correlateByRequestId(
  records: readonly DecisionLogRecord[],
  requestId: string,
): DecisionLogRecord[] {
  return records.filter((record) => record.requestId === requestId && requestId.length > 0);
}

/**
 * Projects the requirement-owned field names that a record actually carries.
 *
 * A field is reported only when the underlying value is present, so a partially observed event is
 * reported honestly instead of being padded with placeholders.
 *
 * @param record - Parsed decision or completion record.
 * @param required - Requirement-owned symbolic field names.
 * @returns The subset of `required` genuinely present on the record.
 */
export function projectObservedFields(
  record: DecisionLogRecord,
  required: readonly string[],
): string[] {
  return required.filter((field) => readSymbolicField(record, field) !== undefined);
}

/** Returns the symbolic fields a record cannot supply. */
export function unprojectedFields(
  record: DecisionLogRecord,
  required: readonly string[],
): string[] {
  return required.filter((field) => readSymbolicField(record, field) === undefined);
}

/** Maps one requirement-owned symbolic field name onto a concrete record value. */
export function readSymbolicField(record: DecisionLogRecord, field: string): string | undefined {
  switch (field) {
    case 'synthetic-correlation-id':
      return record.requestId.length > 0 ? record.requestId : undefined;
    case 'event-class':
      return record.eventName;
    case 'public-method':
      return record.method;
    case 'public-route-class':
      return record.routeTemplate;
    case 'public-outcome-class':
      return record.outcome ?? statusClass(record.statusCode);
    case 'actor-id':
      return record.actorRef;
    case 'action':
      return record.action;
    case 'target-id-digest':
      return record.resourceRef;
    case 'result':
      return record.outcome ?? statusClass(record.statusCode);
    default:
      return undefined;
  }
}

/** Reports the symbolic forbidden fields whose pattern matches the bounded text. */
export function findExposedForbiddenFields(
  text: string,
  patterns: Readonly<Record<string, RegExp>>,
): string[] {
  return Object.entries(patterns)
    .filter(([, pattern]) => pattern.test(text))
    .map(([field]) => field)
    .sort();
}
