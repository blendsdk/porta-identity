import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';

import {
  decideMutationPilot,
  registeredMutationPilotCapability,
  validateMutationPilotWorkerResult,
} from '../mutation/index.js';

/** Exact count record used by controlled implementation tests. */
function counts(
  overrides: Partial<{
    killed: number;
    survived: number;
    invalid: number;
    'no-coverage': number;
    timeout: number;
  }> = {},
) {
  return {
    killed: 0,
    survived: 0,
    invalid: 0,
    'no-coverage': 0,
    timeout: 0,
    ...overrides,
  };
}

test('should accept only complete count-only results for both registered targets', () => {
  const result = validateMutationPilotWorkerResult({
    schemaVersion: 1,
    compatibility: 'compatible',
    targets: [
      {
        sourcePath: 'packages/server/src/lib/cursor.ts',
        classifications: counts({ killed: 3, survived: 1 }),
        total: 4,
      },
      {
        sourcePath: 'packages/server/src/middleware/require-permission.ts',
        classifications: counts({ killed: 2, 'no-coverage': 1 }),
        total: 3,
      },
    ],
  });

  assert.equal(result.targets.length, 2);
  assert.deepEqual(
    result.targets.map((target) => target.total),
    [4, 3],
  );
});

test('should reject additional targets, raw fields, negative counts, and inconsistent totals', () => {
  const validTarget = {
    sourcePath: 'packages/server/src/lib/cursor.ts',
    classifications: counts({ killed: 1 }),
    total: 1,
  };
  const authorizationTarget = {
    sourcePath: 'packages/server/src/middleware/require-permission.ts',
    classifications: counts({ killed: 1 }),
    total: 1,
  };
  assert.throws(
    () =>
      validateMutationPilotWorkerResult({
        schemaVersion: 1,
        compatibility: 'compatible',
        targets: [
          validTarget,
          authorizationTarget,
          { ...validTarget, sourcePath: 'packages/server/src/server.ts' },
        ],
      }),
    /not registered|exact target set/i,
  );
  assert.throws(
    () =>
      validateMutationPilotWorkerResult({
        schemaVersion: 1,
        compatibility: 'compatible',
        targets: [
          { ...validTarget, classifications: { ...validTarget.classifications, sourceText: 'x' } },
          authorizationTarget,
        ],
      }),
    /counts are invalid/i,
  );
  assert.throws(
    () =>
      validateMutationPilotWorkerResult({
        schemaVersion: 1,
        compatibility: 'compatible',
        targets: [
          { ...validTarget, classifications: counts({ killed: -1 }), total: -1 },
          authorizationTarget,
        ],
      }),
    /count is invalid/i,
  );
  assert.throws(
    () =>
      validateMutationPilotWorkerResult({
        schemaVersion: 1,
        compatibility: 'compatible',
        targets: [{ ...validTarget, total: 2 }, authorizationTarget],
      }),
    /total does not match/i,
  );
});

test('should retain a runner incompatibility only as an empty no-go input', () => {
  assert.deepEqual(
    validateMutationPilotWorkerResult({
      schemaVersion: 1,
      compatibility: 'incompatible',
      targets: [],
    }),
    { schemaVersion: 1, compatibility: 'incompatible', targets: [] },
  );
  assert.throws(
    () =>
      validateMutationPilotWorkerResult({
        schemaVersion: 1,
        compatibility: 'incompatible',
        targets: [
          {
            sourcePath: 'packages/server/src/lib/cursor.ts',
            classifications: counts({ killed: 1 }),
            total: 1,
          },
        ],
      }),
    /must not claim target results/i,
  );
});

test('should decide go only when each target has an observable killed or survived result', () => {
  const target = (sourcePath: string, classifications: ReturnType<typeof counts>) => ({
    sourcePath,
    classifications,
    total: Object.values(classifications).reduce((sum, count) => sum + count, 0),
  });
  const sourcePaths = registeredMutationPilotCapability.targets.map((entry) => entry.sourcePath);

  assert.deepEqual(
    decideMutationPilot(sourcePaths.map((sourcePath) => target(sourcePath, counts()))),
    { decision: 'no-go', reason: 'no-generated-variations' },
  );
  assert.deepEqual(
    decideMutationPilot([
      target(sourcePaths[0]!, counts({ killed: 2 })),
      target(sourcePaths[1]!, counts({ invalid: 2 })),
    ]),
    { decision: 'no-go', reason: 'target-without-observable-result' },
  );
  assert.deepEqual(
    decideMutationPilot([
      target(sourcePaths[0]!, counts({ killed: 2 })),
      target(sourcePaths[1]!, counts({ survived: 1 })),
    ]),
    { decision: 'go', reason: 'compatible-useful-results' },
  );
});

test('should reject every mutation selector except the exact bounded pilot', () => {
  const runner = 'test-harness/assurance/scripts/run-command.ts';
  for (const options of [
    ['mutation'],
    ['mutation', '--select', 'all'],
    ['mutation', '--select', '../packages/server/src/server.ts'],
    ['mutation', '--target', 'packages/server/src/lib/cursor.ts'],
  ]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', runner, ...options], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    assert.equal(result.status, 30, options.join(' '));
    assert.match(result.stderr, /ASSURANCE_SELECTOR_INVALID/, options.join(' '));
  }
});

test('should reject malformed recovery identities without touching runtime state', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'test-harness/assurance/scripts/run-command.ts',
      'mutation',
      '--recover',
      '../other-run',
    ],
    { cwd: process.cwd(), encoding: 'utf8' },
  );

  assert.equal(result.status, 60);
  assert.match(result.stderr, /ASSURANCE_CLEANUP_FAILED/);
  assert.doesNotMatch(result.stderr, /(?:\/home\/|\/tmp\/)/);
});
