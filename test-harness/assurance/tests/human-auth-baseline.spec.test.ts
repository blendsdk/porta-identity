import assert from 'node:assert/strict';
import test from 'node:test';

import {
  humanAuthBaselineCaseIds,
  humanAuthBaselineRequirements,
  humanAuthCandidateRejectionReasons,
} from './human-auth-baseline-requirements.js';

import type { BaselineProvenance } from '../baseline/index.js';

type HumanAuthResultFactory = (
  caseId: string,
  runId: string,
  recordedAt: string,
  provenance: BaselineProvenance,
) => unknown;

function isResultFactory(value: unknown): value is HumanAuthResultFactory {
  return typeof value === 'function';
}

test('freezes exact commands and natural-red classification for every human-auth sentinel', () => {
  assert.deepEqual(
    humanAuthBaselineRequirements.map((entry) => entry.caseId),
    humanAuthBaselineCaseIds,
  );
  for (const requirement of humanAuthBaselineRequirements) {
    assert.deepEqual(requirement.command, [
      'yarn',
      'assurance:baseline',
      '--case',
      requirement.caseId,
    ]);
    assert.equal(requirement.classification, 'natural-red');
    assert.equal(requirement.reason, 'missing-exact-human-auth-sentinel');
    assert.equal(requirement.selectedSentinel, null);
    assert.equal(requirement.productFailureObserved, false);
    assert.ok(requirement.candidates.every((entry) => !entry.exactSentinelEligible));
  }
});

test('rejects conditional, vacuous, and non-independent candidates from exact baseline credit', () => {
  const knownReasons = new Set<string>(humanAuthCandidateRejectionReasons);
  for (const requirement of humanAuthBaselineRequirements) {
    for (const entry of requirement.candidates) {
      assert.ok(entry.rejectionReasons.length > 0, entry.path);
      assert.ok(
        entry.rejectionReasons.every((reason) => knownReasons.has(reason)),
        entry.path,
      );
      if (entry.prerequisite === 'conditional-or-nonfatal') {
        assert.ok(
          entry.rejectionReasons.includes('conditional-or-nonfatal-prerequisite'),
          entry.path,
        );
        assert.deepEqual(entry.eligibleScopes, [], entry.path);
      }
      if (!entry.publicBoundary) {
        assert.ok(entry.rejectionReasons.includes('mock-or-service-only'), entry.path);
        assert.deepEqual(entry.eligibleScopes, [], entry.path);
      }
      if (
        entry.eligibleScopes.includes('session-lifecycle') ||
        entry.eligibleScopes.includes('cookie-and-csrf')
      ) {
        assert.ok(entry.independentObservations.length > 1, entry.path);
      }
      if (
        entry.rejectionReasons.includes('fake-artifact-only') ||
        entry.rejectionReasons.includes('pre-marked-artifact') ||
        entry.rejectionReasons.includes('status-only-oracle')
      ) {
        assert.deepEqual(entry.eligibleScopes, [], entry.path);
      }
    }
  }
});

test('limits direct-database artifacts to consumed-artifact behavior', () => {
  const artifact = humanAuthBaselineRequirements.find((entry) => entry.caseId === 'ST-46');
  assert.ok(artifact);
  const scoped = artifact.candidates.filter((entry) => entry.eligibleScopes.length > 0);
  assert.deepEqual(
    scoped.map((entry) => entry.eligibleScopes),
    [['consumed-artifact-sequential-reuse'], ['consumed-artifact-sequential-reuse']],
  );
  for (const entry of scoped) {
    assert.ok(entry.rejectionReasons.includes('missing-delivery-observation'));
    assert.ok(entry.rejectionReasons.includes('missing-binding-observation'));
  }
});

test('requires the exact human-auth baseline command surface before producing evidence', async () => {
  const baseline = await import('../baseline/index.js');
  const caseIds = Reflect.get(baseline, 'humanAuthBaselineCaseIds');
  const createResult = Reflect.get(baseline, 'createHumanAuthBaselineResult');
  if (!Array.isArray(caseIds) || !isResultFactory(createResult)) {
    assert.fail('HUMAN_AUTH_BASELINE_CAPABILITY_MISSING');
  }

  assert.deepEqual(caseIds, humanAuthBaselineCaseIds);
  const result = createResult(
    'ST-42',
    '22222222-2222-4222-8222-222222222222',
    '2026-08-19T00:00:00.000Z',
    {
      commitIdentity: `commit:${'1'.repeat(40)}`,
      treeIdentity: `tree:${'2'.repeat(40)}`,
      assuranceToolDigest: `sha256:${'3'.repeat(64)}`,
    },
  );
  assert.ok(result);
});
