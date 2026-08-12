/** Stable result categories emitted by one curated-fault tuple execution. */
export type FaultTupleClassification =
  'killed' | 'survived' | 'invalid' | 'infrastructure-failed' | 'timeout';

/** One claim-specific sentinel and exact failure signature owned by a fault. */
export interface PlannedFaultTuple {
  /** Assurance claim whose sensitivity this tuple may prove. */
  readonly claimId: string;
  /** Independently executable specification sentinel. */
  readonly sentinelId: string;
  /** Exact assertion marker required for a valid kill. */
  readonly expectedSignature: string;
}

/** Complete immutable identity and execution metadata for one curated fault. */
export interface PlannedFaultDefinition {
  /** Stable allowlisted fault identifier. */
  readonly id: string;
  /** Exact clean source revision accepted by the fault. */
  readonly targetRevision: string;
  /** Repository-relative regular file modified by the patch. */
  readonly targetPath: string;
  /** SHA-256 identity required before applying the patch. */
  readonly targetHash: string;
  /** Repository-relative reviewed patch artifact. */
  readonly patchPath: string;
  /** Shell-free build command identifier. */
  readonly buildCommand: string;
  /** Shell-free sentinel command identifier. */
  readonly executionCommand: string;
  /** Positive bounded runtime for one tuple. */
  readonly timeoutMilliseconds: number;
  /** Exact cleanup postcondition. */
  readonly cleanupVerification: string;
  /** Every claim-specific tuple independently supported by the fault. */
  readonly tuples: readonly PlannedFaultTuple[];
}

/** Controlled child observations supplied to the independent classification oracle. */
export interface PlannedFaultObservation {
  /** Stage at which execution stopped. */
  readonly stage: 'validation' | 'build' | 'startup' | 'fixture' | 'sentinel' | 'cleanup';
  /** Numeric child status when it exited normally. */
  readonly exitCode: number;
  /** Bounded assertion markers observed from the designated sentinel. */
  readonly assertionSignatures: readonly string[];
  /** Whether an unrelated test failed in the same child. */
  readonly unrelatedFailure: boolean;
  /** Whether the runner deadline expired. */
  readonly timedOut: boolean;
}

/** Sanitized result for one exact fault/claim/sentinel tuple. */
export interface PlannedFaultTupleResult {
  /** Exact tuple identity that was executed. */
  readonly tuple: PlannedFaultTuple;
  /** Classification derived from the controlled child observation. */
  readonly classification: FaultTupleClassification;
  /** Claims blocked by this result; never includes an unrelated claim. */
  readonly blockedClaims: readonly string[];
  /** Claims independently killed by this result. */
  readonly killedClaims: readonly string[];
  /** Whether the primary source tree retained its original byte identity. */
  readonly primaryTreeUnchanged: boolean;
  /** Remaining owned resources, which must be empty or exactly recoverable. */
  readonly residue: readonly string[];
  /** Bounded recovery command when residue could not be removed automatically. */
  readonly recoveryCommand?: string;
}

/** Request for one exact tuple execution under a controlled child observation. */
export interface PlannedFaultExecution {
  /** Curated fault selected by its stable ID. */
  readonly fault: PlannedFaultDefinition;
  /** Exact claim requested by the caller. */
  readonly claimId: string;
  /** Exact sentinel requested by the caller. */
  readonly sentinelId: string;
  /** Clean source revision observed before disposable work begins. */
  readonly observedRevision: string;
  /** Current target-file digest observed before patching. */
  readonly observedTargetHash: string;
  /** Controlled external child outcome used by the specification rig. */
  readonly observation: PlannedFaultObservation;
}

/** Public capability boundary exercised by immutable fault-runner specifications. */
export interface PlannedFaultRunnerContract {
  /** Validates and executes one exact tuple without mutating the primary tree. */
  execute(request: PlannedFaultExecution): Promise<PlannedFaultTupleResult>;
}

/**
 * Loads the future fault-runner adapter after its owning implementation task installs it.
 *
 * The immutable specification files are intentionally type-checkable before the runtime exists,
 * while their separate RED checkpoint proves that absence through the public dispatcher.
 */
export async function createPlannedFaultRunner(): Promise<PlannedFaultRunnerContract> {
  throw new Error('curated fault runner is not installed');
}
