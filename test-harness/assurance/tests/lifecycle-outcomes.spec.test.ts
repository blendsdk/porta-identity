import assert from 'node:assert/strict';
import test from 'node:test';

import type { PrerequisiteName } from '../../fixtures/lifecycle-planned.js';
import { createLifecycleSpecRig, validLifecycleRequest } from './lifecycle-spec-rig.js';

const startupPrerequisites: readonly PrerequisiteName[] = [
  'dns',
  'health',
  'migration',
  'seed',
  'fixture-verification',
];

// Every required prerequisite is fatal and names itself before dependent checks may execute.
for (const failedPrerequisite of startupPrerequisites) {
  test(`should classify ${failedPrerequisite} failure as setup failure before later checks`, async () => {
    const rig = createLifecycleSpecRig();
    rig.controls.failedPrerequisite = failedPrerequisite;

    const result = await rig.controller.start(validLifecycleRequest());

    assert.equal(result.outcome.exitCode, 30);
    assert.equal(result.outcome.primaryExitCode, 30);
    assert.equal(result.outcome.classification, 'setup-failure');
    assert.equal(result.outcome.prerequisite, failedPrerequisite);
    const failureIndex = startupPrerequisites.indexOf(failedPrerequisite);
    assert.deepEqual(
      rig.controls.prerequisiteCalls,
      startupPrerequisites.slice(0, failureIndex + 1),
    );
  });
}

// Redis reset failure aborts a scenario before behavioral assertions or later reset work begins.
test('should abort reset immediately when Redis reset fails', async () => {
  const rig = createLifecycleSpecRig();
  const started = await rig.controller.start(validLifecycleRequest());
  assert.ok(started.ownedRun);
  rig.controls.prerequisiteCalls.length = 0;
  rig.controls.failedPrerequisite = 'redis-reset';

  const outcome = await rig.controller.reset(started.ownedRun);

  assert.equal(outcome.exitCode, 30);
  assert.equal(outcome.prerequisite, 'redis-reset');
  assert.deepEqual(rig.controls.prerequisiteCalls, ['redis-reset']);
});

// MailHog non-success aborts a scenario before behavioral assertions begin.
test('should abort reset immediately when MailHog reset is not successful', async () => {
  const rig = createLifecycleSpecRig();
  const started = await rig.controller.start(validLifecycleRequest());
  assert.ok(started.ownedRun);
  rig.controls.prerequisiteCalls.length = 0;
  rig.controls.failedPrerequisite = 'mailhog-reset';

  const outcome = await rig.controller.reset(started.ownedRun);

  assert.equal(outcome.exitCode, 30);
  assert.equal(outcome.prerequisite, 'mailhog-reset');
  assert.deepEqual(rig.controls.prerequisiteCalls, ['redis-reset', 'mailhog-reset']);
});

// Cleanup failure overrides the process exit status but evidence retains the primary outcome.
test('should give cleanup failure precedence while preserving the primary outcome', async () => {
  const rig = createLifecycleSpecRig();
  const started = await rig.controller.start(validLifecycleRequest());
  assert.ok(started.ownedRun);
  rig.controls.cleanupFailure = new Error('identity-matched cleanup failed');

  const outcome = await rig.controller.stop(started.ownedRun);

  assert.equal(outcome.exitCode, 60);
  assert.equal(outcome.classification, 'cleanup-failure');
  assert.equal(outcome.primaryExitCode, 0);
  assert.ok(outcome.recoveryIdentifiers.length > 0);
});
