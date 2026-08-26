import {
  baselineCandidateSchema,
  humanAuthBaselineCandidateSchema,
  humanAuthBaselineCaseIds,
  p1BaselineCandidateSchema,
  p1BaselineCaseIds,
  protocolBaselineCaseIds,
  tenantAdminBaselineCaseIds,
  type BaselineCandidate,
  type HumanAuthBaselineCandidate,
  type HumanAuthBaselineCaseId,
  type P1BaselineCandidate,
  type P1BaselineCaseId,
  type ProtocolBaselineCaseId,
  type TenantAdminBaselineCaseId,
} from './model.js';

/** Existing external tests reviewed before declaring that a live sentinel is absent. */
const candidatesByCase: Readonly<Record<TenantAdminBaselineCaseId, readonly BaselineCandidate[]>> =
  {
    'ST-28': [
      {
        path: 'packages/server/tests/pentest/admin-security/privilege-escalation.test.ts',
        testTitle: 'should reject cross-tenant admin access',
        eligible: false,
        rejectionReasons: [
          'authentication-denial-before-handler',
          'missing-authorized-control',
          'missing-independent-nonmutation',
        ],
      },
      {
        path: 'packages/server/tests/pentest/admin-security/idor.test.ts',
        testTitle: 'should reject access to Org B users via Org A context',
        eligible: false,
        rejectionReasons: [
          'authentication-denial-before-handler',
          'broad-status-oracle',
          'missing-authorized-control',
          'missing-independent-nonmutation',
        ],
      },
    ],
    'ST-29': [
      {
        path: 'packages/server/tests/pentest/admin-security/privilege-escalation.test.ts',
        testTitle: 'should reject self-assignment of admin role',
        eligible: false,
        rejectionReasons: [
          'authentication-denial-before-handler',
          'broad-status-oracle',
          'missing-authorized-control',
          'missing-independent-nonmutation',
        ],
      },
      {
        path: 'packages/server/tests/pentest/admin-security/idor.test.ts',
        testTitle: 'should reject cross-org client modification',
        eligible: false,
        rejectionReasons: [
          'authentication-denial-before-handler',
          'missing-authorized-control',
          'missing-independent-nonmutation',
        ],
      },
    ],
    'ST-30': [
      {
        path: 'packages/server/tests/pentest/oidc-client-auth/client-auth.test.ts',
        testTitle: 'should not allow cross-tenant client_id probing',
        eligible: false,
        rejectionReasons: ['mock-only', 'missing-concurrent-tenant-context'],
      },
    ],
    'ST-31': [],
    'ST-32': [
      {
        path: 'packages/server/tests/pentest/admin-security/privilege-escalation.test.ts',
        testTitle: 'should reject organization creation without super-admin',
        eligible: false,
        rejectionReasons: [
          'authentication-denial-before-handler',
          'missing-authorized-control',
          'missing-independent-nonmutation',
        ],
      },
      {
        path: 'packages/server/tests/pentest/admin-security/two-factor-admin.test.ts',
        testTitle: 'should prevent disabling super-admin 2FA without authentication',
        eligible: false,
        rejectionReasons: [
          'authentication-denial-before-handler',
          'missing-authorized-control',
          'missing-independent-nonmutation',
        ],
      },
    ],
  };

for (const caseId of tenantAdminBaselineCaseIds) {
  for (const candidate of candidatesByCase[caseId]) baselineCandidateSchema.parse(candidate);
}

/** Returns the frozen audit candidates for one registered tenant/admin case. */
export function baselineCandidatesForCase(
  caseId: TenantAdminBaselineCaseId,
): readonly BaselineCandidate[] {
  return candidatesByCase[caseId];
}

/** Existing OIDC E2E and pentest cases audited against the exact protocol oracle. */
const protocolCandidatesByCase: Readonly<
  Record<ProtocolBaselineCaseId, readonly BaselineCandidate[]>
