import type {
  InterleavingParticipantObservation,
  InterleavingScenarioObservation,
  InterleavingScenarioRequirement,
  ProtocolInterleavingContract,
} from './protocol-interleaving-contract.js';

/**
 * Transparent requirements-only interleaving rig.
 *
 * It performs no requests, barriers, failures, timeouts, or restarts and is never Porta evidence.
 */
export function createProtocolInterleavingSpecRig(): ProtocolInterleavingContract {
  return Object.freeze({
    observeScenario: async (requirement: InterleavingScenarioRequirement) =>
      observeScenario(requirement),
  });
}

/** Mirrors one participant requirement without performing real synchronization. */
function participantObservation(
  requirement: InterleavingScenarioRequirement,
  index: number,
): InterleavingParticipantObservation {
  const participant = requirement.participants[index];
  if (participant === undefined) throw new Error(`missing participant ${index}`);
  return Object.freeze({
    id: participant.id,
    correlationId: participant.correlationId,
    acknowledgedStages: Object.freeze([...participant.requiredStages]),
    requestStartedAtMs: 1_000 + index * 10,
    requestEndedAtMs: 1_100 + index * 10,
  });
}

/** Mirrors one scenario while preserving the broad observation contract. */
function observeScenario(
  requirement: InterleavingScenarioRequirement,
): InterleavingScenarioObservation {
  const restart = requirement.sentinelId === 'ST-51';
  return Object.freeze({
    id: requirement.id,
    sentinelId: requirement.sentinelId,
    artifactKind: requirement.artifactKind,
    evidenceValidity: 'valid',
    invalidReason: null,
    participants: Object.freeze(
      requirement.participants.map((_, index) => participantObservation(requirement, index)),
    ),
    facts: Object.freeze({ ...requirement.expectedFacts }),
    durableStateObservedIndependently: true,
    prohibitedSideEffects: Object.freeze(
      Object.fromEntries(requirement.prohibitedSideEffects.map((effect) => [effect, false])),
    ),
    securityLog: Object.freeze({
      event: requirement.requiredLogEvent,
      fields: Object.freeze([...requirement.requiredLogFields]),
    }),
    retainedSecretCount: 0,
    recoveryObserved: requirement.recoveryExpectation,
    processIdentityBefore: restart ? `owned-porta-before-${requirement.id}` : null,
    processIdentityAfter: restart ? `owned-porta-after-${requirement.id}` : null,
    ownedProcessRestartObserved: restart,
  });
}
