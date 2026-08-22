/** Exact marker emitted when the production decision-event boundary is unavailable. */
export const SECURITY_DECISION_EVENT_CAPABILITY_MISSING =
  'SECURITY_DECISION_EVENT_CAPABILITY_MISSING';

/** Closed terminal outcomes retained by a security decision event. */
export type SecurityDecisionOutcome = 'allow' | 'deny' | 'error';

/** Closed processing boundaries which may make a terminal decision. */
export type SecurityDecisionPoint =
  | 'transport'
  | 'validation'
  | 'authentication'
  | 'membership'
  | 'permission'
  | 'resource'
  | 'handler';

/** Closed test scenarios derived from the approved terminal-event behavior. */
export type SecurityDecisionCaseId =
  | 'admin-read-allowed'
  | 'admin-unauthenticated'
  | 'admin-membership-denied'
  | 'admin-permission-denied'
  | 'admin-resource-denied'
  | 'admin-mutation-committed'
  | 'admin-mutation-audit-failed'
  | 'malformed-json'
  | 'oversized-body'
  | 'schema-rejected'
  | 'handler-threw'
  | 'transport-parser-rejected'
  | 'denial-sink-failed';

/** Privacy-safe terminal event observable at the production logging boundary. */
export interface SecurityDecisionEventObservation {
  /** Event schema version. */
  readonly schemaVersion: 1;
  /** Stable event name. */
  readonly eventName: 'security.decision.v1';
  /** Server-created ISO timestamp. */
  readonly occurredAt: string;
  /** Server-created UUID correlation identifier. */
  readonly requestId: string;
  /** Closed public surface identifier. */
  readonly surface: 'admin-api' | 'public-auth' | 'transport';
  /** Closed HTTP method. */
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'UNKNOWN';
  /** Registered normalized route template. */
  readonly routeTemplate: string;
  /** Final public status. */
  readonly statusCode: number;
  /** Final terminal outcome. */
  readonly outcome: SecurityDecisionOutcome;
  /** Boundary which made the terminal decision. */
  readonly decisionPoint: SecurityDecisionPoint;
  /** Closed reason identifier. */
  readonly reasonCode: string;
  /** Non-secret key identifier for optional protected references. */
  readonly referenceKeyId?: string;
  /** Domain-separated actor reference. */
  readonly actorRef?: string;
  /** Domain-separated tenant reference. */
  readonly tenantRef?: string;
  /** Domain-separated resource reference. */
  readonly resourceRef?: string;
  /** Domain-separated direct-network-source reference. */
  readonly sourceRef?: string;
  /** Optional closed detail object. */
  readonly detail?: Readonly<Record<string, string | number | readonly string[]>>;
}

/** Independently observed result for one executable decision scenario. */
export interface SecurityDecisionCaseObservation {
  /** Scenario executed. */
  readonly caseId: SecurityDecisionCaseId;
  /** Final public status. */
  readonly responseStatus: number;
  /** Number of terminal events correlated to the request or connection. */
  readonly eventCount: number;
  /** Sole correlated event, absent only when the count is not one. */
  readonly event: SecurityDecisionEventObservation | null;
  /** Independently observed business mutation count. */
  readonly mutationCount: number;
  /** Independently observed durable audit count. */
  readonly durableAuditCount: number;
  /** Bounded emergency fallback increments caused by sink failure. */
  readonly emergencyFallbackCount: number;
  /** Complete sanitized operational output for canary scanning. */
  readonly operationalOutput: readonly string[];
  /** Bounded durable-audit content captured independently for canary scanning. */
  readonly auditOutput: readonly string[];
}

/** Production-backed behavior driver used only when explicitly required. */
export interface SecurityDecisionEventDriver {
  /** Reset owned state and execute one scenario. */
  runCase(caseId: SecurityDecisionCaseId): Promise<SecurityDecisionCaseObservation>;
  /** Derive and verify protected references across a rotating key ring. */
  observeKeyRotation(): Promise<{
    readonly activeKeyIdChanged: boolean;
    readonly priorReferenceVerifiesWithRetainedKey: boolean;
    readonly priorReferenceVerifiesWithoutRetainedKey: boolean;
    readonly crossDomainReferencesDiffer: boolean;
  }>;
}

