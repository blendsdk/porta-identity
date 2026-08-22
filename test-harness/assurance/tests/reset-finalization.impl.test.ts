import assert from 'node:assert/strict';
import test from 'node:test';

import type { OwnedRun } from '../../fixtures/lifecycle-planned.js';
import { validLifecycleRequest } from './lifecycle-spec-rig.js';
import {
  createResetSpecRig,
  type ResetInterruptionKind,
  type ResetStep,
} from './reset-spec-rig.js';

/** Reset boundaries that can partially reopen a previously poisoned stack. */
const finalizationSteps = [
  'clear-poison',
  'flush-ready',
  'resume-traffic',
] as const satisfies readonly ResetStep[];
/** Non-success classes whose stable exit must survive successful re-poisoning. */
const interruptionKinds = [
  'failure',
  'SIGINT',
  'SIGTERM',
  'cancellation',
  'timeout',
] as const satisfies readonly ResetInterruptionKind[];

/** Starts one owned stack and clears setup calls before finalization fault injection. */
async function arrangeReset(): Promise<{
  readonly rig: ReturnType<typeof createResetSpecRig>;
  readonly ownedRun: OwnedRun;
}> {
  const rig = createResetSpecRig();
  const started = await rig.controller.start(validLifecycleRequest());
  assert.ok(started.ownedRun);
  rig.controls.calls.length = 0;
  return { rig, ownedRun: started.ownedRun };
}

/** Maps an injected interruption to its stable lifecycle exit. */
function expectedExit(kind: ResetInterruptionKind): 30 | 70 | 130 | 143 {
  if (kind === 'SIGINT') return 130;
  if (kind === 'SIGTERM') return 143;
  if (kind === 'cancellation' || kind === 'timeout') return 70;
  return 30;
}

// Finalization is still part of the reset transaction. Failure before or after clearing poison or
// reopening traffic must re-block admission and durably restore poison before returning.
for (const step of finalizationSteps) {
  for (const timing of ['before', 'after'] as const) {
    for (const kind of interruptionKinds) {
      test(`should restore poison after ${kind} ${timing} reset finalization step ${step}`, async () => {
        const { rig, ownedRun } = await arrangeReset();
        rig.controls.fault = { step, timing, kind };

        const result = await rig.controller.reset(ownedRun);

        assert.equal(result.exitCode, expectedExit(kind));
        assert.equal(
          rig.sharedState.resetStates.get(ownedRun.manifest.runId),
          'resetting-poisoned',
        );
        assert.equal(rig.controls.trafficBlocked, true);
        const calls = rig.controls.calls.map((call) => call.step);
        assert.ok(calls.lastIndexOf('persist-poison') > calls.indexOf(step));
        assert.ok(calls.lastIndexOf('flush-poison') > calls.indexOf(step));
      });
    }
  }
}
