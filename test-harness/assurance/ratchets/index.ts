import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import type {
  AssuranceRatchetsContract,
  RatchetCoverageDecision,
  RatchetCoverageObservation,
  RiskSliceFloorInput,
  StalenessDecision,
  StalenessTrigger,
} from '../tests/assurance-ratchets-contract.js';
import type { AssuranceRatchetBaseline, RepositoryStalenessResult } from './model.js';

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
  if (observation.sourceRevision !== baseline.coverage.sourceRevision) {
    return { accepted: false, reason: 'stale-source-revision', promotionAuthorized: false };
  }
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
  return { accepted: true, reason: 'exact-baseline', promotionAuthorized: false };
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
