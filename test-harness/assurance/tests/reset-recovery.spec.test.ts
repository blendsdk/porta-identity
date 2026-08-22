import assert from 'node:assert/strict';
import test from 'node:test';

import type { OwnedRun } from '../../fixtures/lifecycle-planned.js';
import { validLifecycleRequest } from './lifecycle-spec-rig.js';
import { createResetRigSharedState, createResetSpecRig, type ResetStep } from './reset-spec-rig.js';

/** Recovery lookup containing no caller-selected resource identities. */
function recoveryLookup() {
  return {
    runId: '8f41b7d1-89b5-4ea9-a248-d1807f370888',
    worktreePath: '/worktrees/porta-a',
  };
}

/** Starts an owned stack in shared durable state. */
async function startSharedOwnedRun(
  sharedState: ReturnType<typeof createResetRigSharedState>,
): Promise<{
  readonly originalRig: ReturnType<typeof createResetSpecRig>;
  readonly ownedRun: OwnedRun;
}> {
  const originalRig = createResetSpecRig(sharedState);
  const started = await originalRig.controller.start(validLifecycleRequest());
  assert.ok(started.ownedRun);
  originalRig.controls.calls.length = 0;
  return { originalRig, ownedRun: started.ownedRun };
}

// After a durable reset failure, an in-place reset is fenced even when the original capability is
// retained; only complete owned-stack recovery may make the lease reusable.
test('should block in-place retry after a reset becomes poisoned', async () => {
  const sharedState = createResetRigSharedState();
  const { originalRig, ownedRun } = await startSharedOwnedRun(sharedState);
  originalRig.controls.fault = { step: 'seed', timing: 'after', kind: 'failure' };
  const failed = await originalRig.controller.reset(ownedRun);
  assert.equal(failed.exitCode, 30);
  originalRig.controls.fault = undefined;
  originalRig.controls.calls.length = 0;

  const retry = await originalRig.controller.reset(ownedRun);

  assert.notEqual(retry.exitCode, 0);
  assert.ok(!originalRig.controls.calls.some((call) => call.step === 'db-recreate'));
  assert.equal(sharedState.resetStates.get(ownedRun.manifest.runId), 'resetting-poisoned');
});

// A fresh process can recover a poisoned run only by loading its persisted identity and performing
// the complete recreation sequence; the dead process's in-memory OwnedRun is not required.
test('should recover poison through full recreation from a fresh controller', async () => {
  const sharedState = createResetRigSharedState();
  const { originalRig, ownedRun } = await startSharedOwnedRun(sharedState);
  originalRig.controls.fault = { step: 'redis', timing: 'after', kind: 'timeout' };
  await originalRig.controller.reset(ownedRun);
  assert.equal(sharedState.resetStates.get(ownedRun.manifest.runId), 'resetting-poisoned');

  const recoveryRig = createResetSpecRig(sharedState);
  assert.notEqual(
    recoveryRig.controls.currentProcess.startedAtFingerprint,
    originalRig.controls.currentProcess.startedAtFingerprint,
  );
  const outcome = await recoveryRig.controller.recover(recoveryLookup());

  assert.equal(outcome.exitCode, 0);
  assert.equal(sharedState.resetStates.get(ownedRun.manifest.runId), 'ready');
  const steps = recoveryRig.controls.calls.map((call) => call.step);
  for (const requiredStep of [
    'db-recreate',
    'migration',
    'bootstrap',
    'seed',
    'redis',
    'mailhog',
    'restart-clients',
    'restart-porta',
    'digest-count-checks',
    'public-health',
  ] as const satisfies readonly ResetStep[]) {
    assert.ok(steps.includes(requiredStep), requiredStep);
  }
  assert.ok(steps.indexOf('clear-poison') > steps.indexOf('public-health'));
});

// A failure during full recreation retains durable poison and never reopens traffic.
test('should retain poison when fresh-process full recreation fails', async () => {
  const sharedState = createResetRigSharedState();
  const { originalRig, ownedRun } = await startSharedOwnedRun(sharedState);
  originalRig.controls.fault = { step: 'migration', timing: 'after', kind: 'failure' };
  await originalRig.controller.reset(ownedRun);

  const recoveryRig = createResetSpecRig(sharedState);
  recoveryRig.controls.fault = { step: 'public-health', timing: 'before', kind: 'failure' };
  const outcome = await recoveryRig.controller.recover(recoveryLookup());

  assert.notEqual(outcome.exitCode, 0);
  assert.equal(sharedState.resetStates.get(ownedRun.manifest.runId), 'resetting-poisoned');
  assert.ok(!recoveryRig.controls.calls.some((call) => call.step === 'clear-poison'));
  assert.equal(recoveryRig.controls.trafficBlocked, true);
});

// Persisted ownership remains authoritative during poison recovery; a worktree mismatch cannot
// select or recreate another run's resources.
test('should reject poison recovery when the persisted worktree identity does not match', async () => {
  const sharedState = createResetRigSharedState();
  const { originalRig, ownedRun } = await startSharedOwnedRun(sharedState);
  originalRig.controls.fault = { step: 'seed', timing: 'after', kind: 'failure' };
  await originalRig.controller.reset(ownedRun);
  const recoveryRig = createResetSpecRig(sharedState);

  const outcome = await recoveryRig.controller.recover({
    ...recoveryLookup(),
    worktreePath: '/worktrees/porta-other',
  });

  assert.notEqual(outcome.exitCode, 0);
  assert.deepEqual(recoveryRig.controls.calls, []);
  assert.equal(sharedState.resetStates.get(ownedRun.manifest.runId), 'resetting-poisoned');
});
