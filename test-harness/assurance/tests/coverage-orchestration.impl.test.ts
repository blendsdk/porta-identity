import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  removeCoverageObservation,
  runManagedCoverageConversion,
  withOwnedHarnessStack,
  writeCoverageFailureArtifact,
} from '../scripts/coverage-orchestration.js';
import { createCoverageWorkspace } from '../coverage/index.js';

test('should never stop an active stack when this invocation did not acquire ownership', async () => {
  let stops = 0;
  let workCalls = 0;

  const exit = await withOwnedHarnessStack(
    async () => 30,
    async () => {
      stops += 1;
      return 0;
    },
    async () => {
      workCalls += 1;
      return 0;
    },
  );

  assert.equal(exit, 30);
  assert.equal(stops, 0);
  assert.equal(workCalls, 0);
});

test('should stop exactly once after successful acquisition and preserve cleanup precedence', async () => {
  let stops = 0;
  const exit = await withOwnedHarnessStack(
    async () => 0,
    async () => {
      stops += 1;
      return 60;
    },
    async () => 21,
  );

  assert.equal(exit, 60);
  assert.equal(stops, 1);
});

test('should remove inadmissible observations and write only sanitized terminal facts', () => {
  const repositoryRoot = mkdtempSync(resolve(tmpdir(), 'porta-coverage-outcome-'));
  try {
    const workspace = createCoverageWorkspace(repositoryRoot, 'protocol', 'operational');
    const observation = resolve(workspace.reportDirectory, 'coverage-observation.json');
    mkdirSync(workspace.reportDirectory, { recursive: true });
    writeFileSync(observation, '{}\n');
    const failurePath = writeCoverageFailureArtifact(workspace, {
      stage: 'conversion',
      exitCode: 143,
      classification: 'interrupted-sigterm',
      project: 'protocol',
      profile: 'operational',
      seed: 'coverage-baseline',
    });
    removeCoverageObservation(workspace);

    assert.equal(existsSync(observation), false);
    const artifact = JSON.parse(readFileSync(failurePath, 'utf8')) as Record<string, unknown>;
    assert.deepEqual(artifact, {
      version: 1,
      status: 'failed',
      stage: 'conversion',
      exitCode: 143,
      classification: 'interrupted-sigterm',
      project: 'protocol',
      profile: 'operational',
      seed: 'coverage-baseline',
    });
    assert.equal(readFileSync(failurePath, 'utf8').includes(repositoryRoot), false);
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test('should run conversion in a bounded managed worker instead of the dispatcher process', async () => {
  const repositoryRoot = process.cwd();
  const workspace = createCoverageWorkspace(repositoryRoot, 'security', 'operational');
  try {
    const result = await runManagedCoverageConversion(repositoryRoot, workspace);

    assert.equal(result.code, 40);
    assert.equal(result.timedOut, false);
    assert.equal(result.forwardedSignal, null);
    assert.equal(result.cleanupFailed, false);
  } finally {
    rmSync(resolve(workspace.root, '..', '..', '..'), { recursive: true, force: true });
  }
});
