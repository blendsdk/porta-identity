import type {
  BarrierParticipantRequirement,
  EvidenceValidity,
  InterleavingScenarioRequirement,
  Phase7ProtocolArtifactKind,
} from './protocol-interleaving-contract.js';

/** Invalid harness outcomes can never be credited as a Porta rejection. */
export interface InvalidInterleavingEvidencePolicy {
  /** Harness or infrastructure outcome that invalidates the run. */
  readonly classification: Exclude<EvidenceValidity, 'valid'>;
  /** Invalid evidence can never substantiate a product rejection. */
  readonly canCreditProductRejection: false;
}

/** Closed admission policy for non-product failures during distributed scenarios. */
export const invalidInterleavingEvidencePolicy: readonly InvalidInterleavingEvidencePolicy[] = [
  { classification: 'invalid-setup', canCreditProductRejection: false },
  { classification: 'invalid-timeout', canCreditProductRejection: false },
  { classification: 'invalid-barrier', canCreditProductRejection: false },
  { classification: 'infrastructure-failed', canCreditProductRejection: false },
];

const artifacts: readonly Phase7ProtocolArtifactKind[] = ['authorization-code', 'refresh-token'];
const commonProhibitedEffects = [
  'duplicate-durable-effect',
  'reusable-intermediate-artifact',
  'additional-valid-token-or-grant',
  'secret-retained-in-evidence',
] as const;
const requiredLogFields = [
  'synthetic-correlation-id',
  'artifact-class',
  'stage',
  'result',
] as const;
const forbiddenLogFields = [
  'authorization-code',
  'refresh-token',
  'access-token',
  'id-token',
  'client-secret',
  'session-cookie',
] as const;

/** Creates one participant with a deterministic, secret-free correlation identifier. */
function participant(
  scenario: string,
  id: string,
  requiredStages: readonly string[],
): BarrierParticipantRequirement {
  return {
    id,
    correlationId: `corr-${scenario}-${id}`,
    requiredStages,
  };
}

/** Applies the common bounded-wait, privacy, side-effect, and recovery requirements. */
function scenario(
  definition: Omit<
    InterleavingScenarioRequirement,
    | 'boundedWaitMs'
    | 'prohibitedSideEffects'
    | 'requiredLogEvent'
    | 'requiredLogFields'
    | 'forbiddenLogFields'
    | 'recoveryExpectation'
  >,
): InterleavingScenarioRequirement {
  return {
    ...definition,
    boundedWaitMs: 10_000,
    prohibitedSideEffects: commonProhibitedEffects,
    requiredLogEvent: 'replay-sensitive-artifact-decision',
    requiredLogFields,
    forbiddenLogFields,
    recoveryExpectation: 'one-durable-effect-and-fresh-valid-flow-remains-usable',
  };
}

/** Creates synchronized duplicate-consume and read-during-consume requirements. */
function st49(artifactKind: Phase7ProtocolArtifactKind): InterleavingScenarioRequirement {
  const id = `st49-${artifactKind}-duplicate-read`;
  return scenario({
    id,
    sentinelId: 'ST-49',
    artifactKind,
    variant: 'duplicate-and-read-during-consume',
    harnessMechanism: 'synchronized-disposable-proxy',
    participants: [
      participant(id, 'primary-consumer', [
        'ready-before-consume',
        'consume-entered',
        'commit-released',
      ]),
      participant(id, 'duplicate-consumer', [
        'ready-before-consume',
        'consume-entered',
        'commit-released',
      ]),
      participant(id, 'read-during-consume-observer', ['consume-entered', 'state-read-complete']),
    ],
    expectedFacts: {
      allParticipantsReachedNamedBarrier: true,
      realRequestIntervalsOverlap: true,
      durableSuccessCount: 1,
      rejectedCompetitorCount: 1,
      readDuringConsumptionObserved: true,
      intermediateArtifactReusable: false,
      durableEffectCount: 1,
    },
  });
}

