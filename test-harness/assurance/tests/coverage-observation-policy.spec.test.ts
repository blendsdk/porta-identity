import assert from 'node:assert/strict';
import test from 'node:test';

import { createCoverageAttributionContract } from './coverage-attribution-planned.js';
import { coverageSeed } from './coverage-spec-fixtures.js';

// During observation, threshold misses are visible with exact metric and file attribution but do
// not fail ordinary verification or silently become a release gate.
test('should report threshold misses without failing ordinary verification', async () => {
  const contract = createCoverageAttributionContract();
  const artifact = await contract.runClean(coverageSeed);

  const observation = await contract.observeThresholds(artifact);

  assert.equal(observation.reported, true);
  assert.equal(observation.ordinaryVerificationExitCode, 0);
  assert.ok(observation.deficits.length > 0);
  assert.ok(observation.deficits.every((deficit) => deficit.file.length > 0));
  assert.ok(observation.deficits.every((deficit) => deficit.actual < deficit.expected));
});

// The later governed no-regression command must fail a covered-count reduction and name the exact
// metric and file. This is a contract only; Phase 4 does not enable the policy.
test('should specify failure attribution for a future covered-count reduction', async () => {
  const contract = createCoverageAttributionContract();

  const decision = await contract.evaluateCoveredCountRegression();

  assert.equal(decision.exitCode, 1);
  assert.equal(decision.reason, 'covered-count-reduction');
  assert.ok(decision.metric);
  assert.ok(decision.file?.length);
});

// The later governed ratchet must report and fail unexplained total growth rather than masking it
// as an apparent coverage reduction. This specification does not activate that ratchet.
test('should specify failure attribution for future unexplained total growth', async () => {
  const contract = createCoverageAttributionContract();

  const decision = await contract.evaluateUnexplainedTotalGrowth();

  assert.equal(decision.exitCode, 1);
  assert.equal(decision.reason, 'unexplained-total-growth');
  assert.ok(decision.metric);
  assert.ok(decision.file?.length);
});

// Vitest instrumentation and Dockerized harness V8 attribution remain independent unless their
// provenance and mapping are proven equivalent; unmatched artifacts are kept distinct or rejected.
test('should refuse an unproven Vitest and harness coverage merge', async () => {
  const contract = createCoverageAttributionContract();

  const decision = await contract.evaluateVitestHarnessMerge();

  assert.ok(decision.status === 'kept-distinct' || decision.status === 'rejected');
  assert.ok(
    decision.reason === 'non-equivalent-provenance' || decision.reason === 'non-equivalent-mapping',
  );
});
