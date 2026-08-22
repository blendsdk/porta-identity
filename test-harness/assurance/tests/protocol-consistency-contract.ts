/** Artifact-neutral vocabulary reusable by later single-use consistency suites. */
export type SingleUseArtifactKind = string;

/** Replay-sensitive protocol artifacts included in the current protocol slice. */
export type Phase7ProtocolArtifactKind = 'authorization-code' | 'refresh-token';

/** Stable single-use consistency sentinel identity. */
export type SingleUseConsistencySentinelId = 'ST-49' | 'ST-50' | 'ST-51';

/** Evidence admission result that distinguishes product behavior from test-environment failure. */
export type EvidenceValidity =
  'valid' | 'invalid-setup' | 'invalid-timeout' | 'invalid-observation' | 'infrastructure-failed';

/** One participant whose externally observable checkpoints must be recorded. */
export interface ConsistencyParticipantRequirement {
  /** Stable role within the scenario. */
  readonly id: string;
  /** Synthetic identifier used to correlate observations without retaining credentials. */
  readonly correlationId: string;
  /** Ordered public or datastore checkpoints that must be observed. */
  readonly requiredObservations: readonly string[];
}

/** One defensive single-use consistency scenario. */
export interface SingleUseConsistencyRequirement {
  /** Stable scenario identity. */
  readonly id: string;
  /** Sentinel associated with the scenario. */
  readonly sentinelId: SingleUseConsistencySentinelId;
  /** Replay-sensitive artifact exercised by the scenario. */
  readonly artifactKind: Phase7ProtocolArtifactKind;
  /** Exact defensive consistency behavior under observation. */
  readonly variant:
    | 'public-concurrent-duplicates'
    | 'real-store-conditional-consume'
    | 'committed-response-loss-and-graceful-restart';
  /** Approved mechanism that does not modify source or terminate a process. */
  readonly observationMechanism:
    | 'owned-public-requests'
    | 'real-datastore-integration'
    | 'discarded-client-response-and-graceful-restart';
  /** Participants that must produce named observations. */
  readonly participants: readonly ConsistencyParticipantRequirement[];
  /** Maximum duration for the complete scenario. */
  readonly boundedWaitMs: number;
  /** Exact observable facts required from an admitted run. */
  readonly expectedFacts: Readonly<Record<string, string | number | boolean | null>>;
  /** Effects forbidden during and after the scenario. */
  readonly prohibitedSideEffects: readonly string[];
  /** Privacy-safe rejection event required when a replay is rejected. */
  readonly requiredLogEvent: string | null;
  /** Non-secret fields required on the rejection event. */
  readonly requiredLogFields: readonly string[];
  /** Sensitive fields forbidden from retained observations. */
  readonly forbiddenLogFields: readonly string[];
  /** Durable state required after requests, retry, restart, and cleanup. */
  readonly recoveryExpectation: string;
}

/** Broad observation for one participant interval and its recorded checkpoints. */
export interface ConsistencyParticipantObservation {
  /** Stable participant role. */
  readonly id: string;
  /** Correlation identifier observed during execution. */
  readonly correlationId: string;
  /** Ordered checkpoints observed by the live participant. */
  readonly observedCheckpoints: readonly string[];
  /** Monotonic operation start time used only to prove concurrency. */
  readonly operationStartedAtMs: number;
  /** Monotonic operation end time used only to prove concurrency. */
  readonly operationEndedAtMs: number;
}

/** Broad observation shape for admitted evidence or a fail-closed invalid run. */
export interface SingleUseConsistencyObservation {
  /** Stable scenario identity returned by the observer. */
  readonly id: string;
  /** Sentinel reported by the observer, or `unknown` when admission fails. */
  readonly sentinelId: SingleUseConsistencySentinelId | 'unknown';
  /** Artifact class actually exercised. */
  readonly artifactKind: SingleUseArtifactKind;
  /** Evidence admission result. */
  readonly evidenceValidity: EvidenceValidity;
  /** Sanitized reason for invalid evidence, or `null` for an admitted run. */
  readonly invalidReason: string | null;
  /** Public request, store operation, and state-observer intervals. */
  readonly participants: readonly ConsistencyParticipantObservation[];
  /** Public and durable-state facts observed during the scenario. */
  readonly facts: Readonly<Record<string, string | number | boolean | null>>;
  /** Whether durable state was checked independently from the client under test. */
  readonly durableStateObservedIndependently: boolean;
  /** Exhaustive occurrence map for prohibited effects. */
  readonly prohibitedSideEffects: Readonly<Record<string, boolean>>;
  /** Privacy-safe rejection event observed during replay checks. */
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
  /** Exact owned process identity before graceful restart, when applicable. */
  readonly processIdentityBefore: string | null;
  /** Exact owned process identity after graceful restart, when applicable. */
  readonly processIdentityAfter: string | null;
  /** Whether the exact owned Porta process was gracefully restarted. */
  readonly ownedProcessRestartObserved: boolean;
}

/** Stable seam used by the single-use consistency specifications. */
export interface ProtocolConsistencyContract {
  /**
   * Observes one defensive consistency scenario.
   *
   * @param requirement Requirement-owned outcome and recovery contract.
   * @returns Admitted product evidence or an explicit invalid-evidence observation.
   */
  observeScenario(
    requirement: SingleUseConsistencyRequirement,
  ): Promise<SingleUseConsistencyObservation>;
}
