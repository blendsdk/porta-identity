import assert from 'node:assert/strict';
import test from 'node:test';

import type { LeaseRecord } from '../../fixtures/lifecycle-planned.js';
import {
  createLifecycleRigSharedState,
  createLifecycleSpecRig,
  validLifecycleRequest,
} from './lifecycle-spec-rig.js';

/** Starts one valid run and returns its opaque ownership capability. */
async function startOwnedRun(rig: ReturnType<typeof createLifecycleSpecRig>) {
  const result = await rig.controller.start(validLifecycleRequest());
  assert.ok(result.ownedRun);
  return result.ownedRun;
}

/** Creates the only caller-provided identity accepted by stale recovery. */
function recoveryLookup() {
  return {
    runId: '8f41b7d1-89b5-4ea9-a248-d1807f370888',
    worktreePath: '/worktrees/porta-a',
  };
}

// Cleanup is fenced by every persisted identity dimension. A mismatch must block deletion and
// report only exact safe recovery identifiers rather than guessing which resources are owned.
for (const field of [
  'runId',
  'ownerProcess',
  'worktreePath',
  'composeProject',
  'containerIds',
  'volumeNames',
  'ownedPaths',
  'certificatePath',
] as const) {
  test(`should block deletion when ${field} ownership does not match`, async () => {
    const rig = createLifecycleSpecRig();
    const ownedRun = await startOwnedRun(rig);
    const original = rig.acquiredRecords[0];
    assert.ok(original);
    const mismatches: Record<typeof field, LeaseRecord[typeof field]> = {
      runId: 'run-different',
      ownerProcess: { pid: original.ownerProcess.pid, startedAtFingerprint: 'different-start' },
      worktreePath: '/worktrees/porta-other',
      composeProject: 'porta-other-project',
      containerIds: ['container-other'],
      volumeNames: ['volume-other'],
      ownedPaths: ['/worktrees/porta-other/generated'],
      certificatePath: '/worktrees/porta-other/certificate.pem',
    };
    rig.controls.leaseReadOverride = { ...original, [field]: mismatches[field] };

    const outcome = await rig.controller.stop(ownedRun);

    assert.equal(outcome.exitCode, 60);
    assert.equal(outcome.classification, 'cleanup-failure');
    assert.deepEqual(rig.controls.deletedRecords, []);
    assert.ok(outcome.recoveryIdentifiers.length > 0);
    assert.ok(outcome.recoveryIdentifiers.every((identifier) => !identifier.includes('\n')));
  });
}

// An owner that is still alive independently prevents stale reclaim, even when Compose is absent.
test('should reject stale recovery while the recorded owner process is alive', async () => {
  const sharedState = createLifecycleRigSharedState();
  await startOwnedRun(createLifecycleSpecRig(sharedState));
  const recoveryRig = createLifecycleSpecRig(sharedState);
  recoveryRig.controls.processPresence = 'present';
  recoveryRig.controls.composeInspection = { presence: 'absent' };

  const outcome = await recoveryRig.controller.recover(recoveryLookup());

  assert.equal(outcome.exitCode, 60);
  assert.deepEqual(recoveryRig.controls.deletedRecords, []);
});

// A present Compose project independently prevents stale reclaim, even when the owner is absent.
test('should reject stale recovery while the Compose project is present', async () => {
  const sharedState = createLifecycleRigSharedState();
  await startOwnedRun(createLifecycleSpecRig(sharedState));
  const recoveryRig = createLifecycleSpecRig(sharedState);
  recoveryRig.controls.processPresence = 'absent';
  recoveryRig.controls.composeInspection = {
    presence: 'present',
    identity: recoveryRig.acquiredRecords[0],
  };

  const outcome = await recoveryRig.controller.recover(recoveryLookup());

  assert.equal(outcome.exitCode, 60);
  assert.deepEqual(recoveryRig.controls.deletedRecords, []);
});

// Probe errors are not proof of absence and therefore cannot authorize destructive recovery.
for (const unreadableBoundary of ['process', 'compose'] as const) {
  test(`should reject stale recovery when ${unreadableBoundary} ownership is unreadable`, async () => {
    const sharedState = createLifecycleRigSharedState();
    await startOwnedRun(createLifecycleSpecRig(sharedState));
    const recoveryRig = createLifecycleSpecRig(sharedState);
    recoveryRig.controls.processPresence =
      unreadableBoundary === 'process' ? 'unreadable' : 'absent';
    recoveryRig.controls.composeInspection = {
      presence: unreadableBoundary === 'compose' ? 'unreadable' : 'absent',
    };

    const outcome = await recoveryRig.controller.recover(recoveryLookup());

    assert.equal(outcome.exitCode, 60);
    assert.deepEqual(recoveryRig.controls.deletedRecords, []);
  });
}

