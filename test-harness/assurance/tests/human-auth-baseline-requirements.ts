/** Human-authentication sentinels whose existing public tests are audited before live work. */
export const humanAuthBaselineCaseIds = [
  'ST-42',
  'ST-43',
  'ST-44',
  'ST-45',
  'ST-46',
  'ST-47',
  'ST-48',
] as const;

export type HumanAuthBaselineCaseId = (typeof humanAuthBaselineCaseIds)[number];

/** Stable reasons that prevent a current test from being an exact human-auth sentinel. */
export const humanAuthCandidateRejectionReasons = [
  'conditional-or-nonfatal-prerequisite',
  'conditional-assertion',
  'fake-artifact-only',
  'pre-marked-artifact',
  'status-only-oracle',
  'mock-or-service-only',
  'missing-independent-observation',
  'missing-delivery-observation',
  'missing-binding-observation',
  'missing-public-sequential-reuse',
  'incomplete-sentinel-scope',
  'unresolved-totp-replay-contract',
] as const;

export type HumanAuthCandidateRejectionReason = (typeof humanAuthCandidateRejectionReasons)[number];

export type HumanAuthCandidateScope =
  | 'functional-response-equivalence'
  | 'login-method-and-limit-enforcement'
  | 'session-lifecycle'
  | 'cookie-and-csrf'
  | 'artifact-delivery-and-binding'
  | 'consumed-artifact-sequential-reuse'
  | 'email-otp-sequential-reuse'
  | 'totp-and-recovery-sequential-reuse';

/** One requirements-owned audit of an existing test; eligibility is never inferred from its name. */
export interface HumanAuthBaselineCandidateRequirement {
  readonly path: string;
  readonly testTitle: string;
  readonly publicBoundary: boolean;
  readonly prerequisite: 'none' | 'fatal' | 'conditional-or-nonfatal';
  readonly independentObservations: readonly string[];
  readonly eligibleScopes: readonly HumanAuthCandidateScope[];
  readonly exactSentinelEligible: false;
  readonly rejectionReasons: readonly HumanAuthCandidateRejectionReason[];
}

/** Expected baseline result before a live human-auth sentinel is implemented. */
export interface HumanAuthBaselineRequirement {
  readonly caseId: HumanAuthBaselineCaseId;
  readonly claimIds: readonly ('CLAIM-R5-06' | 'CLAIM-R5-07')[];
  readonly command: readonly ['yarn', 'assurance:baseline', '--case', HumanAuthBaselineCaseId];
  readonly classification: 'natural-red';
  readonly reason: 'missing-exact-human-auth-sentinel';
  readonly selectedSentinel: null;
  readonly productFailureObserved: false;
  readonly candidates: readonly HumanAuthBaselineCandidateRequirement[];
}

const candidate = (
  value: HumanAuthBaselineCandidateRequirement,
): HumanAuthBaselineCandidateRequirement => Object.freeze(value);

const candidatesByCase: Readonly<
  Record<HumanAuthBaselineCaseId, readonly HumanAuthBaselineCandidateRequirement[]>
