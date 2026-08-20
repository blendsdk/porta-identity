import assert from 'node:assert/strict';
import test from 'node:test';

import { createAssuranceAllAggregateContract } from './assurance-all-aggregate-adapter.js';
import type {
  AssuranceAllInternalSuiteInput,
  AssuranceAllItemEvidence,
} from './assurance-all-aggregate-contract.js';
import {
  assuranceAllAggregateEvidenceFixture,
  assuranceAllChildRegistry,
  assuranceAllForbiddenEvidencePatterns,
  assuranceAllKnownGapRegistry,
  assuranceAllRetainedFieldNames,
  assuranceAllTerminalPrecedence,
  classifyAssuranceAllExit,
  classifyAssuranceAllItem,
  deduplicateAssuranceAllInternalSuite,
  rollUpAssuranceAllItems,
} from './assurance-all-aggregate-requirements.js';

test('freezes the complete aggregate child registry and sequential order', () => {
  assert.equal(assuranceAllAggregateEvidenceFixture.registryVersion, 1);
  assert.deepEqual(
    assuranceAllChildRegistry.map((child) => child.id),
    [
      'validate',
      'test',
      'harness:operational',
      'harness:production-security',
      'coverage',
      'fault',
      'compat',
      'report',
    ],
  );
  assert.deepEqual(
    assuranceAllChildRegistry.map((child) => child.ordinal),
    assuranceAllChildRegistry.map((_, ordinal) => ordinal),
  );
  assert.deepEqual(
    assuranceAllChildRegistry.filter((child) => child.internalSuite !== null),
    [assuranceAllChildRegistry[1]],
  );
  assert.equal(assuranceAllChildRegistry[1]?.internalSuite, 'deduplicated-canonical-files');
  assert.equal(new Set(assuranceAllChildRegistry.map((child) => child.id)).size, 8);
  assert.deepEqual(
    assuranceAllChildRegistry.map((child) => child.invocations.length),
    [1, 1, 5, 1, 2, 1, 4, 1],
  );
  assert.equal(assuranceAllChildRegistry.flatMap((child) => child.invocations).length, 16);
  const internal = assuranceAllChildRegistry[1]?.invocations[0];
  assert.equal(internal?.selector, 'assurance-all-internal-v1');
  assert.deepEqual(internal?.arguments, ['--select', 'assurance-all-internal-v1']);
  const coverage = assuranceAllChildRegistry[4]?.invocations;
  assert.deepEqual(
    coverage?.map((entry) => [entry.selector, entry.profile]),
    [
      ['protocol', 'operational'],
      ['security', 'production-security'],
    ],
  );
});

test('deduplicates overlapping internal selectors by canonical file in first-seen order', () => {
  const inputs: readonly AssuranceAllInternalSuiteInput[] = [
    {
      selector: 'foundation',
      canonicalFiles: [
        'test-harness/assurance/tests/assurance-foundation.impl.test.ts',
        'test-harness/assurance/tests/shared-control.spec.test.ts',
      ],
    },
    {
      selector: 'security',
      canonicalFiles: [
        'test-harness/assurance/tests/shared-control.spec.test.ts',
        'test-harness/assurance/tests/security-control.spec.test.ts',
      ],
    },
  ];
  const first = deduplicateAssuranceAllInternalSuite(inputs);
  const second = deduplicateAssuranceAllInternalSuite(structuredClone(inputs));
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map((entry) => entry.canonicalFile),
    [
      'test-harness/assurance/tests/assurance-foundation.impl.test.ts',
      'test-harness/assurance/tests/shared-control.spec.test.ts',
      'test-harness/assurance/tests/security-control.spec.test.ts',
    ],
  );
  assert.deepEqual(first[1]?.contributedBy, ['foundation', 'security']);
  assert.deepEqual(
    first.map((entry) => entry.ordinal),
    [0, 1, 2],
  );
  assert.throws(
    () =>
      deduplicateAssuranceAllInternalSuite([
        { selector: 'invalid', canonicalFiles: ['/tmp/arbitrary.test.ts'] },
      ]),
    /ASSURANCE_ALL_INTERNAL_FILE_NOT_CANONICAL/,
  );
});

