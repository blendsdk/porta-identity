/** Exact externally observable result classes for tenant and administrative authorization. */
export type AuthorizationResult = 'allowed' | 'unauthenticated' | 'forbidden' | 'not-found';

/** Tenant-owned and global asset classifications. */
export type AssetOwnership = 'tenant-scoped' | 'global';

/** Surfaces governed by ordinary tenant and OIDC authority. */
export type TenantSurface = 'user' | 'client' | 'session' | 'token' | 'tenant-data';

/** Surfaces governed by control-plane administrative authority. */
export type ControlPlaneSurface = 'user' | 'client' | 'session' | 'application' | 'role';

/** One asset protected by an authority matrix. */
export interface ProfileAsset {
  /** Stable asset class. */
  readonly id: string;
  /** Whether ordinary organizations own independent instances of this asset. */
  readonly ownership: AssetOwnership;
}

/** One public entry point and its trust transition. */
export interface ProfileEntryPoint {
  /** Stable entry-point identity. */
  readonly id: string;
  /** Boundary crossed by an untrusted caller. */
  readonly trustBoundary: string;
}

/** Exact security-event expectation that forbids sensitive log content. */
export interface PrivacySafeLogExpectation {
  /** Stable event class. */
  readonly event: string;
  /** Allowed synthetic correlation fields. */
  readonly allowedFields: readonly string[];
  /** Sensitive values that must never be retained. */
  readonly forbiddenFields: readonly string[];
}

/** Complete threat, rejection, side-effect, logging, and recovery ontology. */
export interface AuthorityThreatProfile {
  /** Assets protected by or explicitly classified alongside this authority matrix. */
  readonly assets: readonly ProfileAsset[];
  /** Public boundaries exercised by the matrix. */
  readonly entryPoints: readonly ProfileEntryPoint[];
  /** Attacker behaviors the matrix must distinguish. */
  readonly abuseCases: readonly string[];
  /** Exact public rejection classes. */
  readonly rejectionClasses: readonly Exclude<AuthorizationResult, 'allowed'>[];
  /** Effects forbidden after every rejected operation. */
  readonly prohibitedSideEffects: readonly string[];
  /** Required security events with explicit privacy limits. */
  readonly privacySafeLogs: readonly PrivacySafeLogExpectation[];
  /** State required after failure or authority revocation. */
  readonly recoveryExpectations: readonly string[];
}

/** Ordinary tenant principal used for OIDC, session, token, and tenant-data isolation. */
export interface TenantPrincipal {
  /** Stable actor identity. */
  readonly id: string;
  /** Organization whose tenant-scoped assets the principal may access. */
  readonly organization: 'alpha' | 'bravo';
  /** Ordinary principals never acquire control-plane authority. */
  readonly authority: 'ordinary-tenant';
}

/** One tenant/OIDC action bound to a compatible asset surface. */
export interface TenantAction {
  /** Stable action identity. */
  readonly id: string;
  /** Asset surface accepted by this action. */
  readonly surface: TenantSurface;
  /** Entry point that handles the action. */
  readonly entryPoint: string;
}

/** Tenant-owned resource instance addressed by a tenant/OIDC matrix case. */
export interface TenantResource {
  /** Stable resource fixture identity. */
  readonly id: string;
  /** Asset surface represented by this resource. */
  readonly surface: TenantSurface;
  /** Organization that owns the resource. */
  readonly owner: 'alpha' | 'bravo';
}

/** One exact tenant/OIDC actor-action-resource-result expectation. */
export interface TenantAuthorityCase {
  /** Stable case identity. */
  readonly id: string;
  /** Actor under test, or no actor for an unauthenticated request. */
  readonly actor: TenantPrincipal['id'] | 'unauthenticated';
  /** Action under test. */
  readonly action: TenantAction['id'];
  /** Exact resource fixture addressed by the request. */
  readonly resource: TenantResource['id'];
  /** Exact public result class. */
  readonly result: AuthorizationResult;
  /** Allowed case proving the same handler and target are reachable before authority varies. */
  readonly authorizedControl?: string;
  /** Single changed authority dimension for a negative case. */
  readonly variedDimension?: 'authentication' | 'tenant' | 'identifier';
}

