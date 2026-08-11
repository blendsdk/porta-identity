import assert from 'node:assert/strict';
import test from 'node:test';

import type { OwnedRun } from '../../fixtures/lifecycle-planned.js';
import { validLifecycleRequest } from './lifecycle-spec-rig.js';
import {
  createResetSpecRig,
  type ResetInterruptionKind,
  type ResetStep,
} from './reset-spec-rig.js';

const durableBoundaries = [
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
] as const satisfies readonly ResetStep[];

const interruptionKinds = [
  'failure',
  'SIGINT',
  'SIGTERM',
  'cancellation',
  'timeout',
  'unknown',
] as const satisfies readonly ResetInterruptionKind[];

/** Starts a reusable owned stack without retaining setup observations. */
async function arrangeOwnedReset(): Promise<{
  readonly rig: ReturnType<typeof createResetSpecRig>;
  readonly ownedRun: OwnedRun;
}> {
  const rig = createResetSpecRig();
  const started = await rig.controller.start(validLifecycleRequest());
  assert.ok(started.ownedRun);
  rig.controls.calls.length = 0;
  return { rig, ownedRun: started.ownedRun };
}

/** Expected process status for an interruption after reset has been fenced. */
function expectedExitCode(kind: ResetInterruptionKind): 30 | 60 | 70 | 130 | 143 {
  if (kind === 'failure') return 30;
  if (kind === 'SIGINT') return 130;
  if (kind === 'SIGTERM') return 143;
  if (kind === 'unknown') return 60;
  return 70;
}

// Once the poison marker is durable, every failure, signal, cancellation, timeout, or unknown
// outcome around every reset boundary leaves the stack poisoned and blocks assertion admission.
for (const step of durableBoundaries) {
  for (const timing of ['before', 'after'] as const) {
    for (const kind of interruptionKinds) {
      test(`should leave poison after ${kind} ${timing} ${step}`, async () => {
        const { rig, ownedRun } = await arrangeOwnedReset();
        rig.controls.fault = { step, timing, kind };

        const outcome = await rig.controller.reset(ownedRun);

        assert.equal(outcome.exitCode, expectedExitCode(kind));
        assert.equal(
          rig.sharedState.resetStates.get(ownedRun.manifest.runId),
          'resetting-poisoned',
        );
        assert.equal(rig.controls.trafficBlocked, true);
        assert.ok(!rig.controls.calls.some((call) => call.step === 'resume-traffic'));
        assert.ok(!rig.controls.calls.some((call) => call.step === 'clear-poison'));
      });
    }
  }
}

// Interruptions before the poison transition make no durable store mutation and allow a bounded
// retry because no partially recreated state can exist.
for (const step of ['quiesce', 'stop-porta', 'persist-poison'] as const) {
  for (const kind of ['SIGINT', 'SIGTERM', 'cancellation', 'timeout', 'unknown'] as const) {
    test(`should permit retry after ${kind} before pre-mutation step ${step}`, async () => {
      const { rig, ownedRun } = await arrangeOwnedReset();
      rig.controls.fault = { step, timing: 'before', kind };

      const interrupted = await rig.controller.reset(ownedRun);

      assert.equal(interrupted.exitCode, expectedExitCode(kind));
      assert.ok(!rig.controls.calls.some((call) => call.step === 'db-recreate'));
      assert.equal(rig.sharedState.resetStates.get(ownedRun.manifest.runId), 'ready');
      assert.equal(rig.controls.trafficBlocked, false);
      rig.controls.fault = undefined;
      rig.controls.calls.length = 0;

      const retried = await rig.controller.reset(ownedRun);

      assert.equal(retried.exitCode, 0);
      assert.ok(rig.controls.calls.some((call) => call.step === 'db-recreate'));
    });
  }
}

// A failure to write or flush poison prevents the first database mutation and never reports a
// reusable stack to dependent assertions.
for (const step of ['persist-poison', 'flush-poison'] as const) {
  test(`should prevent database mutation when ${step} fails`, async () => {
    const { rig, ownedRun } = await arrangeOwnedReset();
    rig.controls.fault = { step, timing: 'before', kind: 'failure' };

    const outcome = await rig.controller.reset(ownedRun);

    assert.equal(outcome.exitCode, 60);
    assert.equal(outcome.classification, 'cleanup-failure');
    assert.ok(!rig.controls.calls.some((call) => call.step === 'db-recreate'));
    assert.ok(!rig.controls.calls.some((call) => call.step === 'resume-traffic'));
  });
}
