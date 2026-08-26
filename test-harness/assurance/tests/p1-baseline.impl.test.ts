import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createP1BaselineResult,
  p1BaselineCaseIds,
  recordP1Baseline,
  type BaselineRuntimeDependencies,
} from '../baseline/index.js';
import { p1BaselineRequirements } from './p1-baseline-requirements.js';

/** Fixed provenance keeps filesystem tests independent from the caller's Git state. */
const fixtureProvenance = {
  commitIdentity: `commit:${'1'.repeat(40)}`,
  treeIdentity: `tree:${'2'.repeat(40)}`,
  assuranceToolDigest: `sha256:${'3'.repeat(64)}`,
};

test('should preserve the requirement-owned audit in every P1 natural-red result', () => {
  for (const requirement of p1BaselineRequirements) {
    const result = createP1BaselineResult(
      requirement.caseId,
      '33333333-3333-4333-8333-333333333333',
      '2026-08-20T00:00:00.000Z',
      fixtureProvenance,
    );
    assert.deepEqual(result.claimIds, requirement.claimIds, requirement.caseId);
    assert.equal(result.classification, requirement.classification, requirement.caseId);
    assert.equal(result.reason, requirement.reason, requirement.caseId);
    assert.equal(result.productFailureObserved, false, requirement.caseId);
    assert.equal(result.oracleChanged, false, requirement.caseId);
    assert.equal(result.selectedSentinel, null, requirement.caseId);
    assert.deepEqual(result.candidates, requirement.candidates, requirement.caseId);
  }
});

test('should reject unknown P1 baseline selectors', () => {
  assert.throws(
    () =>
      createP1BaselineResult(
        'ST-62',
        '33333333-3333-4333-8333-333333333333',
        '2026-08-20T00:00:00.000Z',
        fixtureProvenance,
      ),
    /registered P1 baseline case/u,
  );
  assert.deepEqual(p1BaselineCaseIds, p1BaselineRequirements.map((entry) => entry.caseId));
});

test('should write one owner-only P1 artifact after validating candidate paths and titles', () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), 'porta-p1-baseline-'));
  const requirement = p1BaselineRequirements.find((entry) => entry.caseId === 'ST-52');
  assert.ok(requirement);
  const runtime: BaselineRuntimeDependencies = {
    inspectProvenance: () => fixtureProvenance,
    createRunId: () => '33333333-3333-4333-8333-333333333333',
    now: () => new Date('2026-08-20T00:00:00.000Z'),
  };
  try {
    for (const candidate of requirement.candidates) {
      const candidatePath = resolve(sandbox, candidate.path);
      mkdirSync(resolve(candidatePath, '..'), { recursive: true });
      writeFileSync(candidatePath, `test(${JSON.stringify(candidate.testTitle)}, () => undefined);`);
    }
    const recorded = recordP1Baseline(sandbox, 'ST-52', runtime);
    const artifact: unknown = JSON.parse(readFileSync(recorded.artifactPath, 'utf8'));
    assert.deepEqual(artifact, recorded.result);
    assert.equal(lstatSync(recorded.artifactPath).mode & 0o777, 0o600);
    assert.doesNotMatch(JSON.stringify(artifact), /Bearer|password|client-secret/iu);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('should reject a changed candidate title before persisting evidence', () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), 'porta-p1-baseline-drift-'));
  const requirement = p1BaselineRequirements.find((entry) => entry.caseId === 'ST-53');
  assert.ok(requirement);
  const runtime: BaselineRuntimeDependencies = {
    inspectProvenance: () => fixtureProvenance,
    createRunId: () => '33333333-3333-4333-8333-333333333333',
    now: () => new Date('2026-08-20T00:00:00.000Z'),
  };
  try {
    for (const candidate of requirement.candidates) {
      const candidatePath = resolve(sandbox, candidate.path);
      mkdirSync(resolve(candidatePath, '..'), { recursive: true });
      writeFileSync(candidatePath, 'test("changed title", () => undefined);');
    }
    assert.throws(
      () => recordP1Baseline(sandbox, 'ST-53', runtime),
      /candidate title no longer matches/u,
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