/** Complete ordinary-tenant authority profile. */
export interface TenantOidcAuthorityProfile {
  /** Stable profile identity. */
  readonly id: 'tenant-oidc-authority';
  /** Explicit ordinary principals from both organizations. */
  readonly actors: readonly TenantPrincipal[];
  /** Tenant/OIDC operations covered by the profile. */
  readonly actions: readonly TenantAction[];
  /** Only tenant-owned resource instances; global assets have no ordinary-tenant operations. */
  readonly resources: readonly TenantResource[];
  /** Exact actor-action-resource-result matrix. */
  readonly cases: readonly TenantAuthorityCase[];
  /** Complete threat and operational recovery profile. */
  readonly threatProfile: AuthorityThreatProfile;
}

/** Administrative actor that always belongs to the single super-admin organization. */
export interface ControlPlaneActor {
  /** Stable actor identity. */
  readonly id: string;
  /** Fixed administrative organization. */
  readonly organization: 'super-admin';
  /** Porta administrative role used to resolve permissions. */
  readonly role: `porta-${string}`;
  /** Independent permission tier exercised by the matrix. */
  readonly permissionProfile: 'full' | 'limited' | 'unprivileged';
}

/** One control-plane action bound to a compatible asset surface and permission. */
export interface ControlPlaneAction {
  /** Stable action identity. */
  readonly id: string;
  /** Asset surface accepted by this action. */
  readonly surface: ControlPlaneSurface;
  /** Permission required after administrative authentication succeeds. */
  readonly requiredPermission: string;
  /** Administrative API entry point that handles the action. */
  readonly entryPoint: string;
}

/** Tenant-targeted or explicitly global control-plane resource. */
export interface ControlPlaneResource {
  /** Stable resource fixture identity. */
  readonly id: string;
  /** Asset surface represented by the resource. */
  readonly surface: ControlPlaneSurface;
  /** Tenant target for scoped assets; global application and role assets have no tenant owner. */
  readonly targetOrganization: 'alpha' | 'bravo' | 'global';
}

/** One exact control-plane actor-action-resource-result expectation. */
export interface ControlPlaneAuthorityCase {
  /** Stable case identity. */
  readonly id: string;
  /** Administrative actor, or no actor for an unauthenticated request. */
  readonly actor: ControlPlaneActor['id'] | 'unauthenticated';
  /** Action under test. */
  readonly action: ControlPlaneAction['id'];
  /** Alpha, bravo, or global target selected independently from actor authority. */
  readonly resource: ControlPlaneResource['id'];
  /** Exact public result class. */
  readonly result: AuthorizationResult;
  /** Allowed case proving the same handler and target are reachable before authority varies. */
  readonly authorizedControl?: string;
  /** Single changed authority dimension for a negative case. */
  readonly variedDimension?: 'authentication' | 'permission' | 'identifier' | 'target';
}

/** Supported or explicitly unavailable stale-authority transition. */
export interface StaleAuthorityTransition {
  /** Stable transition identity. */
  readonly id:
    | 'role-removal'
    | 'actor-deactivation'
    | 'actor-suspension'
    | 'session-revocation'
    | 'organization-membership-removal'
    | 'organization-reassignment';
  /** Whether Porta exposes a supported transition for the assurance journey. */
  readonly status: 'supported' | 'not-applicable';
  /** Named gap when no supported operation exists. */
  readonly gap?: string;
  /** Required post-transition authority state. */
  readonly expected: string;
}

/** Complete control-plane administrative authority profile. */
export interface ControlPlaneAuthorityProfile {
  /** Stable profile identity. */
  readonly id: 'control-plane-admin-authority';
  /** Full, limited, and unprivileged actors from the super-admin organization. */
  readonly actors: readonly ControlPlaneActor[];
  /** Permission-protected administrative operations. */
  readonly actions: readonly ControlPlaneAction[];
  /** Tenant-scoped and global control-plane targets. */
  readonly resources: readonly ControlPlaneResource[];
  /** Exact actor-action-resource-result matrix. */
  readonly cases: readonly ControlPlaneAuthorityCase[];
  /** Complete threat and operational recovery profile. */
  readonly threatProfile: AuthorityThreatProfile;
  /** Supported stale-authority operations and explicit unavailable transitions. */
  readonly staleTransitions: readonly StaleAuthorityTransition[];
}

