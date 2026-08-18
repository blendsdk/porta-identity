/** Version of the independently authored OIDC/token assurance requirement catalog. */
export const oidcTokenProfileCatalogVersion = 1 as const;

/** External client boundary required to substantiate a protocol claim. */
export type ProtocolBoundary = 'spa' | 'bff' | 'raw-http-jose';

/** Stable assurance-claim identifier associated with a protocol requirement. */
export type ProtocolClaimId = 'CLAIM-R5-02' | 'CLAIM-R5-04' | 'CLAIM-R5-05' | 'CLAIM-R5-10';

/** Immutable specification-case identifier associated with a protocol requirement. */
export type ProtocolSentinelId =
  'ST-33' | 'ST-34' | 'ST-35' | 'ST-36' | 'ST-37' | 'ST-38' | 'ST-39' | 'ST-40' | 'ST-41' | 'ST-63';

/** Bounded protocol risk slice covered by one or more independent claims. */
export type ProtocolSliceId =
  | 'redirect-pkce'
  | 'authorization-code-binding'
  | 'request-consent-client-integrity'
  | 'id-token-validation'
  | 'opaque-token-separation'
  | 'refresh-rotation-replay';

/** One version-qualified normative source selected before Porta behavior is observed. */
export interface ProtocolReference {
  /** Stable identifier used by profiles to reference this source. */
  readonly id: string;
  /** Standards body or published specification that owns the requirement. */
  readonly authority: 'OpenID Connect Core' | 'RFC 7636' | 'RFC 8725' | 'RFC 9700' | 'OWASP ASVS';
  /** Published version used when the profile was authored. */
  readonly version: string;
  /** Exact section or control within the published version. */
  readonly sectionOrControl: string;
}

/** One public protocol entry point and the trust transition it crosses. */
export interface ProtocolEntryPoint {
  /** Stable public-boundary identifier. */
  readonly id: string;
  /** Transition from untrusted input to the component that must enforce the invariant. */
  readonly trustBoundary: string;
}

/** Exact, privacy-limited security event required for the slice. */
export interface ProtocolLogRequirement {
  /** Stable privacy-safe event class. */
  readonly event: string;
  /** Non-secret fields required to correlate and classify the event. */
  readonly requiredFields: readonly string[];
  /** Sensitive fields that must never be retained in the event. */
  readonly forbiddenFields: readonly string[];
}

/** Complete, versioned requirement profile for one bounded protocol risk slice. */
export interface ProtocolSliceProfile {
  /** Schema version for deterministic validation and future migration. */
  readonly schemaVersion: 1;
  /** Immutable profile revision authored from the published protocol requirements. */
  readonly profileVersion: '2026-08-18';
  /** Stable slice identity. */
  readonly id: ProtocolSliceId;
  /** Principals and attacker roles relevant to the slice. */
  readonly actors: readonly string[];
  /** Protocol state or data protected by the slice. */
  readonly assets: readonly string[];
  /** External client types required to exercise the slice. */
  readonly boundaries: readonly ProtocolBoundary[];
  /** Public protocol entry points and their trust transitions. */
  readonly entryPoints: readonly ProtocolEntryPoint[];
  /** Misuse and substitution cases the slice must distinguish. */
  readonly abuseCases: readonly string[];
  /** Exact successful outcomes required for positive controls. */
  readonly allowedOutcomes: readonly string[];
  /** Exact public rejection outcomes required for negative cases. */
  readonly exactRejections: readonly string[];
  /** State changes or disclosures forbidden after rejection. */
  readonly prohibitedSideEffects: readonly string[];
  /** Required security events and their privacy limits. */
  readonly privacySafeLogs: readonly ProtocolLogRequirement[];
  /** State required after failure, retry, or process recovery. */
  readonly recoveryExpectations: readonly string[];
  /** Version-qualified normative sources that govern this slice. */
  readonly referenceIds: readonly string[];
}

