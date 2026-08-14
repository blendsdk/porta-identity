import { randomUUID } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { renderJson } from '../scripts/render-summary.js';
import { inspectFoundationProvenance } from '../scripts/source-provenance.js';
import { baselineCandidatesForCase } from './catalog.js';
import {
  isTenantAdminBaselineCaseId,
  tenantAdminBaselineResultSchema,
  type BaselineProvenance,
  type TenantAdminBaselineCaseId,
  type TenantAdminBaselineResult,
} from './model.js';

/** Runtime dependencies isolated so filesystem behavior can be tested without weakening provenance. */
export interface BaselineRuntimeDependencies {
  /** Proves the source tree and assurance tooling are clean and immutable. */
  readonly inspectProvenance: (repositoryRoot: string) => BaselineProvenance;
  /** Creates the UUID that owns one result directory. */
  readonly createRunId: () => string;
  /** Supplies the evidence timestamp. */
  readonly now: () => Date;
}

/** Successful baseline recording with its exact owned artifact path. */
export interface RecordedTenantAdminBaseline {
  /** Validated baseline evidence. */
  readonly result: TenantAdminBaselineResult;
  /** Absolute canonical path of the owner-only JSON artifact. */
  readonly artifactPath: string;
}

/** Default fail-closed runtime dependencies used by the root command. */
const defaultRuntimeDependencies: BaselineRuntimeDependencies = {
  inspectProvenance: inspectFoundationProvenance,
  createRunId: randomUUID,
  now: () => new Date(),
};

/** Requires a real directory at its expected canonical path. */
function requireCanonicalDirectory(path: string): void {
  if (!lstatSync(path).isDirectory() || realpathSync(path) !== path) {
    throw new Error('baseline evidence directory must be canonical');
  }
}

/** Verifies every audited candidate is a canonical regular file inside the repository. */
function verifyCandidatePaths(repositoryRoot: string, caseId: TenantAdminBaselineCaseId): void {
  for (const candidate of baselineCandidatesForCase(caseId)) {
    const candidatePath = resolve(repositoryRoot, candidate.path);
    const fromRoot = relative(repositoryRoot, candidatePath);
    if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new Error('baseline candidate escapes the repository');
    }
    if (!lstatSync(candidatePath).isFile() || realpathSync(candidatePath) !== candidatePath) {
      throw new Error('baseline candidate must be a canonical regular file');
    }
    if (!readFileSync(candidatePath, 'utf8').includes(candidate.testTitle)) {
      throw new Error('baseline candidate title no longer matches the audited test');
    }
  }
}

/** Writes one rendered artifact atomically with owner-only permissions. */
function writeAtomic(path: string, content: string): void {
  const temporaryPath = `${path}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

/**
 * Creates one strict missing-sentinel result without inferring a Porta product failure.
 *
 * The selected case must belong to the tenant/admin slice. Every candidate remains explicitly
 * ineligible until a later live adapter proves the complete external boundary.
 */
export function createTenantAdminBaselineResult(
  caseId: string,
  runId: string,
  recordedAt: string,
  provenance: BaselineProvenance,
): TenantAdminBaselineResult {
  if (!isTenantAdminBaselineCaseId(caseId)) {
    throw new Error('expected a registered tenant/admin baseline case');
  }
  const candidates = baselineCandidatesForCase(caseId);
  return tenantAdminBaselineResultSchema.parse({
    version: 1,
    runId,
    caseId,
    claimId: 'CLAIM-R5-03',
    classification: 'natural-red',
    reason: 'missing-live-sentinel',
    productFailureObserved: false,
    oracleChanged: false,
    selectedSentinel: null,
    candidates,
    candidateAbsence: candidates.length === 0 ? 'no-exact-e2e-or-pentest-candidate' : null,
    recordedAt,
    buildIdentity: provenance.commitIdentity,
    treeIdentity: provenance.treeIdentity,
    assuranceToolDigest: provenance.assuranceToolDigest,
  });
}

/**
 * Records one provenance-bound tenant/admin baseline beneath the ignored assurance result root.
 *
 * @throws When the source tree is dirty, the selector is unknown, an audited candidate changed
 * shape, or the owned artifact cannot be safely created.
 */
export function recordTenantAdminBaseline(
  repositoryRoot: string,
  caseId: string,
  dependencies: BaselineRuntimeDependencies = defaultRuntimeDependencies,
): RecordedTenantAdminBaseline {
  const canonicalRoot = realpathSync(repositoryRoot);
  if (!isTenantAdminBaselineCaseId(caseId)) {
    throw new Error('expected a registered tenant/admin baseline case');
  }
  const provenance = dependencies.inspectProvenance(canonicalRoot);
  verifyCandidatePaths(canonicalRoot, caseId);
  const runId = dependencies.createRunId();
  const result = createTenantAdminBaselineResult(
    caseId,
    runId,
    dependencies.now().toISOString(),
    provenance,
  );

  const resultsRoot = resolve(canonicalRoot, 'test-harness/.assurance-results');
  mkdirSync(resultsRoot, { recursive: true, mode: 0o700 });
  requireCanonicalDirectory(resultsRoot);
  const runDirectory = resolve(resultsRoot, runId);
  try {
    mkdirSync(runDirectory, { mode: 0o700 });
    requireCanonicalDirectory(runDirectory);
    const baselineDirectory = resolve(runDirectory, 'baseline');
    mkdirSync(baselineDirectory, { mode: 0o700 });
    requireCanonicalDirectory(baselineDirectory);
    const caseDirectory = resolve(baselineDirectory, caseId);
    mkdirSync(caseDirectory, { mode: 0o700 });
    requireCanonicalDirectory(caseDirectory);
    const artifactPath = resolve(caseDirectory, 'result.json');
    writeAtomic(artifactPath, renderJson(result));
    return { result, artifactPath };
  } catch (error) {
    rmSync(runDirectory, { recursive: true, force: true });
    throw error;
  }
}
