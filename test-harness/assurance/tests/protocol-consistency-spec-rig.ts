import type {
  ConsistencyParticipantObservation,
  ProtocolConsistencyContract,
  SingleUseConsistencyObservation,
  SingleUseConsistencyRequirement,
} from './protocol-consistency-contract.js';

/**
 * Transparent requirements-only consistency rig.
 *
 * It performs no requests, datastore operations, response loss, or restarts and is never Porta
 * evidence. It exists only to prove that the specification itself is complete and coherent.
 */
export function createProtocolConsistencySpecRig(): ProtocolConsistencyContract {
  return Object.freeze({
    observeScenario: async (requirement: SingleUseConsistencyRequirement) =>
      observeScenario(requirement),
  });
}

/** Mirrors one participant requirement without performing a real operation. */
function participantObservation(
  requirement: SingleUseConsistencyRequirement,
  index: number,
): ConsistencyParticipantObservation {
  const participant = requirement.participants[index];
  if (participant === undefined) throw new Error(`missing participant ${index}`);
  return Object.freeze({
    id: participant.id,
    correlationId: participant.correlationId,
    observedCheckpoints: Object.freeze([...participant.requiredObservations]),
    operationStartedAtMs: 1_000 + index * 10,
    operationEndedAtMs: 1_100 + index * 10,
  });
}

/** Mirrors one scenario while preserving the broad live observation contract. */
function observeScenario(
  requirement: SingleUseConsistencyRequirement,
): SingleUseConsistencyObservation {
  const restart = requirement.sentinelId === 'ST-51';
  const securityLog =
    requirement.requiredLogEvent === null
      ? null
      : Object.freeze({
          event: requirement.requiredLogEvent,
          fields: Object.freeze([...requirement.requiredLogFields]),
        });
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
    securityLog,
    retainedSecretCount: 0,
    recoveryObserved: requirement.recoveryExpectation,
    processIdentityBefore: restart ? `owned-porta-before-${requirement.id}` : null,
    processIdentityAfter: restart ? `owned-porta-after-${requirement.id}` : null,
    ownedProcessRestartObserved: restart,
  });
}
