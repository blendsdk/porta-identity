/** Commands whose representative assurance protocols may be stability-qualified. */
export type StabilityCommand = 'test' | 'harness' | 'coverage' | 'fault' | 'compat';

/** Terminal classifications retained for every visible campaign attempt. */
export type StabilityAttemptClassification =
  'completed' | 'flaky' | 'invalid' | 'incomplete' | 'cancelled';

/** One bounded attempt supplied to the campaign state machine. */
export interface StabilityAttemptInput {
  /** One-based attempt ordinal. */
  readonly ordinal: number;
  /** Deterministic registered seed selected for this attempt. */
  readonly seed: string;
  /** Terminal classification observed from the child command. */
  readonly classification: StabilityAttemptClassification;
}

/** Qualification result derived from a complete visible attempt sequence. */
export interface StabilitySequenceResult {
  /** Whether the candidate met the complete zero-flake contract. */
  readonly qualified: boolean;
  /** Longest uninterrupted sequence of clean completed attempts. */
  readonly longestConsecutiveCompleted: number;
  /** Clean completed attempts at the end of the supplied sequence. */
  readonly finalConsecutiveCompleted: number;
  /** Number of times a non-clean outcome reset the active sequence. */
  readonly sequenceResetCount: number;
  /** Whether any candidate failure occurred, even if later attempts passed. */
  readonly flakeObserved: boolean;
}

/** Closed candidate metadata exposed to immutable stability specifications. */
export interface StabilityCandidateContract {
  /** Exact root command selector accepted by the stability dispatcher. */
  readonly command: StabilityCommand;
  /** Stable candidate identifier stored in evidence. */
  readonly candidateId: string;
  /** Registered internal selector exercised by each attempt. */
  readonly selector: string;
  /** Explicit evidence boundary that prevents live-handler overclaiming. */
  readonly qualificationScope: 'assurance-protocol-candidate';
}

/** Public stability campaign seam consumed by requirements-derived specifications. */
export interface StabilityCampaignContract {
  /** Returns the exact registered candidate for one command and seed set. */
  candidate(command: StabilityCommand, seedSet: string): StabilityCandidateContract;
  /** Returns the deterministic shuffled seed order for the registered set. */
  seeds(seedSet: string): readonly string[];
  /** Reduces visible attempts under the frozen qualification rules. */
  evaluate(attempts: readonly StabilityAttemptInput[]): StabilitySequenceResult;
}
