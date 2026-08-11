import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test, { type TestContext } from 'node:test';

import type { LeaseRecord, ProcessIdentity } from '../../fixtures/lifecycle-planned.js';
import {
  FileLeaseStateAdapter,
  FileResetStateAdapter,
  LinuxProcessProbeAdapter,
} from '../../fixtures/lifecycle-system.js';
import { createEndpointManifest } from '../../fixtures/lifecycle-validation.js';
import { validLifecycleRequest } from './lifecycle-spec-rig.js';
import { createResetRigSharedState, createResetSpecRig } from './reset-spec-rig.js';

/** Creates one complete record whose paths are confined to a disposable worktree. */
async function createRecord(worktreePath: string): Promise<LeaseRecord> {
  const manifest = createEndpointManifest(
    validLifecycleRequest({ worktreePath, candidateBasePort: 51_000 }),
    0,
  );
  return Object.freeze({
    runId: manifest.runId,
    ownerProcess: Object.freeze({ pid: 2_147_000_000, startedAtFingerprint: 'dead-owner' }),
    worktreePath,
    composeProject: manifest.composeProject,
    containerIds: Object.freeze(['container-a']),
    volumeNames: Object.freeze(['volume-a']),
    ownedPaths: Object.freeze([
      resolve(worktreePath, 'test-harness/.assurance-runtime', manifest.runId),
    ]),
    certificatePath: manifest.certificatePath,
    manifest,
  });
}

