import assert from 'node:assert/strict';
import test from 'node:test';

import { createMutationPilotContract } from './mutation-pilot-adapter.js';
import {
  isApprovedMutationPilotTarget,
  isCanonicalPilotPath,
  mutationPilotCapabilityRequirement,
  mutationPilotForbiddenEvidenceFields,
  mutationPilotTargets,
} from './mutation-pilot-requirements.js';

test('defines exactly one pure-logic target and one authorization-boundary target', () => {
  assert.equal(mutationPilotTargets.length, 2);
  assert.deepEqual(
    mutationPilotTargets.map((target) => target.purpose),
    ['pure-logic', 'authorization-boundary'],
  );
  assert.equal(new Set(mutationPilotTargets.map((target) => target.sourcePath)).size, 2);
  assert.equal(new Set(mutationPilotTargets.map((target) => target.testPath)).size, 2);
  assert.ok(mutationPilotTargets.every(isApprovedMutationPilotTarget));
});

test('rejects traversal, absolute paths, wildcards, and altered source-test pairings', () => {
  for (const path of [
    '/tmp/source.ts',
    '../source.ts',
    'packages/server/src/**/*.ts',
    'packages/server/src/file?.ts',
    'packages\\server\\src\\file.ts',
    `packages/server/src/file.ts\0ignored`,
  ]) {
    assert.equal(isCanonicalPilotPath(path), false, path);
  }

  const pureTarget = mutationPilotTargets[0]!;
  const authorizationTarget = mutationPilotTargets[1]!;
  assert.equal(
    isApprovedMutationPilotTarget({
      ...pureTarget,
      testPath: authorizationTarget.testPath,
    }),
    false,
  );
  assert.equal(
    isApprovedMutationPilotTarget({
      ...authorizationTarget,
      sourcePath: 'packages/server/src/middleware/admin-auth.ts',
    }),
    false,
  );
});

test('requires a version-pinned Vitest runner and a closed non-score result taxonomy', () => {
  assert.deepEqual(mutationPilotCapabilityRequirement.runner, {
    packageName: '@stryker-mutator/core',
    runnerPackageName: '@stryker-mutator/vitest-runner',
    version: '9.6.1',
  });
  assert.deepEqual(mutationPilotCapabilityRequirement.classifications, [
    'killed',
    'survived',
    'invalid',
    'no-coverage',
    'timeout',
  ]);
  assert.deepEqual(mutationPilotCapabilityRequirement.decisions, ['go', 'no-go']);
  assert.equal('score' in mutationPilotCapabilityRequirement, false);
  assert.equal('threshold' in mutationPilotCapabilityRequirement, false);
});

test('requires clean disposable execution and sanitized owner-only evidence', () => {
  assert.equal(mutationPilotCapabilityRequirement.isolation, 'clean-detached-worktree');
  assert.deepEqual(mutationPilotCapabilityRequirement.evidence, {
    machineReadable: true,
    artifactMode: 0o600,
    atomicWrite: true,
    primaryTreeMustRemainClean: true,
    rawDiagnosticsRetained: false,
    modifiedProductSourceRetained: false,
  });
  assert.ok(mutationPilotForbiddenEvidenceFields.includes('sourceText'));
  assert.ok(mutationPilotForbiddenEvidenceFields.includes('absolutePath'));
  assert.ok(mutationPilotForbiddenEvidenceFields.includes('token'));
});

test('exposes the exact executable capability without a synthetic fallback', () => {
  const contract = createMutationPilotContract();
  const capability = contract.describe();
  assert.deepEqual(capability, mutationPilotCapabilityRequirement);
  assert.ok(mutationPilotTargets.every((target) => contract.acceptsTarget(target)));
  assert.equal(
    contract.acceptsTarget({
      sourcePath: 'packages/server/src/middleware/admin-auth.ts',
      testPath: 'packages/server/tests/unit/middleware/admin-auth.test.ts',
      purpose: 'authorization-boundary',
    }),
    false,
  );
});
