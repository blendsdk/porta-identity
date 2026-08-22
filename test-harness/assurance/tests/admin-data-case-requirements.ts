/** Version of the independently authored administrative-data requirement catalog. */
export const adminDataCatalogVersion = 1 as const;

/** Stable requirement revision shared by the administrative-data cases. */
export const adminDataRequirementVersion = '2026-08-20' as const;

/** Immutable specification sentinels owned by this bounded catalog. */
export type AdminDataSentinelId = 'ST-57' | 'ST-58' | 'ST-59' | 'ST-60' | 'ST-61';

/** Closed administrative surfaces represented by the catalog. */
export type AdminDataSurface =
  'pagination' | 'audit' | 'signing-key' | 'session-administration' | 'configuration';

/** Broad public result types that permit a later live adapter to report defects honestly. */
export type AdminDataResult =
  | 'allowed'
  | 'validation-rejected'
  | 'forbidden'
  | 'not-found'
  | 'unexpected-success'
  | 'unexpected-error';

/** Exact administrative actor contract grounded in the deterministic assurance fixture. */
export interface AdminDataActor {
  readonly id: 'admin-full' | 'admin-limited' | 'admin-unprivileged';
  readonly organization: 'super-admin';
  readonly role: 'porta-super-admin' | 'porta-auditor' | 'porta-assurance-unprivileged';
}

/** One raw public administrative request definition. */
export interface AdminDataRequest {
  readonly transport: 'raw-http';
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly path: string;
  readonly body: string | null;
  readonly actor: AdminDataActor['id'];
  readonly requiredPermission: string;
}

/** Exact same-action and same-target authorized control for a probe. */
export interface AdminDataControl {
  readonly id: string;
  readonly request: AdminDataRequest;
  readonly expectedResult: 'allowed';
  readonly expectedStatus: number;
  readonly reachabilityObservations: readonly string[];
}

/** One requirement-derived administrative-data case. */
export interface AdminDataCaseRequirement {
  readonly schemaVersion: 1;
  readonly requirementVersion: typeof adminDataRequirementVersion;
  readonly id: string;
  readonly sentinelId: AdminDataSentinelId;
  readonly surface: AdminDataSurface;
  readonly actor: string;
  readonly asset: string;
  readonly target: string;
  readonly entryPoint: string;
  readonly trustBoundary: string;
  readonly abuseCase: string;
  readonly control: AdminDataControl;
  readonly probe: AdminDataRequest;
  readonly expectedResult: AdminDataResult;
  readonly expectedStatus: number;
  readonly exactPublicOutcome: string;
  readonly independentObservations: readonly string[];
  readonly prohibitedSideEffects: readonly string[];
  readonly requiredLogFields: readonly string[];
  readonly forbiddenLogFields: readonly string[];
  readonly recoveryExpectations: readonly string[];
  readonly referenceIds: readonly string[];
  readonly evidenceStatus: 'specification-only';
}

/** Version-qualified authority used by one or more administrative-data cases. */
export interface AdminDataReference {
  readonly id: string;
  readonly authority: 'RD-05' | 'test-assurance testing strategy' | 'OWASP ASVS';
  readonly version: string;
  readonly sectionOrControl: string;
}

/** Exact deterministic administrative actors reused from the assurance fixture contract. */
export const adminDataActors: readonly AdminDataActor[] = [
  { id: 'admin-full', organization: 'super-admin', role: 'porta-super-admin' },
  { id: 'admin-limited', organization: 'super-admin', role: 'porta-auditor' },
  {
    id: 'admin-unprivileged',
    organization: 'super-admin',
    role: 'porta-assurance-unprivileged',
  },
];

