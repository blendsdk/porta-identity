import assert from 'node:assert/strict';
import test from 'node:test';

import type { LeaseRecord } from '../../fixtures/lifecycle-planned.js';
import { createLifecycleSpecRig, validLifecycleRequest } from './lifecycle-spec-rig.js';
import { createLifecycleQualitySpecRig } from './lifecycle-quality-spec-rig.js';

/** Lease identity after successful discovery of immutable Docker resources. */
interface DiscoveredLeaseRecord extends LeaseRecord {
  readonly networkIds: readonly string[];
}

/** Narrows a lease only when container and network identities are immutable Docker identifiers. */
function hasExactDockerIdentity(record: LeaseRecord): record is DiscoveredLeaseRecord {
  if (!record.containerIds.every((identifier) => /^[a-f0-9]{64}$/.test(identifier))) return false;
  if (!('networkIds' in record) || !Array.isArray(record.networkIds)) return false;
  return record.networkIds.every(
    (identifier) => typeof identifier === 'string' && /^[a-f0-9]{64}$/.test(identifier),
  );
}

// A controller without the full reset capability bundle may support narrow preparation, but a
// caller requesting full reset must receive an explicit non-success outcome.
test('should not report full reset success when reset capabilities are unavailable', async () => {
  const rig = createLifecycleSpecRig();
  const started = await rig.controller.start(validLifecycleRequest());
  assert.ok(started.ownedRun);

  const outcome = await rig.controller.reset(started.ownedRun);

  assert.notEqual(outcome.exitCode, 0);
  assert.notEqual(outcome.classification, 'success');
});

// Startup ownership is not ready until Compose discovery returns the actual resource identity;
// absence after start is an infrastructure failure rather than a clean owned run.
test('should reject startup when actual Compose resource discovery is missing', async () => {
  const rig = createLifecycleQualitySpecRig();
  rig.controls.discovery = 'missing';

  const result = await rig.controller.start(validLifecycleRequest());

  assert.notEqual(result.outcome.exitCode, 0);
  assert.equal(result.ownedRun, undefined);
  assert.ok(rig.controls.calls.includes('compose-inspect'));
  assert.ok(rig.controls.calls.includes('compose-stop'));
  assert.ok(rig.controls.calls.includes('lease-release'));
});

// The persisted owner records exact immutable Docker container and network IDs discovered after
// creation; generated names and predicted IDs cannot authorize later deletion.
test('should persist exact discovered Docker container and network identities', async () => {
  const rig = createLifecycleQualitySpecRig();
  rig.controls.discovery = 'available';

  const result = await rig.controller.start(validLifecycleRequest());

  assert.equal(result.outcome.exitCode, 0);
  const record = rig.sharedState.records[0];
  assert.ok(record);
  assert.ok(hasExactDockerIdentity(record));
  assert.deepEqual(record.containerIds, rig.controls.actualContainerIds);
  assert.deepEqual(record.networkIds, rig.controls.actualNetworkIds);
});

// Host-process ownership persists both PID and a durable process-start fingerprint so PID reuse
// cannot turn a new process into the owner of an older stack.
test('should persist and fence the exact durable host-process identity', async () => {
  const processIdentity = { pid: 42_001, startedAtFingerprint: 'boot:173128:proc:42001' };
  const rig = createLifecycleQualitySpecRig(undefined, processIdentity);
  const started = await rig.controller.start(validLifecycleRequest());
  assert.ok(started.ownedRun);
  assert.deepEqual(rig.sharedState.records[0]?.ownerProcess, processIdentity);
  const record = rig.sharedState.records[0];
  assert.ok(record);
  rig.controls.leaseReadOverride = {
    ...record,
    ownerProcess: { pid: processIdentity.pid, startedAtFingerprint: 'boot:different:proc:42001' },
  };

  const outcome = await rig.controller.stop(started.ownedRun);

  assert.equal(outcome.exitCode, 60);
  assert.ok(!rig.controls.calls.includes('compose-stop'));
});

// Missing durable ownership is not evidence of a clean stale state and cannot return success.
test('should reject stale recovery when persisted lease discovery is missing', async () => {
  const rig = createLifecycleSpecRig();
  rig.controls.leaseReadOverride = 'missing';

  const outcome = await rig.controller.recover({
    runId: '8f41b7d1-89b5-4ea9-a248-d1807f370888',
    worktreePath: '/worktrees/porta-a',
  });

  assert.notEqual(outcome.exitCode, 0);
  assert.notEqual(outcome.classification, 'success');
  assert.equal(outcome.ownedRun, undefined);
});
