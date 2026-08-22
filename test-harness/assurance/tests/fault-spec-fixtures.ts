import type {
  PlannedFaultDefinition,
  PlannedFaultExecution,
  PlannedFaultObservation,
  PlannedFaultTuple,
} from './fault-runner-planned.js';

/** Exact clean revision used by the transparent fault specification fixture. */
export const faultFixtureRevision = 'a'.repeat(40);

/** Exact pre-patch SHA-256 used by the transparent fault specification fixture. */
export const faultFixtureTargetHash = `sha256:${'b'.repeat(64)}`;

/** First independently executable tuple supported by the shared fixture fault. */
export const firstFaultTuple: PlannedFaultTuple = Object.freeze({
  claimId: 'CLAIM-R6-01',
  sentinelId: 'ST-64',
  expectedSignature: 'FOUNDATION_FAULT_DETECTED_ALPHA',
});

/** Second tuple proving that shared faults do not share kill evidence. */
export const secondFaultTuple: PlannedFaultTuple = Object.freeze({
  claimId: 'CLAIM-R6-03',
  sentinelId: 'ST-66',
  expectedSignature: 'FOUNDATION_FAULT_DETECTED_BRAVO',
});

/** Complete shared curated-fault definition used by immutable specifications. */
export const sharedFaultDefinition: PlannedFaultDefinition = Object.freeze({
  id: 'foundation-smoke',
  targetRevision: faultFixtureRevision,
  targetPath: 'test-harness/assurance/fault/fixtures/foundation-control.ts',
  targetHash: faultFixtureTargetHash,
  patchPath: 'test-harness/assurance/fault/patches/foundation-smoke.patch',
  buildCommand: 'fault-foundation-build',
  executionCommand: 'fault-foundation-sentinel',
  timeoutMilliseconds: 120_000,
  cleanupVerification: 'primary-tree-unchanged-and-no-owned-residue',
  tuples: Object.freeze([firstFaultTuple, secondFaultTuple]),
});

/** Creates one controlled child observation with explicit overrides. */
export function faultObservation(
  overrides: Partial<PlannedFaultObservation> = {},
): PlannedFaultObservation {
  return Object.freeze({
    stage: 'sentinel',
    exitCode: 1,
    assertionSignatures: Object.freeze([firstFaultTuple.expectedSignature]),
    unrelatedFailure: false,
    timedOut: false,
    ...overrides,
  });
}

/** Creates one valid exact tuple execution with explicit overrides. */
export function faultExecution(
  overrides: Partial<PlannedFaultExecution> = {},
): PlannedFaultExecution {
  return Object.freeze({
    fault: sharedFaultDefinition,
    claimId: firstFaultTuple.claimId,
    sentinelId: firstFaultTuple.sentinelId,
    observedRevision: faultFixtureRevision,
    observedTargetHash: faultFixtureTargetHash,
    observation: faultObservation(),
    ...overrides,
  });
}
