import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createHumanAuthBaselineResult,
  humanAuthBaselineCaseIds,
  recordHumanAuthBaseline,
} from '../baseline/index.js';
import { humanAuthBaselineRequirements } from './human-auth-baseline-requirements.js';

import type { BaselineRuntimeDependencies } from '../baseline/index.js';

/** Fixed source identity keeps filesystem tests independent from the caller's Git state. */
const fixtureProvenance = {
  commitIdentity: `commit:${'1'.repeat(40)}`,
  treeIdentity: `tree:${'2'.repeat(40)}`,
  assuranceToolDigest: `sha256:${'3'.repeat(64)}`,
};

test('should preserve the requirement-owned audit in every natural-red result', () => {
  for (const requirement of humanAuthBaselineRequirements) {
    const result = createHumanAuthBaselineResult(
      requirement.caseId,
      '22222222-2222-4222-8222-222222222222',
      '2026-08-20T00:00:00.000Z',
      fixtureProvenance,
    );
    assert.deepEqual(result.claimIds, requirement.claimIds, requirement.caseId);
    assert.equal(result.classification, requirement.classification, requirement.caseId);
    assert.equal(result.reason, requirement.reason, requirement.caseId);
    assert.equal(result.selectedSentinel, null, requirement.caseId);
    assert.equal(result.productFailureObserved, false, requirement.caseId);
    assert.deepEqual(result.candidates, requirement.candidates, requirement.caseId);
    assert.equal(
      result.candidateAbsence,
      requirement.candidates.length === 0 ? 'no-exact-e2e-pentest-or-ui-candidate' : null,
      requirement.caseId,
    );
  }
});

test('should reject unknown human-authentication baseline selectors', () => {
  assert.throws(
    () =>
      createHumanAuthBaselineResult(
        'ST-99',
        '22222222-2222-4222-8222-222222222222',
        '2026-08-20T00:00:00.000Z',
        fixtureProvenance,
      ),
    /registered human-authentication baseline case/u,
  );
});

test('should write one owner-only baseline after revalidating audited candidate titles', () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), 'porta-human-auth-baseline-'));
  const requirement = humanAuthBaselineRequirements.find((entry) => entry.caseId === 'ST-42');
  assert.ok(requirement);
  const runtime: BaselineRuntimeDependencies = {
    inspectProvenance: () => fixtureProvenance,
    createRunId: () => '22222222-2222-4222-8222-222222222222',
    now: () => new Date('2026-08-20T00:00:00.000Z'),
  };
  try {
    for (const candidate of requirement.candidates) {
      const candidatePath = resolve(sandbox, candidate.path);
      mkdirSync(resolve(candidatePath, '..'), { recursive: true });
      writeFileSync(candidatePath, `test(${JSON.stringify(candidate.testTitle)}, () => {});\n`);
    }
    const recorded = recordHumanAuthBaseline(sandbox, 'ST-42', runtime);
    const artifact: unknown = JSON.parse(readFileSync(recorded.artifactPath, 'utf8'));
    assert.deepEqual(artifact, recorded.result);
    assert.equal(lstatSync(recorded.artifactPath).mode & 0o777, 0o600);
    assert.doesNotMatch(JSON.stringify(artifact), /Bearer|password-value|client-secret/iu);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('should expose the exact seven registered human-authentication cases', () => {
  assert.deepEqual(humanAuthBaselineCaseIds, [
    'ST-42',
    'ST-43',
    'ST-44',
    'ST-45',
    'ST-46',
    'ST-47',
    'ST-48',
  ]);
});
