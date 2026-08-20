import assert from 'node:assert/strict';
import test from 'node:test';

import { createAssuranceRatchetsContract } from './assurance-ratchets-adapter.js';
import {
  changedRatchetInputDigest,
  reviewedCoverageBaseline,
  reviewedStalenessDigests,
} from './assurance-ratchets-requirements.js';

// Exact covered counts, rather than rounded percentages, decide local no-regression results.
test('should reject an exact covered branch reduction with unchanged totals', () => {
  const contract = createAssuranceRatchetsContract();
  const counts = {
    ...reviewedCoverageBaseline.counts,
    branches: {
      ...reviewedCoverageBaseline.counts.branches,
      covered: reviewedCoverageBaseline.counts.branches.covered - 1,
    },
  };

  assert.deepEqual(
    contract.evaluateCoverage({
      sourceRevision: reviewedCoverageBaseline.sourceRevision,
      normalizedPathCount: reviewedCoverageBaseline.normalizedPathCount,
      counts,
    }),
    {
      accepted: false,
      reason: 'covered-count-reduction',
      metric: 'branches',
      promotionAuthorized: false,
    },
  );
});

// Executable-total or path-set changes need separately reviewed metadata and cannot be hidden by a
// percentage that happens to improve.
test('should reject unexplained executable-total and normalized-path growth', () => {
  const contract = createAssuranceRatchetsContract();
  const counts = {
    ...reviewedCoverageBaseline.counts,
    statements: {
      covered: reviewedCoverageBaseline.counts.statements.covered + 1,
      total: reviewedCoverageBaseline.counts.statements.total + 1,
    },
  };

  assert.deepEqual(
    contract.evaluateCoverage({
      sourceRevision: reviewedCoverageBaseline.sourceRevision,
      normalizedPathCount: reviewedCoverageBaseline.normalizedPathCount,
      counts,
    }),
    {
      accepted: false,
      reason: 'unreviewed-total-change',
      metric: 'statements',
      promotionAuthorized: false,
    },
  );
  assert.equal(
    contract.evaluateCoverage({
      sourceRevision: reviewedCoverageBaseline.sourceRevision,
      normalizedPathCount: reviewedCoverageBaseline.normalizedPathCount + 1,
      counts: reviewedCoverageBaseline.counts,
    }).reason,
    'unreviewed-total-change',
  );
});

// Exact unchanged observations pass locally, while a different source revision remains stale until
// a reviewed baseline update records its new identities.
test('should accept only the exact reviewed source observation', () => {
  const contract = createAssuranceRatchetsContract();
  assert.deepEqual(
    contract.evaluateCoverage({
      sourceRevision: reviewedCoverageBaseline.sourceRevision,
      normalizedPathCount: reviewedCoverageBaseline.normalizedPathCount,
      counts: reviewedCoverageBaseline.counts,
    }),
    { accepted: true, reason: 'exact-baseline', promotionAuthorized: false },
  );
  assert.equal(
    contract.evaluateCoverage({
      sourceRevision: 'new-source-revision',
      normalizedPathCount: reviewedCoverageBaseline.normalizedPathCount,
      counts: reviewedCoverageBaseline.counts,
    }).reason,
    'stale-source-revision',
  );
});

// A risk-slice floor may rise only after both claim completion and designated-check sensitivity are
// independently complete.
test('should permit a higher slice floor only after claim and sensitivity closure', () => {
  const contract = createAssuranceRatchetsContract();
  assert.equal(
    contract.mayIncreaseSliceFloor({
      currentFloor: 20,
      proposedFloor: 21,
      claimsClosed: true,
      sensitivityComplete: true,
    }),
    true,
  );
  for (const [claimsClosed, sensitivityComplete] of [
    [false, true],
    [true, false],
    [false, false],
  ] as const) {
    assert.equal(
      contract.mayIncreaseSliceFloor({
        currentFloor: 20,
        proposedFloor: 21,
        claimsClosed,
        sensitivityComplete,
      }),
      false,
    );
  }
});

// Requirement, fixture, dependency, and sentinel identity changes stale their exact affected
// claims before a governed report can succeed.
test('should block governed reporting for every changed monitored input', () => {
  const contract = createAssuranceRatchetsContract();
  for (const trigger of ['requirement-r5', 'fixture', 'dependency', 'sentinel'] as const) {
    const current = contract.evaluateStaleness(trigger, reviewedStalenessDigests[trigger]);
    assert.equal(current.resultingStatus, 'current', trigger);
    assert.equal(current.reportAllowed, true, trigger);

    const stale = contract.evaluateStaleness(trigger, changedRatchetInputDigest);
    assert.equal(stale.resultingStatus, 'stale', trigger);
    assert.equal(stale.reportAllowed, false, trigger);
    assert.ok(stale.affectedClaims.length > 0, trigger);
    if (trigger === 'requirement-r5') {
      assert.ok(
        stale.affectedClaims.every((claim) => claim.startsWith('CLAIM-R5-')),
        trigger,
      );
    }
  }
});
