import assert from 'node:assert/strict';
import test from 'node:test';

import { createProtocolConsistencyContract } from './protocol-consistency-adapter.js';
import {
  invalidConsistencyEvidencePolicy,
  protocolConsistencyRequirements,
  st49ProtocolConsistency,
  st50ProtocolConsistency,
  st51ProtocolConsistency,
} from './protocol-consistency-requirements.js';

import type {
  ConsistencyParticipantObservation,
  SingleUseConsistencyObservation,
  SingleUseConsistencyRequirement,
} from './protocol-consistency-contract.js';

const adapter = createProtocolConsistencyContract();

/** Proves two live operation intervals intersect rather than merely running in sequence. */
function intervalsOverlap(
  left: ConsistencyParticipantObservation,
  right: ConsistencyParticipantObservation,
): boolean {
  return (
    left.operationStartedAtMs < right.operationEndedAtMs &&
    right.operationStartedAtMs < left.operationEndedAtMs
  );
}

/** Applies the shared evidence-admission, privacy, side-effect, and recovery assertions. */
async function observeValid(
  requirement: SingleUseConsistencyRequirement,
): Promise<SingleUseConsistencyObservation> {
  const observation = await adapter.observeScenario(requirement);
  assert.equal(observation.id, requirement.id);
  assert.equal(observation.sentinelId, requirement.sentinelId);
  assert.equal(observation.artifactKind, requirement.artifactKind);
  assert.equal(observation.evidenceValidity, 'valid', observation.invalidReason ?? requirement.id);
  assert.equal(observation.invalidReason, null);
  assert.equal(observation.participants.length, requirement.participants.length);

  for (const expectedParticipant of requirement.participants) {
    const participant = observation.participants.find(({ id }) => id === expectedParticipant.id);
    assert.ok(participant, `${requirement.id}: ${expectedParticipant.id}`);
    assert.equal(participant.correlationId, expectedParticipant.correlationId);
    assert.deepEqual(participant.observedCheckpoints, expectedParticipant.requiredObservations);
    assert.ok(participant.operationStartedAtMs < participant.operationEndedAtMs, participant.id);
  }
  for (const [fact, expected] of Object.entries(requirement.expectedFacts)) {
    assert.equal(observation.facts[fact], expected, `${requirement.id}: ${fact}`);
  }
  assert.equal(observation.durableStateObservedIndependently, true, requirement.id);
  assert.deepEqual(
    Object.keys(observation.prohibitedSideEffects).sort(),
    [...requirement.prohibitedSideEffects].sort(),
  );
  assert.ok(Object.values(observation.prohibitedSideEffects).every((occurred) => !occurred));
  if (requirement.requiredLogEvent === null) {
    assert.equal(observation.securityLog, null);
  } else {
    assert.equal(observation.securityLog?.event, requirement.requiredLogEvent);
    assert.ok(
      requirement.requiredLogFields.every((field) =>
        observation.securityLog?.fields.includes(field),
      ),
    );
  }
  assert.ok(
    requirement.forbiddenLogFields.every(
      (field) => !observation.securityLog?.fields.includes(field),
    ),
  );
  assert.equal(observation.retainedSecretCount, 0);
  assert.equal(observation.recoveryObserved, requirement.recoveryExpectation);
  return observation;
}

test('ST-49 verifies public concurrent duplicates for code and refresh artifacts', async () => {
  assert.deepEqual(
    st49ProtocolConsistency.map(({ artifactKind }) => artifactKind),
    ['authorization-code', 'refresh-token'],
  );
  for (const requirement of st49ProtocolConsistency) {
    const observation = await observeValid(requirement);
    assert.ok(intervalsOverlap(observation.participants[0]!, observation.participants[1]!));
    assert.equal(observation.facts.durableSuccessCount, 1);
    assert.equal(observation.facts.rejectedCompetitorCount, 1);
    assert.equal(observation.facts.consumedTransitionCount, 1);
  }
});

test('ST-50 verifies real-store conditional consumption without source variants', async () => {
  assert.equal(st50ProtocolConsistency.length, 2);
  for (const requirement of st50ProtocolConsistency) {
    const observation = await observeValid(requirement);
    assert.equal(requirement.observationMechanism, 'real-datastore-integration');
    assert.ok(intervalsOverlap(observation.participants[0]!, observation.participants[1]!));
    assert.equal(observation.facts.successfulConditionalConsumes, 1);
    assert.equal(observation.facts.rejectedConditionalConsumes, 1);
    assert.equal(observation.facts.consumedTransitionCount, 1);
    assert.equal(observation.facts.sourceModificationUsed, false);
    assert.equal(observation.facts.processTerminationUsed, false);
  }
});

test('ST-51 verifies committed response loss and graceful fresh-process replay', async () => {
  assert.equal(st51ProtocolConsistency.length, 2);
  for (const requirement of st51ProtocolConsistency) {
    const observation = await observeValid(requirement);
    assert.equal(observation.facts.initialRequestCommitted, true);
    assert.equal(observation.facts.initialResponseUsedByClient, false);
    assert.equal(observation.facts.durableStateBeforeRetry, 'consumed');
    assert.equal(observation.facts.preRestartRetryResult, 'rejected-as-replay');
    assert.equal(observation.facts.postRestartRetryResult, 'rejected-as-replay');
    assert.equal(observation.ownedProcessRestartObserved, true);
    assert.ok(observation.processIdentityBefore);
    assert.ok(observation.processIdentityAfter);
    assert.notEqual(observation.processIdentityBefore, observation.processIdentityAfter);
  }
});

test('classifies setup timeout observation and infrastructure failures as invalid evidence', () => {
  assert.deepEqual(
    invalidConsistencyEvidencePolicy,
    ['invalid-setup', 'invalid-timeout', 'invalid-observation', 'infrastructure-failed'].map(
      (classification) => ({ classification, canCreditProductRejection: false }),
    ),
  );
  assert.ok(
    protocolConsistencyRequirements.every(
      (requirement) =>
        requirement.participants.length > 0 &&
        requirement.participants.every(
          (participant) =>
            participant.correlationId.length > 0 && participant.requiredObservations.length > 0,
        ),
    ),
  );
});

test('keeps a six-case defensive catalog and fails closed when live execution is absent', () => {
  assert.equal(protocolConsistencyRequirements.length, 6);
  assert.deepEqual(
    [...new Set(protocolConsistencyRequirements.map(({ sentinelId }) => sentinelId))],
    ['ST-49', 'ST-50', 'ST-51'],
  );
  assert.ok(
    protocolConsistencyRequirements.every(
      ({ observationMechanism }) =>
        !observationMechanism.includes('disposable') &&
        !observationMechanism.includes('termination') &&
        !observationMechanism.includes('proxy'),
    ),
  );
  const prior = process.env.PORTA_ASSURANCE_PROTOCOL_CONSISTENCY_ADAPTER;
  process.env.PORTA_ASSURANCE_PROTOCOL_CONSISTENCY_ADAPTER = 'live';
  try {
    assert.throws(
      () => createProtocolConsistencyContract(),
      /PROTOCOL_CONSISTENCY_LIVE_UNAVAILABLE/,
    );
  } finally {
    if (prior === undefined) delete process.env.PORTA_ASSURANCE_PROTOCOL_CONSISTENCY_ADAPTER;
    else process.env.PORTA_ASSURANCE_PROTOCOL_CONSISTENCY_ADAPTER = prior;
  }
});
