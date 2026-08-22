import type {
  MutationPilotCapability,
  MutationPilotTarget,
} from '../tests/mutation-pilot-contract.js';

/** Exact source and test pairs available to the local mutation pilot. */
export const registeredMutationPilotTargets: readonly MutationPilotTarget[] = Object.freeze([
  Object.freeze({
    sourcePath: 'packages/server/src/lib/cursor.ts',
    testPath: 'packages/server/tests/unit/lib/cursor.test.ts',
    purpose: 'pure-logic' as const,
  }),
  Object.freeze({
    sourcePath: 'packages/server/src/middleware/require-permission.ts',
    testPath: 'packages/server/tests/unit/middleware/require-permission.test.ts',
    purpose: 'authorization-boundary' as const,
  }),
]);

/** Closed declaration returned without starting a process or creating evidence. */
export const registeredMutationPilotCapability: MutationPilotCapability = Object.freeze({
  selector: 'bounded-pilot',
  runner: Object.freeze({
    packageName: '@stryker-mutator/core',
    runnerPackageName: '@stryker-mutator/vitest-runner',
    version: '9.6.1',
  }),
  targets: registeredMutationPilotTargets,
  isolation: 'clean-detached-worktree',
  classifications: Object.freeze([
    'killed',
    'survived',
    'invalid',
    'no-coverage',
    'timeout',
  ] as const),
  decisions: Object.freeze(['go', 'no-go'] as const),
  evidence: Object.freeze({
    machineReadable: true,
    artifactMode: 0o600,
    atomicWrite: true,
    primaryTreeMustRemainClean: true,
    rawDiagnosticsRetained: false,
    modifiedProductSourceRetained: false,
  }),
});

/** Returns true only for one byte-for-byte registered source/test/purpose tuple. */
export function isRegisteredMutationPilotTarget(target: MutationPilotTarget): boolean {
  return registeredMutationPilotTargets.some(
    (registered) =>
      registered.sourcePath === target.sourcePath &&
      registered.testPath === target.testPath &&
      registered.purpose === target.purpose,
  );
}