/** Version-qualified sources selected before executable behavior is observed. */
export const adminDataReferences: readonly AdminDataReference[] = [
  { id: 'rd-05-r5.2', authority: 'RD-05', version: '2026-08-19', sectionOrControl: 'R5.2' },
  { id: 'rd-05-r5.9', authority: 'RD-05', version: '2026-08-19', sectionOrControl: 'R5.9' },
  { id: 'rd-05-r5.10', authority: 'RD-05', version: '2026-08-19', sectionOrControl: 'R5.10' },
  {
    id: 'testing-strategy-st57-st61',
    authority: 'test-assurance testing strategy',
    version: '2026-08-19',
    sectionOrControl: 'ST-57 through ST-61',
  },
  { id: 'asvs-5.0.0-8.2.1', authority: 'OWASP ASVS', version: '5.0.0', sectionOrControl: '8.2.1' },
  { id: 'asvs-5.0.0-8.3.1', authority: 'OWASP ASVS', version: '5.0.0', sectionOrControl: '8.3.1' },
  {
    id: 'asvs-5.0.0-16.3.3',
    authority: 'OWASP ASVS',
    version: '5.0.0',
    sectionOrControl: '16.3.3',
  },
];

/** Privacy-safe fields required from administrative security events. */
export const adminDataRequiredLogFields = [
  'synthetic-correlation-id',
  'actor-id',
  'action',
  'target-id-digest',
  'result',
] as const;
/** Sensitive fields forbidden from administrative security events and evidence. */
export const adminDataForbiddenLogFields = [
  'opaque-token',
  'session-cookie',
  'private-signing-key',
  'configuration-secret-value',
  'audit-sensitive-payload',
  'personal-data',
  'stack-trace',
] as const;

function actor(id: AdminDataActor['id']): AdminDataActor {
  const value = adminDataActors.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`unknown administrative actor ${id}`);
  return value;
}

function request(
  actorId: AdminDataActor['id'],
  method: AdminDataRequest['method'],
  path: string,
  permission: string,
  body: string | null = null,
): AdminDataRequest {
  actor(actorId);
  return {
    transport: 'raw-http',
    actor: actorId,
    method,
    path,
    body,
    requiredPermission: permission,
  };
}

function control(id: string, raw: AdminDataRequest, status = 200): AdminDataControl {
  return {
    id,
    request: raw,
    expectedResult: 'allowed',
    expectedStatus: status,
    reachabilityObservations: ['admin-authentication-succeeded', 'intended-handler-reached'],
  };
}

function requirement(
  value: Omit<AdminDataCaseRequirement, 'schemaVersion' | 'requirementVersion' | 'evidenceStatus'>,
): AdminDataCaseRequirement {
  return {
    schemaVersion: 1,
    requirementVersion: adminDataRequirementVersion,
    ...value,
    evidenceStatus: 'specification-only',
  };
}

/** Requirement sources shared by every bounded administrative-data case. */
export const adminDataCommonReferenceIds = [
  'rd-05-r5.2',
  'rd-05-r5.9',
  'rd-05-r5.10',
  'testing-strategy-st57-st61',
  'asvs-5.0.0-8.2.1',
  'asvs-5.0.0-8.3.1',
  'asvs-5.0.0-16.3.3',
] as const;

function adminCase(
  value: Omit<
    AdminDataCaseRequirement,
    | 'schemaVersion'
    | 'requirementVersion'
    | 'evidenceStatus'
    | 'requiredLogFields'
    | 'forbiddenLogFields'
    | 'referenceIds'
    | 'target'
  >,
): AdminDataCaseRequirement {
  return requirement({
    ...value,
    target: value.asset,
    requiredLogFields: adminDataRequiredLogFields,
    forbiddenLogFields: adminDataForbiddenLogFields,
    referenceIds: adminDataCommonReferenceIds,
  });
}