test('rolls up every item exactly once without laundering defects or authority gaps', () => {
  const source = assuranceAllAggregateEvidenceFixture.items.map(
    ({ conclusion: _conclusion, ...item }) => item,
  );
  assert.deepEqual(rollUpAssuranceAllItems(source), assuranceAllAggregateEvidenceFixture.rollup);
  for (const item of assuranceAllAggregateEvidenceFixture.items) {
    const { conclusion: _conclusion, ...observation } = item;
    assert.equal(classifyAssuranceAllItem(observation), item.conclusion, item.id);
  }
  assert.equal(
    classifyAssuranceAllItem({
      id: 'resolved-known-defect',
      childId: 'harness:operational',
      authority: 'known-product-defect-collector',
      executionStatus: 'completed',
      observation: 'passed',
      notRunReason: null,
    }),
    'assured',
  );
  assert.throws(
    () =>
      classifyAssuranceAllItem({
        id: 'invented-authority',
        childId: 'report',
        authority: 'authority-blocked',
        executionStatus: 'completed',
        observation: 'passed',
        notRunReason: null,
      }),
    /ASSURANCE_ALL_AUTHORITY_GAP_EXECUTED/,
  );
  assert.deepEqual(
    assuranceAllKnownGapRegistry.map(({ id, authority, conclusion, statusSource }) => ({
      id,
      authority,
      conclusion,
      statusSource,
    })),
    [...assuranceAllKnownGapRegistry],
  );
  assert.ok(
    assuranceAllKnownGapRegistry.every(
      (gap) =>
        gap.statusSource === 'approved-program-gap-register' &&
        ((gap.authority === 'authority-blocked' && gap.conclusion === 'blocked') ||
          (gap.authority === 'stale-or-no-go-evidence' && gap.conclusion === 'unqualified')),
    ),
  );
  assert.throws(() => rollUpAssuranceAllItems([...source, source[0]!]), /DUPLICATE_ITEM_ID/);
});

test('accounts explicitly for all children and all not-run entries', () => {
  const evidence = assuranceAllAggregateEvidenceFixture;
  assert.deepEqual(
    evidence.children.map((child) => child.id),
    assuranceAllChildRegistry.map((child) => child.id),
  );
  assert.ok(evidence.children.every((child) => child.processOwnership === 'managed-child'));
  for (const child of evidence.children) {
    assert.equal(child.ordinal, evidence.children.indexOf(child));
    if (child.executionStatus === 'not-run') {
      assert.equal(child.outcome, null);
      assert.ok(child.notRunReason);
    } else {
      assert.notEqual(child.outcome, null);
      assert.equal(child.notRunReason, null);
    }
    assert.deepEqual(
      child.invocations.map((entry) => entry.id),
      assuranceAllChildRegistry[child.ordinal]?.invocations.map((entry) => entry.id),
    );
    for (const invocation of child.invocations) {
      assert.match(invocation.sourceRevision, /^[a-f0-9]{40}$/);
      assert.match(invocation.sourceTreeDigest, /^sha256:[a-f0-9]{64}$/);
      assert.match(invocation.toolDigest, /^sha256:[a-f0-9]{64}$/);
      assert.ok(invocation.toolIdentity.startsWith('assurance:'));
      if (invocation.executionStatus === 'completed') {
        assert.equal(typeof invocation.exitCode, 'number');
        assert.match(invocation.artifactReference ?? '', /^all\/[a-z0-9/-]+\.json$/);
        assert.match(invocation.artifactDigest ?? '', /^sha256:[a-f0-9]{64}$/);
        assert.equal(invocation.notRunReason, null);
      } else {
        assert.equal(invocation.exitCode, null);
        assert.equal(invocation.artifactReference, null);
        assert.equal(invocation.artifactDigest, null);
        assert.ok(invocation.notRunReason);
      }
      assert.equal(invocation.cleanupComplete, true);
    }
  }
  const stopped: AssuranceAllItemEvidence = {
    id: 'not-run-after-stop',
    childId: 'compat',
    authority: 'eligible',
    executionStatus: 'not-run',
    observation: null,
    notRunReason: 'EARLIER_CHILD_TERMINATED',
    conclusion: 'incomplete',
  };
  const { conclusion: _conclusion, ...stoppedObservation } = stopped;
  assert.equal(classifyAssuranceAllItem(stoppedObservation), 'incomplete');
});

