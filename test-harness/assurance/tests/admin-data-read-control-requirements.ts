import type { AdminDataCaseRequirement, AdminDataRequest } from './admin-data-case-requirements.js';
import {
  adminDataCommonReferenceIds,
  adminDataForbiddenLogFields,
  adminDataRequiredLogFields,
  adminDataRequirementVersion,
} from './admin-data-case-requirements.js';

interface ReadControlDefinition {
  readonly id: string;
  readonly sentinelId: AdminDataCaseRequirement['sentinelId'];
  readonly surface: AdminDataCaseRequirement['surface'];
  readonly asset: string;
  readonly entryPoint: string;
  readonly path: string;
  readonly permission: string;
  readonly exactPublicOutcome: string;
  readonly independentObservations: readonly string[];
  readonly prohibitedSideEffects: readonly string[];
}

function readRequest(
  actor: AdminDataRequest['actor'],
  definition: ReadControlDefinition,
): AdminDataRequest {
  return {
    transport: 'raw-http',
    method: 'GET',
    path: definition.path,
    body: null,
    actor,
    requiredPermission: definition.permission,
  };
}

const definitions: readonly ReadControlDefinition[] = [
  {
    id: 'audit-read-limited-allowed',
    sentinelId: 'ST-58',
    surface: 'audit',
    asset: 'redacted-alpha-audit-page',
    entryPoint: 'audit-list',
    path: '/api/admin/audit?org={alphaOrgId}',
    permission: 'admin:audit:read',
    exactPublicOutcome: 'redacted-alpha-audit-page-returned',
    independentObservations: ['audit-cardinality-and-event-digests-unchanged'],
    prohibitedSideEffects: ['sensitive-audit-value-disclosed', 'audit-event-mutated'],
  },
  {
    id: 'key-list-limited-allowed',
    sentinelId: 'ST-59',
    surface: 'signing-key',
    asset: 'public-signing-key-metadata',
    entryPoint: 'signing-key-list',
    path: '/api/admin/keys',
    permission: 'admin:key:read',
    exactPublicOutcome: 'public-key-metadata-without-private-material-returned',
    independentObservations: ['key-count-status-and-active-id-unchanged'],
    prohibitedSideEffects: ['private-key-material-disclosed', 'key-lifecycle-mutated'],
  },
  {
    id: 'session-list-limited-allowed',
    sentinelId: 'ST-60',
    surface: 'session-administration',
    asset: 'alpha-filtered-session-page',
    entryPoint: 'session-list',
    path: '/api/admin/sessions?organizationId={alphaOrgId}',
    permission: 'admin:session:read',
    exactPublicOutcome: 'alpha-only-session-page-returned',
    independentObservations: ['alpha-session-cardinality-and-digests-unchanged'],
    prohibitedSideEffects: ['bravo-session-disclosed', 'session-mutated'],
  },
  {
    id: 'configuration-read-limited-allowed',
    sentinelId: 'ST-61',
    surface: 'configuration',
    asset: 'masked-configuration-value',
    entryPoint: 'configuration-read',
    path: '/api/admin/config/{publicConfigKey}',
    permission: 'admin:config:read',
    exactPublicOutcome: 'declared-public-value-returned-and-sensitive-values-masked',
    independentObservations: ['configuration-value-and-version-digests-unchanged'],
    prohibitedSideEffects: ['sensitive-configuration-value-disclosed', 'configuration-mutated'],
  },
];

/** Read-only actor controls that prove the exact limited-permission boundary. */
export const adminDataReadControlRequirements: readonly AdminDataCaseRequirement[] =
  definitions.map((definition) => {
    const fullRequest = readRequest('admin-full', definition);
    return {
      schemaVersion: 1,
      requirementVersion: adminDataRequirementVersion,
      id: definition.id,
      sentinelId: definition.sentinelId,
      surface: definition.surface,
      actor: 'admin-limited',
      asset: definition.asset,
      target: definition.asset,
      entryPoint: definition.entryPoint,
      trustBoundary: 'read-only-super-admin-role-to-declared-read-permission',
      abuseCase: 'read-only role could be denied or receive data beyond the declared read surface',
      control: {
        id: `${definition.id}-full-control`,
        request: fullRequest,
        expectedResult: 'allowed',
        expectedStatus: 200,
        reachabilityObservations: ['admin-authentication-succeeded', 'intended-handler-reached'],
      },
      probe: readRequest('admin-limited', definition),
      expectedResult: 'allowed',
      expectedStatus: 200,
      exactPublicOutcome: definition.exactPublicOutcome,
      independentObservations: definition.independentObservations,
      prohibitedSideEffects: definition.prohibitedSideEffects,
      requiredLogFields: adminDataRequiredLogFields,
      forbiddenLogFields: adminDataForbiddenLogFields,
      recoveryExpectations: ['the-same-read-remains-stable-and-no-mutation-recovery-is-required'],
      referenceIds: adminDataCommonReferenceIds,
      evidenceStatus: 'specification-only',
    };
  });