const tenantActors: readonly TenantPrincipal[] = [
  { id: 'alpha-principal', organization: 'alpha', authority: 'ordinary-tenant' },
  { id: 'bravo-principal', organization: 'bravo', authority: 'ordinary-tenant' },
];

const tenantActions: readonly TenantAction[] = [
  {
    id: 'authenticate-user',
    surface: 'user',
    entryPoint: 'oidc-authorization-endpoint',
  },
  {
    id: 'authorize-registered-client',
    surface: 'client',
    entryPoint: 'oidc-authorization-endpoint',
  },
  { id: 'resume-session', surface: 'session', entryPoint: 'oidc-interaction' },
  { id: 'present-token', surface: 'token', entryPoint: 'token-consumer' },
  { id: 'read-userinfo', surface: 'tenant-data', entryPoint: 'oidc-userinfo-endpoint' },
];

const tenantResources: readonly TenantResource[] = [
  { id: 'alpha-user', surface: 'user', owner: 'alpha' },
  { id: 'bravo-user', surface: 'user', owner: 'bravo' },
  { id: 'alpha-client', surface: 'client', owner: 'alpha' },
  { id: 'bravo-client', surface: 'client', owner: 'bravo' },
  { id: 'alpha-session', surface: 'session', owner: 'alpha' },
  { id: 'bravo-session', surface: 'session', owner: 'bravo' },
  { id: 'alpha-token', surface: 'token', owner: 'alpha' },
  { id: 'bravo-token', surface: 'token', owner: 'bravo' },
  { id: 'alpha-data', surface: 'tenant-data', owner: 'alpha' },
  { id: 'bravo-data', surface: 'tenant-data', owner: 'bravo' },
];

/** Builds exact controls and denials for every compatible ordinary-tenant target. */
function tenantCases(): readonly TenantAuthorityCase[] {
  const actionBySurface = new Map(tenantActions.map((action) => [action.surface, action]));
  return tenantResources.flatMap((resource) => {
    const action = actionBySurface.get(resource.surface);
    if (action === undefined) throw new Error(`missing tenant action for ${resource.surface}`);
    const ownerActor = `${resource.owner}-principal`;
    const foreignActor = resource.owner === 'alpha' ? 'bravo-principal' : 'alpha-principal';
    const controlId = `${ownerActor}-${action.id}-${resource.id}`;
    return [
      {
        id: controlId,
        actor: ownerActor,
        action: action.id,
        resource: resource.id,
        result: 'allowed',
      },
      {
        id: `${foreignActor}-${action.id}-${resource.id}`,
        actor: foreignActor,
        action: action.id,
        resource: resource.id,
        result: 'not-found',
        authorizedControl: controlId,
        variedDimension: 'tenant',
      },
      {
        id: `unauthenticated-${action.id}-${resource.id}`,
        actor: 'unauthenticated',
        action: action.id,
        resource: resource.id,
        result: 'unauthenticated',
        authorizedControl: controlId,
        variedDimension: 'authentication',
      },
    ];
  });
}

/** Immutable ordinary-tenant OIDC/session/token/data authority catalog. */
export const tenantOidcAuthorityProfile: TenantOidcAuthorityProfile = {
  id: 'tenant-oidc-authority',
  actors: tenantActors,
  actions: tenantActions,
  resources: tenantResources,
  cases: tenantCases(),
  threatProfile: {
    assets: [
      { id: 'users', ownership: 'tenant-scoped' },
      { id: 'clients', ownership: 'tenant-scoped' },
      { id: 'sessions', ownership: 'tenant-scoped' },
      { id: 'tokens', ownership: 'tenant-scoped' },
      { id: 'tenant-data', ownership: 'tenant-scoped' },
      { id: 'applications', ownership: 'global' },
      { id: 'roles', ownership: 'global' },
    ],
    entryPoints: [
      {
        id: 'oidc-authorization-endpoint',
        trustBoundary: 'browser and registered client to OIDC provider',
      },
      { id: 'oidc-interaction', trustBoundary: 'browser session to OIDC provider' },
      { id: 'token-consumer', trustBoundary: 'presented token to Porta consumer' },
      {
        id: 'oidc-userinfo-endpoint',
        trustBoundary: 'bearer token to OIDC UserInfo endpoint',
      },
    ],
    abuseCases: [
      'cross-tenant-id-or-slug',
      'issuer-or-cache-confusion',
      'foreign-session-or-token-reuse',
    ],
    rejectionClasses: ['unauthenticated', 'forbidden', 'not-found'],
    prohibitedSideEffects: [
      'foreign-data-disclosure',
      'foreign-state-mutation',
      'foreign-session-renewal',
      'foreign-token-acceptance',
    ],
    privacySafeLogs: [
      {
        event: 'tenant-authority-rejected',
        allowedFields: ['synthetic-actor-id', 'synthetic-target-id', 'action', 'result'],
        forbiddenFields: ['token', 'session-cookie', 'client-secret', 'personal-data'],
      },
    ],
    recoveryExpectations: [
      'authorized-same-tenant-request-remains-usable',
      'rejected-request-creates-no-durable-state',
      'cache-and-issuer-context-remain-tenant-scoped',
    ],
  },
};

