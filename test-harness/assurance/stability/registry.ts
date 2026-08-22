import type { StabilityCommand } from '../tests/stability-campaign-contract.js';
import type { RegisteredStabilityCandidate } from './model.js';

/** Versioned seed set accepted by the initial reliability campaign. */
export const registeredStabilitySeedSet = 'reliability-smoke-v1';

/** Required clean executions before one candidate qualifies. */
export const stabilityRequiredConsecutive = 100 as const;

/** Hard cap that keeps invalid or interrupted campaigns bounded. */
export const stabilityMaximumAttempts = 125 as const;

/** Per-attempt deadline inherited from the root test command plus its campaign allowance. */
export const stabilityAttemptDeadlineMilliseconds = 420_000 as const;

/** Closed candidates that exercise existing assurance subsystem protocols without services. */
export const registeredStabilityCandidates: Readonly<
  Record<StabilityCommand, RegisteredStabilityCandidate>
> = Object.freeze({
  test: Object.freeze({
    command: 'test',
    candidateId: 'test-protocol-v1',
    selector: 'command-outcome-matrix',
    testFile: 'test-harness/assurance/tests/command-outcome-matrix.spec.test.ts',
    qualificationScope: 'assurance-protocol-candidate',
  }),
  harness: Object.freeze({
    command: 'harness',
    candidateId: 'harness-protocol-v1',
    selector: 'project-collection',
    testFile: 'test-harness/assurance/tests/assurance-project-collection.spec.test.ts',
    qualificationScope: 'assurance-protocol-candidate',
  }),
  coverage: Object.freeze({
    command: 'coverage',
    candidateId: 'coverage-protocol-v1',
    selector: 'stability-coverage-probe',
    testFile: 'test-harness/assurance/tests/coverage-classification.impl.test.ts',
    qualificationScope: 'assurance-protocol-candidate',
  }),
  fault: Object.freeze({
    command: 'fault',
    candidateId: 'fault-protocol-v1',
    selector: 'fault-catalog-campaign',
    testFile: 'test-harness/assurance/tests/fault-catalog-campaign.impl.test.ts',
    qualificationScope: 'assurance-protocol-candidate',
  }),
  compat: Object.freeze({
    command: 'compat',
    candidateId: 'compat-protocol-v1',
    selector: 'stability-compat-probe',
    testFile: 'test-harness/assurance/tests/packed-tenant-admin.impl.test.ts',
    qualificationScope: 'assurance-protocol-candidate',
  }),
});

/** Returns whether an untrusted string is one registered stability command. */
export function isStabilityCommand(value: string): value is StabilityCommand {
  return Object.hasOwn(registeredStabilityCandidates, value);
}

/** Returns one exact candidate and rejects unregistered seed sets. */
export function resolveStabilityCandidate(
  command: StabilityCommand,
  seedSet: string,
): RegisteredStabilityCandidate {
  if (seedSet !== registeredStabilitySeedSet) {
    throw new Error('stability seed set is not registered');
  }
  return registeredStabilityCandidates[command];
}

/** Creates the deterministic shuffled seeds frozen by the registered set. */
export function createStabilitySeeds(seedSet: string): readonly string[] {
  if (seedSet !== registeredStabilitySeedSet) {
    throw new Error('stability seed set is not registered');
  }
  const seeds = Array.from(
    { length: stabilityMaximumAttempts },
    (_, index) => `seed-${String(index + 1).padStart(3, '0')}`,
  );
  let state = 0x5a17c9e3;
  for (let index = seeds.length - 1; index > 0; index -= 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const target = (state >>> 0) % (index + 1);
    [seeds[index], seeds[target]] = [seeds[target]!, seeds[index]!];
  }
  return Object.freeze(seeds);
}
