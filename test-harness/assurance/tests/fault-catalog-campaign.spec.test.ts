import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaultCatalogCampaignContract } from './fault-catalog-campaign-adapter.js';
import {
  aggregateFaultCatalogSelector,
  classifyFaultCatalogCampaignExit,
  expandFaultCatalogCampaign,
  faultCatalogCampaignBaselineFixture,
  faultCatalogCampaignFixture,
  faultCatalogCampaignForbiddenArtifactFields,
  faultCatalogCampaignRetainedFields,
  faultCatalogTupleClassificationRules,
  faultDefinitionIsInScope,
  isExactAggregateFaultCatalogSelector,
} from './fault-catalog-campaign-requirements.js';

test('admits only the exact aggregate selector without treating it as a fault identifier', () => {
  assert.equal(isExactAggregateFaultCatalogSelector(aggregateFaultCatalogSelector), true);
  for (const selector of [
    { fault: 'full-catalog', claim: 'catalog', sentinel: 'ST-64' },
    { fault: 'full-catalog', claim: 'CLAIM-R6-01', sentinel: 'all' },
    { fault: 'alpha-boundary-fault', claim: 'catalog', sentinel: 'all' },
    { fault: 'full-catalog*', claim: 'catalog', sentinel: 'all' },
  ]) {
    assert.equal(isExactAggregateFaultCatalogSelector(selector), false);
  }
  assert.equal(
    faultCatalogCampaignFixture.faults.some(
      (fault) => fault.id === aggregateFaultCatalogSelector.fault,
    ),
    false,
  );
});

test('expands a complete deterministic globally unique tuple list', () => {
  const first = expandFaultCatalogCampaign(faultCatalogCampaignFixture);
  const second = expandFaultCatalogCampaign(structuredClone(faultCatalogCampaignFixture));
  assert.deepEqual(first, second);
  assert.equal(
    first.length,
    faultCatalogCampaignFixture.faults.reduce((count, fault) => count + fault.tuples.length, 0),
  );
  assert.deepEqual(
    first.map((tuple) => tuple.identity),
    [...first.map((tuple) => tuple.identity)].sort(),
  );
  assert.equal(new Set(first.map((tuple) => tuple.identity)).size, first.length);
  assert.deepEqual(
    first.map((tuple) => tuple.ordinal),
    first.map((_, index) => index),
  );
  assert.ok(first.every((tuple) => tuple.executionIsolation === 'fresh-detached-worktree'));

  const firstFault = faultCatalogCampaignFixture.faults[0]!;
  const duplicate = {
    ...faultCatalogCampaignFixture,
    faults: [
      firstFault,
      {
        ...faultCatalogCampaignFixture.faults[1]!,
        id: firstFault.id,
        tuples: [firstFault.tuples[0]!],
      },
    ],
  };
  assert.throws(() => expandFaultCatalogCampaign(duplicate), /duplicate global tuple identity/i);
});

test('keeps mismatches and non-sentinel failures distinct from exact kills', () => {
  assert.deepEqual(
    faultCatalogTupleClassificationRules.map((rule) => rule.condition),
    [
      'revision-mismatch',
      'target-hash-mismatch',
      'tuple-mismatch',
      'build-failure',
      'setup-failure',
      'unrelated-failure',
      'exact-signature-failed',
      'sentinel-survived',
      'tuple-timeout',
      'outside-scope-mutation',
    ],
  );
  const killed = faultCatalogTupleClassificationRules.filter((rule) => rule.killed);
  assert.deepEqual(killed, [
    {
      condition: 'exact-signature-failed',
      classification: 'killed',
      killed: true,
      incomplete: false,
    },
  ]);
  assert.ok(
    faultCatalogTupleClassificationRules
      .filter((rule) => rule.classification === 'survived' || rule.classification === 'timeout')
      .every((rule) => rule.incomplete),
  );
});

