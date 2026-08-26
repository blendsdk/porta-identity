/** Public channels allowed to independently observe authentication state and effects. */
export type HumanAuthPublicStateChannel =
  | 'authorization-callback'
  | 'spa-authentication-status'
  | 'synthetic-mailbox-cardinality'
  | 'browser-cookie-identity'
  | 'protected-resource-response'
  | 'admin-api-resource-state';

export type HumanAuthObservedValue = string | number | boolean | null;

/** One fatal external prerequisite required before a case can produce evidence. */
export interface HumanAuthFunctionalPrerequisite {
  readonly id: string;
  readonly kind: 'fixture' | 'email';
  readonly failurePolicy: 'fatal-invalid-evidence';
  readonly requiredCapabilities: readonly string[];
}

/** Exact functional HTTP dimensions; timing is intentionally absent. */
export interface HumanAuthFunctionalResponseRequirement {
  readonly status: number | 'redirect';
  readonly bodySchemaId: string;
  readonly headerSetId: string;
}

/** Independent public-state observation required in addition to the HTTP result. */
export interface HumanAuthPublicStateRequirement {
  readonly id: string;
  readonly channel: HumanAuthPublicStateChannel;
  readonly expected: Readonly<Record<string, HumanAuthObservedValue>>;
}

/** One reachable positive control or one linked negative black-box variation. */
export interface HumanAuthFunctionalStepRequirement {
  readonly id: string;
  readonly kind: 'control' | 'negative';
  readonly controlId: string | null;
  readonly setupControlIds: readonly string[];
  readonly boundary: 'raw-http' | 'browser';
  readonly action: string;
  readonly target: string;
  readonly variation: string;
  readonly response: HumanAuthFunctionalResponseRequirement;
  readonly publicState: readonly HumanAuthPublicStateRequirement[];
}

/** Complete requirements-owned black-box case for one human-auth sentinel. */
export interface HumanAuthFunctionalCaseRequirement {
  readonly sentinelId: 'ST-42' | 'ST-43' | 'ST-44';
  readonly profileIds: readonly string[];
  readonly prerequisites: readonly HumanAuthFunctionalPrerequisite[];
  readonly controls: readonly HumanAuthFunctionalStepRequirement[];
  readonly negatives: readonly HumanAuthFunctionalStepRequirement[];
}

/** Broad live values permit the adapter to report defects without casting expected results. */
export interface HumanAuthFunctionalStepObservation {
  readonly id: string;
  readonly response: {
    readonly status: number | 'redirect' | null;
    readonly bodySchemaId: string | null;
    readonly headerSetId: string | null;
  };
  readonly publicState: readonly {
    readonly id: string;
    readonly channel: HumanAuthPublicStateChannel | 'unknown';
    readonly observed: Readonly<Record<string, HumanAuthObservedValue>>;
  }[];
}

/** Provenance required before a retained-harness adapter may contact Porta. */
export interface HumanAuthFunctionalLiveContext {
  readonly runId: string;
  readonly endpointManifestPath: string;
  readonly fixtureManifestPath: string;
  readonly protectedCredentialsPath: string;
  readonly projectAdmitted: boolean;
  readonly profile: string;
}

export interface HumanAuthFunctionalCaseObservation {
  readonly sentinelId: string;
  readonly runId: string;
  readonly controls: readonly HumanAuthFunctionalStepObservation[];
  readonly negatives: readonly HumanAuthFunctionalStepObservation[];
  readonly rawSecretsRetained: boolean;
}

/** Stable seam implemented only by the owner-fenced retained harness. */
export interface HumanAuthFunctionalContract {
  observeCase(
    requirement: HumanAuthFunctionalCaseRequirement,
  ): Promise<HumanAuthFunctionalCaseObservation>;
}

export type CreateHumanAuthFunctionalContract = (
  context: HumanAuthFunctionalLiveContext,
) => HumanAuthFunctionalContract;
