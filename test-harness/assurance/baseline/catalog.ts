import {
  baselineCandidateSchema,
  tenantAdminBaselineCaseIds,
  type BaselineCandidate,
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
