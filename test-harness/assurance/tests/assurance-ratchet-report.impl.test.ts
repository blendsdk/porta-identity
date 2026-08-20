import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  digestNormalizedCoveragePaths,
  loadAssuranceRatchetBaseline,
  requireAcceptedGovernedCoverageObservation,
} from '../ratchets/index.js';

const regressionRunId = '10000000-0000-4000-8000-000000000001';
const staleRunId = '10000000-0000-4000-8000-000000000002';

function createSandbox(): string {
  const sandbox = mkdtempSync(resolve(tmpdir(), 'porta-ratchet-report-'));
  const assuranceRoot = resolve(sandbox, 'test-harness/assurance');
  mkdirSync(assuranceRoot, { recursive: true });
  const baseline = structuredClone(loadAssuranceRatchetBaseline(process.cwd()));
  const normalizedPaths = Array.from(
    { length: baseline.coverage.normalizedPathCount },
    (_, index) => `packages/server/src/file-${String(index).padStart(3, '0')}.ts`,
  );
  Object.assign(baseline.coverage, {
    normalizedPathDigest: digestNormalizedCoveragePaths(normalizedPaths),
  });
  writeFileSync(resolve(assuranceRoot, 'ratchet-baselines.json'), JSON.stringify(baseline));
  return sandbox;
}

function writeObservation(
  repositoryRoot: string,
  runId: string,
  revision: string,
  branchCoveredDelta: number,
  substitutePath = false,
): Readonly<{ revision: string; dependencyLockDigest: string; sourceTreeDigest: string }> {
  const baseline = loadAssuranceRatchetBaseline(repositoryRoot);
  const dependencyLockDigest = `sha256:${'b'.repeat(64)}`;
  const sourceTreeDigest = `sha256:${'c'.repeat(64)}`;
  const root = resolve(
    repositoryRoot,
    'test-harness/.assurance-results',
    runId,
    'coverage/security/operational',
  );
  mkdirSync(resolve(root, 'report'), { recursive: true });
  writeFileSync(
    resolve(root, 'capture-manifest.json'),
    JSON.stringify({
      version: 1,
      runId,
      project: 'security',
      profile: 'operational',
      revision,
      dependencyLockDigest,
      sourceTreeDigest,
      flushStatus: 'complete',
    }),
  );
  writeFileSync(
    resolve(root, 'report/coverage-observation.json'),
    JSON.stringify({
      version: 1,
      mode: 'observation',
      blocking: false,
      ordinaryVerificationExitCode: 0,
      normalizedPaths: Array.from({ length: baseline.coverage.normalizedPathCount }, (_, index) =>
        substitutePath && index === baseline.coverage.normalizedPathCount - 1
          ? 'packages/server/src/substituted.ts'
          : `packages/server/src/file-${String(index).padStart(3, '0')}.ts`,
      ),
      totals: {
        ...baseline.coverage.counts,
        branches: {
          ...baseline.coverage.counts.branches,
          covered: baseline.coverage.counts.branches.covered + branchCoveredDelta,
        },
      },
    }),
  );
  return { revision, dependencyLockDigest, sourceTreeDigest };
}

test('should fail governed reporting for a one-branch covered-count regression', () => {
  const repositoryRoot = createSandbox();
  const provenance = writeObservation(repositoryRoot, regressionRunId, 'a'.repeat(40), -1);
  try {
    assert.throws(
      () => requireAcceptedGovernedCoverageObservation(repositoryRoot, regressionRunId, provenance),
      /covered-count-reduction/u,
    );
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test('should reject a same-count normalized path substitution', () => {
  const repositoryRoot = createSandbox();
  const provenance = writeObservation(repositoryRoot, regressionRunId, 'a'.repeat(40), 0, true);
  try {
    assert.throws(
      () => requireAcceptedGovernedCoverageObservation(repositoryRoot, regressionRunId, provenance),
      /unreviewed-path-change/u,
    );
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test('should fail closed when selected coverage provenance is stale or mismatched', () => {
  const repositoryRoot = createSandbox();
  const provenance = writeObservation(repositoryRoot, staleRunId, 'd'.repeat(40), 0);
  try {
    const evidence = requireAcceptedGovernedCoverageObservation(
      repositoryRoot,
      staleRunId,
      provenance,
    );
    assert.equal(evidence.decision.accepted, true);
    assert.equal(
      evidence.baseline.sourceRevision,
      loadAssuranceRatchetBaseline(repositoryRoot).coverage.sourceRevision,
    );
    assert.equal(evidence.observation.sourceRevision, provenance.revision);
    assert.equal(evidence.observation.profile, 'operational');
    assert.match(evidence.observation.summaryDigest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(evidence.promotionAuthorized, false);

    assert.throws(
      () =>
        requireAcceptedGovernedCoverageObservation(repositoryRoot, staleRunId, {
          ...provenance,
          revision: 'e'.repeat(40),
        }),
      /provenance does not match/u,
    );
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});
