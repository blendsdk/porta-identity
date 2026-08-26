import assert from 'node:assert/strict';
import test from 'node:test';

import {
  p1BaselineCaseIds,
  p1BaselineRequirements,
  p1CandidateRejectionReasons,
} from './p1-baseline-requirements.js';

import type { BaselineProvenance } from '../baseline/index.js';

type P1ResultFactory = (
  caseId: string,
  runId: string,
  recordedAt: string,
  provenance: BaselineProvenance,
) => unknown;

function isResultFactory(value: unknown): value is P1ResultFactory {
  return typeof value === 'function';
}

test('freezes exact natural-red commands for every independently executable P1 sentinel', () => {
  assert.deepEqual(
    p1BaselineRequirements.map((entry) => entry.caseId),
    p1BaselineCaseIds,
  );
  for (const requirement of p1BaselineRequirements) {
    assert.deepEqual(requirement.command, [
      'yarn',
      'assurance:baseline',
      '--case',
      requirement.caseId,
    ]);
    assert.equal(requirement.classification, 'natural-red');
    assert.equal(requirement.reason, 'missing-exact-p1-sentinel');
    assert.equal(requirement.selectedSentinel, null);
    assert.equal(requirement.productFailureObserved, false);
  }
});

test('keeps broad and conditional legacy tests as corroboration only', () => {
  const knownReasons = new Set<string>(p1CandidateRejectionReasons);
  for (const requirement of p1BaselineRequirements) {
    assert.ok(requirement.candidates.length > 0, requirement.caseId);
    for (const candidate of requirement.candidates) {
      assert.equal(candidate.exactSentinelEligible, false, candidate.path);
      assert.ok(candidate.rejectionReasons.length > 0, candidate.path);
      assert.ok(
        candidate.rejectionReasons.every((reason) => knownReasons.has(reason)),
        candidate.path,
      );
      if (candidate.prerequisite === 'conditional-or-nonfatal') {
        assert.ok(candidate.rejectionReasons.includes('conditional-prerequisite'), candidate.path);
      }
      if (candidate.boundary === 'service-or-repository') {
        assert.ok(
          candidate.rejectionReasons.includes('service-or-repository-only'),
          candidate.path,
        );
      }
    }
  }
});

test('requires independent state, log, and recovery evidence before exact credit', () => {
  for (const requirement of p1BaselineRequirements) {
    for (const candidate of requirement.candidates) {
      const reasons = new Set(candidate.rejectionReasons);
      assert.ok(
        reasons.has('missing-independent-nonmutation') ||
          reasons.has('missing-lifecycle-effect') ||
          reasons.has('missing-cardinality-observation') ||
          reasons.has('missing-privacy-redaction-observation'),
        candidate.path,
      );
      assert.ok(reasons.has('missing-recovery-control'), candidate.path);
    }
  }
});

test('requires the registered P1 baseline surface before evidence can be recorded', async () => {
  const baseline = await import('../baseline/index.js');
  const caseIds = Reflect.get(baseline, 'p1BaselineCaseIds');
  const createResult = Reflect.get(baseline, 'createP1BaselineResult');
  if (!Array.isArray(caseIds) || !isResultFactory(createResult)) {
    assert.fail('P1_BASELINE_CAPABILITY_MISSING');
  }

  assert.deepEqual(caseIds, p1BaselineCaseIds);
  const result = createResult(
    'ST-52',
    '33333333-3333-4333-8333-333333333333',
    '2026-08-20T00:00:00.000Z',
    {
      commitIdentity: `commit:${'1'.repeat(40)}`,
      treeIdentity: `tree:${'2'.repeat(40)}`,
      assuranceToolDigest: `sha256:${'3'.repeat(64)}`,
    },
  );
  assert.ok(result);
});
