import type {
  CoverageProvenance,
  ExactCoverageCounts,
  ManualMappingOracle,
  RawCoverageEnvelope,
} from './coverage-attribution-planned.js';

/** Fixed seed shared by reproducibility and raw-envelope specifications. */
export const coverageSeed = 'porta-coverage-spike-seed-v1';

/** Exact build/process provenance for the attributed spike fixture. */
export const expectedCoverageProvenance: CoverageProvenance = {
  revision: '0123456789abcdef0123456789abcdef01234567',
  imageDigest: `sha256:${'a'.repeat(64)}`,
  sourceMapDigest: `sha256:${'b'.repeat(64)}`,
  processIdentity: 'pid:42001:start:1731280000000',
};

/** Exact manually sampled TypeScript mapping for the known executed/unexecuted branch fixture. */
export const manualMappingOracle: ManualMappingOracle = {
  sourcePath: 'src/coverage-spike.ts',
  coveredLines: [4, 5, 9],
  uncoveredLines: [7, 12],
  counts: {
    statements: { covered: 3, total: 5 },
    branches: { covered: 2, total: 4 },
    functions: { covered: 1, total: 2 },
    lines: { covered: 3, total: 5 },
  },
};

/** Creates one trusted raw envelope for classification and mismatch cases. */
export function trustedRawEnvelope(): RawCoverageEnvelope {
  return {
    seed: coverageSeed,
    flushStatus: 'complete',
    scripts: [
      {
        url: '/app/dist/coverage-spike.js',
        provenance: expectedCoverageProvenance,
        ranges: [{ startOffset: 0, endOffset: 120, count: 1 }],
      },
      {
        url: 'node:internal/process/task_queues',
        provenance: expectedCoverageProvenance,
        ranges: [{ startOffset: 0, endOffset: 20, count: 1 }],
      },
      {
        url: '/app/node_modules/koa/lib/application.js',
        provenance: expectedCoverageProvenance,
        ranges: [{ startOffset: 0, endOffset: 40, count: 1 }],
      },
    ],
  };
}

/** Returns exact totals in a stable metric order for comparison assertions. */
export function exactCountsVector(counts: ExactCoverageCounts): readonly number[] {
  return [
    counts.statements.covered,
    counts.statements.total,
    counts.branches.covered,
    counts.branches.total,
    counts.functions.covered,
    counts.functions.total,
    counts.lines.covered,
    counts.lines.total,
  ];
}
