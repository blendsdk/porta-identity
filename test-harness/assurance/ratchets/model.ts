import type {
  RatchetCoverageCounts,
  StalenessTrigger,
} from '../tests/assurance-ratchets-contract.js';

/** Reviewed identity and claim scope for one staleness input. */
export interface MonitoredRatchetInput {
  /** Canonical repository-relative files included in the digest. */
  readonly paths: readonly string[];
  /** Reviewed aggregate SHA-256 digest. */
  readonly digest: string;
  /** Requirement prefix whose mapped claims become stale, or every claim. */
  readonly affectedRequirementPrefix: `R${number}` | '*';
}

/** Versioned local baseline loaded from the repository. */
export interface AssuranceRatchetBaseline {
  /** Baseline schema version. */
  readonly version: 1;
  /** Exact attributed coverage observation. */
  readonly coverage: {
    readonly sourceRevision: string;
    readonly sourceRunId: string;
    readonly summaryDigest: string;
    readonly normalizedPathCount: number;
    readonly counts: RatchetCoverageCounts;
    readonly enforcement: 'local-observation-only';
    readonly promotionAuthorized: false;
  };
  /** Inputs that reopen affected assurance conclusions. */
  readonly monitoredInputs: Readonly<Record<StalenessTrigger, MonitoredRatchetInput>>;
  /** Mandatory human-readable review metadata for this exact baseline. */
  readonly review: {
    readonly reviewId: string;
    readonly reviewedAt: string;
    readonly reviewedBy: string;
    readonly reason: string;
    readonly sourceArtifact: string;
    readonly promotionAuthorized: false;
  };
}

/** Complete current-state result checked before governed reporting. */
export interface RepositoryStalenessResult {
  /** Claim identifiers made stale by changed monitored inputs. */
  readonly staleClaims: readonly string[];
  /** Changed input classes in stable order. */
  readonly changedInputs: readonly StalenessTrigger[];
  /** Whether a governed report may continue. */
  readonly reportAllowed: boolean;
}
