import type {
  ConsistencyParticipantRequirement,
  EvidenceValidity,
  Phase7ProtocolArtifactKind,
  SingleUseConsistencyRequirement,
} from './protocol-consistency-contract.js';

/** Invalid environment outcomes can never be credited as a Porta rejection. */
export interface InvalidConsistencyEvidencePolicy {
  /** Environment outcome that invalidates the run. */
  readonly classification: Exclude<EvidenceValidity, 'valid'>;
  /** Invalid evidence can never substantiate product behavior. */
  readonly canCreditProductRejection: false;
}

/** Closed admission policy for non-product failures. */
export const invalidConsistencyEvidencePolicy: readonly InvalidConsistencyEvidencePolicy[] = [
  { classification: 'invalid-setup', canCreditProductRejection: false },
  { classification: 'invalid-timeout', canCreditProductRejection: false },
  { classification: 'invalid-observation', canCreditProductRejection: false },
  { classification: 'infrastructure-failed', canCreditProductRejection: false },
];

const artifacts: readonly Phase7ProtocolArtifactKind[] = ['authorization-code', 'refresh-token'];
const commonProhibitedEffects = [
  'duplicate-durable-effect',
  'reusable-intermediate-artifact',
  'additional-valid-token-or-grant',
  'secret-retained-in-evidence',
] as const;
const rejectionLogFields = [
  'synthetic-correlation-id',
  'event-class',
  'public-client-id-digest',
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
  requiredObservations: readonly string[],
): ConsistencyParticipantRequirement {
  return { id, correlationId: `corr-${scenario}-${id}`, requiredObservations };
}

/** Applies common privacy, side-effect, timing, and recovery requirements. */
function scenario(
  definition: Omit<
    SingleUseConsistencyRequirement,
    'boundedWaitMs' | 'prohibitedSideEffects' | 'forbiddenLogFields' | 'recoveryExpectation'
  >,
): SingleUseConsistencyRequirement {
  return {
    ...definition,
    boundedWaitMs: 10_000,
    prohibitedSideEffects: commonProhibitedEffects,
    forbiddenLogFields,
    recoveryExpectation: 'one-consumed-transition-and-fresh-valid-flow-remains-usable',
  };
}

/** Creates a public concurrent-duplicate scenario for one artifact family. */
function st49(artifactKind: Phase7ProtocolArtifactKind): SingleUseConsistencyRequirement {
  const id = `st49-${artifactKind}-public-concurrent-duplicates`;
  return scenario({
    id,
    sentinelId: 'ST-49',
    artifactKind,
    variant: 'public-concurrent-duplicates',
    observationMechanism: 'owned-public-requests',
    participants: [
      participant(id, 'first-public-consumer', ['request-started', 'response-observed']),
      participant(id, 'second-public-consumer', ['request-started', 'response-observed']),
      participant(id, 'post-settlement-state-observer', ['requests-settled', 'durable-state-read']),
    ],
    expectedFacts: {
      realRequestIntervalsOverlap: true,
      durableSuccessCount: 1,
      rejectedCompetitorCount: 1,
      consumedTransitionCount: 1,
      intermediateArtifactReusable: false,
    },
    requiredLogEvent: 'protocol-security-rejection',
    requiredLogFields: rejectionLogFields,
  });
}

/** Creates a real-store conditional-consume consistency scenario. */
function st50(artifactKind: Phase7ProtocolArtifactKind): SingleUseConsistencyRequirement {
  const id = `st50-${artifactKind}-real-store-conditional-consume`;
  return scenario({
    id,
    sentinelId: 'ST-50',
    artifactKind,
    variant: 'real-store-conditional-consume',
    observationMechanism: 'real-datastore-integration',
    participants: [
      participant(id, 'first-store-consumer', ['operation-started', 'operation-settled']),
      participant(id, 'second-store-consumer', ['operation-started', 'operation-settled']),
      participant(id, 'store-state-observer', ['operations-settled', 'consumed-state-read']),
    ],
    expectedFacts: {
      realOperationIntervalsOverlap: true,
      successfulConditionalConsumes: 1,
      rejectedConditionalConsumes: 1,
      consumedTransitionCount: 1,
      sourceModificationUsed: false,
      processTerminationUsed: false,
    },
    requiredLogEvent: null,
    requiredLogFields: [],
  });
}

/** Creates a committed-response-loss retry and graceful-restart scenario. */
function st51(artifactKind: Phase7ProtocolArtifactKind): SingleUseConsistencyRequirement {
  const id = `st51-${artifactKind}-committed-response-loss-restart`;
  return scenario({
    id,
    sentinelId: 'ST-51',
    artifactKind,
    variant: 'committed-response-loss-and-graceful-restart',
    observationMechanism: 'discarded-client-response-and-graceful-restart',
    participants: [
      participant(id, 'response-discarding-client', ['request-completed', 'response-discarded']),
      participant(id, 'durable-state-observer', ['response-discarded', 'consumed-state-read']),
      participant(id, 'pre-restart-retry', ['consumed-state-read', 'replay-rejected']),
      participant(id, 'post-restart-retry', ['owned-process-restarted', 'replay-rejected']),
    ],
    expectedFacts: {
      initialRequestCommitted: true,
      initialResponseUsedByClient: false,
      durableStateBeforeRetry: 'consumed',
      preRestartRetryResult: 'rejected-as-replay',
      ownedPortaProcessRestartedGracefully: true,
      processIdentityDistinct: true,
      postRestartRetryResult: 'rejected-as-replay',
      finalConsumedTransitionCount: 1,
      duplicateEffect: false,
    },
    requiredLogEvent: 'protocol-security-rejection',
    requiredLogFields: rejectionLogFields,
  });
}

/** Public concurrent-duplicate scenarios for both protocol artifact families. */
export const st49ProtocolConsistency = artifacts.map(st49);

/** Real-store conditional-consume scenarios for both protocol artifact families. */
export const st50ProtocolConsistency = artifacts.map(st50);

/** Committed-response-loss and graceful-restart scenarios for both artifact families. */
export const st51ProtocolConsistency = artifacts.map(st51);

/** Closed defensive consistency catalog. */
export const protocolConsistencyRequirements: readonly SingleUseConsistencyRequirement[] = [
  ...st49ProtocolConsistency,
  ...st50ProtocolConsistency,
  ...st51ProtocolConsistency,
];
