/** Version of the independently authored human-authentication requirement catalog. */
export const humanAuthProfileCatalogVersion = 1 as const;

/** Stable assurance claims governed by the human-authentication risk slice. */
export type HumanAuthClaimId =
  'CLAIM-R5-02' | 'CLAIM-R5-06' | 'CLAIM-R5-07' | 'CLAIM-R5-10' | 'CLAIM-R5-12';

/** Immutable specification cases owned by the human-authentication risk slice. */
export type HumanAuthSentinelId =
  'ST-42' | 'ST-43' | 'ST-44' | 'ST-45' | 'ST-46' | 'ST-47' | 'ST-48' | 'ST-63';

/** Bounded human-authentication and recovery profiles. */
export type HumanAuthSliceId =
  | 'functional-enumeration'
  | 'login-method-enforcement'
  | 'failed-login-lockout-rate-limit'
  | 'session-lifecycle'
  | 'cookie-csrf'
  | 'magic-link'
  | 'password-reset'
  | 'invitation'
  | 'email-otp'
  | 'totp'
  | 'recovery-code';

/** One version-qualified requirements source selected before Porta behavior is observed. */
export interface HumanAuthRequirementSource {
  readonly id: string;
  readonly authority: 'RD-05' | 'test-assurance testing strategy';
  readonly version: '2026-08-19';
  readonly clause: string;
}

/** One semantic public entry point and its exact trust transition. */
export interface HumanAuthEntryPoint {
  readonly id: string;
  readonly trustBoundary: string;
}

/** Privacy-limited security event required by one risk slice. */
export interface HumanAuthLogRequirement {
  readonly event: string;
  readonly requiredFields: readonly string[];
  readonly forbiddenFields: readonly string[];
}

/** Complete requirement-owned profile for one human-authentication risk slice. */
export interface HumanAuthSliceProfile {
  readonly schemaVersion: 1;
  readonly profileVersion: '2026-08-19';
  readonly id: HumanAuthSliceId;
  readonly actors: readonly string[];
  readonly assets: readonly string[];
  readonly actions: readonly string[];
  readonly resources: readonly string[];
  readonly entryPoints: readonly HumanAuthEntryPoint[];
  readonly abuseCases: readonly string[];
  readonly allowedOutcomes: readonly string[];
  readonly exactRejections: readonly string[];
  readonly prohibitedSideEffects: readonly string[];
  readonly privacySafeLogs: readonly HumanAuthLogRequirement[];
  readonly recoveryExpectations: readonly string[];
  readonly sourceIds: readonly string[];
}

/** Stable claim definition that remains independent of executable Porta observations. */
export interface HumanAuthClaimRequirement {
  readonly schemaVersion: 1;
  readonly requirementVersion: '2026-08-19';
  readonly id: string;
  readonly claimIds: readonly HumanAuthClaimId[];
  readonly sentinelId: HumanAuthSentinelId;
  readonly sliceIds: readonly HumanAuthSliceId[];
  readonly invariant: string;
  readonly positiveOutcome: string;
  readonly negativeOutcomes: readonly string[];
  readonly oracle: 'approved-requirements-only';
  readonly evidenceStatus: 'specification-only';
}

/** Explicit authority decision that prevents opportunistic enumeration timing measurements. */
export const functionalEnumerationTimingPolicy = Object.freeze({
  gapId: 'enumeration-timing-contract-unapproved',
  status: 'blocked' as const,
  allowedObservationFields: Object.freeze([
    'public-status',
    'public-body-schema',
    'security-relevant-response-headers',
  ]),
  forbiddenActivities: Object.freeze([
    'latency-sampling',
    'timing-distribution-comparison',
    'post-observation-threshold-selection',
    'effect-size-estimation',
    'power-rule-selection',
  ]),
  unblockAuthority:
    'product/security authority must approve the hypothesis, material effect-size bound, sample-size/power rule, clock/environment controls, and noise/invalid-run rule before measurement',
});

/** Versioned sources from which this catalog is independently derived. */
export const humanAuthRequirementSources: readonly HumanAuthRequirementSource[] = [
  { id: 'rd-05-r5.2', authority: 'RD-05', version: '2026-08-19', clause: 'R5.2' },
  { id: 'rd-05-r5.6', authority: 'RD-05', version: '2026-08-19', clause: 'R5.6' },
  { id: 'rd-05-r5.7', authority: 'RD-05', version: '2026-08-19', clause: 'R5.7' },
  { id: 'rd-05-r5.10', authority: 'RD-05', version: '2026-08-19', clause: 'R5.10' },
  {
    id: 'testing-strategy-st42-st48-st63',
    authority: 'test-assurance testing strategy',
    version: '2026-08-19',
    clause: 'ST-42 through ST-48 and ST-63',
  },
];

/** Closed synthetic actors shared by every human-authentication threat profile. */
export const humanAuthActors = [
  'synthetic-existing-account-owner',
  'synthetic-absent-account-requester',
  'unauthenticated-browser',
  'authenticated-browser',
  'remote-attacker',
  'authorization-server',
  'synthetic-mailbox',
] as const;

/** Sensitive authentication fields forbidden from every profile's security event. */
export const humanAuthForbiddenLogFields = [
  'password',
  'account-existence',
  'email-address',
  'session-cookie',
  'csrf-token',
  'magic-link-token',
  'password-reset-token',
  'invitation-token',
  'email-otp-code',
  'totp-secret',
  'totp-code',
  'recovery-code',
  'stack-trace',
] as const;