test('binds every tuple to the single clean baseline and validated catalog snapshot', () => {
  assert.equal(faultCatalogCampaignBaselineFixture.clean, true);
  assert.match(faultCatalogCampaignBaselineFixture.commit, /^[a-f0-9]{40}$/);
  assert.match(faultCatalogCampaignBaselineFixture.treeDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(faultCatalogCampaignBaselineFixture.toolchainDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    faultCatalogCampaignBaselineFixture.catalogDigest,
    faultCatalogCampaignFixture.digest,
  );
  const tuples = expandFaultCatalogCampaign(faultCatalogCampaignFixture);
  assert.ok(
    tuples.every(
      (tuple) =>
        tuple.targetRevision === faultCatalogCampaignBaselineFixture.commit &&
        /^sha256:[a-f0-9]{64}$/.test(tuple.targetHash),
    ),
  );
});

test('applies the exact aggregate terminal precedence', () => {
  const base = {
    cleanupOrTreeDrift: false,
    signal: null,
    timedOut: false,
    invalid: false,
    infrastructureFailed: false,
    survived: false,
  } as const;
  assert.equal(classifyFaultCatalogCampaignExit(base), 0);
  assert.equal(classifyFaultCatalogCampaignExit({ ...base, survived: true }), 21);
  assert.equal(
    classifyFaultCatalogCampaignExit({ ...base, survived: true, infrastructureFailed: true }),
    30,
  );
  assert.equal(
    classifyFaultCatalogCampaignExit({ ...base, infrastructureFailed: true, invalid: true }),
    50,
  );
  assert.equal(classifyFaultCatalogCampaignExit({ ...base, invalid: true, timedOut: true }), 70);
  assert.equal(
    classifyFaultCatalogCampaignExit({ ...base, timedOut: true, signal: 'sigint' }),
    130,
  );
  assert.equal(
    classifyFaultCatalogCampaignExit({ ...base, timedOut: true, signal: 'sigterm' }),
    143,
  );
  assert.equal(
    classifyFaultCatalogCampaignExit({ ...base, cleanupOrTreeDrift: true, signal: 'sigterm' }),
    60,
  );
});

test('rejects paths, wildcards, traversal, and undeclared command forms before mutation', () => {
  assert.ok(faultCatalogCampaignFixture.faults.every(faultDefinitionIsInScope));
  const source = faultCatalogCampaignFixture.faults[0]!;
  for (const fault of [
    { ...source, targetPath: '/absolute/path' },
    { ...source, patchPath: '../outside.patch' },
    { ...source, targetPath: 'test-harness/assurance/fault/fixtures/*.mjs' },
    { ...source, buildCommandId: 'node --eval arbitrary' },
  ]) {
    assert.equal(faultDefinitionIsInScope(fault), false);
  }
});

test('executes the aggregate contract with complete accounting and sanitized cleanup evidence', async () => {
  const artifact = await createFaultCatalogCampaignContract().execute({
    selector: aggregateFaultCatalogSelector,
  });

  assert.deepEqual(artifact.selector, aggregateFaultCatalogSelector);
  assert.match(artifact.catalogDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(artifact.baseline.catalogDigest, artifact.catalogDigest);
  assert.equal(artifact.baseline.clean, true);
  assert.match(artifact.baseline.commit, /^[a-f0-9]{40}$/);
  assert.match(artifact.baseline.treeDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(artifact.baseline.toolchainDigest, /^sha256:[a-f0-9]{64}$/);
  assert.ok(artifact.tuples.length > 0);
  assert.deepEqual(
    artifact.tuples.map((tuple) => tuple.identity),
    [...artifact.tuples.map((tuple) => tuple.identity)].sort(),
  );
  assert.equal(
    new Set(artifact.tuples.map((tuple) => tuple.identity)).size,
    artifact.tuples.length,
  );
  for (const entry of artifact.tuples) {
    const identity = entry.identity.split('::');
    assert.equal(identity.length, 3, entry.identity);
    const claimId = identity[1]!;
    assert.equal(entry.ordinal, artifact.tuples.indexOf(entry), entry.identity);
    if (entry.executionStatus === 'not-run') {
      assert.equal(entry.classification, null, entry.identity);
      assert.ok(entry.notRunReason && entry.notRunReason.length > 0, entry.identity);
      assert.equal(entry.exactSignatureObserved, false, entry.identity);
      assert.deepEqual(entry.killedClaimIds, [], entry.identity);
    } else {
      assert.notEqual(entry.classification, null, entry.identity);
      assert.equal(entry.notRunReason, null, entry.identity);
      if (entry.classification === 'killed') {
        assert.equal(entry.exactSignatureObserved, true, entry.identity);
        assert.deepEqual(entry.killedClaimIds, [claimId], entry.identity);
      } else {
        assert.deepEqual(entry.killedClaimIds, [], entry.identity);
      }
      if (entry.classification === 'survived' || entry.classification === 'timeout') {
        assert.deepEqual(entry.blockedClaimIds, [claimId], entry.identity);
      }
    }
    assert.equal(entry.primaryTreeUnchanged, true, entry.identity);
    assert.equal(entry.ownedResourcesRemovedOrRecovered, true, entry.identity);
    if (identity[2] === 'ST-68A') {
      assert.equal(entry.classification, 'invalid');
      assert.equal(entry.freshDetachedWorktree, false);
    } else if (entry.executionStatus === 'completed') {
      assert.equal(entry.freshDetachedWorktree, true, entry.identity);
    }
  }

  assert.equal(artifact.artifactMode, 0o600);
  assert.equal(artifact.atomicWrite, true);
  assert.equal(artifact.primaryTreeUnchanged, true);
  assert.equal(artifact.ownedResourcesRemovedOrRecovered, true);
  assert.deepEqual(Object.keys(artifact.ownedResourceCleanup).sort(), [
    'build',
    'evidence',
    'image',
    'stack',
    'worktree',
  ]);
  assert.ok(
    Object.values(artifact.ownedResourceCleanup).every(
      (outcome) => outcome === 'removed' || outcome === 'exactly-recovered',
    ),
  );
  assert.match(artifact.terminalReason, /^[A-Z][A-Z0-9_]{2,127}$/);
  assert.deepEqual(artifact.retainedFieldNames, faultCatalogCampaignRetainedFields);
  assert.ok(
    faultCatalogCampaignForbiddenArtifactFields.every(
      (field) => !artifact.retainedFieldNames.includes(field),
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(artifact),
    /(?:\/home\/|\/tmp\/|BEGIN [A-Z ]*PRIVATE KEY|Bearer\s|authorization:|password=)/i,
  );
});
