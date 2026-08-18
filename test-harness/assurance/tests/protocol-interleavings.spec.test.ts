import assert from 'node:assert/strict';
import test from 'node:test';

import { createProtocolInterleavingContract } from './protocol-interleaving-adapter.js';
import {
  invalidInterleavingEvidencePolicy,
  protocolInterleavingRequirements,
  st49ProtocolInterleavings,
  st50ProtocolInterleavings,
  st51ProtocolInterleavings,
} from './protocol-interleaving-requirements.js';

import type {
  InterleavingParticipantObservation,
  InterleavingScenarioObservation,
  InterleavingScenarioRequirement,
} from './protocol-interleaving-contract.js';

const adapter = createProtocolInterleavingContract();

/** Proves two live request intervals intersect rather than merely starting in sequence. */
function intervalsOverlap(
  left: InterleavingParticipantObservation,
  right: InterleavingParticipantObservation,
): boolean {
  return (
    left.requestStartedAtMs < right.requestEndedAtMs &&
    right.requestStartedAtMs < left.requestEndedAtMs
  );
}

/** Applies the shared evidence-admission, privacy, side-effect, and recovery assertions. */
async function observeValid(
  requirement: InterleavingScenarioRequirement,
): Promise<InterleavingScenarioObservation> {
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
    assert.deepEqual(participant.acknowledgedStages, expectedParticipant.requiredStages);
    assert.ok(participant.requestStartedAtMs < participant.requestEndedAtMs, participant.id);
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
  assert.equal(observation.securityLog?.event, requirement.requiredLogEvent);
  assert.ok(
    requirement.requiredLogFields.every((field) => observation.securityLog?.fields.includes(field)),
  );
  assert.ok(
    requirement.forbiddenLogFields.every(
      (field) => !observation.securityLog?.fields.includes(field),
    ),
  );
  assert.equal(observation.retainedSecretCount, 0);
  assert.equal(observation.recoveryObserved, requirement.recoveryExpectation);
  return observation;
}

test('ST-49 synchronizes duplicate consumes and read-during-consume for code and refresh artifacts', async () => {
  assert.deepEqual(
    st49ProtocolInterleavings.map(({ artifactKind }) => artifactKind),
    ['authorization-code', 'refresh-token'],
  );
  for (const requirement of st49ProtocolInterleavings) {
    const observation = await observeValid(requirement);
    assert.equal(requirement.boundedWaitMs, 10_000);
    assert.ok(intervalsOverlap(observation.participants[0]!, observation.participants[1]!));
    assert.ok(intervalsOverlap(observation.participants[0]!, observation.participants[2]!));
    assert.equal(observation.facts.durableSuccessCount, 1);
    assert.equal(observation.facts.rejectedCompetitorCount, 1);
    assert.equal(observation.facts.intermediateArtifactReusable, false);
    assert.equal(observation.facts.durableEffectCount, 1);
  }
});

test('ST-50 distinguishes exact before-commit and after-commit disposable failures', async () => {
  assert.equal(st50ProtocolInterleavings.length, 4);
  for (const requirement of st50ProtocolInterleavings) {
    const observation = await observeValid(requirement);
    assert.equal(requirement.harnessMechanism.includes('disposable'), true);
    assert.equal(observation.facts.exactFailureStageAcknowledged, true);
    assert.equal(observation.facts.productionHookUsed, false);
    assert.equal(observation.facts.finalDurableEffectCount, 1);
    assert.equal(observation.facts.duplicateEffect, false);
    if (requirement.variant === 'failure-immediately-before-commit') {
      assert.equal(observation.facts.durableEffectsBeforeRetry, 0);
      assert.equal(observation.facts.retryResult, 'accepted');
    } else {
      assert.equal(observation.facts.durableEffectsBeforeRetry, 1);
      assert.equal(observation.facts.retryResult, 'rejected-as-replay');
    }
  }
});

test('ST-51 resolves timeout uncertainty from durable state before retry and fresh-process replay', async () => {
  assert.equal(st51ProtocolInterleavings.length, 4);
  for (const requirement of st51ProtocolInterleavings) {
    const observation = await observeValid(requirement);
    assert.equal(observation.facts.initialClientOutcome, 'unknown');
    assert.equal(observation.facts.retryDecisionDerivedFromDurableState, true);
    assert.equal(observation.facts.durableEffectCountBeforeRestart, 1);
    assert.equal(observation.facts.finalDurableEffectCount, 1);
    assert.equal(observation.facts.freshProcessReplayResult, 'rejected-as-replay');
    assert.equal(observation.facts.restartTarget, 'exact-owned-porta-process');
    assert.equal(observation.ownedProcessRestartObserved, true);
    assert.ok(observation.processIdentityBefore);
    assert.ok(observation.processIdentityAfter);
    assert.notEqual(observation.processIdentityBefore, observation.processIdentityAfter);
  }
});

test('classifies setup timeout barrier and infrastructure failures as invalid evidence', () => {
  assert.deepEqual(
    invalidInterleavingEvidencePolicy,
    ['invalid-setup', 'invalid-timeout', 'invalid-barrier', 'infrastructure-failed'].map(
      (classification) => ({ classification, canCreditProductRejection: false }),
    ),
  );
  assert.ok(
    protocolInterleavingRequirements.every(
      (requirement) =>
        requirement.participants.length > 0 &&
        requirement.participants.every(
          (participant) =>
            participant.correlationId.length > 0 && participant.requiredStages.length > 0,
        ),
    ),
  );
});

test('keeps the protocol interleaving catalog closed and live execution unavailable', () => {
  assert.equal(protocolInterleavingRequirements.length, 10);
  assert.deepEqual(
    [...new Set(protocolInterleavingRequirements.map(({ sentinelId }) => sentinelId))],
    ['ST-49', 'ST-50', 'ST-51'],
  );
  const prior = process.env.PORTA_ASSURANCE_INTERLEAVING_ADAPTER;
  process.env.PORTA_ASSURANCE_INTERLEAVING_ADAPTER = 'live';
  try {
    assert.throws(
      () => createProtocolInterleavingContract(),
      /PROTOCOL_INTERLEAVING_LIVE_UNAVAILABLE/,
    );
  } finally {
    if (prior === undefined) delete process.env.PORTA_ASSURANCE_INTERLEAVING_ADAPTER;
    else process.env.PORTA_ASSURANCE_INTERLEAVING_ADAPTER = prior;
  }
});
