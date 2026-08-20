import type { StabilityAttemptInput, StabilityCommand } from './stability-campaign-contract.js';

/** Versioned seed-set name accepted by every initial stability candidate. */
export const stabilitySeedSetId = 'reliability-smoke-v1';

/** Number of consecutive clean executions required for qualification. */
export const requiredConsecutiveExecutions = 100;

/** Maximum visible attempts admitted before qualification fails. */
export const maximumCampaignAttempts = 125;

/** Exact registered command order used by local reliability evidence. */
export const stabilityCommands: readonly StabilityCommand[] = [
  'test',
  'harness',
  'coverage',
  'fault',
  'compat',
];

/** Exact existing internal selectors chosen as bounded subsystem protocol candidates. */
export const stabilityCandidateSelectors: Readonly<Record<StabilityCommand, string>> = {
  test: 'command-outcome-matrix',
  harness: 'project-collection',
  coverage: 'stability-coverage-probe',
  fault: 'fault-catalog-campaign',
  compat: 'stability-compat-probe',
};

/** Closed expected qualification metadata for retained campaign evidence. */
export const stabilityEvidenceRequirements = Object.freeze({
  artifactMode: 0o600,
  artifactAtomic: true,
  attemptDeadlineMilliseconds: 420_000,
  qualificationScope: 'assurance-protocol-candidate' as const,
  noHiddenRetry: true,
  primaryTreeUnchanged: true,
  zeroOwnedResidue: true,
  promotionAuthorized: false,
});

/** Representative reset sequence used by the immutable state-machine oracle. */
export const stabilityResetExample: readonly StabilityAttemptInput[] = [
  { ordinal: 1, seed: 'seed-001', classification: 'completed' },
  { ordinal: 2, seed: 'seed-002', classification: 'invalid' },
  { ordinal: 3, seed: 'seed-003', classification: 'completed' },
  { ordinal: 4, seed: 'seed-004', classification: 'incomplete' },
  { ordinal: 5, seed: 'seed-005', classification: 'completed' },
  { ordinal: 6, seed: 'seed-006', classification: 'cancelled' },
  { ordinal: 7, seed: 'seed-007', classification: 'flaky' },
];