/** One stable protocol claim definition that remains independent of executable observations. */
export interface ProtocolClaimRequirement {
  /** Schema version for deterministic validation and future migration. */
  readonly schemaVersion: 1;
  /** Stable requirement identity. */
  readonly id: string;
  /** Assurance claims supported by this requirement. */
  readonly claimIds: readonly ProtocolClaimId[];
  /** Immutable specification case that exercises the requirement. */
  readonly sentinelId: ProtocolSentinelId;
  /** Protocol slices whose combined behavior satisfies the requirement. */
  readonly sliceIds: readonly ProtocolSliceId[];
  /** External client types required to substantiate the requirement. */
  readonly boundaries: readonly ProtocolBoundary[];
  /** Requirement-owned behavior that must remain true. */
  readonly invariant: string;
  /** Successful control outcome required before negative variants run. */
  readonly positiveOutcome: string;
  /** Exact rejection or non-effect outcomes required from negative variants. */
  readonly negativeOutcomes: readonly string[];
  /** Authority boundary that owns the expected behavior. */
  readonly oracle: 'published-standard-and-approved-porta-contract';
  /** Rule preventing Porta from validating its own token or protocol output. */
  readonly independentClientRule: string;
}

/** Versioned normative references applicable to the bounded Porta protocol flows. */
export const oidcTokenReferences: readonly ProtocolReference[] = [
  {
    id: 'oidc-core-1.0-3.1.2.1',
    authority: 'OpenID Connect Core',
    version: '1.0 incorporating errata set 2',
    sectionOrControl: '3.1.2.1',
  },
  {
    id: 'oidc-core-1.0-3.1.3.7',
    authority: 'OpenID Connect Core',
    version: '1.0 incorporating errata set 2',
    sectionOrControl: '3.1.3.7',
  },
  {
    id: 'oidc-core-1.0-15.5.2',
    authority: 'OpenID Connect Core',
    version: '1.0 incorporating errata set 2',
    sectionOrControl: '15.5.2',
  },
  {
    id: 'rfc-7636-4.2',
    authority: 'RFC 7636',
    version: 'April 2015',
    sectionOrControl: '4.2',
  },
  {
    id: 'rfc-7636-4.6',
    authority: 'RFC 7636',
    version: 'April 2015',
    sectionOrControl: '4.6',
  },
  {
    id: 'rfc-8725-3.1',
    authority: 'RFC 8725',
    version: 'February 2020',
    sectionOrControl: '3.1',
  },
  {
    id: 'rfc-8725-3.8',
    authority: 'RFC 8725',
    version: 'February 2020',
    sectionOrControl: '3.8',
  },
  {
    id: 'rfc-8725-3.11',
    authority: 'RFC 8725',
    version: 'February 2020',
    sectionOrControl: '3.11',
  },
  {
    id: 'rfc-9700-2.1',
    authority: 'RFC 9700',
    version: 'January 2025',
    sectionOrControl: '2.1',
  },
  {
    id: 'rfc-9700-2.2',
    authority: 'RFC 9700',
    version: 'January 2025',
    sectionOrControl: '2.2',
  },
  {
    id: 'rfc-9700-4.14.2',
    authority: 'RFC 9700',
    version: 'January 2025',
    sectionOrControl: '4.14.2',
  },
  {
    id: 'asvs-5.0.0-v10',
    authority: 'OWASP ASVS',
    version: '5.0.0',
    sectionOrControl: 'V10 OAuth and OIDC',
  },
];

const allBoundaries: readonly ProtocolBoundary[] = ['spa', 'bff', 'raw-http-jose'];
const commonActors = [
  'resource-owner',
  'spa-public-client',
  'bff-confidential-client',
  'authorization-server',
  'relying-party-or-resource-consumer',
  'network-attacker',
] as const;
const commonLog: readonly ProtocolLogRequirement[] = [
  {
    event: 'protocol-security-rejection',
    requiredFields: ['synthetic-correlation-id', 'event-class', 'public-client-id-digest'],
    forbiddenFields: [
      'authorization-code',
      'access-token',
      'refresh-token',
      'id-token',
      'client-secret',
      'code-verifier',
      'session-cookie',
      'personal-data',
    ],
  },
];