> = {
  'ST-33': [
    {
      path: 'packages/server/tests/pentest/oidc-attacks/pkce-bypass.test.ts',
      testTitle: 'should reject auth request without code_challenge',
      eligible: false,
      rejectionReasons: [
        'broad-status-oracle',
        'missing-positive-control',
        'missing-code-issuance-observation',
      ],
    },
    {
      path: 'packages/server/tests/pentest/oidc-attacks/redirect-uri-manipulation.test.ts',
      testTitle: 'should reject redirect to evil domain',
      eligible: false,
      rejectionReasons: ['missing-positive-control', 'missing-code-issuance-observation'],
    },
  ],
  'ST-34': [
    {
      path: 'packages/server/tests/pentest/oidc-attacks/code-injection.test.ts',
      testTitle: 'should reject code exchange with wrong client credentials',
      eligible: false,
      rejectionReasons: [
        'fake-artifact-only',
        'missing-positive-control',
        'missing-durable-state-observation',
      ],
    },
    {
      path: 'packages/server/tests/e2e/invalid-params/token-exchange.test.ts',
      testTitle: 'should reject already-used authorization code',
      eligible: false,
      rejectionReasons: [
        'fake-artifact-only',
        'missing-positive-control',
        'missing-durable-state-observation',
      ],
    },
  ],
  'ST-35': [
    {
      path: 'packages/server/tests/pentest/oidc-client-auth/client-auth.test.ts',
      testTitle: 'should return consistent response shape for valid and invalid secrets',
      eligible: false,
      rejectionReasons: [
        'missing-positive-control',
        'missing-context-substitution',
        'missing-independent-nonmutation',
      ],
    },
  ],
  'ST-36': [
    {
      path: 'packages/server/tests/pentest/crypto-attacks/jwt-manipulation.test.ts',
      testTitle: 'should reject JWT with modified sub claim',
      eligible: false,
      rejectionReasons: [
        'conditional-prerequisite-exit',
        'wrong-token-kind',
        'missing-independent-jose',
        'missing-positive-control',
      ],
    },
  ],
  'ST-37': [
    {
      path: 'packages/server/tests/pentest/crypto-attacks/jwt-algorithm-confusion.test.ts',
      testTitle: 'should reject JWT with alg: none (unsigned token)',
      eligible: false,
      rejectionReasons: [
        'wrong-token-kind',
        'missing-independent-jose',
        'missing-positive-control',
        'missing-attacker-key-location-variants',
      ],
    },
    {
      path: 'packages/server/tests/pentest/crypto-attacks/jwt-manipulation.test.ts',
      testTitle: 'should reject JWT with modified iss claim',
      eligible: false,
      rejectionReasons: [
        'conditional-prerequisite-exit',
        'wrong-token-kind',
        'missing-independent-jose',
        'missing-attacker-key-location-variants',
      ],
    },
  ],
  'ST-38': [
    {
      path: 'packages/server/tests/pentest/oidc-attacks/token-substitution.test.ts',
      testTitle: 'should reject HMAC-signed JWT (algorithm confusion)',
      eligible: false,
      rejectionReasons: [
        'broad-status-oracle',
        'fake-artifact-only',
        'missing-positive-control',
        'missing-real-artifact-substitution',
      ],
    },
  ],
  'ST-39': [
    {
      path: 'packages/server/tests/pentest/oidc-attacks/refresh-token-replay.test.ts',
      testTitle: 'should reject concurrent refresh token usage (race condition)',
      eligible: false,
      rejectionReasons: [
        'fake-artifact-only',
        'missing-positive-control',
        'missing-durable-state-observation',
        'missing-true-concurrency',
      ],
    },
    {
      path: 'packages/server/tests/e2e/flows/refresh-token.test.ts',
      testTitle: 'should reject an invalid/random refresh token',
      eligible: false,
      rejectionReasons: [
        'fake-artifact-only',
        'missing-positive-control',
        'missing-durable-state-observation',
      ],
    },
  ],
  'ST-40': [
    {
      path: 'packages/server/tests/pentest/oidc-client-auth/client-auth.test.ts',
      testTitle: 'should not allow cross-tenant client_id probing',
      eligible: false,
      rejectionReasons: ['missing-concurrent-issuer-context', 'missing-independent-jose'],
    },
  ],
  'ST-41': [],
};

