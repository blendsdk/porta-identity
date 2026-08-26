import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createProtocolBaselineResult,
  protocolBaselineCaseIds,
  recordProtocolBaseline,
  type BaselineRuntimeDependencies,
} from '../baseline/index.js';

/** Fixed clean-source identity for filesystem tests that must not depend on the caller's Git state. */
const fixtureProvenance = {
  commitIdentity: `commit:${'1'.repeat(40)}`,
  treeIdentity: `tree:${'2'.repeat(40)}`,
  assuranceToolDigest: `sha256:${'3'.repeat(64)}`,
};

test('should classify every protocol case as natural red without a product verdict', () => {
  for (const caseId of protocolBaselineCaseIds) {
    const result = createProtocolBaselineResult(
      caseId,
      '11111111-1111-4111-8111-111111111111',
      '2026-08-18T00:00:00.000Z',
      fixtureProvenance,
    );
    assert.equal(result.classification, 'natural-red');
    assert.equal(result.reason, 'missing-exact-live-sentinel');
    assert.equal(result.productFailureObserved, false);
    assert.equal(result.oracleChanged, false);
    assert.equal(result.selectedSentinel, null);
    assert.ok(result.candidates.every((candidate) => !candidate.eligible));
  }
});

test('should bind protocol cases to their exact claim set and candidate audit', () => {
  const authorization = createProtocolBaselineResult(
    'ST-33',
    '11111111-1111-4111-8111-111111111111',
    '2026-08-18T00:00:00.000Z',
    fixtureProvenance,
  );
  const context = createProtocolBaselineResult(
    'ST-41',
    '11111111-1111-4111-8111-111111111111',
    '2026-08-18T00:00:00.000Z',
    fixtureProvenance,
  );
  assert.deepEqual(authorization.claimIds, ['CLAIM-R5-04']);
  assert.deepEqual(context.claimIds, ['CLAIM-R5-04', 'CLAIM-R5-05']);
  assert.ok(
    authorization.candidates.some((candidate) =>
      candidate.rejectionReasons.includes('broad-status-oracle'),
    ),
  );
  assert.equal(context.candidateAbsence, 'no-exact-e2e-or-pentest-candidate');
});

test('should write one owner-only protocol artifact after validating audited candidates', () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), 'porta-protocol-baseline-'));
  const runtime: BaselineRuntimeDependencies = {
    inspectProvenance: () => fixtureProvenance,
    createRunId: () => '11111111-1111-4111-8111-111111111111',
    now: () => new Date('2026-08-18T00:00:00.000Z'),
  };
  try {
    for (const path of [
      'packages/server/tests/pentest/oidc-attacks/pkce-bypass.test.ts',
      'packages/server/tests/pentest/oidc-attacks/redirect-uri-manipulation.test.ts',
    ]) {
      mkdirSync(resolve(sandbox, path, '..'), { recursive: true });
      writeFileSync(resolve(sandbox, path), readFileSync(resolve(process.cwd(), path)));
    }
    const recorded = recordProtocolBaseline(sandbox, 'ST-33', runtime);
    const artifact: unknown = JSON.parse(readFileSync(recorded.artifactPath, 'utf8'));
    assert.deepEqual(artifact, recorded.result);
    assert.equal(lstatSync(recorded.artifactPath).mode & 0o777, 0o600);
    assert.doesNotMatch(JSON.stringify(artifact), /Bearer|password|client-secret/iu);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