/** Creates a disposable directory and guarantees recursive cleanup after the test. */
function disposableDirectory(context: TestContext, prefix: string): string {
  const directory = mkdtempSync(resolve(tmpdir(), prefix));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

// The filesystem claim and exact-record replacement form one CAS. Concurrent fresh recovery
// processes cannot both become the owner even when they begin with the same stale record.
test('should atomically transfer a stale filesystem lease to exactly one contender', async (t) => {
  const worktree = disposableDirectory(t, 'porta-recovery-worktree-');
  const leaseRoot = disposableDirectory(t, 'porta-recovery-leases-');
  const leases = new FileLeaseStateAdapter(leaseRoot);
  const staleRecord = await createRecord(worktree);
  assert.equal(await leases.tryAcquire(staleRecord), 'acquired');
  const newOwner = await new LinuxProcessProbeAdapter().currentIdentity();

  const results = await Promise.all([
    leases.transferOwner(staleRecord, newOwner),
    leases.transferOwner(staleRecord, newOwner),
  ]);

  assert.equal(results.filter((result) => result === 'mismatch').length, 1);
  const winner = results.find((result): result is LeaseRecord => result !== 'mismatch');
  assert.ok(winner);
  assert.deepEqual(winner.ownerProcess, newOwner);
  assert.equal(winner.runId, staleRecord.runId);
  assert.equal(winner.composeProject, staleRecord.composeProject);
  assert.deepEqual(winner.containerIds, staleRecord.containerIds);
  assert.deepEqual(winner.volumeNames, staleRecord.volumeNames);
  assert.deepEqual(winner.ownedPaths, staleRecord.ownedPaths);
  assert.equal(winner.certificatePath, staleRecord.certificatePath);
  assert.deepEqual(winner.manifest, staleRecord.manifest);
  await assert.rejects(leases.release(staleRecord), /lease identity changed/u);
  await leases.release(winner);
});

// A mismatched expected record or malformed takeover claim is never treated as permission to
// replace durable ownership. A complete claim from a proven-dead process is safely reclaimable.
test('should preserve the lease across mismatched and malformed takeover state', async (t) => {
  const worktree = disposableDirectory(t, 'porta-cas-worktree-');
  const leaseRoot = disposableDirectory(t, 'porta-cas-leases-');
  const leases = new FileLeaseStateAdapter(leaseRoot);
  const staleRecord = await createRecord(worktree);
  assert.equal(await leases.tryAcquire(staleRecord), 'acquired');
  const newOwner = await new LinuxProcessProbeAdapter().currentIdentity();
  const mismatched = Object.freeze({
    ...staleRecord,
    containerIds: Object.freeze(['different-container']),
  });
  assert.equal(await leases.transferOwner(mismatched, newOwner), 'mismatch');
  assert.deepEqual(
    await leases.read({ runId: staleRecord.runId, worktreePath: staleRecord.worktreePath }),
    staleRecord,
  );

  const claimPath = resolve(
    leaseRoot,
    `block-${staleRecord.manifest.ports.porta}`,
    `owner-${staleRecord.runId}`,
    'takeover.claim',
  );
  writeFileSync(claimPath, '{malformed', { mode: 0o600 });
  assert.equal(await leases.transferOwner(staleRecord, newOwner), 'mismatch');
  unlinkSync(claimPath);
  writeFileSync(
    claimPath,
    JSON.stringify({ pid: 2_147_000_001, startedAtFingerprint: 'dead-claimant' }),
    { mode: 0o600 },
  );

  const reclaimed = await leases.transferOwner(staleRecord, newOwner);
  assert.notEqual(reclaimed, 'mismatch');
  if (reclaimed !== 'mismatch') await leases.release(reclaimed);
});

// A staged poison transition is not durable evidence. Only flush atomically publishes it, and a
// fresh adapter must then observe the exact committed state.
test('should expose reset poison only after an atomic durable flush', async (t) => {
  const worktree = disposableDirectory(t, 'porta-reset-state-');
  const record = await createRecord(worktree);
  const first = new FileResetStateAdapter();
  await first.persist(record, 'ready');
  await first.flush(record);
  assert.equal(await first.read(record), 'ready');

  await first.persist(record, 'resetting-poisoned');
  assert.equal(await first.read(record), 'ready');
  await first.flush(record);

  assert.equal(await new FileResetStateAdapter().read(record), 'resetting-poisoned');
});

// Successful fresh-process recovery returns the newly transferred opaque capability, and that
// capability—not the dead process's state—can perform exact cleanup of the rebuilt stack.
test('should return a stoppable capability after fresh-controller poison recovery', async () => {
  const sharedState = createResetRigSharedState();
  const original = createResetSpecRig(sharedState);
  const started = await original.controller.start(validLifecycleRequest());
  assert.ok(started.ownedRun);
  original.controls.fault = { step: 'seed', timing: 'after', kind: 'failure' };
  await original.controller.reset(started.ownedRun);

  const replacement = createResetSpecRig(sharedState);
  const recovered = await replacement.controller.recover({
    runId: started.ownedRun.manifest.runId,
    worktreePath: started.ownedRun.manifest.worktreePath,
  });

  assert.equal(recovered.exitCode, 0);
  assert.ok(recovered.ownedRun);
  assert.ok(recovered.report);
  assert.equal(recovered.report.runId, started.ownedRun.manifest.runId);
  assert.ok(Object.isFrozen(recovered.report));
  assert.ok(Object.isFrozen(recovered.report.fixtureCounts));
  assert.ok(Object.isFrozen(recovered.report.identifiers));
  assert.equal((await replacement.controller.stop(recovered.ownedRun)).exitCode, 0);
});

// After ownership transfer, a failed rebuild remains poisoned but still returns the exact opaque
// capability needed for bounded cleanup and a later safe recovery attempt.
test('should retain a capability and safe identifiers when post-takeover recovery fails', async () => {
  const sharedState = createResetRigSharedState();
  const original = createResetSpecRig(sharedState);
  const started = await original.controller.start(validLifecycleRequest());
  assert.ok(started.ownedRun);
  original.controls.fault = { step: 'redis', timing: 'after', kind: 'timeout' };
  await original.controller.reset(started.ownedRun);

  const replacement = createResetSpecRig(sharedState);
  replacement.controls.fault = { step: 'public-health', timing: 'before', kind: 'failure' };
  const recovered = await replacement.controller.recover({
    runId: started.ownedRun.manifest.runId,
    worktreePath: started.ownedRun.manifest.worktreePath,
  });

  assert.notEqual(recovered.exitCode, 0);
  assert.ok(recovered.ownedRun);
  assert.ok(recovered.recoveryIdentifiers.every((identifier) => !identifier.includes('\n')));
  assert.ok(recovered.recoveryIdentifiers.length <= 16);
  assert.equal(recovered.report?.runId, started.ownedRun.manifest.runId);
  assert.equal(sharedState.resetStates.get(started.ownedRun.manifest.runId), 'resetting-poisoned');
  assert.equal((await replacement.controller.stop(recovered.ownedRun)).exitCode, 0);
});

// PID reuse must not confer ownership: the same PID with a different start fingerprint is absent.
test('should distinguish the live process from a reused PID fingerprint', async () => {
  const processes = new LinuxProcessProbeAdapter();
  const current = await processes.currentIdentity();
  const reused: ProcessIdentity = { ...current, startedAtFingerprint: 'different-start' };

  assert.equal(await processes.presence(current), 'present');
  assert.equal(await processes.presence(reused), 'absent');
});
