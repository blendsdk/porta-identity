/** Exhaustive classification applied to every V8 script before conversion. */
export type CoverageScriptClassification =
  'first-party' | 'node-internal' | 'dependency' | 'unexpected-local';

/** Exact process and build provenance attached to every normalized script. */
export interface CoverageProvenance {
  /** Source revision used to build the image. */
  readonly revision: string;
  /** Immutable Docker image identifier. */
  readonly imageDigest: string;
  /** Digest of the compiled output and source maps retained from the image. */
  readonly sourceMapDigest: string;
  /** Durable identity of the covered Porta process. */
  readonly processIdentity: string;
}

/** One V8 execution range normalized from a raw function record. */
export interface RawCoverageRange {
  /** Inclusive UTF-16 start offset. */
  readonly startOffset: number;
  /** Exclusive UTF-16 end offset. */
  readonly endOffset: number;
  /** V8 execution count. */
  readonly count: number;
}

/** One raw V8 function record preserved for merging and conversion. */
export interface RawFunctionCoverage {
  /** V8 function name, which may be empty for the top-level script. */
  readonly functionName: string;
  /** Nested execution ranges. */
  readonly ranges: readonly RawCoverageRange[];
  /** Whether V8 emitted block-level coverage for this function. */
  readonly isBlockCoverage: boolean;
}

/** One raw script record with normalized provenance. */
export interface RawCoverageScript {
  /** V8 script identifier within its process record. */
  readonly scriptId?: string;
  /** Script URL emitted by V8. */
  readonly url: string;
  /** Provenance attached by the trusted capture envelope. */
  readonly provenance?: CoverageProvenance;
  /** Flattened ranges used by simple classification fixtures. */
  readonly ranges: readonly RawCoverageRange[];
  /** Original V8 function records used by the converter. */
  readonly functions?: readonly RawFunctionCoverage[];
}

/** Complete normalized raw envelope for one fixed-seed capture. */
export interface RawCoverageEnvelope {
  /** Fixed deterministic harness seed. */
  readonly seed: string;
  /** Whether graceful Node termination flushed complete data. */
  readonly flushStatus: 'complete' | 'incomplete' | 'invalid';
  /** Every script from every captured Porta process. */
  readonly scripts: readonly RawCoverageScript[];
  /** Original process boundaries retained for duplicate-process merging. */
  readonly processes?: readonly RawCoverageProcess[];
}

/** One complete V8 process record retained before cross-process merging. */
export interface RawCoverageProcess {
  /** Scripts emitted by one attributed Porta process. */
  readonly scripts: readonly RawCoverageScript[];
}

/** Classification result for one raw script. */
export interface ClassifiedCoverageScript {
  /** Original raw script URL. */
  readonly url: string;
  /** Exhaustive stable category. */
  readonly classification: CoverageScriptClassification;
  /** Whether the script contributes to Porta coverage. */
  readonly eligible: boolean;
  /** Validated provenance retained for conversion. */
  readonly provenance?: CoverageProvenance;
  /** Stable explanation for the classification. */
  readonly reason: string;
}

/** Exhaustive classification and provenance-validation outcome. */
export interface CoverageClassificationResult {
  /** One result for every input script in stable input order. */
  readonly scripts: readonly ClassifiedCoverageScript[];
  /** Whether conversion must stop. */
  readonly rejected: boolean;
  /** Stable primary rejection reason. */
  readonly rejectionReason?: 'unexpected-local-script' | 'missing-provenance' | 'incomplete-flush';
}

/** Exact covered and total counts for every reported metric. */
export interface ExactCoverageCounts {
  /** Covered and total statement counts. */
  readonly statements: Readonly<{ covered: number; total: number }>;
  /** Covered and total branch counts. */
  readonly branches: Readonly<{ covered: number; total: number }>;
  /** Covered and total function counts. */
  readonly functions: Readonly<{ covered: number; total: number }>;
  /** Covered and total source-line counts. */
  readonly lines: Readonly<{ covered: number; total: number }>;
}

/** One accepted, source-mapped coverage artifact. */
export interface ConvertedCoverageArtifact {
  /** Merger used before source-map conversion. */
  readonly merger: '@bcoe/v8-coverage';
  /** Stable repository-relative TypeScript source paths. */
  readonly normalizedPaths: readonly string[];
  /** Aggregate exact counts. */
  readonly totals: ExactCoverageCounts;
  /** Exact counts by source file. */
  readonly files: Readonly<Record<string, ExactCoverageCounts>>;
  /** Covered source lines by file. */
  readonly coveredLines: Readonly<Record<string, readonly number[]>>;
  /** Uncovered source lines by file. */
  readonly uncoveredLines: Readonly<Record<string, readonly number[]>>;
  /** Every deliberately excluded runtime or dependency script. */
  readonly exclusions: readonly Readonly<{ url: string; reason: string }>[];
  /** Every eligible script that could not be mapped. */
  readonly unmapped: readonly Readonly<{ url: string; reason: string }>[];
  /** Whether the machine-readable report was written. */
  readonly jsonProduced: boolean;
  /** Whether the human-readable report was written. */
  readonly htmlProduced: boolean;
}

/** Non-enforcing exact-count snapshot emitted while the project is in observation mode. */
export interface CoverageObservationSummary {
  /** Summary schema version. */
  readonly version: 1;
  /** Explicit policy state that prevents this artifact from becoming an implicit gate. */
  readonly mode: 'observation';
  /** Observation artifacts never block ordinary verification. */
  readonly blocking: false;
  /** Ordinary verification result associated with a threshold miss during observation. */
  readonly ordinaryVerificationExitCode: 0;
  /** Stable source path set used for reproducibility comparison. */
  readonly normalizedPaths: readonly string[];
  /** Aggregate exact covered and total counts. */
  readonly totals: ExactCoverageCounts;
  /** Per-file exact counts used to distinguish path-set equality from aggregate cancellation. */
  readonly files: Readonly<Record<string, ExactCoverageCounts>>;
}

/** Result of provenance validation, merging, and source-map conversion. */
export interface CoverageConversionResult {
  /** Whether the resulting evidence is acceptable. */
  readonly accepted: boolean;
  /** Converted artifact when accepted. */
  readonly artifact?: ConvertedCoverageArtifact;
  /** Declared exclusions preserved on both success and failure. */
  readonly exclusions: readonly Readonly<{ url: string; reason: string }>[];
  /** Eligible inputs that could not be mapped. */
  readonly unmapped: readonly Readonly<{ url: string; reason: string }>[];
  /** Stable rejection reason. */
  readonly rejectionReason?:
    'revision-mismatch' | 'source-map-mismatch' | 'image-mismatch' | 'unmapped-eligible-input';
}
