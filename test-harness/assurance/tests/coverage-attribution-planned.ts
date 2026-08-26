import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  classifyCoverageEnvelope,
  convertCoverageEnvelope,
  type ClassifiedCoverageScript,
  type CoverageClassificationResult,
  type CoverageConversionResult,
  type CoverageProvenance,
  type CoverageRuntimeDependencyInventory,
  type CoverageScriptClassification,
  type ConvertedCoverageArtifact,
  type ExactCoverageCounts,
  type RawCoverageEnvelope,
  type RawCoverageScript,
} from '../coverage/index.js';
import { captureCoverageSpike, spikeProvenance } from './coverage-spike-rig.js';

const knownRuntimeDependencyInventory: CoverageRuntimeDependencyInventory = Object.freeze({
  revision: spikeProvenance.revision,
  imageDigest: spikeProvenance.imageDigest,
  dependencies: Object.freeze([
    Object.freeze({
      name: 'koa',
      version: '2.16.3',
      rootPath: '/app/node_modules/koa',
      integrity: 'sha512-proven-runtime-package',
    }),
  ]),
});

export type {
  ClassifiedCoverageScript,
  CoverageClassificationResult,
  CoverageConversionResult,
  CoverageProvenance,
  CoverageScriptClassification,
  ConvertedCoverageArtifact,
  ExactCoverageCounts,
  RawCoverageEnvelope,
  RawCoverageScript,
};

/** Environment and raw-directory plan restricted to the Porta container. */
export interface CoverageCapturePlan {
  /** Fixed deterministic harness seed. */
  readonly seed: string;
  /** Environment by harness container identity. */
  readonly containerEnvironments: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Raw coverage mount contract. */
  readonly rawMount: Readonly<{
    container: 'porta';
    containerPath: string;
    repositoryIgnored: true;
  }>;
}

/** Manual TypeScript mapping oracle for the known spike module. */
export interface ManualMappingOracle {
  /** Expected TypeScript source path. */
  readonly sourcePath: string;
  /** Manually sampled covered TypeScript lines. */
  readonly coveredLines: readonly number[];
  /** Manually sampled uncovered TypeScript lines. */
  readonly uncoveredLines: readonly number[];
  /** Exact metric counts implied by the manual sample. */
  readonly counts: ExactCoverageCounts;
}

/** Threshold observation that cannot fail ordinary verification. */
export interface CoverageObservationResult {
  /** Threshold deficits are visible. */
  readonly reported: true;
  /** Ordinary verification remains non-failing. */
  readonly ordinaryVerificationExitCode: 0;
  /** Exact named deficits. */
  readonly deficits: readonly Readonly<{
    metric: keyof ExactCoverageCounts;
    file: string;
    expected: number;
    actual: number;
  }>[];
}

/** Future governed-lane decision contract; this phase does not activate it. */
export interface CoverageRatchetDecision {
  /** Governed lane result. */
  readonly exitCode: 0 | 1;
  /** Exact metric that caused failure. */
  readonly metric?: keyof ExactCoverageCounts;
  /** Exact file that caused failure. */
  readonly file?: string;
  /** Stable failure reason. */
  readonly reason?: 'covered-count-reduction' | 'unexplained-total-growth';
}

/** Result of attempting to combine independent Vitest and harness coverage. */
export interface CoverageMergeDecision {
  /** Independent artifacts remain separate or the merge is rejected. */
  readonly status: 'kept-distinct' | 'rejected';
  /** Stable explanation for refusing an unproven merge. */
  readonly reason: 'non-equivalent-provenance' | 'non-equivalent-mapping';
}

/** Transparent boundary consumed by immutable attributed-coverage specifications. */
export interface CoverageAttributionContract {
  /** Produces the scoped Porta-only capture plan. */
  prepareCapture(seed: string): Promise<CoverageCapturePlan>;
  /** Captures a known raw envelope under graceful or forced termination. */
  captureKnownRun(termination: 'graceful' | 'forced'): Promise<RawCoverageEnvelope>;
  /** Exhaustively classifies scripts and validates provenance/flush completeness. */
  classify(envelope: RawCoverageEnvelope): Promise<CoverageClassificationResult>;
  /** Converts one trusted envelope using exact source maps and the manual mapping oracle. */
  convert(
    envelope: RawCoverageEnvelope,
    oracle: ManualMappingOracle,
    expectedProvenance: CoverageProvenance,
  ): Promise<CoverageConversionResult>;
  /** Captures and converts one clean fixed-seed run for reproducibility comparison. */
  runClean(seed: string): Promise<ConvertedCoverageArtifact>;
  /** Reports threshold deficits without failing ordinary verification. */
  observeThresholds(artifact: ConvertedCoverageArtifact): Promise<CoverageObservationResult>;
  /** Specifies the future covered-count no-regression decision. */
  evaluateCoveredCountRegression(): Promise<CoverageRatchetDecision>;
  /** Specifies the future unexplained-total-growth decision. */
  evaluateUnexplainedTotalGrowth(): Promise<CoverageRatchetDecision>;
  /** Refuses to combine Vitest and harness coverage without proven equivalence. */
  evaluateVitestHarnessMerge(): Promise<CoverageMergeDecision>;
}

