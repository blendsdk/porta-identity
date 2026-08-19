import type {
  HumanAuthClaimRequirement,
  HumanAuthLogRequirement,
  HumanAuthSliceProfile,
} from './human-auth-slice-profile-model.js';
import {
  humanAuthActors as humanActors,
  humanAuthForbiddenLogFields,
} from './human-auth-slice-profile-model.js';

export {
  functionalEnumerationTimingPolicy,
  humanAuthProfileCatalogVersion,
  humanAuthRequirementSources,
} from './human-auth-slice-profile-model.js';
export type {
  HumanAuthClaimId,
  HumanAuthClaimRequirement,
  HumanAuthEntryPoint,
  HumanAuthLogRequirement,
  HumanAuthRequirementSource,
  HumanAuthSentinelId,
  HumanAuthSliceId,
  HumanAuthSliceProfile,
} from './human-auth-slice-profile-model.js';

function securityLog(event: string): readonly HumanAuthLogRequirement[] {
  return [
    {
      event,
      requiredFields: [
        'synthetic-correlation-id',
        'event-class',
        'public-method',
        'public-outcome-class',
      ],
      forbiddenFields: humanAuthForbiddenLogFields,
    },
  ];
}

const artifactExposureSideEffects = [
  'artifact-in-wrong-mailbox',
  'artifact-in-public-response',
  'artifact-in-redirect',
  'artifact-in-log',
  'artifact-in-audit-event',
  'artifact-in-trace',
  'artifact-in-report',
  'artifact-in-referrer',
  'artifact-in-browser-history',
  'artifact-in-retained-evidence',
] as const;

function profile(
  value: Omit<HumanAuthSliceProfile, 'schemaVersion' | 'profileVersion'>,
): HumanAuthSliceProfile {
  return { schemaVersion: 1, profileVersion: '2026-08-19', ...value };
}