const controlPlaneActors: readonly ControlPlaneActor[] = [
  {
    id: 'admin-full',
    organization: 'super-admin',
    role: 'porta-super-admin',
    permissionProfile: 'full',
  },
  {
    id: 'admin-limited',
    organization: 'super-admin',
    role: 'porta-auditor',
    permissionProfile: 'limited',
  },
  {
    id: 'admin-unprivileged',
    organization: 'super-admin',
    role: 'porta-assurance-unprivileged',
    permissionProfile: 'unprivileged',
  },
];

const controlPlaneActions: readonly ControlPlaneAction[] = [
  {
    id: 'read-target-user',
    surface: 'user',
    requiredPermission: 'admin:user:read',
    entryPoint: 'admin-user-api',
  },
  {
    id: 'update-target-user',
    surface: 'user',
    requiredPermission: 'admin:user:update',
    entryPoint: 'admin-user-api',
  },
  {
    id: 'read-target-client',
    surface: 'client',
    requiredPermission: 'admin:client:read',
    entryPoint: 'admin-client-api',
  },
  {
    id: 'update-target-client',
    surface: 'client',
    requiredPermission: 'admin:client:update',
    entryPoint: 'admin-client-api',
  },
  {
    id: 'read-target-session',
    surface: 'session',
    requiredPermission: 'admin:session:read',
    entryPoint: 'admin-session-api',
  },
  {
    id: 'revoke-target-session',
    surface: 'session',
    requiredPermission: 'admin:session:revoke',
    entryPoint: 'admin-session-api',
  },
  {
    id: 'read-global-application',
    surface: 'application',
    requiredPermission: 'admin:app:read',
    entryPoint: 'admin-application-api',
  },
  {
    id: 'update-global-application',
    surface: 'application',
    requiredPermission: 'admin:app:update',
    entryPoint: 'admin-application-api',
  },
  {
    id: 'read-global-role',
    surface: 'role',
    requiredPermission: 'admin:role:read',
    entryPoint: 'admin-role-api',
  },
  {
    id: 'update-global-role',
    surface: 'role',
    requiredPermission: 'admin:role:update',
    entryPoint: 'admin-role-api',
  },
];

const controlPlaneResources: readonly ControlPlaneResource[] = [
  { id: 'admin-target-alpha-user', surface: 'user', targetOrganization: 'alpha' },
  { id: 'admin-target-bravo-user', surface: 'user', targetOrganization: 'bravo' },
  { id: 'admin-target-alpha-client', surface: 'client', targetOrganization: 'alpha' },
  { id: 'admin-target-bravo-client', surface: 'client', targetOrganization: 'bravo' },
  { id: 'admin-target-alpha-session', surface: 'session', targetOrganization: 'alpha' },
  { id: 'admin-target-bravo-session', surface: 'session', targetOrganization: 'bravo' },
  { id: 'admin-global-application', surface: 'application', targetOrganization: 'global' },
  { id: 'admin-global-role', surface: 'role', targetOrganization: 'global' },
];

