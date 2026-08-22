import assert from 'node:assert/strict';
import test from 'node:test';

import type { BaselineProvenance } from '../baseline/index.js';

const exactCases = [
  'ST-33',
  'ST-34',
  'ST-35',
  'ST-36',
  'ST-37',
  'ST-38',
  'ST-39',
  'ST-40',
  'ST-41',
] as const;

/** Narrows an unknown module property to the protocol baseline factory contract. */
function isProtocolResultFactory(
  value: unknown,
): value is (
  caseId: string,
  runId: string,
  recordedAt: string,
  provenance: BaselineProvenance,
) => unknown {
  return typeof value === 'function';
}

/** Narrows an unknown JSON-like value before its public evidence fields are inspected. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('registers every protocol baseline case with requirement-owned natural-red evidence', async () => {
  const baseline = await import('../baseline/index.js');
  const caseIds = Reflect.get(baseline, 'protocolBaselineCaseIds');
  const createResult = Reflect.get(baseline, 'createProtocolBaselineResult');
  if (!Array.isArray(caseIds) || !isProtocolResultFactory(createResult)) {
    assert.fail('PROTOCOL_BASELINE_CURRENT_SURFACE_MISSING');
  }

  assert.deepEqual(caseIds, exactCases);
  const provenance: BaselineProvenance = {
    commitIdentity: `commit:${'1'.repeat(40)}`,
    treeIdentity: `tree:${'2'.repeat(40)}`,
    assuranceToolDigest: `sha256:${'3'.repeat(64)}`,
  };
  for (const caseId of exactCases) {
    const result = createResult(
      caseId,
      '11111111-1111-4111-8111-111111111111',
      '2026-08-18T00:00:00.000Z',
      provenance,
    );
    assert.ok(isRecord(result), caseId);
    assert.equal(result.caseId, caseId);
    assert.equal(result.classification, 'natural-red');
    assert.equal(result.reason, 'missing-exact-live-sentinel');
    assert.equal(result.productFailureObserved, false);
    assert.equal(result.oracleChanged, false);
    assert.equal(result.selectedSentinel, null);
    assert.ok(Array.isArray(result.claimIds) && result.claimIds.length > 0, caseId);
    assert.ok(Array.isArray(result.candidates), caseId);
  }
});

test('rejects unknown protocol baseline selectors without changing the oracle', async () => {
  const baseline = await import('../baseline/index.js');
  const createResult = Reflect.get(baseline, 'createProtocolBaselineResult');
  if (!isProtocolResultFactory(createResult)) {
    assert.fail('PROTOCOL_BASELINE_CURRENT_SURFACE_MISSING');
  }
  assert.throws(
    () =>
      createResult('ST-99', '11111111-1111-4111-8111-111111111111', '2026-08-18T00:00:00.000Z', {
        commitIdentity: `commit:${'1'.repeat(40)}`,
        treeIdentity: `tree:${'2'.repeat(40)}`,
        assuranceToolDigest: `sha256:${'3'.repeat(64)}`,
      }),
    /registered protocol baseline case/u,
  );
});
