import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlannedFaultRunner } from './fault-runner-planned.js';
import {
  faultExecution,
  faultObservation,
  firstFaultTuple,
  secondFaultTuple,
} from './fault-spec-fixtures.js';

// Only the designated sentinel's exact assertion signature can kill its claim.
test('should kill a tuple only for its exact designated assertion signature', async () => {
  const runner = await createPlannedFaultRunner();
  const result = await runner.execute(faultExecution());

  assert.equal(result.classification, 'killed');
  assert.deepEqual(result.killedClaims, [firstFaultTuple.claimId]);
  assert.deepEqual(result.blockedClaims, []);
});

// Build, startup, fixture, and unrelated-test failures are invalid evidence, even though a child
// process exited non-zero.
for (const stage of ['build', 'startup', 'fixture'] as const) {
  test(`should never count a ${stage} failure as a killed fault`, async () => {
    const runner = await createPlannedFaultRunner();
    const result = await runner.execute(
      faultExecution({ observation: faultObservation({ stage, assertionSignatures: [] }) }),
    );

    assert.equal(result.classification, stage === 'build' ? 'invalid' : 'infrastructure-failed');
    assert.deepEqual(result.killedClaims, []);
  });
}

test('should never count an unrelated test failure as a killed fault', async () => {
  const runner = await createPlannedFaultRunner();
  const result = await runner.execute(
    faultExecution({ observation: faultObservation({ unrelatedFailure: true }) }),
  );

  assert.equal(result.classification, 'invalid');
  assert.deepEqual(result.killedClaims, []);
});

// A shared fault supplies no shared kill shortcut: each claim tuple must independently emit its
// own sentinel signature.
test('should require an independent exact kill for every tuple of a shared fault', async () => {
  const runner = await createPlannedFaultRunner();
  const first = await runner.execute(faultExecution());
  const secondWithoutOwnSignature = await runner.execute(
    faultExecution({
      claimId: secondFaultTuple.claimId,
      sentinelId: secondFaultTuple.sentinelId,
      observation: faultObservation({ assertionSignatures: [firstFaultTuple.expectedSignature] }),
    }),
  );
  const secondWithOwnSignature = await runner.execute(
    faultExecution({
      claimId: secondFaultTuple.claimId,
      sentinelId: secondFaultTuple.sentinelId,
      observation: faultObservation({ assertionSignatures: [secondFaultTuple.expectedSignature] }),
    }),
  );

  assert.deepEqual(first.killedClaims, [firstFaultTuple.claimId]);
  assert.equal(secondWithoutOwnSignature.classification, 'invalid');
  assert.deepEqual(secondWithoutOwnSignature.killedClaims, []);
  assert.equal(secondWithOwnSignature.classification, 'killed');
  assert.deepEqual(secondWithOwnSignature.killedClaims, [secondFaultTuple.claimId]);
});

// A passing designated sentinel is a survivor that blocks only its own mapped claim.
test('should classify a passing sentinel as survived and block only the mapped claim', async () => {
  const runner = await createPlannedFaultRunner();
  const result = await runner.execute(
    faultExecution({
      observation: faultObservation({ exitCode: 0, assertionSignatures: [] }),
    }),
  );

  assert.equal(result.classification, 'survived');
  assert.deepEqual(result.blockedClaims, [firstFaultTuple.claimId]);
  assert.deepEqual(result.killedClaims, []);
});

// Deadline expiry is a timeout, never a kill or a survivor.
test('should classify deadline expiry separately without closing a claim', async () => {
  const runner = await createPlannedFaultRunner();
  const result = await runner.execute(
    faultExecution({ observation: faultObservation({ timedOut: true }) }),
  );

  assert.equal(result.classification, 'timeout');
  assert.deepEqual(result.killedClaims, []);
});
