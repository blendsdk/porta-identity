/** Exact count for one attributed coverage metric. */
export interface RatchetMetricCount {
  /** Covered executable items. */
  readonly covered: number;
  /** Total executable items. */
  readonly total: number;
}

/** Complete exact attributed coverage counts. */
export interface RatchetCoverageCounts {
  /** Exact statement counts. */
  readonly statements: RatchetMetricCount;
  /** Exact branch counts. */
  readonly branches: RatchetMetricCount;
  /** Exact function counts. */
  readonly functions: RatchetMetricCount;
  /** Exact line counts. */
  readonly lines: RatchetMetricCount;
}

/** Observation supplied to the local exact coverage ratchet. */
export interface RatchetCoverageObservation {
  /** Source revision that produced the observation. */
  readonly sourceRevision: string;
  /** Exact normalized first-party source count. */
  readonly normalizedPathCount: number;
  /** Domain-separated identity of the exact ordered normalized source paths. */
  readonly normalizedPathDigest: string;
  /** Exact attributed counts. */
  readonly counts: RatchetCoverageCounts;
}

/** Stable local coverage decision; it never changes repository policy. */
export interface RatchetCoverageDecision {
  /** Whether the observation equals or improves the reviewed baseline. */
  readonly accepted: boolean;
  /** Stable decision reason. */
  readonly reason:
    | 'exact-baseline'
    | 'covered-count-reduction'
    | 'unreviewed-total-change'
    | 'unreviewed-path-change';
  /** Exact metric that triggered a count decision. */
  readonly metric?: keyof RatchetCoverageCounts;
  /** Local observation never authorizes CI or merge enforcement. */
  readonly promotionAuthorized: false;
}

/** Input used to decide whether a risk-slice floor may rise. */
export interface RiskSliceFloorInput {
  /** Current reviewed covered-count floor. */
  readonly currentFloor: number;
  /** Proposed covered-count floor. */
  readonly proposedFloor: number;
  /** Whether every owning claim is closed without gaps. */
  readonly claimsClosed: boolean;
  /** Whether every required designated check was detected. */
  readonly sensitivityComplete: boolean;
}

/** Repository change class that must stale affected claims. */
export type StalenessTrigger = 'requirement-r5' | 'fixture' | 'dependency' | 'sentinel';

/** Result produced before a governed report may continue. */
export interface StalenessDecision {
  /** Trigger inspected by this decision. */
  readonly trigger: StalenessTrigger;
  /** Exact affected claim identifiers. */
  readonly affectedClaims: readonly string[];
  /** Resulting claim status after a changed input. */
  readonly resultingStatus: 'current' | 'stale';
  /** A report cannot succeed while affected claims are stale. */
  readonly reportAllowed: boolean;
}

/** Public seam consumed by immutable local-ratchet specifications. */
export interface AssuranceRatchetsContract {
  /** Evaluates one exact attributed coverage observation. */
  evaluateCoverage(observation: RatchetCoverageObservation): RatchetCoverageDecision;
  /** Returns whether a reviewed slice floor may increase. */
  mayIncreaseSliceFloor(input: RiskSliceFloorInput): boolean;
  /** Evaluates one monitored input identity against its reviewed baseline. */
  evaluateStaleness(trigger: StalenessTrigger, observedDigest: string): StalenessDecision;
}