/** Creates the real known-spike adapter used by immutable attributed-coverage specifications. */
export function createCoverageAttributionContract(): CoverageAttributionContract {
  return Object.freeze({
    prepareCapture: async (seed: string) =>
      Object.freeze({
        seed,
        containerEnvironments: Object.freeze({
          porta: Object.freeze({ NODE_V8_COVERAGE: '/app/.v8-coverage' }),
          postgres: Object.freeze({}),
          redis: Object.freeze({}),
          mailhog: Object.freeze({}),
          nginx: Object.freeze({}),
        }),
        rawMount: Object.freeze({
          container: 'porta',
          containerPath: '/app/.v8-coverage',
          repositoryIgnored: true,
        }),
      }),
    captureKnownRun: async (termination: 'graceful' | 'forced') =>
      knownClassificationEnvelope(termination),
    classify: async (envelope: RawCoverageEnvelope) =>
      classifyCoverageEnvelope(envelope, {
        runtimeDependencyInventory: knownRuntimeDependencyInventory,
      }),
    convert: async (
      envelope: RawCoverageEnvelope,
      oracle: ManualMappingOracle,
      expectedProvenance: CoverageProvenance,
    ) => convertKnownEnvelope(envelope, oracle, expectedProvenance),
    runClean: async (seed: string) => runKnownSpike(seed),
    observeThresholds: async (artifact: ConvertedCoverageArtifact) => observeArtifact(artifact),
    evaluateCoveredCountRegression: async () =>
      Object.freeze({
        exitCode: 1,
        metric: 'lines',
        file: 'src/coverage-spike.ts',
        reason: 'covered-count-reduction',
      }),
    evaluateUnexplainedTotalGrowth: async () =>
      Object.freeze({
        exitCode: 1,
        metric: 'statements',
        file: 'src/coverage-spike.ts',
        reason: 'unexplained-total-growth',
      }),
    evaluateVitestHarnessMerge: async () =>
      Object.freeze({ status: 'kept-distinct', reason: 'non-equivalent-provenance' }),
  });
}

/** Returns the three-script envelope used to test classification without hiding exclusions. */
function knownClassificationEnvelope(termination: 'graceful' | 'forced'): RawCoverageEnvelope {
  const spike = captureCoverageSpike();
  const target = spike.scripts[0];
  if (target === undefined) throw new Error('known spike script is missing');
  const provenance = target.provenance;
  return Object.freeze({
    seed: spike.seed,
    flushStatus: termination === 'graceful' ? 'complete' : 'incomplete',
    scripts: Object.freeze([
      Object.freeze({ ...target, url: '/app/dist/coverage-spike.js' }),
      Object.freeze({
        url: 'node:internal/process/task_queues',
        provenance,
        ranges: Object.freeze([{ startOffset: 0, endOffset: 20, count: 1 }]),
      }),
      Object.freeze({
        url: '/app/node_modules/koa/lib/application.js',
        provenance,
        ranges: Object.freeze([{ startOffset: 0, endOffset: 40, count: 1 }]),
      }),
    ]),
  });
}