for (const caseId of protocolBaselineCaseIds) {
  for (const candidate of protocolCandidatesByCase[caseId])
    baselineCandidateSchema.parse(candidate);
}

/** Returns the frozen audit candidates for one registered protocol case. */
export function protocolBaselineCandidatesForCase(
  caseId: ProtocolBaselineCaseId,
): readonly BaselineCandidate[] {
  return protocolCandidatesByCase[caseId];
}

/** Existing human-authentication tests audited against complete external-boundary sentinels. */
const humanAuthCandidatesByCase: Readonly<
  Record<HumanAuthBaselineCaseId, readonly HumanAuthBaselineCandidate[]>
> = {
  'ST-42': [
    {
      path: 'packages/server/tests/e2e/security/user-enumeration.test.ts',
      testTitle:
        'should return same response for forgot-password with existing and non-existing email',
      publicBoundary: true,
      prerequisite: 'none',
      independentObservations: ['status'],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: ['status-only-oracle', 'missing-independent-observation'],
    },
    {
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
    },
  ],
  'ST-43': [
    {
      path: 'packages/server/tests/e2e/security/rate-limiting.test.ts',
      testTitle: 'should return 429 after exceeding login attempts',
      publicBoundary: true,
      prerequisite: 'none',
      independentObservations: ['status'],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: ['missing-independent-observation', 'incomplete-sentinel-scope'],
    },
  ],
  'ST-44': [],
  'ST-45': [
    {
      path: 'packages/server/tests/ui/security/cookie-flags.spec.ts',
      testTitle: 'should set CSRF cookie as HttpOnly',
      publicBoundary: true,
      prerequisite: 'none',
      independentObservations: ['browser-cookie-metadata', 'document-cookie'],
      eligibleScopes: ['cookie-and-csrf'],
      exactSentinelEligible: false,
      rejectionReasons: ['incomplete-sentinel-scope'],
    },
  ],
  'ST-46': [
    {
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
    },
    {
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
    },
    {
      path: 'packages/server/tests/ui/flows/magic-link-verify.spec.ts',
      testTitle: 'already-used token shows error page',
      publicBoundary: true,
      prerequisite: 'none',
      independentObservations: ['error-page'],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: ['pre-marked-artifact', 'missing-public-sequential-reuse'],
    },
    {
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
    },
    {
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
    },
    {
      path: 'packages/server/tests/pentest/magic-link-attacks/token-replay.test.ts',
      testTitle: 'should reject reuse of consumed magic link token',
      publicBoundary: true,
      prerequisite: 'none',
      independentObservations: ['status'],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: ['fake-artifact-only', 'status-only-oracle'],
    },
  ],
  'ST-47': [
    {
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
    },
  ],
  'ST-48': [
    {
      path: 'packages/server/tests/ui/flows/two-factor-edge-cases.spec.ts',
      testTitle: 'invalid TOTP code shows error',
      publicBoundary: true,
      prerequisite: 'none',
      independentObservations: ['error-page'],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: ['missing-public-sequential-reuse', 'unresolved-totp-replay-contract'],
    },
    {
      path: 'packages/server/tests/unit/two-factor/service.test.ts',
      testTitle: 'should verify a valid recovery code and mark it used',
      publicBoundary: false,
      prerequisite: 'none',
      independentObservations: [],
      eligibleScopes: [],
      exactSentinelEligible: false,
      rejectionReasons: ['mock-or-service-only', 'missing-public-sequential-reuse'],
    },
  ],
};

for (const caseId of humanAuthBaselineCaseIds) {
  for (const candidate of humanAuthCandidatesByCase[caseId])
    humanAuthBaselineCandidateSchema.parse(candidate);
}

/** Returns the frozen candidate audit for one registered human-authentication case. */
export function humanAuthBaselineCandidatesForCase(
  caseId: HumanAuthBaselineCaseId,
): readonly HumanAuthBaselineCandidate[] {
  return humanAuthCandidatesByCase[caseId];
}

