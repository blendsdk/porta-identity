/** P1 sentinels whose legacy tests require an explicit eligibility audit. */
export const p1BaselineCaseIds = [
  'ST-52',
  'ST-53',
  'ST-54',
  'ST-55',
  'ST-56',
  'ST-57',
  'ST-58',
  'ST-59',
  'ST-60',
  'ST-61',
] as const;

/** One P1 sentinel accepted by the baseline command. */
export type P1BaselineCaseId = (typeof p1BaselineCaseIds)[number];

/** Closed reasons why a legacy test cannot close a complete P1 sentinel. */
export const p1CandidateRejectionReasons = [
  'broad-smoke',
  'conditional-prerequisite',
  'status-only-oracle',
  'service-or-repository-only',
  'missing-exact-authorized-control',
  'missing-independent-nonmutation',
  'missing-cardinality-observation',
  'missing-audit-log-observation',
  'missing-recovery-control',
  'missing-production-profile',
  'missing-proxy-profile-pair',
  'missing-privacy-redaction-observation',
  'missing-lifecycle-effect',
  'incomplete-case-family',
] as const;

/** One exact reason a legacy candidate receives corroboration credit only. */
export type P1CandidateRejectionReason = (typeof p1CandidateRejectionReasons)[number];

/** Narrow behavior that a legacy candidate genuinely corroborates. */
export const p1CandidateScopes = [
  'input-rejection',
  'output-escaping',
  'host-header-handling',
  'security-response-policy',
  'generic-error-surface',
  'pagination-storage-behavior',
  'audit-storage-behavior',
  'signing-key-storage-behavior',
  'session-storage-behavior',
  'configuration-storage-behavior',
] as const;

/** One narrow behavior supported without closing its external sentinel. */
export type P1CandidateScope = (typeof p1CandidateScopes)[number];

/** Requirements-owned audit of one existing P1 test. */
export interface P1BaselineCandidateRequirement {
  /** Canonical repository-relative test path. */
  readonly path: string;
  /** Exact test title verified before evidence is persisted. */
  readonly testTitle: string;
  /** Boundary exercised by the decisive assertion. */
  readonly boundary: 'public-http' | 'service-or-repository';
  /** Whether unavailable infrastructure fails the candidate instead of skipping it. */
  readonly prerequisite: 'fatal' | 'conditional-or-nonfatal';
  /** Independent observations made by the current test. */
  readonly independentObservations: readonly string[];
  /** Narrow behaviors that remain useful as corroboration. */
  readonly corroboratedScopes: readonly P1CandidateScope[];
  /** Full sentinel eligibility remains false until every required observation exists. */
  readonly exactSentinelEligible: false;
  /** Closed shortcomings that prevent exact sentinel credit. */
  readonly rejectionReasons: readonly P1CandidateRejectionReason[];
}

/** Expected baseline outcome for one P1 sentinel before live implementation. */
export interface P1BaselineRequirement {
  /** Exact selected sentinel. */
  readonly caseId: P1BaselineCaseId;
  /** Requirement claims supported by the selected sentinel. */
  readonly claimIds: readonly ('CLAIM-R5-08' | 'CLAIM-R5-09' | 'CLAIM-R5-10')[];
  /** Exact root command that records the result. */
  readonly command: readonly ['yarn', 'assurance:baseline', '--case', P1BaselineCaseId];
  /** Incomplete legacy evidence is recorded as natural RED. */
  readonly classification: 'natural-red';
  /** Stable explanation for the missing exact external sentinel. */
  readonly reason: 'missing-exact-p1-sentinel';
  /** No passing legacy test is promoted to an exact sentinel. */
  readonly selectedSentinel: null;
  /** Missing evidence is not itself a Porta product failure. */
  readonly productFailureObserved: false;
  /** Audited legacy candidates for this sentinel. */
  readonly candidates: readonly P1BaselineCandidateRequirement[];
}

/** Freezes one candidate so later tests cannot mutate the requirement-owned audit. */
function candidate(value: P1BaselineCandidateRequirement): P1BaselineCandidateRequirement {
  return Object.freeze(value);
}

const candidatesByCase: Readonly<
  Record<P1BaselineCaseId, readonly P1BaselineCandidateRequirement[]>
> = {
  'ST-52': [
    candidate({
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
    }),
    candidate({
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
    }),
  ],
  'ST-53': [
    candidate({
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
    }),
  ],
  'ST-54': [
    candidate({
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
    }),
  ],
  'ST-55': [
    candidate({
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
    }),
    candidate({
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
    }),
  ],
  'ST-56': [
    candidate({
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
    }),
  ],
  'ST-57': [
    candidate({
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
    }),
  ],
  'ST-58': [
    candidate({
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
    }),
  ],
  'ST-59': [
    candidate({
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
    }),
  ],
  'ST-60': [
    candidate({
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
    }),
  ],
  'ST-61': [
    candidate({
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
    }),
  ],
};

/** Maps each sentinel to the exact claims declared by its immutable specifications. */
function claimIdsForCase(
  caseId: P1BaselineCaseId,
): readonly ('CLAIM-R5-08' | 'CLAIM-R5-09' | 'CLAIM-R5-10')[] {
  if (
    caseId === 'ST-57' ||
    caseId === 'ST-58' ||
    caseId === 'ST-59' ||
    caseId === 'ST-60' ||
    caseId === 'ST-61'
  ) {
    return ['CLAIM-R5-09'];
  }
  return caseId === 'ST-52' || caseId === 'ST-55' || caseId === 'ST-56'
    ? ['CLAIM-R5-08', 'CLAIM-R5-10']
    : ['CLAIM-R5-08'];
}

/** Frozen baseline audit for all independently executable P1 sentinels. */
export const p1BaselineRequirements: readonly P1BaselineRequirement[] = p1BaselineCaseIds.map(
  (caseId) => ({
    caseId,
    claimIds: claimIdsForCase(caseId),
    command: ['yarn', 'assurance:baseline', '--case', caseId],
    classification: 'natural-red',
    reason: 'missing-exact-p1-sentinel',
    selectedSentinel: null,
    productFailureObserved: false,
    candidates: candidatesByCase[caseId],
  }),
);