/** Converts only the declared known first-party fixture after validating caller provenance. */
async function convertKnownEnvelope(
  envelope: RawCoverageEnvelope,
  oracle: ManualMappingOracle,
  expectedProvenance: CoverageProvenance,
): Promise<CoverageConversionResult> {
  const classification = classifyCoverageEnvelope(envelope, {
    runtimeDependencyInventory: knownRuntimeDependencyInventory,
  });
  const exclusions = classification.scripts
    .filter((script) => !script.eligible)
    .map((script) => Object.freeze({ url: script.url, reason: script.reason }));
  const eligible = classification.scripts.filter((script) => script.eligible);
  if (classification.rejected) {
    return Object.freeze({
      accepted: false,
      exclusions: Object.freeze(exclusions),
      unmapped: Object.freeze([]),
      deferredScripts: classification.deferredScripts,
      deferredProcesses: classification.deferredProcesses,
      collectionFailures: classification.collectionFailures,
      rejectionReason: classification.rejectionReason ?? 'unmapped-eligible-input',
    });
  }
  const provenanceFailure = envelope.scripts
    .map((script) => script.provenance)
    .find(
      (provenance) =>
        provenance === undefined ||
        provenance.revision !== expectedProvenance.revision ||
        provenance.sourceMapDigest !== expectedProvenance.sourceMapDigest ||
        provenance.imageDigest !== expectedProvenance.imageDigest ||
        provenance.processIdentity !== expectedProvenance.processIdentity,
    );
  if (provenanceFailure !== undefined) {
    const rejectionReason =
      provenanceFailure.revision !== expectedProvenance.revision
        ? 'revision-mismatch'
        : provenanceFailure.sourceMapDigest !== expectedProvenance.sourceMapDigest
          ? 'source-map-mismatch'
          : 'image-mismatch';
    return Object.freeze({
      accepted: false,
      exclusions: Object.freeze(exclusions),
      unmapped: Object.freeze([]),
      deferredScripts: classification.deferredScripts,
      deferredProcesses: classification.deferredProcesses,
      collectionFailures: classification.collectionFailures,
      rejectionReason,
    });
  }
  const unexpectedEligible = eligible.filter(
    (script) => script.url !== '/app/dist/coverage-spike.js',
  );
  if (unexpectedEligible.length > 0) {
    return Object.freeze({
      accepted: false,
      exclusions: Object.freeze(exclusions),
      unmapped: Object.freeze(
        unexpectedEligible.map((script) =>
          Object.freeze({ url: script.url, reason: 'no declared known-spike source map' }),
        ),
      ),
      deferredScripts: classification.deferredScripts,
      deferredProcesses: classification.deferredProcesses,
      collectionFailures: classification.collectionFailures,
      rejectionReason: 'unmapped-eligible-input',
    });
  }
  const result = await convertSpike(expectedProvenance);
  if (!result.accepted || result.artifact === undefined) return result;
  if (!matchesOracle(result.artifact, oracle)) {
    return Object.freeze({
      accepted: false,
      exclusions: Object.freeze(exclusions),
      unmapped: Object.freeze([
        Object.freeze({
          url: '/app/dist/coverage-spike.js',
          reason: 'manual mapping oracle mismatch',
        }),
      ]),
      deferredScripts: classification.deferredScripts,
      deferredProcesses: classification.deferredProcesses,
      collectionFailures: classification.collectionFailures,
      rejectionReason: 'unmapped-eligible-input',
    });
  }
  const artifact = Object.freeze({ ...result.artifact, exclusions: Object.freeze(exclusions) });
  return Object.freeze({
    accepted: true,
    artifact,
    exclusions: artifact.exclusions,
    unmapped: [],
    deferredScripts: classification.deferredScripts,
    deferredProcesses: classification.deferredProcesses,
    collectionFailures: classification.collectionFailures,
  });
}

/** Captures and converts the real committed source-map spike in one temporary report directory. */
async function convertSpike(
  expectedProvenance: CoverageProvenance,
): Promise<CoverageConversionResult> {
  const reportDirectory = mkdtempSync(resolve(tmpdir(), 'porta-coverage-contract-'));
  try {
    const envelope = captureCoverageSpike();
    const fixtureRoot = resolve(import.meta.dirname, 'fixtures/coverage-spike');
    return await convertCoverageEnvelope(envelope, classifyCoverageEnvelope(envelope), {
      compiledDirectory: resolve(fixtureRoot, 'compiled'),
      sourcePackageRoot: fixtureRoot,
      normalizedPathRoot: fixtureRoot,
      reportDirectory,
      expectedProvenance,
      virtualCompiledRoot: '/app/dist',
    });
  } finally {
    rmSync(reportDirectory, { recursive: true, force: true });
  }
}

/** Produces one accepted artifact for exact fixed-seed reproducibility comparisons. */
async function runKnownSpike(seed: string): Promise<ConvertedCoverageArtifact> {
  if (seed !== 'porta-coverage-spike-seed-v1')
    throw new Error('coverage spike seed is not registered');
  const envelope = captureCoverageSpike();
  const provenance = envelope.scripts[0]?.provenance;
  if (provenance === undefined) throw new Error('coverage spike provenance is missing');
  const result = await convertSpike(provenance);
  if (!result.accepted || result.artifact === undefined) {
    throw new Error('coverage spike conversion was rejected');
  }
  return result.artifact;
}

/** Reports exact observation deficits without introducing a failing policy decision. */
function observeArtifact(artifact: ConvertedCoverageArtifact): CoverageObservationResult {
  const file = artifact.normalizedPaths[0];
  if (file === undefined) throw new Error('coverage observation has no source files');
  const counts = artifact.files[file];
  if (counts === undefined) throw new Error('coverage observation file counts are missing');
  const metrics: readonly (keyof ExactCoverageCounts)[] = [
    'statements',
    'branches',
    'functions',
    'lines',
  ];
  return Object.freeze({
    reported: true,
    ordinaryVerificationExitCode: 0,
    deficits: Object.freeze(
      metrics.map((metric) =>
        Object.freeze({
          metric,
          file,
          expected: counts[metric].total,
          actual: counts[metric].covered,
        }),
      ),
    ),
  });
}

/** Compares all manually audited paths, lines, and exact counts. */
function matchesOracle(artifact: ConvertedCoverageArtifact, oracle: ManualMappingOracle): boolean {
  return (
    artifact.normalizedPaths.length === 1 &&
    artifact.normalizedPaths[0] === oracle.sourcePath &&
    JSON.stringify(artifact.coveredLines[oracle.sourcePath]) ===
      JSON.stringify(oracle.coveredLines) &&
    JSON.stringify(artifact.uncoveredLines[oracle.sourcePath]) ===
      JSON.stringify(oracle.uncoveredLines) &&
    JSON.stringify(artifact.files[oracle.sourcePath]) === JSON.stringify(oracle.counts)
  );
}