/** Audited legacy tests retained as corroboration for P1 validation and administrative cases. */
const p1CandidatesByCase: Readonly<Record<P1BaselineCaseId, readonly P1BaselineCandidate[]>> = {
  'ST-52': [
    {
      path: 'packages/server/tests/pentest/injection/sql-injection-comprehensive.test.ts',
      testTitle: 'should reject classic OR injection across admin endpoints',
      boundary: 'public-http',
      prerequisite: 'fatal',
      independentObservations: ['response-status'],
      corroboratedScopes: ['input-rejection'],
      exactSentinelEligible: false,
      rejectionReasons: [
        'broad-smoke',
        'status-only-oracle',
        'missing-exact-authorized-control',
        'missing-independent-nonmutation',
        'missing-audit-log-observation',
        'missing-recovery-control',
        'incomplete-case-family',
      ],
    },
    {
      path: 'packages/server/tests/pentest/injection/template-injection.test.ts',
      testTitle: 'should reject prototype pollution via JSON body',
      boundary: 'public-http',
      prerequisite: 'fatal',
      independentObservations: ['response-status', 'global-prototype-property'],
      corroboratedScopes: ['input-rejection'],
      exactSentinelEligible: false,
      rejectionReasons: [
        'missing-exact-authorized-control',
        'missing-independent-nonmutation',
        'missing-audit-log-observation',
        'missing-recovery-control',
        'incomplete-case-family',
      ],
    },
  ],
  'ST-53': [
    {
      path: 'packages/server/tests/pentest/magic-link-attacks/host-header-injection.test.ts',
      testTitle: 'should ignore X-Forwarded-Host header for URL generation',
      boundary: 'public-http',
      prerequisite: 'conditional-or-nonfatal',
      independentObservations: ['mail-message-body'],
      corroboratedScopes: ['host-header-handling'],
      exactSentinelEligible: false,
      rejectionReasons: [
        'conditional-prerequisite',
        'missing-proxy-profile-pair',
        'missing-independent-nonmutation',
        'missing-audit-log-observation',
        'missing-recovery-control',
        'incomplete-case-family',
      ],
    },
  ],
  'ST-54': [
    {
      path: 'packages/server/tests/pentest/infrastructure/method-tampering.test.ts',
      testTitle: 'should reject PUT on token endpoint',
      boundary: 'public-http',
      prerequisite: 'fatal',
      independentObservations: ['response-status'],
      corroboratedScopes: ['input-rejection'],
      exactSentinelEligible: false,
      rejectionReasons: [
        'status-only-oracle',
        'missing-exact-authorized-control',
        'missing-independent-nonmutation',
        'missing-audit-log-observation',
        'missing-recovery-control',
        'incomplete-case-family',
      ],
    },
  ],
  'ST-55': [
    {
      path: 'packages/server/tests/pentest/infrastructure/http-security-headers.test.ts',
      testTitle: 'should include X-Content-Type-Options: nosniff',
      boundary: 'public-http',
      prerequisite: 'fatal',
      independentObservations: ['response-header'],
      corroboratedScopes: ['security-response-policy'],
      exactSentinelEligible: false,
      rejectionReasons: [
        'missing-production-profile',
        'missing-independent-nonmutation',
        'missing-recovery-control',
        'incomplete-case-family',
      ],
    },
    {
      path: 'packages/server/tests/pentest/infrastructure/cors-misconfiguration.test.ts',
      testTitle: 'should not reflect arbitrary origin',
      boundary: 'public-http',
      prerequisite: 'fatal',
      independentObservations: ['response-header'],
      corroboratedScopes: ['security-response-policy'],
      exactSentinelEligible: false,
      rejectionReasons: [
        'missing-production-profile',
        'missing-exact-authorized-control',
        'missing-independent-nonmutation',
        'missing-recovery-control',
        'incomplete-case-family',
      ],
    },
  ],
  'ST-56': [
    {
      path: 'packages/server/tests/pentest/infrastructure/information-disclosure.test.ts',
      testTitle: 'should not expose stack traces in error responses',
      boundary: 'public-http',
      prerequisite: 'fatal',
      independentObservations: ['response-body-pattern'],
      corroboratedScopes: ['generic-error-surface'],
      exactSentinelEligible: false,
      rejectionReasons: [
        'broad-smoke',
        'missing-production-profile',
        'missing-privacy-redaction-observation',
        'missing-audit-log-observation',
        'missing-recovery-control',
        'incomplete-case-family',
      ],
    },
  ],
  'ST-57': [
    {
      path: 'packages/server/tests/integration/repositories/cursor-pagination.test.ts',
      testTitle: 'should return paginated users scoped to organization',
      boundary: 'service-or-repository',
      prerequisite: 'fatal',
      independentObservations: ['repository-page-membership'],
      corroboratedScopes: ['pagination-storage-behavior'],
      exactSentinelEligible: false,
      rejectionReasons: [
        'service-or-repository-only',
        'missing-exact-authorized-control',
        'missing-cardinality-observation',
        'missing-independent-nonmutation',
        'missing-recovery-control',
      ],
    },
  ],
  'ST-58': [
    {
      path: 'packages/server/tests/integration/repositories/audit-log.repo.test.ts',
      testTitle: 'should query audit logs by organization ID',
      boundary: 'service-or-repository',
      prerequisite: 'fatal',
      independentObservations: ['repository-result-membership'],
      corroboratedScopes: ['audit-storage-behavior'],
      exactSentinelEligible: false,
      rejectionReasons: [
        'service-or-repository-only',
        'missing-exact-authorized-control',
        'missing-privacy-redaction-observation',
        'missing-lifecycle-effect',
        'missing-recovery-control',
      ],
    },
  ],
  'ST-59': [
    {
      path: 'packages/server/tests/integration/services/signing-key.service.test.ts',
      testTitle: 'should generate a valid ES256 key pair and store in DB',
      boundary: 'service-or-repository',
      prerequisite: 'fatal',
      independentObservations: ['stored-key-row', 'public-jwk'],
      corroboratedScopes: ['signing-key-storage-behavior'],
      exactSentinelEligible: false,
      rejectionReasons: [
        'service-or-repository-only',
        'missing-exact-authorized-control',
        'missing-privacy-redaction-observation',
        'missing-lifecycle-effect',
        'missing-recovery-control',
      ],
    },
  ],
  'ST-60': [
    {
      path: 'packages/server/tests/integration/services/session-tracking.test.ts',
      testTitle: 'should mark a session as revoked',
      boundary: 'service-or-repository',
      prerequisite: 'fatal',
      independentObservations: ['stored-session-status'],
      corroboratedScopes: ['session-storage-behavior'],
      exactSentinelEligible: false,
      rejectionReasons: [
        'service-or-repository-only',
        'missing-exact-authorized-control',
        'missing-independent-nonmutation',
        'missing-lifecycle-effect',
        'missing-recovery-control',
      ],
    },
  ],
  'ST-61': [
    {
      path: 'packages/server/tests/integration/services/config.service.test.ts',
      testTitle: 'should update an existing config value',
      boundary: 'service-or-repository',
      prerequisite: 'fatal',
      independentObservations: ['stored-configuration-value'],
      corroboratedScopes: ['configuration-storage-behavior'],
      exactSentinelEligible: false,
      rejectionReasons: [
        'service-or-repository-only',
        'missing-exact-authorized-control',
        'missing-privacy-redaction-observation',
        'missing-audit-log-observation',
        'missing-recovery-control',
      ],
    },
  ],
};

for (const caseId of p1BaselineCaseIds) {
  for (const candidate of p1CandidatesByCase[caseId]) p1BaselineCandidateSchema.parse(candidate);
}

/** Returns the frozen legacy-candidate audit for one registered P1 case. */
export function p1BaselineCandidatesForCase(
  caseId: P1BaselineCaseId,
): readonly P1BaselineCandidate[] {
  return p1CandidatesByCase[caseId];
}
