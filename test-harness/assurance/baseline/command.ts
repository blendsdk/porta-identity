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
import {
  baselineCandidatesForCase,
  humanAuthBaselineCandidatesForCase,
  p1BaselineCandidatesForCase,
  protocolBaselineCandidatesForCase,
} from './catalog.js';
import {
  humanAuthBaselineResultSchema,
  isHumanAuthBaselineCaseId,
  isP1BaselineCaseId,
  isProtocolBaselineCaseId,
  isTenantAdminBaselineCaseId,
  protocolBaselineResultSchema,
  p1BaselineResultSchema,
  tenantAdminBaselineResultSchema,
  type BaselineProvenance,
  type HumanAuthBaselineCaseId,
  type HumanAuthBaselineResult,
  type P1BaselineCaseId,
  type P1BaselineResult,
  type ProtocolBaselineCaseId,
  type ProtocolBaselineResult,
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

/** Successful protocol baseline recording with its exact owned artifact path. */
export interface RecordedProtocolBaseline {
  /** Validated protocol baseline evidence. */
  readonly result: ProtocolBaselineResult;
  /** Absolute canonical path of the owner-only JSON artifact. */
  readonly artifactPath: string;
}

/** Successful human-authentication baseline recording with its exact owned artifact path. */
export interface RecordedHumanAuthBaseline {
  /** Validated human-authentication baseline evidence. */
  readonly result: HumanAuthBaselineResult;
  /** Absolute canonical path of the owner-only JSON artifact. */
  readonly artifactPath: string;
}

/** Successful P1 baseline recording with its exact owned artifact path. */
export interface RecordedP1Baseline {
  /** Validated P1 baseline evidence. */
  readonly result: P1BaselineResult;
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
function verifyCandidatePaths(
  repositoryRoot: string,
  candidates: readonly { readonly path: string; readonly testTitle: string }[],
): void {
  for (const candidate of candidates) {
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

/** Maps one protocol case to the assurance claims its exact live sentinel must support. */
function protocolClaimIds(
  caseId: ProtocolBaselineCaseId,
): readonly ('CLAIM-R5-04' | 'CLAIM-R5-05')[] {
  if (caseId === 'ST-41') return ['CLAIM-R5-04', 'CLAIM-R5-05'];
  if (caseId === 'ST-33' || caseId === 'ST-34' || caseId === 'ST-35') {
    return ['CLAIM-R5-04'];
  }
  return ['CLAIM-R5-05'];
}

/** Maps one human-authentication case to its requirement-owned claim. */
function humanAuthClaimIds(
  caseId: HumanAuthBaselineCaseId,
): readonly ('CLAIM-R5-06' | 'CLAIM-R5-07')[] {
  return caseId === 'ST-42' || caseId === 'ST-43' || caseId === 'ST-44' || caseId === 'ST-45'
    ? ['CLAIM-R5-06']
    : ['CLAIM-R5-07'];
}

/** Maps one P1 case to the requirement claims it must eventually support. */
function p1ClaimIds(
  caseId: P1BaselineCaseId,
): readonly ('CLAIM-R5-08' | 'CLAIM-R5-09' | 'CLAIM-R5-10')[] {
  if (['ST-57', 'ST-58', 'ST-59', 'ST-60', 'ST-61'].includes(caseId)) {
    return ['CLAIM-R5-09'];
  }
  return ['ST-52', 'ST-55', 'ST-56'].includes(caseId)
    ? ['CLAIM-R5-08', 'CLAIM-R5-10']
    : ['CLAIM-R5-08'];
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

/** Persists one validated baseline result beneath its UUID and case owner directories. */
function writeBaselineResult<T extends { readonly runId: string; readonly caseId: string }>(
  canonicalRoot: string,
  result: T,
): string {
  const resultsRoot = resolve(canonicalRoot, 'test-harness/.assurance-results');
  mkdirSync(resultsRoot, { recursive: true, mode: 0o700 });
  requireCanonicalDirectory(resultsRoot);
  const runDirectory = resolve(resultsRoot, result.runId);
  try {
    mkdirSync(runDirectory, { mode: 0o700 });
    requireCanonicalDirectory(runDirectory);
    const baselineDirectory = resolve(runDirectory, 'baseline');
    mkdirSync(baselineDirectory, { mode: 0o700 });
    requireCanonicalDirectory(baselineDirectory);
    const caseDirectory = resolve(baselineDirectory, result.caseId);
    mkdirSync(caseDirectory, { mode: 0o700 });
    requireCanonicalDirectory(caseDirectory);
    const artifactPath = resolve(caseDirectory, 'result.json');
    writeAtomic(artifactPath, renderJson(result));
    return artifactPath;
  } catch (error) {
    rmSync(runDirectory, { recursive: true, force: true });
    throw error;
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

/** Creates strict missing-sentinel evidence for one registered protocol case. */
export function createProtocolBaselineResult(
  caseId: string,
  runId: string,
  recordedAt: string,
  provenance: BaselineProvenance,
): ProtocolBaselineResult {
  if (!isProtocolBaselineCaseId(caseId)) {
    throw new Error('expected a registered protocol baseline case');
  }
  const candidates = protocolBaselineCandidatesForCase(caseId);
  return protocolBaselineResultSchema.parse({
    version: 1,
    runId,
    caseId,
    claimIds: protocolClaimIds(caseId),
    classification: 'natural-red',
    reason: 'missing-exact-live-sentinel',
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

/** Creates strict natural-RED evidence for one registered human-authentication case. */
export function createHumanAuthBaselineResult(
  caseId: string,
  runId: string,
  recordedAt: string,
  provenance: BaselineProvenance,
): HumanAuthBaselineResult {
  if (!isHumanAuthBaselineCaseId(caseId)) {
    throw new Error('expected a registered human-authentication baseline case');
  }
  const candidates = humanAuthBaselineCandidatesForCase(caseId);
  return humanAuthBaselineResultSchema.parse({
    version: 1,
    runId,
    caseId,
    claimIds: humanAuthClaimIds(caseId),
    classification: 'natural-red',
    reason: 'missing-exact-human-auth-sentinel',
    productFailureObserved: false,
    oracleChanged: false,
    selectedSentinel: null,
    candidates,
    candidateAbsence: candidates.length === 0 ? 'no-exact-e2e-pentest-or-ui-candidate' : null,
    recordedAt,
    buildIdentity: provenance.commitIdentity,
    treeIdentity: provenance.treeIdentity,
    assuranceToolDigest: provenance.assuranceToolDigest,
  });
}

/** Creates strict natural-RED evidence for one registered P1 case. */
export function createP1BaselineResult(
  caseId: string,
  runId: string,
  recordedAt: string,
  provenance: BaselineProvenance,
): P1BaselineResult {
  if (!isP1BaselineCaseId(caseId)) {
    throw new Error('expected a registered P1 baseline case');
  }
  return p1BaselineResultSchema.parse({
    version: 1,
    runId,
    caseId,
    claimIds: p1ClaimIds(caseId),
    classification: 'natural-red',
    reason: 'missing-exact-p1-sentinel',
    productFailureObserved: false,
    oracleChanged: false,
    selectedSentinel: null,
    candidates: p1BaselineCandidatesForCase(caseId),
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
  verifyCandidatePaths(canonicalRoot, baselineCandidatesForCase(caseId));
  const runId = dependencies.createRunId();
  const result = createTenantAdminBaselineResult(
    caseId,
    runId,
    dependencies.now().toISOString(),
    provenance,
  );

  return { result, artifactPath: writeBaselineResult(canonicalRoot, result) };
}

/**
 * Records one provenance-bound protocol baseline beneath the ignored assurance result root.
 *
 * @throws When provenance is dirty, the selector is unknown, a candidate changed, or persistence
 * fails.
 */
export function recordProtocolBaseline(
  repositoryRoot: string,
  caseId: string,
  dependencies: BaselineRuntimeDependencies = defaultRuntimeDependencies,
): RecordedProtocolBaseline {
  const canonicalRoot = realpathSync(repositoryRoot);
  if (!isProtocolBaselineCaseId(caseId)) {
    throw new Error('expected a registered protocol baseline case');
  }
  const provenance = dependencies.inspectProvenance(canonicalRoot);
  verifyCandidatePaths(canonicalRoot, protocolBaselineCandidatesForCase(caseId));
  const runId = dependencies.createRunId();
  const result = createProtocolBaselineResult(
    caseId,
    runId,
    dependencies.now().toISOString(),
    provenance,
  );
  return { result, artifactPath: writeBaselineResult(canonicalRoot, result) };
}

/**
 * Records one provenance-bound human-authentication baseline beneath the ignored result root.
 *
 * @throws When provenance is dirty, the selector is unknown, a candidate changed, or persistence
 * fails.
 */
export function recordHumanAuthBaseline(
  repositoryRoot: string,
  caseId: string,
  dependencies: BaselineRuntimeDependencies = defaultRuntimeDependencies,
): RecordedHumanAuthBaseline {
  const canonicalRoot = realpathSync(repositoryRoot);
  if (!isHumanAuthBaselineCaseId(caseId)) {
    throw new Error('expected a registered human-authentication baseline case');
  }
  const provenance = dependencies.inspectProvenance(canonicalRoot);
  verifyCandidatePaths(canonicalRoot, humanAuthBaselineCandidatesForCase(caseId));
  const runId = dependencies.createRunId();
  const result = createHumanAuthBaselineResult(
    caseId,
    runId,
    dependencies.now().toISOString(),
    provenance,
  );
  return { result, artifactPath: writeBaselineResult(canonicalRoot, result) };
}

/**
 * Records one provenance-bound P1 baseline beneath the ignored assurance result root.
 *
 * @throws When provenance is dirty, the selector is unknown, a candidate changed, or persistence
 * fails.
 */
export function recordP1Baseline(
  repositoryRoot: string,
  caseId: string,
  dependencies: BaselineRuntimeDependencies = defaultRuntimeDependencies,
): RecordedP1Baseline {
  const canonicalRoot = realpathSync(repositoryRoot);
  if (!isP1BaselineCaseId(caseId)) {
    throw new Error('expected a registered P1 baseline case');
  }
  const provenance = dependencies.inspectProvenance(canonicalRoot);
  verifyCandidatePaths(canonicalRoot, p1BaselineCandidatesForCase(caseId));
  const runId = dependencies.createRunId();
  const result = createP1BaselineResult(
    caseId,
    runId,
    dependencies.now().toISOString(),
    provenance,
  );
  return { result, artifactPath: writeBaselineResult(canonicalRoot, result) };
}