/** Immutable protocol risk-slice profiles. */
export const oidcTokenSliceProfiles: readonly ProtocolSliceProfile[] = [
  {
    schemaVersion: 1,
    profileVersion: '2026-08-18',
    id: 'redirect-pkce',
    actors: commonActors,
    assets: [
      'authorization-request',
      'registered-redirect-uri',
      'pkce-verifier',
      'authorization-code',
    ],
    boundaries: allBoundaries,
    entryPoints: [
      { id: 'authorization-endpoint', trustBoundary: 'browser and client to authorization server' },
      { id: 'token-endpoint', trustBoundary: 'public client to authorization server' },
    ],
    abuseCases: [
      'redirect-uri-character-substitution',
      'missing-pkce',
      'plain-pkce',
      'wrong-verifier',
    ],
    allowedOutcomes: ['exact-redirect-and-s256-request-issues-one-bound-code'],
    exactRejections: [
      'redirect-mismatch:direct-400-invalid_request-before-code-issuance',
      'missing-or-plain-pkce:direct-400-invalid_request-before-code-issuance',
      'wrong-verifier:token-json-400-invalid_grant-without-token-issuance',
    ],
    prohibitedSideEffects: [
      'code-issued-for-invalid-request',
      'response-sent-to-unregistered-uri',
      'token-issued-for-wrong-verifier',
    ],
    privacySafeLogs: commonLog,
    recoveryExpectations: ['fresh-exact-redirect-s256-authorization-remains-usable'],
    referenceIds: [
      'oidc-core-1.0-3.1.2.1',
      'rfc-7636-4.2',
      'rfc-7636-4.6',
      'rfc-9700-2.1',
      'rfc-9700-2.2',
      'asvs-5.0.0-v10',
    ],
  },
  {
    schemaVersion: 1,
    profileVersion: '2026-08-18',
    id: 'authorization-code-binding',
    actors: commonActors,
    assets: ['authorization-code', 'initiating-client', 'exact-redirect-uri', 'token-grant'],
    boundaries: allBoundaries,
    entryPoints: [
      { id: 'token-endpoint', trustBoundary: 'client-held code to authorization server' },
    ],
    abuseCases: [
      'cross-client-code-redemption',
      'changed-redirect-redemption',
      'sequential-code-replay',
      'concurrent-code-replay',
    ],
    allowedOutcomes: ['initiating-client-and-exact-redirect-redeem-code-once'],
    exactRejections: ['binding-or-replay-failure:token-json-400-invalid_grant'],
    prohibitedSideEffects: [
      'second-token-grant',
      'code-rebound-to-other-client-or-redirect',
      'multiple-durable-redemptions',
    ],
    privacySafeLogs: commonLog,
    recoveryExpectations: [
      'consumed-code-remains-consumed',
      'new-independent-authorization-remains-usable',
    ],
    referenceIds: ['oidc-core-1.0-3.1.3.7', 'rfc-9700-2.1', 'asvs-5.0.0-v10'],
  },
  {
    schemaVersion: 1,
    profileVersion: '2026-08-18',
    id: 'request-consent-client-integrity',
    actors: commonActors,
    assets: ['state', 'nonce', 'consent-decision', 'interaction-session', 'client-credentials'],
    boundaries: allBoundaries,
    entryPoints: [
      { id: 'authorization-callback', trustBoundary: 'authorization server response to client' },
      {
        id: 'interaction-endpoint',
        trustBoundary: 'browser consent to authorization server session',
      },
      { id: 'token-endpoint', trustBoundary: 'confidential client to authorization server' },
    ],
    abuseCases: [
      'state-substitution',
      'nonce-omission',
      'cross-interaction-consent',
      'invalid-client-authentication',
      'wrong-session-or-tenant-context',
    ],
    allowedOutcomes: [
      'state-round-trips-for-client-verification',
      'requested-nonce-appears-in-id-token',
      'consent-and-client-authentication-bind-to-the-originating-context',
    ],
    exactRejections: [
      'state-mismatch:client-rejects-callback',
      'consent-context-mismatch:request-rejected-without-grant',
      'invalid-confidential-client:token-json-401-invalid_client',
    ],
    prohibitedSideEffects: [
      'client-session-created-after-state-mismatch',
      'consent-applied-to-other-interaction',
      'grant-issued-to-unauthenticated-client',
      'foreign-session-or-identity-disclosure',
    ],
    privacySafeLogs: commonLog,
    recoveryExpectations: [
      'original-interaction-state-remains-authoritative',
      'fresh-authenticated-client-request-remains-usable',
    ],
    referenceIds: [
      'oidc-core-1.0-3.1.2.1',
      'oidc-core-1.0-15.5.2',
      'rfc-9700-2.1',
      'asvs-5.0.0-v10',
    ],
  },
  {
    schemaVersion: 1,
    profileVersion: '2026-08-18',
    id: 'id-token-validation',
    actors: commonActors,
    assets: ['id-token', 'trusted-jwks', 'issuer-context', 'subject-identity'],
    boundaries: allBoundaries,
    entryPoints: [
      { id: 'jwks-endpoint', trustBoundary: 'issuer metadata to independent verifier' },
      { id: 'id-token-consumer', trustBoundary: 'signed token to relying party' },
    ],
    abuseCases: [
      'algorithm-substitution',
      'untrusted-signing-key',
      'wrong-issuer-audience-or-subject',
      'expired-or-not-yet-valid-token',
      'unknown-kid',
      'attacker-jku-x5u-or-embedded-jwk',
      'issuer-cache-cross-talk',
    ],
    allowedOutcomes: [
      'independent-verifier-accepts-only-es256-p256-token-with-trusted-kid-and-exact-iss-aud-sub-nonce-exp-nbf',
    ],
    exactRejections: [
      'any-signature-key-header-or-claim-violation:consumer-rejects-token-without-session',
    ],
    prohibitedSideEffects: [
      'attacker-key-fetch',
      'identity-or-session-created-from-invalid-token',
      'issuer-or-jwks-cache-cross-talk',
    ],
    privacySafeLogs: commonLog,
    recoveryExpectations: [
      'trusted-current-key-and-valid-claims-remain-usable',
      'issuer-and-key-cache-remain-request-scoped',
    ],
    referenceIds: [
      'oidc-core-1.0-3.1.3.7',
      'oidc-core-1.0-15.5.2',
      'rfc-8725-3.1',
      'rfc-8725-3.8',
      'rfc-8725-3.11',
      'asvs-5.0.0-v10',
    ],
  },
  {
    schemaVersion: 1,
    profileVersion: '2026-08-18',
    id: 'opaque-token-separation',
    actors: commonActors,
    assets: [
      'opaque-access-token',
      'id-token',
      'authorization-code',
      'refresh-token',
      'userinfo-response',
    ],
    boundaries: allBoundaries,
    entryPoints: [
      { id: 'userinfo-endpoint', trustBoundary: 'opaque bearer token to its real consumer' },
      { id: 'id-token-consumer', trustBoundary: 'ID token to relying party' },
      { id: 'token-endpoint', trustBoundary: 'code or refresh credential to authorization server' },
    ],
    abuseCases: [
      'opaque-access-token-parsed-as-jwt',
      'id-token-used-as-access-token',
      'authorization-code-used-as-token',
      'refresh-token-used-at-resource-consumer',
      'wrong-client-session-or-tenant-context',
    ],
    allowedOutcomes: ['each-artifact-is-accepted-only-by-its-declared-real-consumer'],
    exactRejections: [
      'wrong-token-type:consumer-specific-rejection-without-fallback-or-jwt-decoding',
    ],
    prohibitedSideEffects: [
      'opaque-token-jwt-interpretation',
      'identity-disclosure-to-wrong-artifact',
      'token-grant-from-wrong-artifact',
      'cross-context-session-change',
    ],
    privacySafeLogs: commonLog,
    recoveryExpectations: ['correct-artifact-at-correct-consumer-remains-usable'],
    referenceIds: ['oidc-core-1.0-3.1.3.7', 'rfc-8725-3.11', 'rfc-9700-2.1', 'asvs-5.0.0-v10'],
  },
  {
    schemaVersion: 1,
    profileVersion: '2026-08-18',
    id: 'refresh-rotation-replay',
    actors: commonActors,
    assets: [
      'refresh-token-predecessor',
      'refresh-token-replacement',
      'access-token',
      'durable-grant',
    ],
    boundaries: allBoundaries,
    entryPoints: [
      {
        id: 'token-endpoint',
        trustBoundary: 'refresh credential to authorization server durable state',
      },
    ],
    abuseCases: [
      'sequential-predecessor-replay',
      'concurrent-predecessor-replay',
      'replay-after-timeout',
      'replay-on-fresh-process',
    ],
    allowedOutcomes: ['rotation-returns-distinct-replacement-and-one-durable-success'],
    exactRejections: [
      'predecessor-replay:token-json-400-invalid_grant-without-additional-valid-token-or-grant',
    ],
    prohibitedSideEffects: [
      'predecessor-remains-valid',
      'multiple-valid-replacements',
      'additional-durable-grant-after-replay',
    ],
    privacySafeLogs: commonLog,
    recoveryExpectations: [
      'predecessor-remains-invalid-across-processes',
      'replacement-follows-declared-validity-policy',
    ],
    referenceIds: ['rfc-9700-4.14.2', 'asvs-5.0.0-v10'],
  },
];