test('applies the exact aggregate terminal precedence', () => {
  assert.deepEqual(
    assuranceAllTerminalPrecedence.map((entry) => entry.exitCode),
    [60, 130, 143, 70, 50, 40, 30, 20, 21],
  );
  const base = {
    cleanupOrPrimaryTreeDrift: false,
    signal: null,
    timedOut: false,
    invalidEvidence: false,
    coverageIncomplete: false,
    infrastructureFailed: false,
    productDefectObserved: false,
    assertionFailedOrFaultSurvived: false,
  } as const;
  assert.equal(classifyAssuranceAllExit(base), 0);
  assert.equal(classifyAssuranceAllExit({ ...base, assertionFailedOrFaultSurvived: true }), 21);
  assert.equal(
    classifyAssuranceAllExit({
      ...base,
      assertionFailedOrFaultSurvived: true,
      productDefectObserved: true,
    }),
    20,
  );
  assert.equal(
    classifyAssuranceAllExit({ ...base, productDefectObserved: true, infrastructureFailed: true }),
    30,
  );
  assert.equal(
    classifyAssuranceAllExit({ ...base, infrastructureFailed: true, timedOut: true }),
    70,
  );
  assert.equal(classifyAssuranceAllExit({ ...base, timedOut: true, signal: 'sigint' }), 130);
  assert.equal(classifyAssuranceAllExit({ ...base, timedOut: true, signal: 'sigterm' }), 143);
  assert.equal(
    classifyAssuranceAllExit({
      ...base,
      signal: 'sigterm',
      cleanupOrPrimaryTreeDrift: true,
    }),
    60,
  );
});

test('requires atomic owner-only sanitized evidence and managed cleanup', () => {
  const evidence = assuranceAllAggregateEvidenceFixture;
  assert.equal(evidence.artifactMode, 0o600);
  assert.equal(evidence.atomicWrite, true);
  assert.match(evidence.registryDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(evidence.baselineRevision, /^[a-f0-9]{40}$/);
  assert.match(evidence.baselineTreeDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(evidence.terminalReason, /^[A-Z][A-Z0-9_]{2,127}$/);
  assert.deepEqual(evidence.retainedFieldNames, assuranceAllRetainedFieldNames);
  const serialized = JSON.stringify(evidence);
  for (const forbidden of assuranceAllForbiddenEvidencePatterns) {
    assert.doesNotMatch(serialized, forbidden);
  }
  assert.equal(evidence.cleanup.primaryTreeUnchanged, true);
  assert.equal(evidence.cleanup.activeChildStopped, true);
  assert.equal(evidence.cleanup.childProcessGroupStopped, true);
  assert.equal(evidence.cleanup.ownedResourcesRemovedOrExactlyRecovered, true);
  assert.equal(evidence.cleanup.recoveryRequired, false);
  assert.equal(evidence.cleanup.recoveryCommand, null);
});

test('validates the complete requirement-owned aggregate evidence fixture', () => {
  assert.deepEqual(
    createAssuranceAllAggregateContract().validate(assuranceAllAggregateEvidenceFixture),
    assuranceAllAggregateEvidenceFixture,
  );
});
