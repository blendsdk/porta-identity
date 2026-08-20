import type { MutationPilotCapability, MutationPilotTarget } from './mutation-pilot-contract.js';

/** Exact source/test pairs admitted by the bounded local evaluation. */
export const mutationPilotTargets: readonly MutationPilotTarget[] = Object.freeze([
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

/** Requirement-owned capability expected from the implementation checkpoint. */
export const mutationPilotCapabilityRequirement: MutationPilotCapability = Object.freeze({
  selector: 'bounded-pilot',
  runner: Object.freeze({
    packageName: '@stryker-mutator/core',
    runnerPackageName: '@stryker-mutator/vitest-runner',
    version: '9.6.1',
  }),
  targets: mutationPilotTargets,
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

/** Sensitive or unbounded fields that may never be retained in pilot evidence. */
export const mutationPilotForbiddenEvidenceFields = Object.freeze([
  'stdout',
  'stderr',
  'stack',
  'exception',
  'sourceText',
  'replacementText',
  'diff',
  'absolutePath',
  'credential',
  'token',
  'secret',
]);

/** Returns true only when a path is one canonical repository-relative file path. */
export function isCanonicalPilotPath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.includes('..') &&
    !path.includes('\\') &&
    !path.includes('*') &&
    !path.includes('?') &&
    !path.includes('\0')
  );
}

/** Returns true only for an exact requirement-owned source/test pair. */
export function isApprovedMutationPilotTarget(target: MutationPilotTarget): boolean {
  if (!isCanonicalPilotPath(target.sourcePath) || !isCanonicalPilotPath(target.testPath)) {
    return false;
  }
  return mutationPilotTargets.some(
    (approved) =>
      approved.sourcePath === target.sourcePath &&
      approved.testPath === target.testPath &&
      approved.purpose === target.purpose,
  );
}
