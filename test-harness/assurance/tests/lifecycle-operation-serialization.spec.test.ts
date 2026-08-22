import assert from 'node:assert/strict';
import test from 'node:test';

import type { OwnedRun } from '../../fixtures/lifecycle-planned.js';
import { validLifecycleRequest } from './lifecycle-spec-rig.js';
import {
  createLifecycleQualitySpecRig,
  createQualityGate,
  type LifecycleQualitySpecRig,
} from './lifecycle-quality-spec-rig.js';
import { ResetSpecInterruption } from './reset-spec-rig.js';

/** Starts one owned stack and clears setup observations before an operation race. */
async function arrangeOwnedRun(): Promise<{
  readonly rig: LifecycleQualitySpecRig;
  readonly ownedRun: OwnedRun;
}> {
  const rig = createLifecycleQualitySpecRig();
  const started = await rig.controller.start(validLifecycleRequest());
  assert.ok(started.ownedRun);
  rig.controls.calls.length = 0;
  return { rig, ownedRun: started.ownedRun };
}

/** Yields through queued promise continuations without using timing-sensitive sleeps. */
async function yieldMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// Reset and stop on one owned run are serialized. Cleanup cannot delete the stack while reset is
// between durable boundaries, even when both operations are requested concurrently.
test('should serialize stop behind an active reset', async () => {
  const { rig, ownedRun } = await arrangeOwnedRun();
  const gate = createQualityGate();
  rig.controls.resetGate = gate;
  const reset = rig.controller.reset(ownedRun);
  await gate.entered;

  const stop = rig.controller.stop(ownedRun);
  await yieldMicrotasks();
  assert.ok(!rig.controls.calls.includes('compose-stop'));
  gate.release();
  const [resetOutcome, stopOutcome] = await Promise.all([reset, stop]);

  assert.equal(resetOutcome.exitCode, 0);
  assert.equal(stopOutcome.exitCode, 0);
  assert.ok(
    rig.controls.calls.indexOf('reset-db-exit') < rig.controls.calls.indexOf('compose-stop'),
  );
});

// Signal finalization shares the same serialization boundary. A signal raised by reset completes
// its poison transition before a queued stop may inspect or remove ownership.
test('should serialize stop behind signal finalization during reset', async () => {
  const { rig, ownedRun } = await arrangeOwnedRun();
  const gate = createQualityGate();
  rig.controls.resetGate = gate;
  rig.controls.resetCompletionFault = new ResetSpecInterruption('SIGTERM');
  const reset = rig.controller.reset(ownedRun);
  await gate.entered;

  const stop = rig.controller.stop(ownedRun);
  await yieldMicrotasks();
  assert.ok(!rig.controls.calls.includes('compose-stop'));
  gate.release();
  const [resetOutcome, stopOutcome] = await Promise.all([reset, stop]);

  assert.equal(resetOutcome.exitCode, 143);
  assert.equal(stopOutcome.exitCode, 0);
  assert.ok(
    rig.controls.calls.indexOf('reset-db-enter') < rig.controls.calls.indexOf('compose-stop'),
  );
});

// Lifecycle work is actually wrapped by the deadline capability. Expiry aborts the bounded work,
// classifies timeout, and cleans the acquisition intent before returning.
test('should enforce an aborting deadline around startup work', async () => {
  const rig = createLifecycleQualitySpecRig();
  rig.controls.deadlineMode = 'timeout';

  const result = await rig.controller.start(validLifecycleRequest());

  assert.equal(result.outcome.exitCode, 70);
  assert.equal(result.outcome.classification, 'timeout');
  assert.equal(result.ownedRun, undefined);
  assert.equal(rig.controls.deadlineAbortObserved, true);
  assert.ok(rig.controls.calls.includes('deadline-run'));
  assert.equal(rig.sharedState.records.length, 0);
  assert.equal(rig.sharedState.worktreeClaims.size, 0);
});
