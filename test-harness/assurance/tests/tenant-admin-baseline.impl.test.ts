import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createTenantAdminBaselineResult,
  recordTenantAdminBaseline,
  tenantAdminBaselineCaseIds,
  type BaselineRuntimeDependencies,
} from '../baseline/index.js';

/** Fixed source identity used by filesystem tests without depending on the caller's Git state. */
const fixtureProvenance = {
  commitIdentity: `commit:${'1'.repeat(40)}`,
  treeIdentity: `tree:${'2'.repeat(40)}`,
  assuranceToolDigest: `sha256:${'3'.repeat(64)}`,
};

test('should classify every tenant/admin case as missing live evidence without a product verdict', () => {
  assert.deepEqual(tenantAdminBaselineCaseIds, ['ST-28', 'ST-29', 'ST-30', 'ST-31', 'ST-32']);

  for (const caseId of tenantAdminBaselineCaseIds) {
    const result = createTenantAdminBaselineResult(
      caseId,
      '00000000-0000-4000-8000-000000000001',
      '2026-08-14T09:45:00.000Z',
      fixtureProvenance,
    );

    assert.equal(result.claimId, 'CLAIM-R5-03');
    assert.equal(result.classification, 'natural-red');
    assert.equal(result.reason, 'missing-live-sentinel');
    assert.equal(result.productFailureObserved, false);
    assert.equal(result.oracleChanged, false);
    assert.equal(result.selectedSentinel, null);
    assert.ok(result.candidates.every((candidate) => candidate.eligible === false));
  }
});

test('should retain exact rejection reasons for audited E2E and pentest candidates', () => {
  const crossTenant = createTenantAdminBaselineResult(
    'ST-28',
    '00000000-0000-4000-8000-000000000001',
    '2026-08-14T09:45:00.000Z',
    fixtureProvenance,
  );
  const staleAuthority = createTenantAdminBaselineResult(
    'ST-31',
    '00000000-0000-4000-8000-000000000001',
    '2026-08-14T09:45:00.000Z',
    fixtureProvenance,
  );

  assert.ok(crossTenant.candidates.length > 0);
  assert.ok(
    crossTenant.candidates.some((candidate) =>
      candidate.rejectionReasons.includes('authentication-denial-before-handler'),
    ),
  );
  assert.equal(staleAuthority.candidates.length, 0);
  assert.equal(staleAuthority.candidateAbsence, 'no-exact-e2e-or-pentest-candidate');
});

test('should reject an unregistered case before creating evidence', () => {
  assert.throws(
    () =>
      createTenantAdminBaselineResult(
        'ST-27',
        '00000000-0000-4000-8000-000000000001',
        '2026-08-14T09:45:00.000Z',
        fixtureProvenance,
      ),
    /registered tenant\/admin baseline case/u,
  );
});

test('should write one owner-only sanitized artifact after validating candidate paths', () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), 'porta-baseline-'));
  const runtime: BaselineRuntimeDependencies = {
    inspectProvenance: () => fixtureProvenance,
    createRunId: () => '00000000-0000-4000-8000-000000000001',
    now: () => new Date('2026-08-14T09:45:00.000Z'),
  };
  try {
    for (const path of [
      'packages/server/tests/pentest/admin-security/privilege-escalation.test.ts',
      'packages/server/tests/pentest/admin-security/idor.test.ts',
      'packages/server/tests/pentest/oidc-client-auth/client-auth.test.ts',
      'packages/server/tests/pentest/admin-security/two-factor-admin.test.ts',
    ]) {
      mkdirSync(resolve(sandbox, path, '..'), { recursive: true });
      writeFileSync(resolve(sandbox, path), readFileSync(resolve(process.cwd(), path)));
    }

    const recorded = recordTenantAdminBaseline(sandbox, 'ST-28', runtime);
    const artifact = JSON.parse(readFileSync(recorded.artifactPath, 'utf8'));

    assert.equal(recorded.result.caseId, 'ST-28');
    assert.equal(artifact.reason, 'missing-live-sentinel');
    assert.equal(artifact.productFailureObserved, false);
    assert.equal(lstatSync(recorded.artifactPath).mode & 0o777, 0o600);
    assert.doesNotMatch(JSON.stringify(artifact), /Bearer|password|client-secret/iu);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
