import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePackedP1ReadEvidence } from './p1-packed-read-adapter.js';
import { packedP1ReadRequirements } from './p1-packed-read-requirements.js';
import { completePackedP1ReadEvidence } from './p1-packed-read-spec-fixtures.js';

import type { PackedP1ReadClient, PackedP1ReadSurface } from './p1-packed-read-requirements.js';

const exactMatrix: readonly (readonly [PackedP1ReadClient, PackedP1ReadSurface])[] = [
  ['sdk', 'tenant-users-page'],
  ['cli', 'users-page-search'],
  ['cli', 'audit-filter'],
  ['sdk', 'signing-key-list'],
  ['sdk', 'tenant-session-page'],
  ['cli', 'configuration-list'],
];

test('freezes exactly six approved packed SDK and CLI read journeys', () => {
  assert.deepEqual(
    packedP1ReadRequirements.map((entry) => [entry.client, entry.surface]),
    exactMatrix,
  );
  assert.equal(new Set(packedP1ReadRequirements.map((entry) => entry.id)).size, 6);

  for (const requirement of packedP1ReadRequirements) {
    assert.equal(requirement.schemaVersion, 1, requirement.id);
    assert.equal(requirement.requirementVersion, '2026-08-20', requirement.id);
    assert.equal(requirement.operation, 'read', requirement.id);
    assert.equal(requirement.evidenceStatus, 'specification-only', requirement.id);
    assert.equal(requirement.correlatedLogCredit, 'forbidden', requirement.id);
    assert.match(requirement.independentRawRequest, /^GET /, requirement.id);
    assert.doesNotMatch(
      requirement.clientInvocation,
      /\b(create|update|delete|generate|rotate|revoke|cleanup|import|export)\b/i,
    );
    assert.doesNotMatch(requirement.id, /st-?62|bulk|import|export/i);
  }
  const cursor = packedP1ReadRequirements[0];
  assert.ok(cursor);
  assert.match(cursor.clientInvocation, /pageSize: 2/u);
  assert.match(cursor.independentRawRequest, /[?&]limit=2(?:&|$)/u);
  assert.doesNotMatch(cursor.independentRawRequest, /[?&]pageSize=/u);
});

test('requires independent comparison, nonmutation, scanning, provenance, and actual-run cleanup', () => {
  const expectedState = [
    'target-row-digests',
    'target-cardinality',
    'session-lifecycle-digests',
    'signing-key-lifecycle-digests',
    'configuration-version-digests',
  ];
  const expectedForbidden = [
    'opaque-access-or-refresh-token',
    'session-cookie-or-credential',
    'protected-configuration-value',
    'private-signing-key-material',
    'foreign-tenant-identity-or-count',
  ];
  const expectedProvenance = [
    'package-name-exact',
    'package-version-equals-built-workspace-manifest',
    'archive-sha256-exact',
    'archive-file-dependency-exact',
    'compiled-entrypoint-loaded-from-dist',
    'resolved-content-digest-equals-locally-packed-archive',
    'registry-workspace-source-alias-and-symlink-resolution-rejected',
    'node-version-and-executable-digest-exact',
    'source-revision-exact',
    'server-image-digest-exact',
    'fixture-manifest-digest-exact',
    'primary-tree-unchanged',
  ];

  for (const requirement of packedP1ReadRequirements) {
    assert.deepEqual(requirement.stateFingerprintKeys, expectedState, requirement.id);
    assert.deepEqual(requirement.forbiddenOutputClasses, expectedForbidden, requirement.id);
    assert.deepEqual(requirement.provenanceRequirements, expectedProvenance, requirement.id);
    assert.ok(requirement.fixtureOracleRequirements.length > 0, requirement.id);
    assert.ok(
      requirement.cleanupRequirements.includes('exactly-one-actual-terminal-outcome-recorded'),
      requirement.id,
    );
    assert.ok(
      requirement.cleanupRequirements.includes('actual-run-owned-resources-cleaned'),
      requirement.id,
    );
  }
});

test('validates complete packed evidence and rejects expectation-shaped defects', () => {
  const complete = completePackedP1ReadEvidence();
  const evidence = validatePackedP1ReadEvidence(complete);
  assert.deepEqual(evidence, complete);

  const changedState = {
    ...complete,
    journeys: complete.journeys.map((journey, index) =>
      index === 0
        ? {
            ...journey,
            stateFingerprintsAfter: {
              ...journey.stateFingerprintsAfter,
              'target-cardinality': 'sha256:defect',
            },
          }
        : journey,
    ),
  };
  assert.throws(() => validatePackedP1ReadEvidence(changedState), /state.*changed/i);

  const mismatchedRaw = {
    ...complete,
    journeys: complete.journeys.map((journey, index) =>
      index === 1
        ? {
            ...journey,
            outcome: 'product-failure' as const,
            independentRawResult: { ...journey.independentRawResult, status: 500 },
          }
        : journey,
    ),
  };
  assert.equal(validatePackedP1ReadEvidence(mismatchedRaw).journeys[1]?.outcome, 'product-failure');
  assert.throws(
    () =>
      validatePackedP1ReadEvidence({
        ...mismatchedRaw,
        journeys: mismatchedRaw.journeys.map((journey, index) =>
          index === 1 ? { ...journey, outcome: 'passed' as const } : journey,
        ),
      }),
    /outcome.*independent observations/i,
  );

  const leakedOutput = {
    ...complete,
    journeys: complete.journeys.map((journey, index) =>
      index === 2
        ? {
            ...journey,
            forbiddenOutputObserved: {
              ...journey.forbiddenOutputObserved,
              'opaque-access-or-refresh-token': true,
            },
          }
        : journey,
    ),
  };
  assert.throws(() => validatePackedP1ReadEvidence(leakedOutput), /forbidden output/i);

  const falseProvenance = {
    ...complete,
    provenance: { ...complete.provenance, prohibitedResolutionObserved: true },
  };
  assert.throws(() => validatePackedP1ReadEvidence(falseProvenance), /resolution/i);

  const residue = {
    ...complete,
    cleanup: { ...complete.cleanup, residuePaths: ['/synthetic/residue'] },
  };
  assert.throws(() => validatePackedP1ReadEvidence(residue), /residue/i);

  const logCredit = { ...complete, correlatedLogEvidenceCollected: true };
  assert.throws(() => validatePackedP1ReadEvidence(logCredit), /correlated log/i);
});