// Recovery is permitted only after both the recorded owner and Compose project are proven absent.
test('should reclaim an identity-matched stale lease when owner and Compose are absent', async () => {
  const sharedState = createLifecycleRigSharedState();
  const originalRig = createLifecycleSpecRig(sharedState);
  await startOwnedRun(originalRig);
  const recoveryRig = createLifecycleSpecRig(sharedState);
  recoveryRig.controls.processPresence = 'absent';
  recoveryRig.controls.composeInspection = { presence: 'absent' };

  const outcome = await recoveryRig.controller.recover(recoveryLookup());

  assert.equal(outcome.exitCode, 0);
  assert.deepEqual(recoveryRig.controls.deletedRecords, [originalRig.acquiredRecords[0]]);
  assert.deepEqual(recoveryRig.controls.releasedRecords, [originalRig.acquiredRecords[0]]);
});

// Stopping one run cannot delete a concurrently owned run from another worktree.
test('should stop one owned run without deleting another worktree run', async () => {
  const rig = createLifecycleSpecRig();
  const first = await rig.controller.start(validLifecycleRequest());
  const second = await rig.controller.start(
    validLifecycleRequest({
      runId: '7c930ab2-f0a8-47a0-914f-188ebaa75db8',
      worktreePath: '/worktrees/porta-b',
      environmentName: 'assurance-b',
    }),
  );
  assert.ok(first.ownedRun);
  assert.ok(second.ownedRun);

  const outcome = await rig.controller.stop(first.ownedRun);

  assert.equal(outcome.exitCode, 0);
  assert.deepEqual(rig.controls.deletedRecords, [rig.acquiredRecords[0]]);
  assert.notEqual(rig.controls.deletedRecords[0], rig.acquiredRecords[1]);
});

// Malformed or incomplete ownership is quarantined for inspection and never treated as stale.
for (const unsafeRecord of ['malformed', 'incomplete'] as const) {
  test(`should quarantine an ${unsafeRecord} lease without deleting resources`, async () => {
    const sharedState = createLifecycleRigSharedState();
    await startOwnedRun(createLifecycleSpecRig(sharedState));
    const recoveryRig = createLifecycleSpecRig(sharedState);
    recoveryRig.controls.leaseReadOverride = unsafeRecord;

    const lookup = recoveryLookup();
    const outcome = await recoveryRig.controller.recover(lookup);

    assert.equal(outcome.exitCode, 60);
    assert.deepEqual(recoveryRig.controls.deletedRecords, []);
    assert.deepEqual(recoveryRig.controls.quarantinedLookups, [lookup]);
    assert.deepEqual(outcome.recoveryIdentifiers, [`lease:${lookup.runId}`]);
  });
}

// Recovery validates the narrow lookup before reading durable state or considering deletion.
for (const [name, lookup] of [
  ['malformed UUID', { runId: 'not-a-uuid', worktreePath: '/worktrees/porta-a' }],
  [
    'non-canonical worktree',
    {
      runId: '8f41b7d1-89b5-4ea9-a248-d1807f370888',
      worktreePath: '/worktrees/porta-a/../porta-b',
    },
  ],
] as const) {
  test(`should reject ${name} in a recovery lookup without deleting resources`, async () => {
    const rig = createLifecycleSpecRig();

    const outcome = await rig.controller.recover(lookup);

    assert.equal(outcome.exitCode, 60);
    assert.deepEqual(rig.controls.deletedRecords, []);
    assert.deepEqual(rig.controls.quarantinedLookups, []);
  });
}

// Callers cannot nominate resource identifiers for recovery; persisted ownership is authoritative.
test('should reject caller-supplied resource identities in a recovery lookup', async () => {
  const rig = createLifecycleSpecRig();
  const lookupWithResourceIdentity = {
    ...recoveryLookup(),
    containerIds: ['attacker-selected-container'],
  };

  const outcome = await rig.controller.recover(lookupWithResourceIdentity);

  assert.equal(outcome.exitCode, 60);
  assert.deepEqual(rig.controls.deletedRecords, []);
});
