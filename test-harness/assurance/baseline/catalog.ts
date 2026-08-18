import {
  baselineCandidateSchema,
  protocolBaselineCaseIds,
  tenantAdminBaselineCaseIds,
  type BaselineCandidate,
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