/** Builds exact controls and denials for every compatible administrative target. */
function controlPlaneCases(): readonly ControlPlaneAuthorityCase[] {
  return controlPlaneResources.flatMap((resource) => {
    const actions = controlPlaneActions.filter((action) => action.surface === resource.surface);
    if (actions.length !== 2)
      throw new Error(
        `control-plane surface ${resource.surface} requires read and mutation actions`,
      );
    return actions.flatMap((action) => {
      const controlId = `admin-full-${action.id}-${resource.id}`;
      const limitedMayRead = action.requiredPermission.endsWith(':read');
      return [
        {
          id: controlId,
          actor: 'admin-full',
          action: action.id,
          resource: resource.id,
          result: 'allowed',
        },
        limitedMayRead
          ? {
              id: `admin-limited-${action.id}-${resource.id}`,
              actor: 'admin-limited',
              action: action.id,
              resource: resource.id,
              result: 'allowed',
            }
          : {
              id: `admin-limited-${action.id}-${resource.id}`,
              actor: 'admin-limited',
              action: action.id,
              resource: resource.id,
              result: 'forbidden',
              authorizedControl: controlId,
              variedDimension: 'permission',
            },
        {
          id: `admin-unprivileged-${action.id}-${resource.id}`,
          actor: 'admin-unprivileged',
          action: action.id,
          resource: resource.id,
          result: 'forbidden',
          authorizedControl: controlId,
          variedDimension: 'permission',
        },
        {
          id: `unauthenticated-${action.id}-${resource.id}`,
          actor: 'unauthenticated',
          action: action.id,
          resource: resource.id,
          result: 'unauthenticated',
          authorizedControl: controlId,
          variedDimension: 'authentication',
        },
      ];
    });
  });
}

/** Immutable super-admin-organization control-plane authority catalog. */
export const controlPlaneAuthorityProfile: ControlPlaneAuthorityProfile = {
  id: 'control-plane-admin-authority',
  actors: controlPlaneActors,
  actions: controlPlaneActions,
  resources: controlPlaneResources,
  cases: controlPlaneCases(),
  threatProfile: {
    assets: [
      { id: 'tenant-target-users', ownership: 'tenant-scoped' },
      { id: 'tenant-target-clients', ownership: 'tenant-scoped' },
      { id: 'tenant-target-sessions', ownership: 'tenant-scoped' },
      { id: 'global-applications', ownership: 'global' },
      { id: 'global-roles-and-permissions', ownership: 'global' },
    ],
    entryPoints: [
      {
        id: 'admin-user-api',
        trustBoundary: 'super-admin organization actor to control-plane API',
      },
      {
        id: 'admin-client-api',
        trustBoundary: 'super-admin organization actor to control-plane API',
      },
      {
        id: 'admin-session-api',
        trustBoundary: 'super-admin organization actor to control-plane API',
      },
      {
        id: 'admin-application-api',
        trustBoundary: 'super-admin organization actor to control-plane API',
      },
      {
        id: 'admin-role-api',
        trustBoundary: 'super-admin organization actor to control-plane API',
      },
    ],
    abuseCases: [
      'missing-admin-authentication',
      'missing-admin-role',
      'permission-escalation',
      'target-id-or-slug-substitution',
      'stale-role-or-session-authority',
      'super-admin-exception-bypass',
    ],
    rejectionClasses: ['unauthenticated', 'forbidden', 'not-found'],
    prohibitedSideEffects: [
      'unauthorized-target-disclosure',
      'unauthorized-target-mutation',
      'cross-target-cache-reuse',
      'sensitive-audit-content',
    ],
    privacySafeLogs: [
      {
        event: 'control-plane-authority-rejected',
        allowedFields: ['synthetic-actor-id', 'synthetic-target-id', 'action', 'result'],
        forbiddenFields: ['access-token', 'session-cookie', 'credentials', 'personal-data'],
      },
    ],
    recoveryExpectations: [
      'authorized-control-remains-usable',
      'rejected-operation-leaves-target-unchanged',
      'revoked-authority-is-rejected-by-existing-and-fresh-clients',
    ],
  },
  staleTransitions: [
    { id: 'role-removal', status: 'supported', expected: 'removed role grants no authority' },
    { id: 'actor-deactivation', status: 'supported', expected: 'deactivated actor is rejected' },
    { id: 'actor-suspension', status: 'supported', expected: 'suspended actor is rejected' },
    { id: 'session-revocation', status: 'supported', expected: 'revoked session is rejected' },
    {
      id: 'organization-membership-removal',
      status: 'not-applicable',
      gap: 'no supported public organization-membership removal operation',
      expected: 'no behavior invented',
    },
    {
      id: 'organization-reassignment',
      status: 'not-applicable',
      gap: 'no supported public organization-reassignment operation',
      expected: 'no behavior invented',
    },
  ],
};
