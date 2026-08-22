import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { z } from 'zod';

import type {
  AssuranceRatchetsContract,
  RatchetCoverageDecision,
  RatchetCoverageObservation,
  RiskSliceFloorInput,
  StalenessDecision,
  StalenessTrigger,
} from '../tests/assurance-ratchets-contract.js';
import type {
  AssuranceRatchetBaseline,
  GovernedCoverageProvenance,
  GovernedCoverageRatchetEvidence,
  RepositoryStalenessResult,
} from './model.js';

/** Canonical versioned baseline path. */
const baselinePath = 'test-harness/assurance/ratchet-baselines.json';

/** Canonical executable traceability path used to map requirements to claims. */
const traceabilityPath = 'test-harness/assurance/traceability.json';

/** Exact count schema used by all four coverage metrics. */
const metricCountSchema = z.object({
  covered: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

/** Closed baseline schema that makes review and no-promotion metadata mandatory. */
const assuranceRatchetBaselineSchema = z.object({
  version: z.literal(1),
  coverage: z.object({
    sourceRevision: z.string().regex(/^[0-9a-f]{40}$/u),
    sourceRunId: z.uuid(),
    summaryDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    normalizedPathCount: z.number().int().positive(),
    normalizedPathDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    counts: z.object({
      statements: metricCountSchema,
      branches: metricCountSchema,
      functions: metricCountSchema,
      lines: metricCountSchema,
    }),
    enforcement: z.literal('local-observation-only'),
    promotionAuthorized: z.literal(false),
  }),
  monitoredInputs: z.record(
    z.enum(['requirement-r5', 'fixture', 'dependency', 'sentinel']),
    z.object({
      paths: z.array(z.string().min(1)).min(1),
      digest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
      affectedRequirementPrefix: z.enum(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', '*']),
    }),
  ),
  review: z.object({
    reviewId: z.string().min(1),
    reviewedAt: z.iso.datetime({ offset: true }),
    reviewedBy: z.string().min(1),
    reason: z.string().min(1),
    sourceArtifact: z.string().min(1),
    promotionAuthorized: z.literal(false),
  }),
});

const captureManifestSchema = z.object({
  version: z.literal(1),
  runId: z.uuid(),
  project: z.literal('security'),
  profile: z.enum(['operational', 'production-security']),
  revision: z.string().regex(/^[0-9a-f]{40}$/u),
  dependencyLockDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  sourceTreeDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  flushStatus: z.literal('complete'),
});

const coverageObservationSchema = z.object({
  version: z.literal(1),
  mode: z.literal('observation'),
  blocking: z.literal(false),
  ordinaryVerificationExitCode: z.literal(0),
  normalizedPaths: z.array(z.string().min(1)).min(1),
  totals: z.object({
    statements: metricCountSchema,
    branches: metricCountSchema,
    functions: metricCountSchema,
    lines: metricCountSchema,
  }),
});

/** Returns whether a value is a non-array object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads and validates the complete reviewed baseline without accepting partial metadata. */
export function loadAssuranceRatchetBaseline(repositoryRoot: string): AssuranceRatchetBaseline {
  const root = realpathSync(repositoryRoot);
  const parsed: unknown = JSON.parse(readFileSync(resolve(root, baselinePath), 'utf8'));
  return assuranceRatchetBaselineSchema.parse(parsed);
}

/** Hashes one ordered path set without retaining file contents in evidence. */
export function digestMonitoredPaths(repositoryRoot: string, paths: readonly string[]): string {
  const root = realpathSync(repositoryRoot);
  const digest = createHash('sha256');
  for (const path of paths) {
    if (!/^[a-z0-9][a-zA-Z0-9._/-]*$/u.test(path) || path.includes('..')) {
      throw new Error('monitored ratchet path is invalid');
    }
    digest.update(path);
    digest.update('\0');
    digest.update(readFileSync(resolve(root, path)));
    digest.update('\0');
  }
  return `sha256:${digest.digest('hex')}`;
}

/** Evaluates exact counts against one already validated local baseline. */
function evaluateCoverage(
  baseline: AssuranceRatchetBaseline,
  observation: RatchetCoverageObservation,
): RatchetCoverageDecision {
  const metrics = ['statements', 'branches', 'functions', 'lines'] as const;
  for (const metric of metrics) {
    const expected = baseline.coverage.counts[metric];
    const actual = observation.counts[metric];
    if (actual.covered < expected.covered && actual.total === expected.total) {
      return {
        accepted: false,
        reason: 'covered-count-reduction',
        metric,
        promotionAuthorized: false,
      };
    }
    if (actual.total !== expected.total) {
      return {
        accepted: false,
        reason: 'unreviewed-total-change',
        metric,
        promotionAuthorized: false,
      };
    }
  }
  if (observation.normalizedPathCount !== baseline.coverage.normalizedPathCount) {
    return {
      accepted: false,
      reason: 'unreviewed-total-change',
      metric: 'lines',
      promotionAuthorized: false,
    };
  }
  if (observation.normalizedPathDigest !== baseline.coverage.normalizedPathDigest) {
    return {
      accepted: false,
      reason: 'unreviewed-path-change',
      promotionAuthorized: false,
    };
  }
  return { accepted: true, reason: 'exact-baseline', promotionAuthorized: false };
}

/** Produces the reviewed domain-separated identity of one ordered normalized source path set. */
export function digestNormalizedCoveragePaths(paths: readonly string[]): string {
  const digest = createHash('sha256');
  digest.update('porta-assurance-normalized-paths-v1\0');
  let previous: string | undefined;
  for (const path of paths) {
    if (
      !/^[a-z0-9][a-zA-Z0-9._/-]*$/u.test(path) ||
      path.includes('..') ||
      (previous !== undefined && previous.localeCompare(path) >= 0)
    ) {
      throw new Error('coverage normalized paths must be unique canonical ordered paths');
    }
    digest.update(path);
    digest.update('\0');
    previous = path;
  }
  return `sha256:${digest.digest('hex')}`;
}

/** Resolves one selected run-owned file without following a symlink or escaping its UUID root. */
function resolveCoverageFile(repositoryRoot: string, runId: string, relativePath: string): string {
  if (!z.uuid().safeParse(runId).success) throw new Error('coverage run ID must be a UUID');
  const resultsRoot = resolve(repositoryRoot, 'test-harness/.assurance-results');
  const runRoot = resolve(resultsRoot, runId);
  const path = resolve(runRoot, relativePath);
  const relation = relative(runRoot, path);
  if (relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error('coverage evidence escapes its selected run');
  }
  if (!lstatSync(path).isFile() || realpathSync(path) !== path) {
    throw new Error('coverage evidence must be a canonical regular file');
  }
  return path;
}

/** Loads, provenance-checks, and evaluates one explicitly selected coverage observation. */
export function evaluateGovernedCoverageObservation(
  repositoryRoot: string,
  coverageRunId: string,
  expected: GovernedCoverageProvenance,
): GovernedCoverageRatchetEvidence {
  const root = realpathSync(repositoryRoot);
  const baseline = loadAssuranceRatchetBaseline(root);
  const candidateRoots = ['coverage/security/operational', 'coverage/security/production-security'];
  const existingRoots = candidateRoots.filter((candidate) => {
    try {
      resolveCoverageFile(root, coverageRunId, `${candidate}/capture-manifest.json`);
      resolveCoverageFile(root, coverageRunId, `${candidate}/report/coverage-observation.json`);
      return true;
    } catch {
      return false;
    }
  });
  if (existingRoots.length !== 1) {
    throw new Error(
      'selected coverage run must contain exactly one registered security observation',
    );
  }
  const coverageRoot = existingRoots[0] ?? '';
  const manifestPath = resolveCoverageFile(
    root,
    coverageRunId,
    `${coverageRoot}/capture-manifest.json`,
  );
  const observationPath = resolveCoverageFile(
    root,
    coverageRunId,
    `${coverageRoot}/report/coverage-observation.json`,
  );
  const manifest = captureManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
  if (
    manifest.runId !== coverageRunId ||
    coverageRoot !== `coverage/${manifest.project}/${manifest.profile}` ||
    manifest.revision !== expected.revision ||
    manifest.dependencyLockDigest !== expected.dependencyLockDigest ||
    manifest.sourceTreeDigest !== expected.sourceTreeDigest
  ) {
    throw new Error('coverage observation provenance does not match the current clean source');
  }
  const observationBytes = readFileSync(observationPath);
  const observation = coverageObservationSchema.parse(
    JSON.parse(observationBytes.toString('utf8')),
  );
  const normalizedPathDigest = digestNormalizedCoveragePaths(observation.normalizedPaths);
  const decision = evaluateCoverage(baseline, {
    sourceRevision: manifest.revision,
    normalizedPathCount: observation.normalizedPaths.length,
    normalizedPathDigest,
    counts: observation.totals,
  });
  return Object.freeze({
    baseline: Object.freeze({
      sourceRunId: baseline.coverage.sourceRunId,
      sourceRevision: baseline.coverage.sourceRevision,
      summaryDigest: baseline.coverage.summaryDigest,
    }),
    observation: Object.freeze({
      sourceRunId: coverageRunId,
      project: manifest.project,
      profile: manifest.profile,
      sourceRevision: manifest.revision,
      sourceTreeDigest: manifest.sourceTreeDigest,
      dependencyLockDigest: manifest.dependencyLockDigest,
      summaryDigest: `sha256:${createHash('sha256').update(observationBytes).digest('hex')}`,
    }),
    decision,
    promotionAuthorized: false,
  });
}

/** Requires an accepted decision while returning the sanitized evidence for report retention. */
export function requireAcceptedGovernedCoverageObservation(
  repositoryRoot: string,
  coverageRunId: string,
  expected: GovernedCoverageProvenance,
): GovernedCoverageRatchetEvidence {
  const evidence = evaluateGovernedCoverageObservation(repositoryRoot, coverageRunId, expected);
  if (!evidence.decision.accepted) {
    throw new Error(`coverage ratchet rejected observation: ${evidence.decision.reason}`);
  }
  return evidence;
}

/** Maps traceability requirements to exact claim identifiers. */
function claimsForPrefix(repositoryRoot: string, prefix: `R${number}` | '*'): readonly string[] {
  const parsed: unknown = JSON.parse(
    readFileSync(resolve(repositoryRoot, traceabilityPath), 'utf8'),
  );
  if (!isRecord(parsed) || !Array.isArray(parsed.mappings)) {
    throw new Error('traceability mappings are invalid');
  }
  const claims = new Set<string>();
  for (const mapping of parsed.mappings) {
    if (
      !isRecord(mapping) ||
      typeof mapping.requirement !== 'string' ||
      typeof mapping.claim !== 'string'
    ) {
      throw new Error('traceability mapping is invalid');
    }
    if (prefix === '*' || mapping.requirement.startsWith(`${prefix}.`)) claims.add(mapping.claim);
  }
  if (claims.size === 0) throw new Error('staleness trigger resolved no affected claims');
  return Object.freeze([...claims].sort());
}

/** Creates the live ratchet contract from repository-reviewed metadata. */
export function createAssuranceRatchets(repositoryRoot: string): AssuranceRatchetsContract {
  const root = realpathSync(repositoryRoot);
  const baseline = loadAssuranceRatchetBaseline(root);
  return Object.freeze({
    evaluateCoverage: (observation: RatchetCoverageObservation) =>
      evaluateCoverage(baseline, observation),
    mayIncreaseSliceFloor(input: RiskSliceFloorInput): boolean {
      return (
        Number.isSafeInteger(input.currentFloor) &&
        Number.isSafeInteger(input.proposedFloor) &&
        input.currentFloor >= 0 &&
        input.proposedFloor > input.currentFloor &&
        input.claimsClosed &&
        input.sensitivityComplete
      );
    },
    evaluateStaleness(trigger: StalenessTrigger, observedDigest: string): StalenessDecision {
      const monitored = baseline.monitoredInputs[trigger];
      const changed = observedDigest !== monitored.digest;
      return Object.freeze({
        trigger,
        affectedClaims: claimsForPrefix(root, monitored.affectedRequirementPrefix),
        resultingStatus: changed ? 'stale' : 'current',
        reportAllowed: !changed,
      });
    },
  });
}

/** Inspects all monitored repository inputs before a governed report may succeed. */
export function inspectRepositoryStaleness(repositoryRoot: string): RepositoryStalenessResult {
  const root = realpathSync(repositoryRoot);
  const baseline = loadAssuranceRatchetBaseline(root);
  const contract = createAssuranceRatchets(root);
  const changedInputs: StalenessTrigger[] = [];
  const staleClaims = new Set<string>();
  for (const trigger of ['requirement-r5', 'fixture', 'dependency', 'sentinel'] as const) {
    const monitored = baseline.monitoredInputs[trigger];
    const currentDigest = digestMonitoredPaths(root, monitored.paths);
    const decision = contract.evaluateStaleness(trigger, currentDigest);
    if (decision.resultingStatus === 'stale') {
      changedInputs.push(trigger);
      for (const claim of decision.affectedClaims) staleClaims.add(claim);
    }
  }
  return Object.freeze({
    staleClaims: Object.freeze([...staleClaims].sort()),
    changedInputs: Object.freeze(changedInputs),
    reportAllowed: staleClaims.size === 0,
  });
}

/** Rejects governed reporting until every changed monitored input receives reviewed metadata. */
export function requireCurrentAssuranceInputs(repositoryRoot: string): void {
  const result = inspectRepositoryStaleness(repositoryRoot);
  if (!result.reportAllowed) {
    throw new Error(
      `assurance claims are stale: inputs=${result.changedInputs.join(',')} claims=${result.staleClaims.length}`,
    );
  }
}
