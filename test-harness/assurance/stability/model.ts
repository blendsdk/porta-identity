import type {
  StabilityAttemptClassification,
  StabilityCommand,
  StabilitySequenceResult,
} from '../tests/stability-campaign-contract.js';

/** Stable ownership categories for one visible stability attempt. */
export type StabilityFailureOwner =
  'none' | 'candidate-test' | 'campaign-setup' | 'timeout' | 'signal' | 'cleanup';

/** One code-owned candidate executed by the stability campaign. */
export interface RegisteredStabilityCandidate {
  /** Command category selected at the root alias. */
  readonly command: StabilityCommand;
  /** Versioned identity retained in evidence. */
  readonly candidateId: string;
  /** Internal dispatcher selector represented by this candidate. */
  readonly selector: string;
  /** Exact repository-relative Node test file executed by every attempt. */
  readonly testFile: string;
  /** Explicit boundary that prevents command or product overclaiming. */
  readonly qualificationScope: 'assurance-protocol-candidate';
}

/** Sanitized evidence for one shell-free child execution. */
export interface StabilityAttemptEvidence {
  /** One-based attempt ordinal. */
  readonly ordinal: number;
  /** Registered deterministic seed supplied to the child. */
  readonly seed: string;
  /** Terminal classification used by the sequence state machine. */
  readonly classification: StabilityAttemptClassification;
  /** Stable owner of a non-clean result. */
  readonly failureOwner: StabilityFailureOwner;
  /** Child exit code when a normal numeric status was observed. */
  readonly exitCode?: number;
  /** Monotonic elapsed milliseconds rounded to an integer. */
  readonly durationMilliseconds: number;
}

/** Owner-only aggregate emitted by one candidate campaign. */
export interface StabilityCampaignArtifact {
  /** Artifact schema version. */
  readonly schemaVersion: 1;
  /** UUID owning this evidence run. */
  readonly runId: string;
  /** Exact registered candidate metadata. */
  readonly candidate: RegisteredStabilityCandidate;
  /** Registered versioned seed-set identity. */
  readonly seedSet: string;
  /** Required clean sequence length. */
  readonly requiredConsecutiveExecutions: 100;
  /** Maximum visible attempt count. */
  readonly maximumAttempts: 125;
  /** Per-attempt child deadline. */
  readonly attemptDeadlineMilliseconds: 420000;
  /** Source commit used by every attempt. */
  readonly commitIdentity: string;
  /** Source tree used by every attempt. */
  readonly treeIdentity: string;
  /** Assurance tooling digest used by every attempt. */
  readonly assuranceToolDigest: string;
  /** Frozen dependency-lock digest. */
  readonly dependencyLockDigest: string;
  /** Every attempt, including retries and invalid runs, in execution order. */
  readonly attempts: readonly StabilityAttemptEvidence[];
  /** State-machine result derived from the complete attempt list. */
  readonly sequence: StabilitySequenceResult;
  /** Median attempt duration in milliseconds. */
  readonly p50RuntimeMilliseconds: number;
  /** Ninety-fifth percentile attempt duration in milliseconds. */
  readonly p95RuntimeMilliseconds: number;
  /** Fraction of attempts classified invalid, incomplete, or cancelled. */
  readonly invalidRunRate: number;
  /** Whether no hidden child retry occurred inside an attempt. */
  readonly noHiddenRetry: true;
  /** Whether source provenance remained unchanged through publication. */
  readonly primaryTreeUnchanged: boolean;
  /** Whether every child process group and campaign resource is absent. */
  readonly zeroOwnedResidue: boolean;
  /** Exact owner-only mode required for this file. */
  readonly artifactMode: 384;
  /** Stability evidence never grants workflow or policy promotion. */
  readonly promotionAuthorized: false;
  /** Final stable command exit code. */
  readonly exitCode: number;
}

/** Result returned to the root dispatcher after evidence publication. */
export interface StabilityCampaignResult {
  /** UUID owning the completed run. */
  readonly runId: string;
  /** Registered candidate identity. */
  readonly candidateId: string;
  /** Whether the complete sequence qualified. */
  readonly qualified: boolean;
  /** Stable root-command exit code. */
  readonly exitCode: number;
  /** Repository-relative retained artifact path. */
  readonly artifactPath: string;
}
