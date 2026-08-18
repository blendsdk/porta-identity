/** Artifact-neutral vocabulary intentionally reusable by later assurance slices. */
export type InterleavingArtifactKind = string;

/** Replay-sensitive protocol artifacts included in the current OIDC/token slice. */
export type Phase7ProtocolArtifactKind = 'authorization-code' | 'refresh-token';

/** Stable distributed-consumption sentinel identity. */
export type InterleavingSentinelId = 'ST-49' | 'ST-50' | 'ST-51';

/** Evidence admission result that distinguishes product behavior from harness failure. */
export type EvidenceValidity =
  'valid' | 'invalid-setup' | 'invalid-timeout' | 'invalid-barrier' | 'infrastructure-failed';

/** One participant that must acknowledge an exact named synchronization stage. */
export interface BarrierParticipantRequirement {
  /** Stable role within the synchronized scenario. */
  readonly id: string;
  /** Synthetic identifier used to correlate acknowledgements without retaining credentials. */
  readonly correlationId: string;
  /** Ordered stages the participant must acknowledge within the bounded wait. */
  readonly requiredStages: readonly string[];
}

/** One deterministic interleaving scenario, independent of its future live implementation. */
export interface InterleavingScenarioRequirement {
  /** Stable scenario identity. */
  readonly id: string;
  /** Distributed-consumption sentinel associated with the scenario. */
  readonly sentinelId: InterleavingSentinelId;
  /** Replay-sensitive artifact consumed by the scenario. */
  readonly artifactKind: Phase7ProtocolArtifactKind;
  /** Exact interleaving or uncertain-outcome branch under observation. */
  readonly variant:
    | 'duplicate-and-read-during-consume'
    | 'failure-immediately-before-commit'
    | 'failure-immediately-after-commit'
    | 'timeout-then-committed-state'
    | 'timeout-then-uncommitted-state';
  /** Harness-owned mechanism required to create the interleaving without a product hook. */
  readonly harnessMechanism:
    | 'synchronized-disposable-proxy'
    | 'disposable-pre-commit-termination'
    | 'disposable-post-commit-termination'
    | 'client-timeout-and-owned-process-restart';
  /** Participants that must acknowledge named synchronization stages. */
  readonly participants: readonly BarrierParticipantRequirement[];
  /** Maximum time allowed for the complete barrier exchange. */
  readonly boundedWaitMs: number;
  /** Exact observable facts required from an admitted run. */
  readonly expectedFacts: Readonly<Record<string, string | number | boolean | null>>;
  /** Effects forbidden during and after the scenario. */
  readonly prohibitedSideEffects: readonly string[];
  /** Privacy-safe security-event class required for the decision. */
  readonly requiredLogEvent: string;
  /** Non-secret fields required on the security event. */
  readonly requiredLogFields: readonly string[];
  /** Sensitive fields forbidden from the security event. */
  readonly forbiddenLogFields: readonly string[];
  /** Durable state required after retry, restart, and cleanup. */
  readonly recoveryExpectation: string;
}

/** Broad observation for one participant interval and its acknowledged stages. */
export interface InterleavingParticipantObservation {
  /** Stable participant role. */
  readonly id: string;
  /** Correlation identifier observed at the barrier. */
  readonly correlationId: string;
  /** Ordered stages acknowledged by the live participant. */
  readonly acknowledgedStages: readonly string[];
  /** Monotonic request start time used only to prove overlap. */
  readonly requestStartedAtMs: number;
  /** Monotonic request end time used only to prove overlap. */
  readonly requestEndedAtMs: number;
}

/** Broad observation shape that can represent valid evidence or any harness failure. */
export interface InterleavingScenarioObservation {
  /** Stable scenario identity returned by the observer. */
  readonly id: string;
  /** Sentinel reported by the observer, or `unknown` when admission fails. */
  readonly sentinelId: InterleavingSentinelId | 'unknown';
  /** Artifact class actually exercised. */
  readonly artifactKind: InterleavingArtifactKind;
  /** Evidence admission result. */
  readonly evidenceValidity: EvidenceValidity;
  /** Sanitized reason for invalid evidence, or `null` for an admitted run. */
  readonly invalidReason: string | null;
  /** Barrier and request-interval observations for every participant. */
  readonly participants: readonly InterleavingParticipantObservation[];
  /** Public and durable-state facts observed during the scenario. */
  readonly facts: Readonly<Record<string, string | number | boolean | null>>;
  /** Whether durable state was checked independently from the client under test. */
  readonly durableStateObservedIndependently: boolean;
  /** Exhaustive occurrence map for the scenario's prohibited effects. */
  readonly prohibitedSideEffects: Readonly<Record<string, boolean>>;
  /** Privacy-safe security event observed for the decision. */
  readonly securityLog: {
    /** Stable public security-event class. */
    readonly event: string;
    /** Field names present on the event; values are never retained here. */
    readonly fields: readonly string[];
  } | null;
  /** Number of credential or token values retained by evidence. */
  readonly retainedSecretCount: number;
  /** Recovery state independently observed after the scenario. */
  readonly recoveryObserved: string | null;
  /** Exact owned process identity before restart, when restart applies. */
  readonly processIdentityBefore: string | null;
  /** Exact owned process identity after restart, when restart applies. */
  readonly processIdentityAfter: string | null;
  /** Whether the exact owned Porta process was restarted. */
  readonly ownedProcessRestartObserved: boolean;
}

/** Stable seam used by immutable distributed-consumption specifications. */
export interface ProtocolInterleavingContract {
  /**
   * Observes one synchronized replay-sensitive scenario.
   *
   * @param requirement Requirement-owned barrier, outcome, and recovery contract.
   * @returns Admitted product evidence or an explicit invalid-evidence observation.
   */
  observeScenario(
    requirement: InterleavingScenarioRequirement,
  ): Promise<InterleavingScenarioObservation>;
}
