import type { HumanAuthSentinelId, HumanAuthSliceId } from './human-auth-slice-profile-model.js';

/** JSON-safe scalar observed at a public human-authentication boundary. */
export type HumanAuthFactValue = string | number | boolean | null;

/** JSON-safe requirement input accepted by a future black-box adapter. */
export type HumanAuthInputValue = HumanAuthFactValue | readonly HumanAuthFactValue[];

/** Public response dimensions used for functional comparisons without timing observations. */
export interface HumanAuthPublicResponse {
  readonly status: number | string | null;
  readonly bodySchemaDigest: string | null;
  readonly securityHeadersDigest: string | null;
}

/** One exact positive control or negative probe defined independently from Porta. */
export interface HumanAuthStepRequirement {
  readonly id: string;
  readonly controlId?: string;
  readonly boundary: 'raw-http' | 'browser' | 'synthetic-mailbox' | 'independent-authenticator';
  readonly action: string;
  readonly target: string;
  readonly inputs: Readonly<Record<string, HumanAuthInputValue>>;
  readonly expectedFacts: Readonly<Record<string, HumanAuthFactValue>>;
  readonly expectedPublicResponse: HumanAuthPublicResponse | null;
}

/** Immutable request for one complete functional human-authentication case. */
export interface HumanAuthCaseRequirement {
  readonly sentinelId: Exclude<HumanAuthSentinelId, 'ST-63'>;
  readonly profileIds: readonly HumanAuthSliceId[];
  readonly controls: readonly HumanAuthStepRequirement[];
  readonly probes: readonly HumanAuthStepRequirement[];
  readonly prohibitedSideEffects: readonly string[];
  readonly protectedStateKeys: readonly string[];
  readonly requiredLogEvent: string;
  readonly requiredLogFields: readonly string[];
  readonly forbiddenLogFields: readonly string[];
  readonly recoveryExpectation: string;
  readonly independenceRule: string;
}

/** Broad observation shape that permits a future live adapter to report defects truthfully. */
export interface HumanAuthStepObservation {
  readonly id: string;
  readonly boundary: HumanAuthStepRequirement['boundary'] | 'unknown';
  readonly action: string;
  readonly target: string;
  readonly facts: Readonly<Record<string, HumanAuthFactValue>>;
  readonly publicResponse: HumanAuthPublicResponse | null;
  readonly prohibitedSideEffects: Readonly<Record<string, boolean>>;
  readonly protectedStateUnchanged: Readonly<Record<string, boolean>>;
  readonly securityLog: {
    readonly event: string;
    readonly fields: readonly string[];
    readonly forbiddenValueObserved: boolean;
  } | null;
  readonly recoveryObserved: string | null;
}

/** Complete observation returned by a requirements rig or future live adapter. */
export interface HumanAuthCaseObservation {
  readonly sentinelId: HumanAuthSentinelId | 'unknown';
  readonly controls: readonly HumanAuthStepObservation[];
  readonly probes: readonly HumanAuthStepObservation[];
}

/** Stable seam consumed by immutable human-authentication specifications. */
export interface HumanAuthCasesContract {
  observeCase(requirement: HumanAuthCaseRequirement): Promise<HumanAuthCaseObservation>;
}

/** Requirements-only deferred consistency entry that cannot produce product evidence. */
export interface DeferredHumanAuthCaseRequirement {
  readonly sentinelId: 'ST-49';
  readonly status: 'requirements-only-deferred';
  readonly evidenceAllowed: false;
  readonly invariant: string;
  readonly ordinaryScope: 'sequential-only';
  readonly excludedMechanics: readonly string[];
  readonly expectedFutureOutcome: string;
}
