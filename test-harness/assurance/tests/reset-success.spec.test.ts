import assert from 'node:assert/strict';
import test from 'node:test';

import type { OwnedRun } from '../../fixtures/lifecycle-planned.js';
import { validLifecycleRequest } from './lifecycle-spec-rig.js';
import { createResetSpecRig, resetExpectations } from './reset-spec-rig.js';

const successfulResetOrder = [
  'quiesce',
  'stop-porta',
  'persist-poison',
  'flush-poison',
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
  'verify-traffic-blocked',
  'clear-poison',
  'flush-ready',
  'resume-traffic',
] as const;

/** Starts an owned stack, then clears setup observations before a reset assertion. */
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

// A successful reset follows one exact order and passes the same immutable manifest and persisted
// ownership identity to every mutating, restart, verification, and admission capability.
test('should execute the complete reset in exact order with one owned identity', async () => {
  const { rig, ownedRun } = await arrangeOwnedReset();

  const outcome = await rig.controller.reset(ownedRun);

  assert.equal(outcome.exitCode, 0);
  assert.deepEqual(
    rig.controls.calls.map((call) => call.step),
    successfulResetOrder,
  );
  const record = rig.sharedState.leases[0];
  assert.ok(record);
  for (const call of rig.controls.calls) {
    assert.equal(call.record, record, call.step);
    assert.equal(call.manifest, ownedRun.manifest, call.step);
  }
  assert.deepEqual(rig.controls.migrationRevisions, [resetExpectations.migrationRevision]);
  assert.deepEqual(rig.controls.seedExpectations, [resetExpectations]);
});

// The resetting/poison marker is flushed before database recreation and is not cleared until all
// restarts, digest/count checks, public health, and traffic-block verification have succeeded.
test('should durably poison before mutation and clear only after final verification', async () => {
  const { rig, ownedRun } = await arrangeOwnedReset();

  await rig.controller.reset(ownedRun);

  const steps = rig.controls.calls.map((call) => call.step);
  assert.ok(steps.indexOf('persist-poison') < steps.indexOf('db-recreate'));
  assert.ok(steps.indexOf('flush-poison') < steps.indexOf('db-recreate'));
  assert.ok(steps.indexOf('clear-poison') > steps.indexOf('public-health'));
  assert.ok(steps.indexOf('clear-poison') > steps.indexOf('verify-traffic-blocked'));
  assert.equal(rig.sharedState.resetStates.get(ownedRun.manifest.runId), 'ready');
});

// Porta is stopped before any store changes, both runtimes restart only after stores are reset,
// and traffic remains blocked until every public postcondition and poison transition is complete.
test('should prevent running services and test traffic from observing partial reset state', async () => {
  const { rig, ownedRun } = await arrangeOwnedReset();

  await rig.controller.reset(ownedRun);

  const calls = rig.controls.calls;
  const mutationSteps = ['db-recreate', 'migration', 'bootstrap', 'seed', 'redis', 'mailhog'];
  const stopIndex = calls.findIndex((call) => call.step === 'stop-porta');
  const clientRestartIndex = calls.findIndex((call) => call.step === 'restart-clients');
  const portaRestartIndex = calls.findIndex((call) => call.step === 'restart-porta');
  for (const step of mutationSteps) {
    const index = calls.findIndex((call) => call.step === step);
    assert.ok(stopIndex < index, step);
    assert.ok(index < clientRestartIndex, step);
    assert.ok(index < portaRestartIndex, step);
  }
  for (const call of calls.slice(0, -1)) assert.equal(call.trafficBlocked, true, call.step);
  assert.deepEqual(calls.at(-1), {
    step: 'resume-traffic',
    record: rig.sharedState.leases[0],
    manifest: ownedRun.manifest,
    trafficBlocked: false,
  });
});

// Reset evidence reports exact synthetic effects and the independently supplied revision/digests.
test('should report exact migration, fixture, Redis, and MailHog reset facts', async () => {
  const { rig, ownedRun } = await arrangeOwnedReset();

  const outcome = await rig.controller.reset(ownedRun);

  assert.equal(outcome.report.runId, ownedRun.manifest.runId);
  assert.equal(outcome.report.migrationRevision, resetExpectations.migrationRevision);
  assert.equal(outcome.report.migrationDigest, resetExpectations.migrationDigest);
  assert.equal(outcome.report.fixtureDigest, resetExpectations.fixtureDigest);
  assert.deepEqual(outcome.report.fixtureCounts, resetExpectations.fixtureCounts);
  assert.equal(outcome.report.redisKeysRemoved, rig.controls.redisKeysRemoved);
  assert.equal(outcome.report.mailMessagesRemoved, rig.controls.mailMessagesRemoved);
  assert.ok(outcome.report.identifiers.every((identifier) => identifier.startsWith('database:')));
});