/** Immutable, requirement-derived human-authentication and recovery slice profiles. */
export const humanAuthSliceProfiles: readonly HumanAuthSliceProfile[] = [
  profile({
    id: 'functional-enumeration',
    actors: humanActors,
    assets: ['account-existence', 'public-authentication-response-contract'],
    actions: ['submit-login', 'request-account-recovery'],
    resources: ['synthetic-existing-identity', 'synthetic-absent-identity'],
    entryPoints: [
      {
        id: 'login-submission',
        trustBoundary: 'unauthenticated browser input to authentication decision',
      },
      {
        id: 'recovery-request',
        trustBoundary: 'unauthenticated recovery input to synthetic delivery decision',
      },
    ],
    abuseCases: [
      'infer-account-existence-from-status',
      'infer-account-existence-from-body-schema',
      'infer-account-existence-from-response-headers',
    ],
    allowedOutcomes: [
      'existing-and-absent-pairs-produce-the-same-public-status',
      'existing-and-absent-pairs-produce-the-same-public-body-schema',
      'existing-and-absent-pairs-produce-the-same-security-relevant-header-set',
    ],
    exactRejections: [
      'invalid-or-absent-identity:equivalent-public-status-body-schema-and-headers',
    ],
    prohibitedSideEffects: [
      'identity-existence-disclosure',
      'authentication-with-invalid-credentials',
      'delivery-to-an-unintended-mailbox',
      'identity-specific-secret-in-public-response',
    ],
    privacySafeLogs: securityLog('functional-enumeration-rejection'),
    recoveryExpectations: [
      'a-subsequent-valid-login-remains-available-to-the-existing-account',
      'a-subsequent-valid-recovery-request-can-use-the-allowlisted-synthetic-delivery-channel',
    ],
    sourceIds: ['rd-05-r5.2', 'rd-05-r5.6', 'testing-strategy-st42-st48-st63'],
  }),
  profile({
    id: 'login-method-enforcement',
    actors: humanActors,
    assets: ['configured-login-method-policy', 'account-authentication-state'],
    actions: ['authenticate-with-enabled-method', 'attempt-disabled-login-method'],
    resources: ['tenant-login-policy', 'synthetic-account'],
    entryPoints: [
      {
        id: 'login-method-selection',
        trustBoundary: 'untrusted method selection to configured login-method enforcement',
      },
    ],
    abuseCases: ['invoke-disabled-password-login', 'invoke-disabled-passwordless-login'],
    allowedOutcomes: ['configured-enabled-method:authentication-may-proceed'],
    exactRejections: ['configured-disabled-method:method-disabled-public-rejection'],
    prohibitedSideEffects: [
      'session-creation-through-disabled-method',
      'credential-validation-through-disabled-method',
      'authentication-policy-bypass',
    ],
    privacySafeLogs: securityLog('disabled-login-method-rejection'),
    recoveryExpectations: ['the-configured-enabled-login-method-remains-usable-after-rejection'],
    sourceIds: ['rd-05-r5.2', 'rd-05-r5.6', 'testing-strategy-st42-st48-st63'],
  }),
  profile({
    id: 'failed-login-lockout-rate-limit',
    actors: humanActors,
    assets: ['failed-login-counter', 'account-lockout-state', 'authentication-rate-limit-budget'],
    actions: ['submit-invalid-password', 'submit-valid-password', 'retry-after-limit'],
    resources: ['synthetic-account', 'authentication-limit-key'],
    entryPoints: [
      {
        id: 'password-login-submission',
        trustBoundary: 'untrusted credential input to password and limit enforcement',
      },
    ],
    abuseCases: [
      'password-guessing',
      'failed-login-counter-bypass',
      'lockout-bypass',
      'rate-limit-key-variant-bypass',
    ],
    allowedOutcomes: ['valid-password-before-lockout:one-authenticated-session'],
    exactRejections: [
      'invalid-password:generic-authentication-rejection-and-failure-recorded',
      'locked-account:generic-authentication-rejection',
      'exhausted-limit:public-throttled-rejection',
    ],
    prohibitedSideEffects: [
      'authenticated-session-on-failure',
      'failure-counter-reset-by-input-variation',
      'lockout-bypass',
      'additional-delivery-or-session-after-throttle',
    ],
    privacySafeLogs: securityLog('authentication-enforcement-rejection'),
    recoveryExpectations: [
      'lockout-and-rate-limit-state-remain-enforced-until-the-declared-recovery-condition',
      'successful-authorized-recovery-restores-only-the-intended-account',
    ],
    sourceIds: ['rd-05-r5.2', 'rd-05-r5.6', 'testing-strategy-st42-st48-st63'],
  }),
  profile({
    id: 'session-lifecycle',
    actors: humanActors,
    assets: ['anonymous-session', 'authenticated-session', 'session-revocation-state'],
    actions: ['authenticate-session', 'use-session', 'logout-session', 'revoke-session'],
    resources: ['browser-session', 'server-session-record'],
    entryPoints: [
      {
        id: 'session-authentication-transition',
        trustBoundary: 'anonymous browser session to authenticated server session',
      },
      {
        id: 'session-protected-request',
        trustBoundary: 'browser session credential to protected application state',
      },
      {
        id: 'session-termination',
        trustBoundary: 'authenticated termination request to server session state',
      },
    ],
    abuseCases: [
      'session-fixation',
      'expired-session-reuse',
      'logged-out-session-reuse',
      'revoked-session-reuse',
    ],
    allowedOutcomes: ['successful-authentication:anonymous-session-identifier-is-renewed'],
    exactRejections: [
      'expired-session:unauthenticated',
      'logged-out-session:unauthenticated',
      'revoked-session:unauthenticated',
    ],
    prohibitedSideEffects: [
      'anonymous-session-identifier-retained-after-authentication',
      'protected-state-access-by-expired-session',
      'protected-state-access-by-terminated-session',
    ],
    privacySafeLogs: securityLog('session-lifecycle-rejection'),
    recoveryExpectations: [
      'fresh-authentication-creates-a-distinct-session-after-valid-reauthentication',
    ],
    sourceIds: ['rd-05-r5.2', 'rd-05-r5.6', 'testing-strategy-st42-st48-st63'],
  }),
  profile({
    id: 'cookie-csrf',
    actors: humanActors,
    assets: ['session-cookie', 'csrf-token', 'state-changing-account-operation'],
    actions: ['inspect-production-cookie', 'submit-state-changing-request'],
    resources: ['host-only-session-cookie', 'csrf-protected-operation'],
    entryPoints: [
      {
        id: 'browser-cookie-boundary',
        trustBoundary: 'server cookie issuance to user-agent cookie policy',
      },
      {
        id: 'state-changing-browser-request',
        trustBoundary: 'browser origin and CSRF proof to authenticated mutation handler',
      },
    ],
    abuseCases: [
      'missing-csrf-token',
      'wrong-csrf-token',
      'cross-origin-state-change',
      'cross-site-cookie-confusion',
      'domain-cookie-widening',
    ],
    allowedOutcomes: [
      'production-session-cookie:is-secure-httponly-samesite-and-host-only',
      'same-origin-valid-csrf-proof:mutation-may-proceed',
    ],
    exactRejections: [
      'missing-or-wrong-csrf-proof:forbidden-before-mutation',
      'disallowed-origin:forbidden-before-mutation',
    ],
    prohibitedSideEffects: [
      'state-change-after-csrf-rejection',
      'cross-site-session-disclosure',
      'persistent-cookie-domain-widening',
    ],
    privacySafeLogs: securityLog('csrf-rejection'),
    recoveryExpectations: [
      'same-origin-request-with-fresh-valid-csrf-proof-can-reach-the-operation',
    ],
    sourceIds: ['rd-05-r5.2', 'rd-05-r5.6', 'testing-strategy-st42-st48-st63'],
  }),
  profile({
    id: 'magic-link',
    actors: humanActors,
    assets: ['magic-link-secret', 'magic-link-recipient-binding', 'magic-link-tenant-binding'],
    actions: ['request-magic-link', 'consume-magic-link', 'replay-magic-link'],
    resources: ['synthetic-mailbox', 'tenant-bound-magic-link'],
    entryPoints: [
      {
        id: 'magic-link-request',
        trustBoundary: 'unauthenticated request to allowlisted synthetic mail delivery',
      },
      {
        id: 'magic-link-consumption',
        trustBoundary: 'untrusted delivered artifact to single-use authentication state',
      },
    ],
    abuseCases: [
      'predictable-magic-link',
      'guess-magic-link',
      'wrong-recipient-use',
      'wrong-tenant-use',
      'expired-use',
      'sequential-replay',
      'request-throttling-bypass',
    ],
    allowedOutcomes: [
      'issued-artifact:is-cryptographically-unpredictable',
      'intended-recipient-and-tenant-within-configured-expiry:one-success',
    ],
    exactRejections: [
      'wrong-recipient-or-tenant:invalid-artifact',
      'configured-expiry-reached:expired-artifact',
      'sequential-replay:invalid-artifact',
      'request-limit-exhausted:public-throttled-rejection',
    ],
    prohibitedSideEffects: [
      'authentication-for-wrong-recipient-or-tenant',
      'second-authentication-from-one-artifact',
      'delivery-after-throttle',
      ...artifactExposureSideEffects,
    ],
    privacySafeLogs: securityLog('magic-link-rejection'),
    recoveryExpectations: [
      'a-newly-issued-artifact-invalidates-no-unrelated-account-or-tenant-state',
    ],
    sourceIds: ['rd-05-r5.2', 'rd-05-r5.7', 'testing-strategy-st42-st48-st63'],
  }),
  profile({
    id: 'password-reset',
    actors: humanActors,
    assets: ['password-reset-secret', 'account-password', 'reset-recipient-and-tenant-binding'],
    actions: ['request-password-reset', 'complete-password-reset', 'replay-password-reset'],
    resources: ['synthetic-mailbox', 'tenant-bound-password-reset'],
    entryPoints: [
      {
        id: 'password-reset-request',
        trustBoundary: 'unauthenticated request to allowlisted synthetic mail delivery',
      },
      {
        id: 'password-reset-completion',
        trustBoundary: 'untrusted reset artifact to account credential mutation',
      },
    ],
    abuseCases: [
      'predictable-reset-token',
      'guess-reset-token',
      'wrong-recipient-use',
      'wrong-tenant-use',
      'expired-use',
      'sequential-replay',
      'request-throttling-bypass',
    ],
    allowedOutcomes: [
      'issued-artifact:is-cryptographically-unpredictable',
      'intended-recipient-and-tenant-within-configured-expiry:one-password-change',
    ],
    exactRejections: [
      'wrong-recipient-or-tenant:invalid-artifact',
      'configured-expiry-reached:expired-artifact',
      'sequential-replay:invalid-artifact',
      'request-limit-exhausted:public-throttled-rejection',
    ],
    prohibitedSideEffects: [
      'password-change-for-wrong-recipient-or-tenant',
      'second-password-change-from-one-artifact',
      'delivery-after-throttle',
      ...artifactExposureSideEffects,
    ],
    privacySafeLogs: securityLog('password-reset-rejection'),
    recoveryExpectations: [
      'a-fresh-valid-reset-remains-possible-without-restoring-consumed-artifacts',
    ],
    sourceIds: ['rd-05-r5.2', 'rd-05-r5.7', 'testing-strategy-st42-st48-st63'],
  }),
  profile({
    id: 'invitation',
    actors: humanActors,
    assets: ['invitation-secret', 'invited-recipient', 'invitation-tenant-and-role-binding'],
    actions: ['issue-invitation', 'accept-invitation', 'replay-invitation'],
    resources: ['synthetic-mailbox', 'tenant-bound-invitation'],
    entryPoints: [
      {
        id: 'invitation-delivery',
        trustBoundary: 'authorized invitation request to allowlisted synthetic mail delivery',
      },
      {
        id: 'invitation-acceptance',
        trustBoundary: 'untrusted invitation artifact to membership creation',
      },
    ],
    abuseCases: [
      'predictable-invitation-token',
      'guess-invitation-token',
      'wrong-recipient-use',
      'wrong-tenant-use',
      'expired-use',
      'sequential-replay',
      'request-throttling-bypass',
    ],
    allowedOutcomes: [
      'issued-artifact:is-cryptographically-unpredictable',
      'intended-recipient-and-tenant-within-configured-expiry:one-membership',
    ],
    exactRejections: [
      'wrong-recipient-or-tenant:invalid-artifact',
      'configured-expiry-reached:expired-artifact',
      'sequential-replay:invalid-artifact',
      'request-limit-exhausted:public-throttled-rejection',
    ],
    prohibitedSideEffects: [
      'membership-for-wrong-recipient-or-tenant',
      'second-membership-from-one-artifact',
      'role-or-tenant-escalation',
      'delivery-after-throttle',
      ...artifactExposureSideEffects,
    ],
    privacySafeLogs: securityLog('invitation-rejection'),
    recoveryExpectations: [
      'a-rejected-invitation-does-not-change-existing-membership-or-role-state',
    ],
    sourceIds: ['rd-05-r5.2', 'rd-05-r5.7', 'testing-strategy-st42-st48-st63'],
  }),
  profile({
    id: 'email-otp',
    actors: humanActors,
    assets: ['email-otp-secret', 'otp-recipient-and-tenant-binding', 'otp-delivery-budget'],
    actions: ['request-email-otp', 'verify-email-otp', 'replay-email-otp'],
    resources: ['synthetic-mailbox', 'tenant-bound-email-otp'],
    entryPoints: [
      {
        id: 'email-otp-request',
        trustBoundary: 'untrusted request to throttled synthetic mail delivery',
      },
      {
        id: 'email-otp-verification',
        trustBoundary: 'untrusted OTP value to single-use verification state',
      },
    ],
    abuseCases: [
      'predictable-email-otp',
      'guess-email-otp',
      'wrong-recipient-use',
      'wrong-tenant-use',
      'expired-use',
      'sequential-replay',
      'delivery-flooding',
    ],
    allowedOutcomes: [
      'issued-artifact:is-cryptographically-unpredictable',
      'intended-recipient-and-tenant-within-configured-expiry:one-verification',
    ],
    exactRejections: [
      'wrong-recipient-or-tenant:invalid-otp',
      'configured-expiry-reached:expired-otp',
      'sequential-replay:invalid-otp',
      'delivery-limit-exhausted:public-throttled-rejection',
    ],
    prohibitedSideEffects: [
      'verification-for-wrong-recipient-or-tenant',
      'second-verification-from-one-otp',
      'delivery-after-throttle',
      ...artifactExposureSideEffects,
    ],
    privacySafeLogs: securityLog('email-otp-rejection'),
    recoveryExpectations: [
      'a-fresh-otp-after-the-declared-recovery-condition-does-not-revalidate-an-old-otp',
    ],
    sourceIds: ['rd-05-r5.2', 'rd-05-r5.7', 'testing-strategy-st42-st48-st63'],
  }),
  profile({
    id: 'totp',
    actors: humanActors,
    assets: [
      'totp-secret',
      'totp-enforcement-state',
      'totp-verification-budget',
      'authenticated-account',
    ],
    actions: [
      'submit-valid-totp',
      'submit-invalid-totp',
      'replay-totp',
      'attempt-second-factor-bypass',
    ],
    resources: ['tenant-bound-encrypted-totp-enrollment', 'totp-protected-session'],
    entryPoints: [
      {
        id: 'totp-verification',
        trustBoundary: 'untrusted second-factor value to protected session authorization',
      },
    ],
    abuseCases: [
      'predictable-totp',
      'guess-totp',
      'omit-required-totp',
      'bypass-second-factor',
      'use-wrong-account-or-tenant-totp',
      'configured-expiry-bypass',
      'sequential-replay',
      'verification-throttling-bypass',
    ],
    allowedOutcomes: [
      'generated-totp:is-cryptographically-unpredictable',
      'correct-current-totp-for-intended-account-and-tenant:one-second-factor-success',
    ],
    exactRejections: [
      'missing-invalid-or-wrong-account-or-tenant-totp:second-factor-required-rejection',
      'configured-expiry-reached:invalid-totp',
      'sequential-replay:invalid-totp',
      'verification-limit-exhausted:public-throttled-rejection',
    ],
    prohibitedSideEffects: [
      'protected-session-without-required-second-factor',
      'totp-secret-disclosure',
      'second-factor-state-change-on-rejection',
      'second-success-from-one-totp',
      ...artifactExposureSideEffects,
    ],
    privacySafeLogs: securityLog('totp-rejection'),
    recoveryExpectations: ['a-subsequent-current-valid-totp-can-satisfy-only-the-intended-account'],
    sourceIds: ['rd-05-r5.2', 'rd-05-r5.7', 'testing-strategy-st42-st48-st63'],
  }),
  profile({
    id: 'recovery-code',
    actors: humanActors,
    assets: [
      'hashed-recovery-code',
      'recovery-code-set',
      'recovery-verification-budget',
      'second-factor-recovery-state',
    ],
    actions: ['consume-recovery-code', 'replay-recovery-code', 'retry-after-limit'],
    resources: ['intended-account-and-tenant-recovery-code', 'second-factor-protected-session'],
    entryPoints: [
      {
        id: 'recovery-code-verification',
        trustBoundary: 'untrusted recovery value to single-use second-factor recovery state',
      },
    ],
    abuseCases: [
      'predictable-recovery-code',
      'guess-recovery-code',
      'use-wrong-account-or-tenant-code',
      'configured-expiry-bypass',
      'sequential-replay',
      'verification-throttling-bypass',
      'recover-with-exposed-code',
    ],
    allowedOutcomes: [
      'generated-recovery-code:is-cryptographically-unpredictable',
      'unused-in-lifetime-code-for-intended-account-and-tenant:one-recovery-success',
    ],
    exactRejections: [
      'wrong-account-or-tenant-or-unknown-code:invalid-recovery-code',
      'configured-expiry-reached:invalid-recovery-code',
      'sequential-replay:invalid-recovery-code',
      'verification-limit-exhausted:public-throttled-rejection',
    ],
    prohibitedSideEffects: [
      'recovery-for-wrong-account',
      'second-recovery-from-one-code',
      'recovery-code-secret-disclosure',
      'unrelated-code-consumption',
      ...artifactExposureSideEffects,
    ],
    privacySafeLogs: securityLog('recovery-code-rejection'),
    recoveryExpectations: ['unused-codes-remain-valid-and-the-consumed-code-remains-invalid'],
    sourceIds: ['rd-05-r5.2', 'rd-05-r5.7', 'testing-strategy-st42-st48-st63'],
  }),
];

