import { describe, expect, it } from 'vitest';
import { getSecurityDecisionEventCapability } from './security-decision-event-adapter.js';
import {
  SECURITY_DECISION_EVENT_CAPABILITY_MISSING,
  SECURITY_DECISION_EVENT_ORACLE,
  SECURITY_DECISION_FORBIDDEN_CANARIES,
  SECURITY_DECISION_TRACE_CASES,
  SECURITY_DECISION_TRACE_OPERATIONS,
  type SecurityDecisionCaseId,
  type SecurityDecisionCaseObservation,
} from './security-decision-event-contract.js';

const capability = getSecurityDecisionEventCapability();
const capabilityRequired = process.env.PORTA_SECURITY_DECISION_SPEC_REQUIRED === '1';

/** Return the exact expected classification for one immutable scenario. */
function expectedCase(caseId: SecurityDecisionCaseId) {
  const expected = SECURITY_DECISION_EVENT_ORACLE.cases.find(([id]) => id === caseId);
  if (!expected) throw new Error(`Missing immutable case: ${caseId}`);
  return expected;
}

/** Assert one event contains only normalized, independently correlated decision facts. */
function expectExactEvent(observation: SecurityDecisionCaseObservation): void {
  const [, status, outcome, decisionPoint] = expectedCase(observation.caseId);
  expect(observation.responseStatus).toBe(status);
  expect(observation.eventCount).toBe(1);
  expect(observation.event).not.toBeNull();
  expect(observation.event).toMatchObject({
    schemaVersion: 1,
    eventName: 'security.decision.v1',
    statusCode: status,
    outcome,
    decisionPoint,
  });
  expect(observation.event?.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(Date.parse(observation.event?.occurredAt ?? '')).not.toBeNaN();
  expect(Object.keys(observation.event ?? {}).sort()).toEqual(
    expect.arrayContaining([...SECURITY_DECISION_EVENT_ORACLE.requiredEventKeys].sort()),
  );
  for (const key of SECURITY_DECISION_EVENT_ORACLE.forbiddenEventKeys) {
    expect(observation.event).not.toHaveProperty(key);
  }

  const retained = JSON.stringify({
    event: observation.event,
    output: observation.operationalOutput,
    audit: observation.auditOutput,
  });
  for (const canary of SECURITY_DECISION_FORBIDDEN_CANARIES) {
    expect(retained).not.toContain(canary);
  }
}

describe('security decision terminal-event requirement catalog', () => {
  it('should freeze every covered admin, malformed, transport, and sink scenario', () => {
    expect(SECURITY_DECISION_EVENT_ORACLE.cases.map(([id]) => id)).toStrictEqual([
      'admin-read-allowed',
      'admin-unauthenticated',
      'admin-membership-denied',
      'admin-permission-denied',
      'admin-resource-denied',
      'admin-mutation-committed',
      'admin-mutation-audit-failed',
      'malformed-json',
      'oversized-body',
      'schema-rejected',
      'handler-threw',
      'transport-parser-rejected',
      'denial-sink-failed',
    ]);
  });

  it('should forbid raw request, identity, network, and internal-error fields', () => {
    expect(SECURITY_DECISION_EVENT_ORACLE.forbiddenEventKeys).toStrictEqual([
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
    ]);
  });

  it('should bind globally unique trace cases to every executable decision scenario', () => {
    expect(Object.keys(SECURITY_DECISION_TRACE_CASES)).toStrictEqual([
      'ST-80',
      'ST-81',
      'ST-82',
      'ST-83',
      'ST-84',
    ]);
    expect(
      new Set(Object.entries(SECURITY_DECISION_TRACE_CASES).flatMap(([, caseIds]) => caseIds)),
    ).toStrictEqual(new Set(SECURITY_DECISION_EVENT_ORACLE.cases.map(([caseId]) => caseId)));
    expect(SECURITY_DECISION_TRACE_OPERATIONS).toStrictEqual({
      'ST-85': 'observe-key-rotation',
    });
  });

  it('should fail closed only when production evidence is explicitly required', () => {
    if (capabilityRequired && !capability.available) {
      throw new Error(SECURITY_DECISION_EVENT_CAPABILITY_MISSING);
    }
    expect(capability.available || !capabilityRequired).toBe(true);
  });
});

if (capability.available) {
  describe('security decision production behavior', () => {
    for (const [caseId] of SECURITY_DECISION_EVENT_ORACLE.cases) {
      it(`should emit one exact terminal event for ${caseId}`, async () => {
        const driver = await capability.createDriver();
        const observation = await driver.runCase(caseId);
        expectExactEvent(observation);

        if (caseId === 'admin-mutation-committed') {
          expect(observation).toMatchObject({ mutationCount: 1, durableAuditCount: 1 });
        } else if (caseId === 'admin-mutation-audit-failed') {
          expect(observation).toMatchObject({ mutationCount: 0, durableAuditCount: 0 });
        }
        if (caseId === 'denial-sink-failed') {
          expect(observation).toMatchObject({
            responseStatus: 403,
            mutationCount: 0,
            emergencyFallbackCount: 1,
          });
        }
      });
    }

    it('should derive active references and verify only retained prior keys', async () => {
      const driver = await capability.createDriver();
      await expect(driver.observeKeyRotation()).resolves.toStrictEqual({
        activeKeyIdChanged: true,
        priorReferenceVerifiesWithRetainedKey: true,
        priorReferenceVerifiesWithoutRetainedKey: false,
        crossDomainReferencesDiffer: true,
      });
    });
  });
}
