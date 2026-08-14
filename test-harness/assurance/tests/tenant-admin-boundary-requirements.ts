import type { TenantSurface } from './tenant-admin-profile-requirements.js';
import type {
  ControlPlaneVariationRequest,
  StaleAuthorityScenarioRequest,
  TenantPublicProbeShape,
} from './tenant-admin-boundaries-contract.js';

/** Compatible public request shape for each ordinary tenant/OIDC surface. */
export const tenantProbeShapeBySurface: Readonly<Record<TenantSurface, TenantPublicProbeShape>> = {
  user: 'organization-slug',
  client: 'client-id',
  session: 'interaction-id',
  token: 'presented-token',
  'tenant-data': 'userinfo-read',
};

/** Ordinary principals have no public list or mutation API in this assurance boundary. */
export const unavailableOrdinaryTenantProbeClasses = [
  { probeClass: 'list', reason: 'no ordinary-tenant public list contract' },
  { probeClass: 'write', reason: 'no ordinary-tenant public mutation contract' },
] as const;

/** Raw permission and target substitutions required after their exact allowed controls. */
export const controlPlaneVariations: readonly ControlPlaneVariationRequest[] = [
  {
    authorizedControlCaseId: 'admin-full-update-target-user-admin-target-alpha-user',
    variation: 'permission',
    expectedResult: 'forbidden',
  },
  {
    authorizedControlCaseId: 'admin-full-read-target-user-admin-target-alpha-user',
    variation: 'target-organization',
    expectedResult: 'not-found',
  },
  {
    authorizedControlCaseId: 'admin-full-read-target-client-admin-target-bravo-client',
    variation: 'target-id',
    expectedResult: 'not-found',
  },
  {
    authorizedControlCaseId: 'admin-full-read-target-session-admin-target-alpha-session',
    variation: 'target-slug',
    expectedResult: 'not-found',
  },
];

/** High-level stale-authority sentinel whose orchestration belongs to the dedicated stale suite. */
export const staleAuthoritySentinel = {
  id: 'ST-31',
  implementationBoundary: 'dedicated-stale-authority-orchestration',
  includedHere: false,
  supportedTransitions: [
    'role-removal',
    'actor-deactivation',
    'actor-suspension',
    'session-revocation',
  ],
  unavailableTransitions: ['organization-membership-removal', 'organization-reassignment'],
} as const;

/**
 * Exact supported public transitions and post-transition outcomes for stale-authority testing.
 *
 * Each scenario begins with an independently allowed control, warms the relevant cache/session
 * state, performs the transition through its public administrative route, then retries from the
 * existing client, a fresh client, and a fresh Porta process.
 */
export const staleAuthorityScenarios: readonly StaleAuthorityScenarioRequest[] = [
  {
    transition: 'role-removal',
    authorizedControlCaseId: 'admin-limited-read-target-user-admin-target-alpha-user',
    mutationMethod: 'DELETE',
    mutationRoute: '/api/admin/organizations/:orgId/users/:userId/roles',
    expectedResult: 'forbidden',
  },
  {
    transition: 'actor-deactivation',
    authorizedControlCaseId: 'admin-limited-read-target-user-admin-target-alpha-user',
    mutationMethod: 'POST',
    mutationRoute: '/api/admin/organizations/:orgId/users/:userId/deactivate',
    expectedResult: 'unauthenticated',
  },
  {
    transition: 'actor-suspension',
    authorizedControlCaseId: 'admin-limited-read-target-user-admin-target-alpha-user',
    mutationMethod: 'POST',
    mutationRoute: '/api/admin/organizations/:orgId/users/:userId/suspend',
    expectedResult: 'unauthenticated',
  },
  {
    transition: 'session-revocation',
    authorizedControlCaseId: 'alpha-principal-resume-session-alpha-session',
    mutationMethod: 'DELETE',
    mutationRoute: '/api/admin/sessions/:sessionId',
    expectedResult: 'unauthenticated',
  },
];

/** Exact destructive operations forbidden for the protected bootstrap super-admin user. */
export const protectedSuperAdminOperations = [
  'deactivate',
  'delete',
  'lock',
  'manage-2fa',
  'remove-super-admin-role',
  'suspend',
] as const;

/** Bootstrap-user operations that have no current public product lifecycle. */
export const nonApplicableSuperAdminOperations = [
  {
    operation: 'archive',
    reason: 'users have no archived state or public archive operation',
  },
] as const;
