import assert from 'node:assert/strict';
import test from 'node:test';

import { createLifecycleSpecRig, validLifecycleRequest } from './lifecycle-spec-rig.js';

// A contender owns either an entire endpoint block or nothing; bounded retry may choose another
// complete block, but no endpoint from a rejected candidate may leak into the owned manifest.
test('should atomically lease distinct complete blocks when contenders race', async () => {
  const rig = createLifecycleSpecRig();
  const request = validLifecycleRequest();

  const [first, second] = await Promise.all([
    rig.controller.start(request),
    rig.controller.start({ ...request, runId: '7c930ab2-f0a8-47a0-914f-188ebaa75db8' }),
  ]);

  assert.equal(first.outcome.exitCode, 0);
  assert.equal(second.outcome.exitCode, 0);
  assert.ok(first.ownedRun);
  assert.ok(second.ownedRun);
  assert.notDeepEqual(first.ownedRun.manifest.ports, second.ownedRun.manifest.ports);
  assert.equal(rig.acquiredRecords.length, 2);
  assert.equal(rig.controls.consumerManifests.get('compose')?.length, 2);
  for (const record of rig.acquiredRecords) {
    assert.ok(record.ownerProcess.pid > 0);
    assert.ok(record.ownerProcess.startedAtFingerprint.length > 0);
    assert.ok(record.composeProject.length > 0);
    assert.ok(record.containerIds.length > 0);
    assert.ok(record.volumeNames.length > 0);
    assert.ok(record.ownedPaths.length > 0);
    assert.ok(record.certificatePath.length > 0);
  }
});

// Occupation of any endpoint invalidates the whole candidate block before a lease or resource is
// created, and the next bounded attempt must derive a complete new block.
test('should reject a complete candidate when any endpoint is occupied', async () => {
  const rig = createLifecycleSpecRig();
  rig.controls.oneShotOccupiedEndpoints.add('mailhog');

  const result = await rig.controller.start(validLifecycleRequest());

  assert.equal(result.outcome.exitCode, 0);
  assert.ok(result.ownedRun);
  assert.notEqual(result.ownedRun.manifest.ports.porta, 41_000);
  assert.equal(rig.acquiredRecords.length, 1);
  assert.notEqual(rig.acquiredRecords[0]?.manifest.ports.porta, 41_000);
});

// The endpoint manifest is the single immutable source passed unchanged to every configuration,
// execution, health, and evidence consumer.
test('should propagate one immutable manifest identity to every consumer', async () => {
  const rig = createLifecycleSpecRig();
  const result = await rig.controller.start(validLifecycleRequest());

  assert.ok(result.ownedRun);
  const manifest = result.ownedRun.manifest;
  assert.ok(Object.isFrozen(manifest));
  assert.ok(Object.isFrozen(manifest.ports));
  assert.ok(Object.isFrozen(manifest.urls));
  const expectedConsumers = [
    'compose',
    'compose-config',
    'nginx',
    'seed',
    'spa',
    'bff',
    'playwright',
    'health',
    'evidence',
  ];
  for (const consumer of expectedConsumers) {
    assert.deepEqual(rig.controls.consumerManifests.get(consumer), [manifest], consumer);
    assert.equal(rig.controls.consumerManifests.get(consumer)?.[0], manifest, consumer);
  }
});

// Identifiers, paths, ports, and environment names cross process, filesystem, and Compose
// boundaries, so separators, traversal, controls, overflow, and shell syntax are rejected.
for (const [name, override] of [
  ['run separator', { runId: 'run/escape' }],
  ['malformed run UUID', { runId: 'run-8f41b7d1' }],
  ['run control', { runId: 'run\nnext' }],
  ['scenario separator', { scenarioId: 'login/escape' }],
  ['worktree traversal', { worktreePath: '/worktrees/../secret' }],
  ['worktree shell content', { worktreePath: '/worktrees/$(touch owned)' }],
  ['environment separator', { environmentName: 'assurance;echo' }],
  ['environment control', { environmentName: 'assurance\u0000x' }],
  ['port overflow', { candidateBasePort: 65_535 }],
  ['negative retries', { collisionRetries: -1 }],
] as const) {
  test(`should reject ${name} before acquiring a lease`, async () => {
    const rig = createLifecycleSpecRig();

    const result = await rig.controller.start(validLifecycleRequest(override));

    assert.equal(result.outcome.exitCode, 30);
    assert.equal(result.outcome.classification, 'setup-failure');
    assert.equal(result.ownedRun, undefined);
    assert.deepEqual(rig.acquiredRecords, []);
    assert.deepEqual(rig.controls.deletedRecords, []);
  });
}