> = {
  'ST-42': [
    candidate({
      path: 'packages/server/tests/e2e/security/user-enumeration.test.ts',
      testTitle:
        'should return same response for forgot-password with existing and non-existing email',
      publicBoundary: true,
      prerequisite: 'none',
      independentObservations: ['status'],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: ['status-only-oracle', 'missing-independent-observation'],
    }),
    candidate({
      path: 'packages/server/tests/pentest/magic-link-attacks/email-enumeration.test.ts',
      testTitle: 'should return same status for magic link with existing email',
      publicBoundary: true,
      prerequisite: 'conditional-or-nonfatal',
      independentObservations: ['status'],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: [
        'conditional-or-nonfatal-prerequisite',
        'status-only-oracle',
        'missing-independent-observation',
      ],
    }),
  ],
  'ST-43': [
    candidate({
      path: 'packages/server/tests/e2e/security/rate-limiting.test.ts',
      testTitle: 'should return 429 after exceeding login attempts',
      publicBoundary: true,
      prerequisite: 'none',
      independentObservations: ['status'],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: ['missing-independent-observation', 'incomplete-sentinel-scope'],
    }),
  ],
  'ST-44': [],
  'ST-45': [
    candidate({
      path: 'packages/server/tests/ui/security/cookie-flags.spec.ts',
      testTitle: 'should set CSRF cookie as HttpOnly',
      publicBoundary: true,
      prerequisite: 'none',
      independentObservations: ['browser-cookie-metadata', 'document-cookie'],
      eligibleScopes: ['cookie-and-csrf'],
      exactSentinelEligible: false,
      rejectionReasons: ['incomplete-sentinel-scope'],
    }),
  ],
  'ST-46': [
    candidate({
      path: 'packages/server/tests/e2e/auth/magic-link.test.ts',
      testTitle: 'should reject magic link on second use',
      publicBoundary: true,
      prerequisite: 'fatal',
      independentObservations: ['status'],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: [
        'status-only-oracle',
        'conditional-assertion',
        'missing-independent-observation',
      ],
    }),
    candidate({
      path: 'packages/server/tests/e2e/auth/forgot-password.test.ts',
      testTitle: 'should reject reset token on second use',
      publicBoundary: true,
      prerequisite: 'conditional-or-nonfatal',
      independentObservations: ['status'],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: [
        'conditional-or-nonfatal-prerequisite',
        'conditional-assertion',
        'status-only-oracle',
      ],
    }),
    candidate({
      path: 'packages/server/tests/ui/flows/magic-link-verify.spec.ts',
      testTitle: 'already-used token shows error page',
      publicBoundary: true,
      prerequisite: 'none',
      independentObservations: ['error-page'],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: ['pre-marked-artifact', 'missing-public-sequential-reuse'],
    }),
    candidate({
      path: 'packages/server/tests/ui/security/reset-password-abuse.spec.ts',
      testTitle: 'token marked as used in DB after successful reset',
      publicBoundary: true,
      prerequisite: 'none',
      independentObservations: ['success-page', 'rejection-page', 'password-form-absence'],
      eligibleScopes: ['consumed-artifact-sequential-reuse'],
      exactSentinelEligible: false,
      rejectionReasons: [
        'missing-delivery-observation',
        'missing-binding-observation',
        'incomplete-sentinel-scope',
      ],
    }),
    candidate({
      path: 'packages/server/tests/ui/flows/invitation.spec.ts',
      testTitle: 'accepted invitation cannot be reused',
      publicBoundary: true,
      prerequisite: 'none',
      independentObservations: ['success-page', 'rejection-page', 'password-form-absence'],
      eligibleScopes: ['consumed-artifact-sequential-reuse'],
      exactSentinelEligible: false,
      rejectionReasons: [
        'missing-delivery-observation',
        'missing-binding-observation',
        'incomplete-sentinel-scope',
      ],
    }),
    candidate({
      path: 'packages/server/tests/pentest/magic-link-attacks/token-replay.test.ts',
      testTitle: 'should reject reuse of consumed magic link token',
      publicBoundary: true,
      prerequisite: 'none',
      independentObservations: ['status'],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: ['fake-artifact-only', 'status-only-oracle'],
    }),
  ],
  'ST-47': [
    candidate({
      path: 'packages/server/tests/ui/flows/two-factor.spec.ts',
      testTitle: 'should authenticate with valid OTP code',
      publicBoundary: true,
      prerequisite: 'conditional-or-nonfatal',
      independentObservations: ['authorization-code'],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: [
        'conditional-or-nonfatal-prerequisite',
        'conditional-assertion',
        'missing-public-sequential-reuse',
      ],
    }),
  ],
  'ST-48': [
    candidate({
      path: 'packages/server/tests/ui/flows/two-factor-edge-cases.spec.ts',
      testTitle: 'invalid TOTP code shows error',
      publicBoundary: true,
      prerequisite: 'none',
      independentObservations: ['error-page'],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: ['missing-public-sequential-reuse', 'unresolved-totp-replay-contract'],
    }),
    candidate({
      path: 'packages/server/tests/unit/two-factor/service.test.ts',
      testTitle: 'should verify a valid recovery code and mark it used',
      publicBoundary: false,
      prerequisite: 'none',
      independentObservations: [],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: ['mock-or-service-only', 'missing-public-sequential-reuse'],
    }),
  ],
};

/** Immutable expected audits; exact eligibility remains RED until a complete candidate exists. */
export const humanAuthBaselineRequirements: readonly HumanAuthBaselineRequirement[] =
  humanAuthBaselineCaseIds.map((caseId) =>
    Object.freeze({
      caseId,
      claimIds: caseId <= 'ST-45' ? (['CLAIM-R5-06'] as const) : (['CLAIM-R5-07'] as const),
      command: ['yarn', 'assurance:baseline', '--case', caseId] as const,
      classification: 'natural-red' as const,
      reason: 'missing-exact-human-auth-sentinel' as const,
      selectedSentinel: null,
      productFailureObserved: false as const,
      candidates: Object.freeze(candidatesByCase[caseId]),
    }),
  );
