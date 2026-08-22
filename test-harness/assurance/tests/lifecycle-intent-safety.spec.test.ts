import assert from 'node:assert/strict';
import test from 'node:test';

import { validLifecycleRequest } from './lifecycle-spec-rig.js';
import {
  createLifecycleQualitySpecRig,
  createQualityGate,
  createQualityRigSharedState,
} from './lifecycle-quality-spec-rig.js';
import { ResetSpecInterruption } from './reset-spec-rig.js';

// A same-worktree startup intent is claimed atomically before resource creation. While the first
// run is not ready, a second run cannot acquire a different block and create a competing stack.
test('should allow only one pre-readiness startup intent for a worktree', async () => {
  const sharedState = createQualityRigSharedState();
  const firstRig = createLifecycleQualitySpecRig(sharedState);
  const gate = createQualityGate();
  firstRig.controls.composeStartGate = gate;
  const firstStart = firstRig.controller.start(validLifecycleRequest());
  await gate.entered;

  const secondRig = createLifecycleQualitySpecRig(sharedState, {
    pid: process.pid,
    startedAtFingerprint: 'boot:second-controller',
  });
  const secondStart = await secondRig.controller.start(
    validLifecycleRequest({
      runId: '7c930ab2-f0a8-47a0-914f-188ebaa75db8',
      candidateBasePort: 42_000,
      collisionRetries: 0,
    }),
  );
  gate.release();
  const firstResult = await firstStart;

  assert.equal(firstResult.outcome.exitCode, 0);
  assert.notEqual(secondStart.outcome.exitCode, 0);
  assert.equal(secondStart.ownedRun, undefined);
  assert.equal(sharedState.worktreeClaims.size, 1);
  assert.equal(sharedState.records.length, 1);
});

// Invocation identity, not caller-supplied run ID or process identity, separates one retry loop
// from a second concurrent start issued by the same controller.
test('should reject a concurrent same-controller start with the same request', async () => {
  const rig = createLifecycleQualitySpecRig();
  const gate = createQualityGate();
  rig.controls.composeStartGate = gate;
  const firstStart = rig.controller.start(validLifecycleRequest());
  await gate.entered;

  const secondStart = await rig.controller.start(validLifecycleRequest({ collisionRetries: 0 }));
  gate.release();
  const firstResult = await firstStart;

  assert.equal(firstResult.outcome.exitCode, 0);
  assert.notEqual(secondStart.outcome.exitCode, 0);
  assert.equal(secondStart.ownedRun, undefined);
  assert.equal(rig.sharedState.records.length, 1);
});

// A signal after acquisition but before readiness cleans the identity-matched partial stack and
// releases its durable intent rather than stranding a collision forever.
test('should clean partial ownership when signalled before startup readiness', async () => {
  const rig = createLifecycleQualitySpecRig();
  rig.controls.prerequisiteFault = new ResetSpecInterruption('SIGTERM');

  const result = await rig.controller.start(validLifecycleRequest());

  assert.notEqual(result.outcome.exitCode, 0);
  assert.notEqual(result.outcome.classification, 'success');
  assert.equal(result.ownedRun, undefined);
  assert.ok(rig.controls.calls.includes('compose-stop'));
  assert.ok(rig.controls.calls.includes('lease-release'));
  assert.equal(rig.sharedState.records.length, 0);
  assert.equal(rig.sharedState.worktreeClaims.size, 0);
});

// A stranded acquisition intent is recoverable by a fresh process after the interrupted owner
// has cleaned or been proven absent; the old record cannot silently remain beside the new owner.
test('should recover a stranded startup intent before a fresh same-worktree start', async () => {
  const sharedState = createQualityRigSharedState();
  const interruptedRig = createLifecycleQualitySpecRig(sharedState);
  const gate = createQualityGate();
  interruptedRig.controls.composeStartGate = gate;
  const interruptedStart = interruptedRig.controller.start(validLifecycleRequest());
  await gate.entered;
  gate.reject(new ResetSpecInterruption('timeout'));
  const interruptedResult = await interruptedStart;
  assert.notEqual(interruptedResult.outcome.exitCode, 0);

  const replacementRig = createLifecycleQualitySpecRig(sharedState, {
    pid: process.pid,
    startedAtFingerprint: 'boot:replacement-controller',
  });
  const replacement = await replacementRig.controller.start(
    validLifecycleRequest({ runId: '7c930ab2-f0a8-47a0-914f-188ebaa75db8' }),
  );

  assert.equal(replacement.outcome.exitCode, 0);
  assert.ok(replacement.ownedRun);
  assert.equal(sharedState.records.length, 1);
  assert.equal(sharedState.records[0]?.runId, '7c930ab2-f0a8-47a0-914f-188ebaa75db8');
});

// Exhausting every bounded port candidate creates no stack, so the losing starter must release
// its own worktree intent instead of permanently blocking a later valid run.
test('should release startup intent after bounded port collisions acquire no lease', async () => {
  const sharedState = createQualityRigSharedState();
  sharedState.blocks.add('41000:41001:41002:41003:41004:41005');
  const rig = createLifecycleQualitySpecRig(sharedState);

  const result = await rig.controller.start(
    validLifecycleRequest({ candidateBasePort: 41_000, collisionRetries: 0 }),
  );

  assert.notEqual(result.outcome.exitCode, 0);
  assert.equal(result.ownedRun, undefined);
  assert.equal(sharedState.records.length, 0);
  assert.equal(sharedState.worktreeClaims.size, 0);
});

// Quarantine preserves a collision tombstone for malformed or incomplete ownership so a fresh
// process cannot reuse the same endpoints merely because the unsafe record became unreadable.
for (const unsafeLease of ['malformed', 'incomplete'] as const) {
  test(`should retain a collision tombstone after quarantining an ${unsafeLease} lease`, async () => {
    const sharedState = createQualityRigSharedState();
    const originalRig = createLifecycleQualitySpecRig(sharedState);
    const started = await originalRig.controller.start(validLifecycleRequest());
    assert.ok(started.ownedRun);
    originalRig.controls.leaseReadOverride = unsafeLease;

    const recovery = await originalRig.controller.recover({
      runId: started.ownedRun.manifest.runId,
      worktreePath: started.ownedRun.manifest.worktreePath,
    });
    assert.notEqual(recovery.exitCode, 0);
    assert.equal(sharedState.collisionTombstones.size, 1);

    const freshRig = createLifecycleQualitySpecRig(sharedState, {
      pid: process.pid,
      startedAtFingerprint: `boot:fresh-${unsafeLease}`,
    });
    const collision = await freshRig.controller.start(
      validLifecycleRequest({
        runId: '7c930ab2-f0a8-47a0-914f-188ebaa75db8',
        collisionRetries: 0,
      }),
    );

    assert.notEqual(collision.outcome.exitCode, 0);
    assert.equal(collision.ownedRun, undefined);
  });
}