const alphaPage = request(
  'admin-full',
  'GET',
  '/api/admin/organizations/{alphaOrgId}/users?page=1&pageSize=2',
  'admin:user:read',
);
const alphaCursorPage = request(
  'admin-full',
  'GET',
  '/api/admin/organizations/{alphaOrgId}/users?limit=2',
  'admin:user:read',
);
const auditList = request(
  'admin-full',
  'GET',
  '/api/admin/audit?org={alphaOrgId}',
  'admin:audit:read',
);
const auditCleanup = request(
  'admin-full',
  'POST',
  '/api/admin/audit/cleanup',
  'admin:config:update',
  '{"retentionDays":30,"dryRun":false}',
);
const keyList = request('admin-full', 'GET', '/api/admin/keys', 'admin:key:read');
const keyGenerate = request(
  'admin-full',
  'POST',
  '/api/admin/keys/generate',
  'admin:key:generate',
  '{}',
);
const keyRotate = request('admin-full', 'POST', '/api/admin/keys/rotate', 'admin:key:rotate', '{}');
const sessionList = request(
  'admin-full',
  'GET',
  '/api/admin/sessions?organizationId={alphaOrgId}',
  'admin:session:read',
);
const sessionRevoke = request(
  'admin-full',
  'DELETE',
  '/api/admin/sessions/{alphaSessionId}',
  'admin:session:revoke',
);
const configRead = request(
  'admin-full',
  'GET',
  '/api/admin/config/{publicConfigKey}',
  'admin:config:read',
);
const configUpdate = request(
  'admin-full',
  'PUT',
  '/api/admin/config/{mutableConfigKey}',
  'admin:config:update',
  '{"value":"{approvedSyntheticValue}"}',
);