/** Fail-closed capability returned by the adapter seam. */
export type SecurityDecisionEventCapability =
  | {
      readonly available: true;
      readonly evidenceBoundary: 'production-middleware-and-owned-observers';
      createDriver(): Promise<SecurityDecisionEventDriver>;
    }
  | { readonly available: false; readonly reason: string };

/** Forbidden material which must never enter an event or retained operational output. */
export const SECURITY_DECISION_FORBIDDEN_CANARIES = Object.freeze([
  '/api/admin/users/raw-user-id?token=raw-query',
  'caller-request-id',
  'Bearer protected-access-token',
  'protected@example.test',
  'raw-user-id',
  '203.0.113.42',
  'AssuranceBrowser/1.0',
  'SELECT secret FROM internal_table',
  '/srv/porta/private.ts:42',
  'redis://private-cache:6379',
]);

/** Immutable scenario catalog and exact expected terminal classifications. */
export const SECURITY_DECISION_EVENT_ORACLE = Object.freeze({
  cases: Object.freeze([
    ['admin-read-allowed', 200, 'allow', 'handler'],
    ['admin-unauthenticated', 401, 'deny', 'authentication'],
    ['admin-membership-denied', 403, 'deny', 'membership'],
    ['admin-permission-denied', 403, 'deny', 'permission'],
    ['admin-resource-denied', 404, 'deny', 'resource'],
    ['admin-mutation-committed', 200, 'allow', 'handler'],
    ['admin-mutation-audit-failed', 503, 'error', 'handler'],
    ['malformed-json', 400, 'deny', 'validation'],
    ['oversized-body', 413, 'deny', 'validation'],
    ['schema-rejected', 400, 'deny', 'validation'],
    ['handler-threw', 500, 'error', 'handler'],
    ['transport-parser-rejected', 400, 'deny', 'transport'],
    ['denial-sink-failed', 403, 'deny', 'permission'],
  ] as const),
  requiredEventKeys: Object.freeze([
    'schemaVersion',
    'eventName',
    'occurredAt',
    'requestId',
    'surface',
    'method',
    'routeTemplate',
    'statusCode',
    'outcome',
    'decisionPoint',
    'reasonCode',
  ]),
  forbiddenEventKeys: Object.freeze([
    'path',
    'query',
    'body',
    'headers',
    'authorization',
    'cookie',
    'email',
    'actorId',
    'tenantId',
    'resourceId',
    'ip',
    'userAgent',
    'error',
    'stack',
  ]),
});

/** Stable trace cases which bind the public assurance catalog to executable scenarios. */
export const SECURITY_DECISION_TRACE_CASES = Object.freeze({
  'ST-80': Object.freeze([
    'admin-read-allowed',
    'admin-unauthenticated',
    'admin-membership-denied',
    'admin-permission-denied',
    'admin-resource-denied',
  ] satisfies readonly SecurityDecisionCaseId[]),
  'ST-81': Object.freeze([
    'admin-mutation-committed',
    'admin-mutation-audit-failed',
  ] satisfies readonly SecurityDecisionCaseId[]),
  'ST-82': Object.freeze([
    'malformed-json',
    'oversized-body',
    'schema-rejected',
    'handler-threw',
    'transport-parser-rejected',
  ] satisfies readonly SecurityDecisionCaseId[]),
  'ST-83': Object.freeze(
    SECURITY_DECISION_EVENT_ORACLE.cases.map(
      ([caseId]) => caseId,
    ) satisfies readonly SecurityDecisionCaseId[],
  ),
  'ST-84': Object.freeze(['denial-sink-failed'] satisfies readonly SecurityDecisionCaseId[]),
});

/** Stable non-case operations which complete the executable trace catalog. */
export const SECURITY_DECISION_TRACE_OPERATIONS = Object.freeze({
  'ST-85': 'observe-key-rotation',
} as const);
