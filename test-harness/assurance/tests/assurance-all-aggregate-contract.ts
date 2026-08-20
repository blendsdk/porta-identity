/** Stable conclusion assigned to one claim-sized aggregate item. */
export type AssuranceAllConclusion =
  'assured' | 'blocked' | 'incomplete' | 'survived' | 'unqualified';

/** Closed aggregate child identity. */
export type AssuranceAllChildId =
  | 'validate'
  | 'test'
  | 'harness:operational'
  | 'harness:production-security'
  | 'coverage'
  | 'fault'
  | 'compat'
  | 'report';

/** One immutable sequential child registration. */
export interface AssuranceAllChildRegistration {
  readonly id: AssuranceAllChildId;
  readonly ordinal: number;
  readonly purpose: string;
  readonly internalSuite: 'deduplicated-canonical-files' | null;
  readonly invocations: readonly AssuranceAllInvocationRegistration[];
}

/** Exact child invocation admitted by the versioned aggregate registry. */
export interface AssuranceAllInvocationRegistration {
  readonly id: string;
  readonly command:
    | 'assurance:validate'
    | 'assurance:test'
    | 'assurance:harness'
    | 'assurance:coverage'
    | 'assurance:fault'
    | 'assurance:compat'
    | 'assurance:report';
  readonly selector: string | null;
  readonly profile: 'operational' | 'production-security' | null;
  readonly arguments: readonly string[];
}

/** A registered internal selector and the canonical files it contributes. */
export interface AssuranceAllInternalSuiteInput {
  readonly selector: string;
  readonly canonicalFiles: readonly string[];
}

/** One canonical internal file after stable cross-selector deduplication. */
export interface AssuranceAllInternalSuiteEntry {
  readonly canonicalFile: string;
  readonly ordinal: number;
  readonly contributedBy: readonly string[];
}

/** Qualification authority for a claim-sized collected item. */
export type AssuranceAllItemAuthority =
  'eligible' | 'known-product-defect-collector' | 'authority-blocked' | 'stale-or-no-go-evidence';

/** Frozen authority source for a known blocked or unqualified item. */
export interface AssuranceAllKnownGapRegistration {
  readonly id: string;
  readonly authority: 'authority-blocked' | 'stale-or-no-go-evidence';
  readonly statusSource: 'approved-program-gap-register';
  readonly conclusion: 'blocked' | 'unqualified';
}

/** Broad observation recorded for a completed item. */
export type AssuranceAllItemObservation =
  | 'passed'
  | 'product-defect-observed'
  | 'evidence-incomplete'
  | 'fault-survived'
  | 'assertion-failed';

/** Claim-sized item retained in the aggregate artifact. */
export interface AssuranceAllItemEvidence {
  readonly id: string;
  readonly childId: AssuranceAllChildId;
  readonly authority: AssuranceAllItemAuthority;
  readonly executionStatus: 'completed' | 'not-run';
  readonly observation: AssuranceAllItemObservation | null;
  readonly notRunReason: string | null;
  readonly conclusion: AssuranceAllConclusion;
}

/** Complete accounting for one registered child. */
export interface AssuranceAllChildEvidence {
  readonly id: AssuranceAllChildId;
  readonly ordinal: number;
  readonly executionStatus: 'completed' | 'not-run';
  readonly processOwnership: 'managed-child' | null;
  readonly outcome:
    'passed' | 'known-product-defect' | 'assertion-failed' | 'survived' | 'incomplete' | null;
  readonly notRunReason: string | null;
  readonly cleanupComplete: boolean;
  readonly invocations: readonly AssuranceAllInvocationEvidence[];
}

/** Provenance-bound outcome of one concrete child invocation. */
export interface AssuranceAllInvocationEvidence {
  readonly id: string;
  readonly command: AssuranceAllInvocationRegistration['command'];
  readonly selector: string | null;
  readonly profile: AssuranceAllInvocationRegistration['profile'];
  readonly arguments: readonly string[];
  readonly executionStatus: 'completed' | 'not-run';
  readonly exitCode: number | null;
  readonly artifactReference: string | null;
  readonly artifactDigest: string | null;
  readonly sourceRevision: string;
  readonly sourceTreeDigest: string;
  readonly toolIdentity: string;
  readonly toolDigest: string;
  readonly cleanupComplete: boolean;
  readonly notRunReason: string | null;
}

/** Terminal facts broad enough to truthfully describe one actual aggregate run. */
export interface AssuranceAllTerminalObservation {
  readonly cleanupOrPrimaryTreeDrift: boolean;
  readonly signal: 'sigint' | 'sigterm' | null;
  readonly timedOut: boolean;
  readonly invalidEvidence: boolean;
  readonly coverageIncomplete: boolean;
  readonly infrastructureFailed: boolean;
  readonly productDefectObserved: boolean;
  readonly assertionFailedOrFaultSurvived: boolean;
}

/** Cleanup observations for resources owned by the aggregate and active child. */
export interface AssuranceAllCleanupEvidence {
  readonly primaryTreeUnchanged: boolean;
  readonly activeChildStopped: boolean;
  readonly childProcessGroupStopped: boolean;
  readonly ownedResourcesRemovedOrExactlyRecovered: boolean;
  readonly recoveryRequired: boolean;
  readonly recoveryCommand: string | null;
}

/** Sanitized owner-only artifact for one aggregate invocation. */
export interface AssuranceAllAggregateEvidence {
  readonly schemaVersion: 1;
  readonly registryVersion: 1;
  readonly registryDigest: string;
  readonly baselineRevision: string;
  readonly baselineTreeDigest: string;
  readonly children: readonly AssuranceAllChildEvidence[];
  readonly items: readonly AssuranceAllItemEvidence[];
  readonly rollup: Readonly<Record<AssuranceAllConclusion, readonly string[]>>;
  readonly terminal: AssuranceAllTerminalObservation;
  readonly exitCode: 0 | 20 | 21 | 30 | 40 | 50 | 60 | 70 | 130 | 143;
  readonly terminalReason: string;
  readonly artifactMode: 0o600;
  readonly atomicWrite: boolean;
  readonly cleanup: AssuranceAllCleanupEvidence;
  readonly retainedFieldNames: readonly string[];
}

/** Stable validation seam implemented by the aggregate capability owner. */
export interface AssuranceAllAggregateContract {
  /** Validates and returns a complete aggregate evidence document. */
  validate(evidence: unknown): AssuranceAllAggregateEvidence;
}
