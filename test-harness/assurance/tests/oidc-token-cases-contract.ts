import type {
  ProtocolBoundary,
  ProtocolSentinelId,
  ProtocolSliceId,
} from './oidc-token-slice-profile-requirements.js';

/** JSON-safe scalar value observed at a public protocol boundary. */
export type ProtocolFactValue = string | number | boolean | null;

/** JSON-safe scalar or flat list supplied to an independent protocol probe. */
export type ProtocolInputValue = ProtocolFactValue | readonly ProtocolFactValue[];

/** One exact positive control or adversarial probe defined independently from Porta. */
export interface ProtocolStepRequirement {
  /** Stable control or probe identity. */
  readonly id: string;
  /** Positive control that proves the same boundary works before this probe varies input. */
  readonly controlId?: string;
  /** Independent transport required to reach the public boundary. */
  readonly transport: 'raw-http' | 'independent-jose';
  /** External client boundary represented by this step. */
  readonly boundary: ProtocolBoundary;
  /** Requirement-owned input dimensions varied by the step. */
  readonly inputs: Readonly<Record<string, ProtocolInputValue>>;
  /** Exact public facts that the observer must report. */
  readonly expectedFacts: Readonly<Record<string, ProtocolFactValue>>;
}

/** Immutable request for one complete public protocol behavior case. */
export interface ProtocolCaseRequirement {
  /** Stable sentinel associated with the behavior case. */
  readonly sentinelId: Exclude<ProtocolSentinelId, 'ST-63'>;
  /** Risk profiles whose threat and recovery rules apply. */
  readonly profileIds: readonly ProtocolSliceId[];
  /** Successful observations required before adversarial probes run. */
  readonly controls: readonly ProtocolStepRequirement[];
  /** Adversarial observations required to test the invariant. */
  readonly probes: readonly ProtocolStepRequirement[];
  /** Effects that must remain absent after every rejected probe. */
  readonly prohibitedSideEffects: readonly string[];
  /** Privacy-safe security event class required for a rejection. */
  readonly requiredLogEvent: string;
  /** Non-secret fields required on the security event. */
  readonly requiredLogFields: readonly string[];
  /** Sensitive fields forbidden from the security event. */
  readonly forbiddenLogFields: readonly string[];
  /** State that must be observed after a rejection or retry. */
  readonly recoveryExpectation: string;
  /** Rule that keeps the observer independent from Porta's implementation. */
  readonly independentClientRule: string;
}

/** Broad live-observation shape; it does not force expected values at compile time. */
export interface ProtocolStepObservation {
  /** Stable control or probe identity returned by the observer. */
  readonly id: string;
  /** Transport actually used, or `unknown` when admission failed. */
  readonly transport: 'raw-http' | 'independent-jose' | 'unknown';
  /** External client boundary actually exercised. */
  readonly boundary: ProtocolBoundary | 'unknown';
  /** Public facts observed without importing expected values into the result type. */
  readonly facts: Readonly<Record<string, ProtocolFactValue>>;
  /** Exhaustive occurrence map for the case's prohibited effects. */
  readonly prohibitedSideEffects: Readonly<Record<string, boolean>>;
  /** Privacy-safe event metadata observed after the step, when applicable. */
  readonly securityLog: {
    /** Stable public security-event class. */
    readonly event: string;
    /** Field names present on the event; values are never retained here. */
    readonly fields: readonly string[];
  } | null;
  /** Recovery state independently observed after the step. */
  readonly recoveryObserved: string | null;
}

/** Complete observations returned by either the requirements rig or a future live adapter. */
export interface ProtocolCaseObservation {
  /** Sentinel reported by the active observer. */
  readonly sentinelId: ProtocolSentinelId | 'unknown';
  /** Positive-control observations in requirement order. */
  readonly controls: readonly ProtocolStepObservation[];
  /** Adversarial-probe observations in requirement order. */
  readonly probes: readonly ProtocolStepObservation[];
}

/** Stable seam consumed by immutable protocol specifications. */
export interface OidcTokenCasesContract {
  /**
   * Observes one complete protocol case.
   *
   * @param requirement Requirement-owned controls and adversarial probes.
   * @returns Public observations from the selected adapter.
   */
  observeCase(requirement: ProtocolCaseRequirement): Promise<ProtocolCaseObservation>;
}
