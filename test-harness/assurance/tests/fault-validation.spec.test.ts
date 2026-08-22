import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlannedFaultRunner } from './fault-runner-planned.js';
import {
  faultExecution,
  faultFixtureRevision,
  sharedFaultDefinition,
} from './fault-spec-fixtures.js';

// A revision mismatch invalidates the run before patching and cannot produce sensitivity evidence.
test('should invalidate a fault whose exact source revision does not match', async () => {
  const runner = await createPlannedFaultRunner();
  const result = await runner.execute(
    faultExecution({ observedRevision: `${faultFixtureRevision.slice(0, -1)}c` }),
  );

  assert.equal(result.classification, 'invalid');
  assert.deepEqual(result.killedClaims, []);
  assert.equal(result.primaryTreeUnchanged, true);
});

// A target digest mismatch means the reviewed patch no longer describes the selected bytes.
test('should invalidate a fault whose target digest does not match', async () => {
  const runner = await createPlannedFaultRunner();
  const result = await runner.execute(
    faultExecution({ observedTargetHash: `sha256:${'c'.repeat(64)}` }),
  );

  assert.equal(result.classification, 'invalid');
  assert.deepEqual(result.killedClaims, []);
  assert.equal(result.primaryTreeUnchanged, true);
});

// Claim and sentinel selectors must identify one declared tuple exactly; partial tuple matches are
// invalid and cannot borrow a kill recorded for another claim.
test('should invalidate a claim and sentinel combination absent from the fault tuple set', async () => {
  const runner = await createPlannedFaultRunner();
  const result = await runner.execute(
    faultExecution({ claimId: 'CLAIM-R6-01', sentinelId: 'ST-66' }),
  );

  assert.equal(sharedFaultDefinition.tuples.length, 2);
  assert.equal(result.classification, 'invalid');
  assert.deepEqual(result.killedClaims, []);
});
