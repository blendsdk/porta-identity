import assert from 'node:assert/strict';
import test from 'node:test';

import type { OwnedRun, PrerequisiteName } from '../../fixtures/lifecycle-planned.js';
import { validLifecycleRequest } from './lifecycle-spec-rig.js';
import { createResetSpecRig, resetExpectations } from './reset-spec-rig.js';

/** Starts an owned stack for one verification-failure oracle. */
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

// Exact migration revision and digest are independent expectations; either mismatch names the
// migration prerequisite and leaves the reset poisoned before assertions can begin.
for (const [name, observation] of [
  [
    'migration revision',
    { migrationRevision: 'wrong-revision', migrationDigest: resetExpectations.migrationDigest },
  ],
  [
    'migration digest',
    { migrationRevision: resetExpectations.migrationRevision, migrationDigest: 'sha256:wrong' },
  ],
] as const) {
  test(`should name setup failure when ${name} does not match`, async () => {
    const { rig, ownedRun } = await arrangeOwnedReset();
    rig.controls.databaseObservation = { ...rig.controls.databaseObservation, ...observation };

    const outcome = await rig.controller.reset(ownedRun);

    assert.equal(outcome.exitCode, 30);
    assert.equal(outcome.prerequisite, 'migration' satisfies PrerequisiteName);
    assert.equal(rig.sharedState.resetStates.get(ownedRun.manifest.runId), 'resetting-poisoned');
    assert.ok(!rig.controls.calls.some((call) => call.step === 'clear-poison'));
  });
}

// Deterministic fixture digest and exact synthetic counts are independent expectations; neither
// may be recalculated from production behavior or accepted approximately.
for (const [name, observation] of [
  ['fixture digest', { fixtureDigest: 'sha256:wrong-fixtures' }],
  ['fixture counts', { fixtureCounts: { ...resetExpectations.fixtureCounts, users: 5 } }],
] as const) {
  test(`should name setup failure when ${name} does not match`, async () => {
    const { rig, ownedRun } = await arrangeOwnedReset();
    rig.controls.databaseObservation = { ...rig.controls.databaseObservation, ...observation };

    const outcome = await rig.controller.reset(ownedRun);

    assert.equal(outcome.exitCode, 30);
    assert.equal(outcome.prerequisite, 'fixture-verification' satisfies PrerequisiteName);
    assert.equal(rig.sharedState.resetStates.get(ownedRun.manifest.runId), 'resetting-poisoned');
    assert.ok(!rig.controls.calls.some((call) => call.step === 'resume-traffic'));
  });
}

// Redis and MailHog reset failures are fatal prerequisites and stop all dependent restart,
// verification, and behavioral assertion work.
for (const [step, prerequisite] of [
  ['redis', 'redis-reset'],
  ['mailhog', 'mailhog-reset'],
] as const) {
  for (const timing of ['before', 'after'] as const) {
    test(`should abort dependent work when ${step} reset fails ${timing} its boundary`, async () => {
      const { rig, ownedRun } = await arrangeOwnedReset();
      rig.controls.fault = { step, timing, kind: 'failure' };

      const outcome = await rig.controller.reset(ownedRun);

      assert.equal(outcome.exitCode, 30);
      assert.equal(outcome.prerequisite, prerequisite satisfies PrerequisiteName);
      assert.ok(!rig.controls.calls.some((call) => call.step === 'restart-clients'));
      assert.ok(!rig.controls.calls.some((call) => call.step === 'public-health'));
      assert.equal(rig.sharedState.resetStates.get(ownedRun.manifest.runId), 'resetting-poisoned');
    });
  }
}

// Migration, seed, and public-health failures name the exact failed prerequisite and remain
// poisoned rather than exposing a partially reset stack to assertions.
for (const [step, prerequisite] of [
  ['migration', 'migration'],
  ['seed', 'seed'],
  ['public-health', 'health'],
] as const) {
  test(`should name ${prerequisite} when ${step} fails`, async () => {
    const { rig, ownedRun } = await arrangeOwnedReset();
    rig.controls.fault = { step, timing: 'after', kind: 'failure' };

    const outcome = await rig.controller.reset(ownedRun);

    assert.equal(outcome.exitCode, 30);
    assert.equal(outcome.prerequisite, prerequisite satisfies PrerequisiteName);
    assert.equal(rig.sharedState.resetStates.get(ownedRun.manifest.runId), 'resetting-poisoned');
    assert.ok(!rig.controls.calls.some((call) => call.step === 'resume-traffic'));
  });
}

// Diagnostic output may include exact synthetic counts and safe identifiers, but never secrets
// from failures, fixtures, authentication material, or runtime state.
test('should exclude representative secret canaries from reset outcomes and reports', async () => {
  const secretCanaries = [
    'Password-Canary-92!',
    'token-canary-raw-value',
    'client-secret-canary',
    'cookie-session-canary',
    'JBSWY3DPEHPK3PXP',
    'recovery-code-canary',
  ];
  for (const secret of secretCanaries) {
    const { rig, ownedRun } = await arrangeOwnedReset();
    rig.controls.fault = {
      step: 'seed',
      timing: 'after',
      kind: 'failure',
      message: `synthetic reset failed near ${secret}`,
    };

    const outcome = await rig.controller.reset(ownedRun);
    const serialized = JSON.stringify(outcome);

    assert.ok(!serialized.includes(secret), secret);
  }
});