/** Creates a disposable termination at one exact durable-commit boundary. */
function st50(
  artifactKind: Phase7ProtocolArtifactKind,
  stage: 'before' | 'after',
): InterleavingScenarioRequirement {
  const before = stage === 'before';
  const id = `st50-${artifactKind}-${stage}-commit`;
  return scenario({
    id,
    sentinelId: 'ST-50',
    artifactKind,
    variant: before ? 'failure-immediately-before-commit' : 'failure-immediately-after-commit',
    harnessMechanism: before
      ? 'disposable-pre-commit-termination'
      : 'disposable-post-commit-termination',
    participants: [
      participant(id, 'initial-consumer', [
        'request-entered',
        before ? 'immediately-before-durable-commit' : 'immediately-after-durable-commit',
        'disposable-variant-terminated',
      ]),
      participant(id, 'state-observer', ['termination-observed', 'durable-state-read']),
      participant(id, 'retry-consumer', ['state-read-complete', 'retry-complete']),
    ],
    expectedFacts: {
      exactFailureStageAcknowledged: true,
      productionHookUsed: false,
      durableEffectsBeforeRetry: before ? 0 : 1,
      retryResult: before ? 'accepted' : 'rejected-as-replay',
      finalDurableEffectCount: 1,
      additionalEffectFromRetry: before,
      duplicateEffect: false,
    },
  });
}

/** Creates one timeout/retry/restart branch selected by independently observed durable state. */
function st51(
  artifactKind: Phase7ProtocolArtifactKind,
  state: 'committed' | 'uncommitted',
): InterleavingScenarioRequirement {
  const committed = state === 'committed';
  const id = `st51-${artifactKind}-timeout-${state}`;
  return scenario({
    id,
    sentinelId: 'ST-51',
    artifactKind,
    variant: committed ? 'timeout-then-committed-state' : 'timeout-then-uncommitted-state',
    harnessMechanism: 'client-timeout-and-owned-process-restart',
    participants: [
      participant(id, 'timed-out-client', ['request-entered', 'client-timeout-observed']),
      participant(id, 'durable-state-observer', ['client-timeout-observed', 'durable-state-read']),
      participant(id, 'state-decided-retry', ['durable-state-read', 'retry-complete']),
      participant(id, 'fresh-process-replay', [
        'owned-process-restarted',
        'fresh-process-replay-complete',
      ]),
    ],
    expectedFacts: {
      initialClientOutcome: 'unknown',
      durableStateBeforeRetry: state,
      retryDecisionDerivedFromDurableState: true,
      retryResult: committed ? 'rejected-as-replay' : 'accepted-once',
      durableEffectCountBeforeRestart: 1,
      ownedPortaProcessRestarted: true,
      restartTarget: 'exact-owned-porta-process',
      processIdentityDistinct: true,
      freshProcessReplayResult: 'rejected-as-replay',
      finalDurableEffectCount: 1,
      duplicateEffect: false,
    },
  });
}

/** Duplicate-consume and read-during-consume scenarios for both protocol artifact families. */
export const st49ProtocolInterleavings = artifacts.map(st49);

/** Exact before-commit and after-commit disposable variants for both artifact families. */
export const st50ProtocolInterleavings = artifacts.flatMap((artifact) => [
  st50(artifact, 'before'),
  st50(artifact, 'after'),
]);

/** Both durable-state branches for timeout, retry, and restart across both artifact families. */
export const st51ProtocolInterleavings = artifacts.flatMap((artifact) => [
  st51(artifact, 'committed'),
  st51(artifact, 'uncommitted'),
]);

/** Closed protocol interleaving catalog; later slices may reuse types without mutating these cases. */
export const protocolInterleavingRequirements: readonly InterleavingScenarioRequirement[] = [
  ...st49ProtocolInterleavings,
  ...st50ProtocolInterleavings,
  ...st51ProtocolInterleavings,
];
