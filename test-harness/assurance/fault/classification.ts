import type { FaultObservation, FaultTuple, FaultTupleResult } from './model.js';

/** Input required to classify one exact tuple without executing repository commands. */
export interface FaultClassificationRequest {
  /** Tuples declared by the selected fault. */
  readonly tuples: readonly FaultTuple[];
  /** Claim selected by the caller. */
  readonly claimId: string;
  /** Sentinel selected by the caller. */
  readonly sentinelId: string;
  /** Whether the clean revision satisfies the catalog constraint. */
  readonly revisionEligible: boolean;
  /** Whether the target bytes match the reviewed SHA-256. */
  readonly targetHashMatches: boolean;
  /** Controlled child observation. */
  readonly observation: FaultObservation;
}

/**
 * Classifies one exact fault tuple without inferring a kill from a generic non-zero process.
 *
 * This pure boundary is shared by live execution and deterministic specification tests so every
 * terminal category follows the same fail-closed precedence.
 */
export function classifyFaultTuple(request: FaultClassificationRequest): FaultTupleResult {
  const tuple = request.tuples.find(
    (candidate) =>
      candidate.claimId === request.claimId && candidate.sentinelId === request.sentinelId,
  );
  const fallbackTuple: FaultTuple = Object.freeze({
    claimId: request.claimId,
    sentinelId: request.sentinelId,
    expectedSignature: 'INVALID_FAULT_TUPLE',
  });
  if (tuple === undefined || !request.revisionEligible || !request.targetHashMatches) {
    return result(fallbackTuple, 'invalid');
  }
  if (request.observation.timedOut) return result(tuple, 'timeout');
  if (request.observation.stage === 'build') return result(tuple, 'invalid');
  if (
    request.observation.stage === 'startup' ||
    request.observation.stage === 'fixture' ||
    request.observation.stage === 'cleanup'
  ) {
    return result(tuple, 'infrastructure-failed');
  }
  if (request.observation.stage !== 'sentinel' || request.observation.unrelatedFailure) {
    return result(tuple, 'invalid');
  }
  if (request.observation.exitCode === 0) return result(tuple, 'survived');
  const exactSignatures = request.observation.assertionSignatures.filter(
    (signature) => signature === tuple.expectedSignature,
  );
  if (
    request.observation.exitCode === 1 &&
    exactSignatures.length === 1 &&
    request.observation.assertionSignatures.length === 1
  ) {
    return result(tuple, 'killed');
  }
  return result(tuple, 'invalid');
}

/** Creates one immutable, residue-free classification result. */
function result(
  tuple: FaultTuple,
  classification: FaultTupleResult['classification'],
): FaultTupleResult {
  return Object.freeze({
    tuple,
    classification,
    blockedClaims: Object.freeze(classification === 'survived' ? [tuple.claimId] : []),
    killedClaims: Object.freeze(classification === 'killed' ? [tuple.claimId] : []),
    primaryTreeUnchanged: true,
    residue: Object.freeze([]),
  });
}
