/**
 * Declaration-only contract for attributed Porta server-process V8 coverage.
 *
 * Runtime capture and conversion are intentionally absent while immutable specifications define
 * the evidence boundary.
 */

/** Exact V8 script classification required before conversion. */
export type CoverageScriptClassification =
  'first-party' | 'node-internal' | 'dependency' | 'unexpected-local';

/** Exact process and build provenance bound to every raw V8 record. */
export interface CoverageProvenance {
  /** Source revision used to build the image. */
  readonly revision: string;
  /** Immutable container image digest. */
  readonly imageDigest: string;
  /** Digest of source maps used for conversion. */
  readonly sourceMapDigest: string;
  /** Durable identity of the covered Porta Node process. */
  readonly processIdentity: string;
}

/** Raw V8 script record emitted by one attributed Porta process. */
export interface RawCoverageScript {
  /** Script URL recorded by V8. */
  readonly url: string;
  /** Process/build provenance for this record. */
  readonly provenance?: CoverageProvenance;
  /** Opaque raw range fixture used by the planned converter. */
  readonly ranges: readonly Readonly<{ startOffset: number; endOffset: number; count: number }>[];
}

/** Complete raw envelope for one fixed-seed harness execution. */
export interface RawCoverageEnvelope {
  /** Fixed deterministic harness seed. */
  readonly seed: string;
  /** Whether graceful Node termination flushed complete process records. */
  readonly flushStatus: 'complete' | 'incomplete' | 'invalid';
  /** Raw scripts across every attributed Porta process. */
  readonly scripts: readonly RawCoverageScript[];
}

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

/** Classification result for every raw script. */
export interface ClassifiedCoverageScript {
  /** Original raw script URL. */
  readonly url: string;
  /** Required exhaustive classification. */
  readonly classification: CoverageScriptClassification;
  /** Whether this script is eligible Porta output under `/app/dist`. */
  readonly eligible: boolean;
  /** Provenance copied from the raw record after validation. */
  readonly provenance?: CoverageProvenance;
}

/** Result of classification and provenance validation. */
export interface CoverageClassificationResult {
  /** Every input script, in stable input order. */
  readonly scripts: readonly ClassifiedCoverageScript[];
  /** Whether conversion is rejected before any baseline can be recorded. */
  readonly rejected: boolean;
  /** Stable rejection reason. */
  readonly rejectionReason?: 'unexpected-local-script' | 'missing-provenance' | 'incomplete-flush';
}

/** Exact mapped metric counts. */
export interface ExactCoverageCounts {
  /** Covered and total statement counts. */
  readonly statements: Readonly<{ covered: number; total: number }>;
  /** Covered and total branch counts. */
  readonly branches: Readonly<{ covered: number; total: number }>;
  /** Covered and total function counts. */
  readonly functions: Readonly<{ covered: number; total: number }>;
  /** Covered and total line counts. */
  readonly lines: Readonly<{ covered: number; total: number }>;
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

/** Converted attributed coverage artifact. */
export interface ConvertedCoverageArtifact {
  /** Merger implementation required for multi-process raw records. */
  readonly merger: '@bcoe/v8-coverage';
  /** Normalized eligible TypeScript paths. */
  readonly normalizedPaths: readonly string[];
  /** Exact aggregate counts. */
  readonly totals: ExactCoverageCounts;
  /** Exact counts by mapped TypeScript file. */
  readonly files: Readonly<Record<string, ExactCoverageCounts>>;
  /** Covered mapped lines by TypeScript file. */
  readonly coveredLines: Readonly<Record<string, readonly number[]>>;
  /** Uncovered mapped lines by TypeScript file. */
  readonly uncoveredLines: Readonly<Record<string, readonly number[]>>;
  /** Every declared exclusion with its reason. */
  readonly exclusions: readonly Readonly<{ url: string; reason: string }>[];
  /** Every eligible input that could not be mapped. */
  readonly unmapped: readonly Readonly<{ url: string; reason: string }>[];
  /** Whether machine-readable JSON output was produced. */
  readonly jsonProduced: boolean;
  /** Whether human-readable HTML output was produced. */
  readonly htmlProduced: boolean;
}

/** Conversion result that refuses untrusted provenance or mapping. */
export interface CoverageConversionResult {
  /** Whether conversion evidence is accepted. */
  readonly accepted: boolean;
  /** Converted artifact when accepted. */
  readonly artifact?: ConvertedCoverageArtifact;
  /** Exclusions recorded even when another input rejects conversion. */
  readonly exclusions: readonly Readonly<{ url: string; reason: string }>[];
  /** Unmapped inputs recorded even when conversion is rejected. */
  readonly unmapped: readonly Readonly<{ url: string; reason: string }>[];
  /** Stable reason when conversion is rejected. */
  readonly rejectionReason?:
    'revision-mismatch' | 'source-map-mismatch' | 'image-mismatch' | 'unmapped-eligible-input';
}

/** Threshold observation that cannot fail ordinary verification in the observation phase. */
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

/** Future governed-lane decision contract specified now but implemented in the later policy phase. */
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

/** Transparent planned boundary consumed by immutable coverage specifications. */
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

/** Creates the planned attributed-coverage contract fixture. */
export function createCoverageAttributionContract(): CoverageAttributionContract;