/** Immutable cases for pagination, audit, key, session, and configuration administration. */
export const adminDataCaseRequirements: readonly AdminDataCaseRequirement[] = [
  adminCase({
    id: 'pagination-cross-tenant-cursor',
    sentinelId: 'ST-57',
    surface: 'pagination',
    actor: 'admin-full',
    asset: 'alpha-user-page-and-cardinality',
    entryPoint: 'organization-user-list',
    trustBoundary: 'bravo-derived-cursor-to-alpha-scoped-page-query',
    abuseCase: 'cursor from another tenant attempts to cross or perturb the alpha result set',
    control: control('alpha-cursor-page-control', alphaCursorPage),
    probe: request(
      'admin-full',
      'GET',
      '/api/admin/organizations/{alphaOrgId}/users?cursor={bravoCursor}&limit=2',
      'admin:user:read',
    ),
    expectedResult: 'validation-rejected',
    expectedStatus: 400,
    exactPublicOutcome: 'invalid-pagination-cursor-without-foreign-page-data',
    independentObservations: [
      'alpha-page-membership-is-alpha-only',
      'alpha-total-count-unchanged',
      'bravo-target-fingerprints-unchanged',
    ],
    prohibitedSideEffects: [
      'bravo-record-returned',
      'cross-tenant-count-disclosed',
      'pagination-state-mutated',
    ],
    recoveryExpectations: ['the-same-alpha-first-page-control-remains-stable'],
  }),
  adminCase({
    id: 'pagination-out-of-range-and-filter-isolation',
    sentinelId: 'ST-57',
    surface: 'pagination',
    actor: 'admin-full',
    asset: 'alpha-filtered-page-order-and-count',
    entryPoint: 'organization-user-list',
    trustBoundary: 'raw-page-filter-and-order-to-alpha-query-scope',
    abuseCase: 'extreme page and bravo-identifying filter attempt scope or count leakage',
    control: control('alpha-filtered-page-control', alphaPage),
    probe: request(
      'admin-full',
      'GET',
      '/api/admin/organizations/{alphaOrgId}/users?page=2147483647&limit=2&search={bravoUniqueMarker}',
      'admin:user:read',
    ),
    expectedResult: 'allowed',
    expectedStatus: 200,
    exactPublicOutcome: 'empty-alpha-page-with-zero-matching-alpha-count-and-no-bravo-data',
    independentObservations: ['response-membership-empty', 'durable-user-cardinality-unchanged'],
    prohibitedSideEffects: [
      'bravo-record-returned',
      'global-count-disclosed',
      'user-state-mutated',
    ],
    recoveryExpectations: ['the-same-alpha-first-page-control-retains-order-and-count'],
  }),
  adminCase({
    id: 'audit-read-without-permission',
    sentinelId: 'ST-58',
    surface: 'audit',
    actor: 'admin-unprivileged',
    asset: 'alpha-audit-stream',
    entryPoint: 'audit-list',
    trustBoundary: 'authenticated-admin-actor-to-audit-read-permission',
    abuseCase: 'unprivileged actor attempts to read tenant audit data',
    control: control('audit-list-control', auditList),
    probe: { ...auditList, actor: 'admin-unprivileged' },
    expectedResult: 'forbidden',
    expectedStatus: 403,
    exactPublicOutcome: 'insufficient-permission-without-audit-existence-or-content',
    independentObservations: ['audit-cardinality-unchanged', 'audit-event-digests-unchanged'],
    prohibitedSideEffects: ['audit-entry-disclosed', 'audit-stream-mutated'],
    recoveryExpectations: ['full-authority-audit-read-control-remains-available'],
  }),
  adminCase({
    id: 'audit-cleanup-without-permission',
    sentinelId: 'ST-58',
    surface: 'audit',
    actor: 'admin-limited',
    asset: 'globally-eligible-and-protected-audit-events',
    entryPoint: 'audit-cleanup',
    trustBoundary: 'read-only-admin-actor-to-audit-cleanup-permission',
    abuseCase: 'auditor attempts destructive cleanup',
    control: {
      ...control('audit-cleanup-control', auditCleanup, 200),
      reachabilityObservations: [
        'admin-authentication-succeeded',
        'intended-handler-reached',
        'only-events-older-than-approved-retention-removed',
        'all-protected-recent-event-digests-unchanged',
      ],
    },
    probe: { ...auditCleanup, actor: 'admin-limited' },
    expectedResult: 'forbidden',
    expectedStatus: 403,
    exactPublicOutcome: 'insufficient-permission-without-cleanup',
    independentObservations: [
      'globally-eligible-and-protected-audit-digests-unchanged',
      'audit-cardinality-unchanged',
    ],
    prohibitedSideEffects: ['audit-event-deleted', 'cleanup-audit-event-forged'],
    recoveryExpectations: ['full-authority-cleanup-control-remains-reachable'],
  }),
  adminCase({
    id: 'audit-read-redaction-integrity',
    sentinelId: 'ST-58',
    surface: 'audit',
    actor: 'admin-full',
    asset: 'redacted-append-only-audit-view',
    entryPoint: 'audit-list',
    trustBoundary: 'stored-security-event-to-public-audit-representation',
    abuseCase: 'reader attempts to recover secrets or mutate retained audit content',
    control: control('audit-redaction-control', auditList),
    probe: auditList,
    expectedResult: 'allowed',
    expectedStatus: 200,
    exactPublicOutcome: 'ordered-audit-page-with-required-fields-and-sensitive-values-redacted',
    independentObservations: [
      'stored-audit-digests-unchanged',
      'audit-order-and-cardinality-stable',
    ],
    prohibitedSideEffects: ['secret-or-token-disclosed', 'audit-entry-modified-by-read'],
    recoveryExpectations: ['repeat-read-has-identical-redacted-event-digests'],
  }),
  adminCase({
    id: 'key-list-without-permission',
    sentinelId: 'ST-59',
    surface: 'signing-key',
    actor: 'admin-unprivileged',
    asset: 'public-signing-key-metadata',
    entryPoint: 'signing-key-list',
    trustBoundary: 'authenticated-admin-actor-to-key-read-permission',
    abuseCase: 'unprivileged actor attempts key inventory access',
    control: control('key-list-control', keyList),
    probe: { ...keyList, actor: 'admin-unprivileged' },
    expectedResult: 'forbidden',
    expectedStatus: 403,
    exactPublicOutcome: 'insufficient-permission-without-key-metadata',
    independentObservations: ['key-set-digest-and-count-unchanged'],
    prohibitedSideEffects: [
      'key-metadata-disclosed',
      'private-key-material-disclosed',
      'key-lifecycle-mutated',
    ],
    recoveryExpectations: ['full-authority-key-list-control-remains-available'],
  }),
  ...(
    [
      {
        id: 'key-generate-without-permission',
        action: keyGenerate,
        controlId: 'key-generate-control',
        effect: 'signing-key-generated',
      },
      {
        id: 'key-rotate-without-permission',
        action: keyRotate,
        controlId: 'key-rotate-control',
        effect: 'active-key-rotated',
      },
    ] as const
  ).map((item) =>
    adminCase({
      id: item.id,
      sentinelId: 'ST-59',
      surface: 'signing-key',
      actor: 'admin-limited',
      asset: 'active-and-retired-signing-key-lifecycle',
      entryPoint: item.action.path,
      trustBoundary: 'read-only-admin-actor-to-key-lifecycle-permission',
      abuseCase: `auditor attempts ${item.effect}`,
      control: {
        ...control(item.controlId, item.action, 201),
        reachabilityObservations:
          item.effect === 'signing-key-generated'
            ? [
                'admin-authentication-succeeded',
                'intended-handler-reached',
                'one-new-key-added',
                'active-key-remains-declared',
                'private-key-material-absent',
              ]
            : [
                'admin-authentication-succeeded',
                'intended-handler-reached',
                'new-active-key-is-distinct',
                'predecessor-retains-declared-verification-lifecycle',
                'private-key-material-absent',
              ],
      },
      probe: { ...item.action, actor: 'admin-limited' },
      expectedResult: 'forbidden',
      expectedStatus: 403,
      exactPublicOutcome: 'insufficient-permission-without-key-lifecycle-effect',
      independentObservations: [
        'active-key-id-after-equals-before',
        'key-count-and-status-digests-unchanged',
        'existing-token-verification-unchanged',
      ],
      prohibitedSideEffects: [
        item.effect,
        'private-key-material-disclosed',
        'existing-signature-invalidated',
      ],
      recoveryExpectations: ['the-full-authority-same-action-control-remains-reachable'],
    }),
  ),
  adminCase({
    id: 'session-list-without-permission',
    sentinelId: 'ST-60',
    surface: 'session-administration',
    actor: 'admin-unprivileged',
    asset: 'alpha-session-list',
    entryPoint: 'session-list',
    trustBoundary: 'authenticated-admin-actor-to-session-read-permission',
    abuseCase: 'unprivileged actor attempts tenant session enumeration',
    control: control('session-list-control', sessionList),
    probe: { ...sessionList, actor: 'admin-unprivileged' },
    expectedResult: 'forbidden',
    expectedStatus: 403,
    exactPublicOutcome: 'insufficient-permission-without-session-existence-or-content',
    independentObservations: ['alpha-session-count-and-digests-unchanged'],
    prohibitedSideEffects: [
      'session-metadata-disclosed',
      'foreign-session-disclosed',
      'session-mutated',
    ],
    recoveryExpectations: ['full-authority-session-list-control-remains-available'],
  }),
  adminCase({
    id: 'session-list-alpha-filter-isolation',
    sentinelId: 'ST-60',
    surface: 'session-administration',
    actor: 'admin-full',
    asset: 'alpha-filtered-session-list',
    entryPoint: 'session-list',
    trustBoundary: 'organization-filter-to-session-query-scope',
    abuseCase: 'alpha filter could accidentally admit bravo sessions or global cardinality',
    control: control('alpha-session-list-filter-control', sessionList),
    probe: sessionList,
    expectedResult: 'allowed',
    expectedStatus: 200,
    exactPublicOutcome: 'alpha-only-session-page-and-alpha-only-total-count',
    independentObservations: [
      'response-session-organization-ids-all-alpha',
      'alpha-total-count-excludes-bravo',
      'session-digests-unchanged',
    ],
    prohibitedSideEffects: [
      'bravo-session-disclosed',
      'global-session-count-disclosed',
      'session-mutated',
    ],
    recoveryExpectations: ['repeat-alpha-filter-has-stable-membership-order-and-count'],
  }),
  adminCase({
    id: 'session-detail-without-permission',
    sentinelId: 'ST-60',
    surface: 'session-administration',
    actor: 'admin-unprivileged',
    asset: 'bravo-session',
    entryPoint: 'session-detail',
    trustBoundary: 'authenticated-admin-actor-to-session-read-permission',
    abuseCase: 'unprivileged actor attempts bravo session detail access',
    control: control(
      'bravo-session-detail-control',
      request('admin-full', 'GET', '/api/admin/sessions/{bravoSessionId}', 'admin:session:read'),
    ),
    probe: request(
      'admin-unprivileged',
      'GET',
      '/api/admin/sessions/{bravoSessionId}',
      'admin:session:read',
    ),
    expectedResult: 'forbidden',
    expectedStatus: 403,
    exactPublicOutcome: 'insufficient-permission-without-session-existence-or-detail',
    independentObservations: ['alpha-and-bravo-session-digests-unchanged'],
    prohibitedSideEffects: ['bravo-session-disclosed', 'session-mutated'],
    recoveryExpectations: ['same-bravo-session-detail-control-remains-readable'],
  }),
  adminCase({
    id: 'session-revoke-without-permission',
    sentinelId: 'ST-60',
    surface: 'session-administration',
    actor: 'admin-limited',
    asset: 'alpha-session-and-derived-authentication-state',
    entryPoint: 'session-revoke',
    trustBoundary: 'read-only-admin-actor-to-session-revoke-permission',
    abuseCase: 'auditor attempts to revoke an active session',
    control: {
      ...control('session-revoke-control', sessionRevoke, 204),
      reachabilityObservations: [
        'admin-authentication-succeeded',
        'intended-handler-reached',
        'one-alpha-session-revoked',
        'derived-protected-access-denied',
        'unrelated-session-digests-unchanged',
      ],
    },
    probe: { ...sessionRevoke, actor: 'admin-limited' },
    expectedResult: 'forbidden',
    expectedStatus: 403,
    exactPublicOutcome: 'insufficient-permission-without-session-cascade',
    independentObservations: [
      'session-active-state-unchanged',
      'derived-token-and-protected-access-state-unchanged',
      'unrelated-session-digests-unchanged',
    ],
    prohibitedSideEffects: [
      'session-revoked',
      'derived-authentication-state-invalidated',
      'unrelated-session-mutated',
    ],
    recoveryExpectations: ['full-authority-revoke-control-can-produce-one-declared-cascade'],
  }),
  adminCase({
    id: 'configuration-read-without-permission',
    sentinelId: 'ST-61',
    surface: 'configuration',
    actor: 'admin-unprivileged',
    asset: 'public-configuration-value',
    entryPoint: 'configuration-read',
    trustBoundary: 'authenticated-admin-actor-to-config-read-permission',
    abuseCase: 'unprivileged actor attempts configuration disclosure',
    control: control('config-read-control', configRead),
    probe: { ...configRead, actor: 'admin-unprivileged' },
    expectedResult: 'forbidden',
    expectedStatus: 403,
    exactPublicOutcome: 'insufficient-permission-without-config-key-or-value',
    independentObservations: ['configuration-digest-unchanged'],
    prohibitedSideEffects: ['configuration-value-disclosed', 'configuration-mutated'],
    recoveryExpectations: ['full-authority-config-read-control-remains-available'],
  }),
  adminCase({
    id: 'configuration-update-without-permission',
    sentinelId: 'ST-61',
    surface: 'configuration',
    actor: 'admin-limited',
    asset: 'mutable-configuration-value',
    entryPoint: 'configuration-update',
    trustBoundary: 'read-only-admin-actor-to-config-update-permission',
    abuseCase: 'auditor attempts configuration mutation',
    control: {
      ...control('config-update-control', configUpdate),
      reachabilityObservations: [
        'admin-authentication-succeeded',
        'intended-handler-reached',
        'configuration-value-and-version-change-once',
        'owned-value-restored-after-control',
      ],
    },
    probe: { ...configUpdate, actor: 'admin-limited' },
    expectedResult: 'forbidden',
    expectedStatus: 403,
    exactPublicOutcome: 'insufficient-permission-without-config-mutation',
    independentObservations: ['configuration-value-and-version-after-equal-before'],
    prohibitedSideEffects: [
      'configuration-mutated',
      'configuration-version-advanced',
      'configuration-secret-disclosed',
    ],
    recoveryExpectations: [
      'full-authority-same-update-control-remains-reachable-and-owned-value-can-be-restored',
    ],
  }),
];