/** Stable claim requirements that later behavioral specs must implement without editing this oracle. */
export const oidcTokenClaimRequirements: readonly ProtocolClaimRequirement[] = [
  {
    schemaVersion: 1,
    id: 'redirect-and-pkce-enforcement',
    claimIds: ['CLAIM-R5-04'],
    sentinelId: 'ST-33',
    sliceIds: ['redirect-pkce'],
    boundaries: allBoundaries,
    invariant: 'redirect URI matching is exact and public clients require PKCE S256',
    positiveOutcome: 'exact redirect and S256 issue one bound code',
    negativeOutcomes: [
      'invalid_request before code issuance',
      'invalid_grant without token issuance',
    ],
    oracle: 'published-standard-and-approved-porta-contract',
    independentClientRule: 'use raw requests for malformed redirect and PKCE variants',
  },
  {
    schemaVersion: 1,
    id: 'authorization-code-binding-and-single-use',
    claimIds: ['CLAIM-R5-04'],
    sentinelId: 'ST-34',
    sliceIds: ['authorization-code-binding'],
    boundaries: allBoundaries,
    invariant: 'authorization code binds to client and redirect and is single use',
    positiveOutcome: 'exactly one durable redemption succeeds',
    negativeOutcomes: [
      'invalid_grant for cross-client, changed-redirect, sequential, and concurrent replay',
    ],
    oracle: 'published-standard-and-approved-porta-contract',
    independentClientRule: 'raw token requests and independent durable-grant observation',
  },
  {
    schemaVersion: 1,
    id: 'state-nonce-consent-and-client-authentication',
    claimIds: ['CLAIM-R5-04'],
    sentinelId: 'ST-35',
    sliceIds: ['request-consent-client-integrity'],
    boundaries: allBoundaries,
    invariant:
      'state responsibility, nonce propagation, consent context, and confidential-client authentication remain bound',
    positiveOutcome: 'client verifies returned state and token contains requested nonce',
    negativeOutcomes: [
      'client rejects state mismatch',
      'consent substitution creates no grant',
      'invalid_client for invalid confidential-client authentication',
    ],
    oracle: 'published-standard-and-approved-porta-contract',
    independentClientRule: 'client-owned state oracle plus raw interaction and token requests',
  },
  {
    schemaVersion: 1,
    id: 'independent-id-token-verification',
    claimIds: ['CLAIM-R5-05'],
    sentinelId: 'ST-36',
    sliceIds: ['id-token-validation'],
    boundaries: allBoundaries,
    invariant:
      'ID token uses ES256 with P-256 trusted JWKS and exact kid, iss, aud, sub, nonce, exp, and nbf',
    positiveOutcome: 'independent verifier accepts the exact trusted token',
    negativeOutcomes: ['no negative variant closes this positive sentinel'],
    oracle: 'published-standard-and-approved-porta-contract',
    independentClientRule:
      'independent JOSE implementation with fetched trusted JWKS; no Porta token helper',
  },
  {
    schemaVersion: 1,
    id: 'id-token-forgery-rejection',
    claimIds: ['CLAIM-R5-05'],
    sentinelId: 'ST-37',
    sliceIds: ['id-token-validation'],
    boundaries: allBoundaries,
    invariant: 'algorithm, key, claims, kid, and JOSE key-location inputs cannot redirect trust',
    positiveOutcome: 'trusted control token validates first',
    negativeOutcomes: [
      'every alg, key, iss, aud, sub, exp, nbf, unknown-kid, jku, x5u, and embedded-JWK variant is rejected',
    ],
    oracle: 'published-standard-and-approved-porta-contract',
    independentClientRule:
      'independently forge JOSE variants; never use Porta signing or validation helpers',
  },
  {
    schemaVersion: 1,
    id: 'protocol-artifact-type-separation',
    claimIds: ['CLAIM-R5-05'],
    sentinelId: 'ST-38',
    sliceIds: ['opaque-token-separation'],
    boundaries: allBoundaries,
    invariant:
      'opaque access, ID, authorization-code, and refresh artifacts are accepted only at their real consumers',
    positiveOutcome: 'each correct artifact succeeds at its declared consumer',
    negativeOutcomes: ['every wrong-artifact substitution is rejected without side effects'],
    oracle: 'published-standard-and-approved-porta-contract',
    independentClientRule: 'opaque access tokens are never decoded or treated as JWTs',
  },
  {
    schemaVersion: 1,
    id: 'refresh-rotation-and-replay',
    claimIds: ['CLAIM-R5-05'],
    sentinelId: 'ST-39',
    sliceIds: ['refresh-rotation-replay'],
    boundaries: allBoundaries,
    invariant:
      'rotation replaces the predecessor and replay cannot create another valid token or grant',
    positiveOutcome: 'replacement differs and exactly one durable rotation succeeds',
    negativeOutcomes: ['invalid_grant for sequential and concurrent predecessor replay'],
    oracle: 'published-standard-and-approved-porta-contract',
    independentClientRule: 'raw concurrent requests plus independent durable-state observation',
  },
  {
    schemaVersion: 1,
    id: 'concurrent-issuer-and-jwks-separation',
    claimIds: ['CLAIM-R5-05'],
    sentinelId: 'ST-40',
    sliceIds: ['id-token-validation'],
    boundaries: allBoundaries,
    invariant: 'concurrent issuer, discovery, JWKS, and verification contexts never cross',
    positiveOutcome:
      'each tenant token validates only against its exact issuer and trusted key context',
    negativeOutcomes: ['cross-issuer token and cache context are rejected'],
    oracle: 'published-standard-and-approved-porta-contract',
    independentClientRule:
      'independent parallel HTTP and JOSE contexts with no shared Porta helper',
  },
  {
    schemaVersion: 1,
    id: 'userinfo-consent-logout-context-separation',
    claimIds: ['CLAIM-R5-04', 'CLAIM-R5-05'],
    sentinelId: 'ST-41',
    sliceIds: ['request-consent-client-integrity', 'opaque-token-separation'],
    boundaries: allBoundaries,
    invariant:
      'UserInfo, consent, and logout stay bound to client, session, tenant, and artifact type',
    positiveOutcome: 'same-context operation succeeds',
    negativeOutcomes: ['wrong context discloses no identity and changes no consent or session'],
    oracle: 'published-standard-and-approved-porta-contract',
    independentClientRule: 'raw context substitutions at each real public consumer',
  },
  {
    schemaVersion: 1,
    id: 'protocol-profile-completeness',
    claimIds: ['CLAIM-R5-02', 'CLAIM-R5-10'],
    sentinelId: 'ST-63',
    sliceIds: [
      'redirect-pkce',
      'authorization-code-binding',
      'request-consent-client-integrity',
      'id-token-validation',
      'opaque-token-separation',
      'refresh-rotation-replay',
    ],
    boundaries: allBoundaries,
    invariant:
      'every protocol slice retains complete threat, outcome, log, recovery, and versioned reference data',
    positiveOutcome: 'all required profile fields and applicable references validate',
    negativeOutcomes: [
      'any missing or orphan profile, claim, boundary, reference, log, or recovery field fails validation',
    ],
    oracle: 'published-standard-and-approved-porta-contract',
    independentClientRule: 'schema validation is independent of Porta implementation behavior',
  },
];
