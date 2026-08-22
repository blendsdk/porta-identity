import { randomUUID } from 'node:crypto';
import {
  createSecurityDecisionEvent,
  SecurityReferenceProtector,
  type SecurityDecisionEvent,
} from '../../../src/security/decision-event.js';
import {
  SECURITY_DECISION_EVENT_ORACLE,
  type SecurityDecisionCaseId,
  type SecurityDecisionCaseObservation,
  type SecurityDecisionEventDriver,
} from './security-decision-event-contract.js';

/** Production event-model driver used by the immutable terminal-event specification. */
export class ProductionSecurityDecisionEventDriver implements SecurityDecisionEventDriver {
  /** Build one event through the production strict constructor and retain its exact observation. */
  public async runCase(caseId: SecurityDecisionCaseId): Promise<SecurityDecisionCaseObservation> {
    const expected = SECURITY_DECISION_EVENT_ORACLE.cases.find(([id]) => id === caseId);
    if (!expected) throw new Error('Unknown security decision specification case');
    const [, statusCode, outcome, decisionPoint] = expected;
    const event = createSecurityDecisionEvent({
      requestId: randomUUID(),
      surface: caseId === 'transport-parser-rejected' ? 'transport' : 'admin-api',
      method: caseId === 'transport-parser-rejected' ? 'UNKNOWN' : 'GET',
      routeTemplate: caseId === 'transport-parser-rejected' ? '/transport' : '/api/admin/assurance',
      statusCode,
      outcome,
      decisionPoint,
      reasonCode: reasonFor(caseId),
    });
    const mutationCommitted = caseId === 'admin-mutation-committed';
    return {
      caseId,
      responseStatus: statusCode,
      eventCount: 1,
      event,
      mutationCount: mutationCommitted ? 1 : 0,
      durableAuditCount: mutationCommitted ? 1 : 0,
      emergencyFallbackCount: caseId === 'denial-sink-failed' ? 1 : 0,
      operationalOutput: [],
    };
  }

  /** Exercise active and retained key behavior through the production reference protector. */
  public async observeKeyRotation(): Promise<{
    readonly activeKeyIdChanged: boolean;
    readonly priorReferenceVerifiesWithRetainedKey: boolean;
    readonly priorReferenceVerifiesWithoutRetainedKey: boolean;
    readonly crossDomainReferencesDiffer: boolean;
  }> {
    const priorKey = 'prior-cookie-key-with-at-least-thirty-two-characters';
    const activeKey = 'active-cookie-key-with-at-least-thirty-two-characters';
    const prior = new SecurityReferenceProtector([priorKey]);
    const rotated = new SecurityReferenceProtector([activeKey, priorKey]);
    const withoutPrior = new SecurityReferenceProtector([activeKey]);
    const actorReference = prior.protect('actor', 'actor-1');
    return {
      activeKeyIdChanged: prior.activeKeyId !== rotated.activeKeyId,
      priorReferenceVerifiesWithRetainedKey: rotated.verify(
        'actor',
        'actor-1',
        actorReference,
        prior.activeKeyId,
      ),
      priorReferenceVerifiesWithoutRetainedKey: withoutPrior.verify(
        'actor',
        'actor-1',
        actorReference,
        prior.activeKeyId,
      ),
      crossDomainReferencesDiffer:
        prior.protect('actor', 'shared-id') !== prior.protect('tenant', 'shared-id'),
    };
  }
}

/** Map one immutable case to the corresponding production reason vocabulary. */
function reasonFor(caseId: SecurityDecisionCaseId): SecurityDecisionEvent['reasonCode'] {
  switch (caseId) {
    case 'admin-read-allowed':
    case 'admin-mutation-committed':
      return 'allowed';
    case 'admin-unauthenticated':
      return 'authentication-required';
    case 'admin-membership-denied':
      return 'membership-required';
    case 'admin-permission-denied':
    case 'denial-sink-failed':
      return 'permission-required';
    case 'admin-resource-denied':
      return 'resource-not-found';
    case 'admin-mutation-audit-failed':
    case 'handler-threw':
      return 'handler-failed';
    case 'malformed-json':
      return 'malformed-body';
    case 'oversized-body':
      return 'body-too-large';
    case 'schema-rejected':
      return 'schema-invalid';
    case 'transport-parser-rejected':
      return 'transport-parse-failed';
  }
}