/** Immutable claim-to-sentinel bindings for Task 8.2; these define no executable observations. */
export const humanAuthClaimRequirements: readonly HumanAuthClaimRequirement[] = [
  {
    schemaVersion: 1,
    requirementVersion: '2026-08-19',
    id: 'human-auth-st42-functional-enumeration',
    claimIds: ['CLAIM-R5-02', 'CLAIM-R5-06'],
    sentinelId: 'ST-42',
    sliceIds: ['functional-enumeration'],
    invariant:
      'existing and absent identity requests are equivalent by public status, body schema, and security-relevant headers without disclosing existence',
    positiveOutcome: 'paired functional observations complete without identity disclosure',
    negativeOutcomes: ['any status, body-schema, or security-header distinction is a failure'],
    oracle: 'approved-requirements-only',
    evidenceStatus: 'specification-only',
  },
  {
    schemaVersion: 1,
    requirementVersion: '2026-08-19',
    id: 'human-auth-st43-method-lockout-limits',
    claimIds: ['CLAIM-R5-02', 'CLAIM-R5-06'],
    sentinelId: 'ST-43',
    sliceIds: ['login-method-enforcement', 'failed-login-lockout-rate-limit'],
    invariant:
      'disabled methods reject exactly and equivalent failed-login variants share failure tracking, lockout, and rate-limit enforcement',
    positiveOutcome: 'an enabled method succeeds before enforcement limits are exhausted',
    negativeOutcomes: [
      'disabled method is rejected before session creation',
      'locked or throttled authentication remains rejected across equivalent variants',
    ],
    oracle: 'approved-requirements-only',
    evidenceStatus: 'specification-only',
  },
  {
    schemaVersion: 1,
    requirementVersion: '2026-08-19',
    id: 'human-auth-st44-session-lifecycle',
    claimIds: ['CLAIM-R5-02', 'CLAIM-R5-06'],
    sentinelId: 'ST-44',
    sliceIds: ['session-lifecycle'],
    invariant:
      'authentication renews the anonymous session and expired, logged-out, or revoked sessions cannot access protected state',
    positiveOutcome: 'valid authentication creates one distinct authenticated session',
    negativeOutcomes: ['terminated or expired session is unauthenticated without protected effect'],
    oracle: 'approved-requirements-only',
    evidenceStatus: 'specification-only',
  },
  {
    schemaVersion: 1,
    requirementVersion: '2026-08-19',
    id: 'human-auth-st45-cookie-csrf',
    claimIds: ['CLAIM-R5-02', 'CLAIM-R5-06'],
    sentinelId: 'ST-45',
    sliceIds: ['cookie-csrf'],
    invariant:
      'production cookies are Secure, HttpOnly, SameSite, and host-only while state changes require the exact origin and CSRF proof',
    positiveOutcome: 'same-origin request with valid CSRF proof may perform one intended mutation',
    negativeOutcomes: [
      'missing, wrong, or disallowed-origin CSRF proof is forbidden before mutation',
    ],
    oracle: 'approved-requirements-only',
    evidenceStatus: 'specification-only',
  },
  {
    schemaVersion: 1,
    requirementVersion: '2026-08-19',
    id: 'human-auth-st46-delivered-artifacts',
    claimIds: ['CLAIM-R5-02', 'CLAIM-R5-07'],
    sentinelId: 'ST-46',
    sliceIds: ['magic-link', 'password-reset', 'invitation'],
    invariant:
      'each unpredictable delivered artifact is bound to its intended recipient and tenant, expires at the configured boundary, and succeeds only once sequentially',
    positiveOutcome:
      'intended synthetic recipient and tenant consume one in-lifetime artifact once',
    negativeOutcomes: [
      'wrong recipient or tenant is rejected without state change',
      'expired or sequentially replayed artifact is rejected without another durable effect',
    ],
    oracle: 'approved-requirements-only',
    evidenceStatus: 'specification-only',
  },
  {
    schemaVersion: 1,
    requirementVersion: '2026-08-19',
    id: 'human-auth-st47-email-otp',
    claimIds: ['CLAIM-R5-02', 'CLAIM-R5-07'],
    sentinelId: 'ST-47',
    sliceIds: ['email-otp'],
    invariant:
      'unpredictable email OTP is recipient- and tenant-bound, expires at the configured boundary, succeeds once sequentially, and delivery is throttled',
    positiveOutcome:
      'one in-lifetime OTP verifies the intended synthetic recipient and tenant once',
    negativeOutcomes: [
      'wrong, expired, replayed, or over-limit OTP operation is rejected without verification',
    ],
    oracle: 'approved-requirements-only',
    evidenceStatus: 'specification-only',
  },
  {
    schemaVersion: 1,
    requirementVersion: '2026-08-19',
    id: 'human-auth-st48-totp-recovery-code',
    claimIds: ['CLAIM-R5-02', 'CLAIM-R5-07', 'CLAIM-R5-12'],
    sentinelId: 'ST-48',
    sliceIds: ['totp', 'recovery-code'],
    invariant:
      'unpredictable TOTP and recovery codes are account- and tenant-bound, enforce configured expiry and throttling, cannot bypass required second factor, and are single-use under sequential replay',
    positiveOutcome:
      'valid current TOTP or one unused intended-account recovery code satisfies the second factor',
    negativeOutcomes: [
      'missing or invalid TOTP and replayed or wrong-account recovery code are rejected',
    ],
    oracle: 'approved-requirements-only',
    evidenceStatus: 'specification-only',
  },
  {
    schemaVersion: 1,
    requirementVersion: '2026-08-19',
    id: 'human-auth-st63-profile-completeness',
    claimIds: ['CLAIM-R5-02', 'CLAIM-R5-10'],
    sentinelId: 'ST-63',
    sliceIds: [
      'functional-enumeration',
      'login-method-enforcement',
      'failed-login-lockout-rate-limit',
      'session-lifecycle',
      'cookie-csrf',
      'magic-link',
      'password-reset',
      'invitation',
      'email-otp',
      'totp',
      'recovery-code',
    ],
    invariant:
      'every human-authentication slice defines its complete threat, rejection, non-effect, privacy-safe log, and recovery contract before behavior is observed',
    positiveOutcome: 'the complete versioned requirement catalog validates without orphan slices',
    negativeOutcomes: ['any missing or orphan requirement field invalidates the profile catalog'],
    oracle: 'approved-requirements-only',
    evidenceStatus: 'specification-only',
  },
];
