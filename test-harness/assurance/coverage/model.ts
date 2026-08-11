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
