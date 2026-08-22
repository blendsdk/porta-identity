import type {
  AdministrativeActor,
  FixtureClient,
  FixtureSession,
  FixtureTenantResource,
  FixtureToken,
  FixtureUser,
  GlobalApplicationFixture,
  GlobalRoleFixture,
  OrdinaryTenantFixture,
  ProtectedCredentialDescriptor,
  PublicFixtureManifest,
} from './fixture-assurance-contract.js';

/** Shared OIDC scopes supported by Porta and independent from tenant ownership. */
export const fixtureProtocolScopes = ['openid', 'profile', 'email', 'offline_access'] as const;

/** Stable aliases for the retained browser journeys. */
export const retainedFixtureAliases = {
  organization: 'alpha',
  publicClient: 'alpha-client-public',
  confidentialClient: 'alpha-client-confidential',
  user: 'alpha-user-active',
} as const;

/** Creates one non-secret credential descriptor for protected runtime storage. */
function protectedCredential(
  ref: string,
  kind: ProtectedCredentialDescriptor['kind'],
): ProtectedCredentialDescriptor {
  return { ref, kind, storage: 'runtime-protected', rawValueExposed: false };
}

/** Creates one ordinary user definition with a protected password reference. */
function user(
  tenant: 'alpha' | 'bravo',
  suffix: string,
  state: FixtureUser['state'],
  options: {
    readonly twoFactorEnabled?: boolean;
    readonly recoveryEnabled?: boolean;
    readonly enumerationSubject?: boolean;
  } = {},
): FixtureUser {
  return {
    id: `${tenant}-user-${suffix}`,
    organizationId: tenant,
    state,
    twoFactorEnabled: options.twoFactorEnabled ?? false,
    recoveryEnabled: options.recoveryEnabled ?? false,
    enumerationSubject: options.enumerationSubject ?? false,
    passwordCredentialRef: `credential:${tenant}:password:${suffix}`,
  };
}

/** Creates one exact OIDC client definition for an ordinary tenant. */
function client(
  tenant: 'alpha' | 'bravo',
  suffix: string,
  kind: FixtureClient['kind'],
  validity: FixtureClient['validity'],
  invalidField?: 'redirect-uri' | 'origin',
): FixtureClient {
  const appOrigin = `https://${tenant}-app-harness.ci.portaidentity.com`;
  return {
    id: `${tenant}-client-${suffix}`,
    organizationId: tenant,
    kind,
    validity,
    invalidConfiguration:
      validity === 'invalid' && invalidField !== undefined
        ? {
            field: invalidField,
            value:
              invalidField === 'redirect-uri'
                ? 'https://attacker.invalid/callback'
                : 'https://attacker.invalid',
            expectedRejection: 'invalid-client-metadata',
          }
        : undefined,
    redirectUris: [`${appOrigin}/callback/${suffix}`],
    origins: [appOrigin],
    grantTypes: ['authorization_code', 'refresh_token'],
    scopes: [...fixtureProtocolScopes],
    clientSecretCredentialRef:
      kind === 'confidential' && validity === 'valid'
        ? `credential:${tenant}:client-secret:${suffix}`
        : undefined,
  };
}

/** Creates one baseline session alias associated with a tenant user. */
function session(tenant: 'alpha' | 'bravo'): FixtureSession {
  return {
    id: `${tenant}-session-baseline`,
    organizationId: tenant,
    userId: `${tenant}-user-active`,
    cookieCredentialRef: `credential:${tenant}:cookie:baseline`,
  };
}

/** Creates one baseline token alias associated with a tenant client and user. */
function token(tenant: 'alpha' | 'bravo'): FixtureToken {
  return {
    id: `${tenant}-token-baseline`,
    organizationId: tenant,
    userId: `${tenant}-user-active`,
    clientId: `${tenant}-client-public`,
    tokenCredentialRef: `credential:${tenant}:token:baseline`,
  };
}

/** Creates one independently addressable tenant resource alias. */
function resource(tenant: 'alpha' | 'bravo'): FixtureTenantResource {
  return {
    id: `${tenant}-resource-primary`,
    organizationId: tenant,
    ownerUserId: `${tenant}-user-active`,
  };
}

/** Creates one complete ordinary-tenant fixture definition. */
function ordinaryTenant(tenant: 'alpha' | 'bravo'): OrdinaryTenantFixture {
  return {
    id: tenant,
    users: [
      user(tenant, 'active', 'active'),
      user(tenant, 'locked', 'locked'),
      user(tenant, 'suspended', 'suspended'),
      user(tenant, 'two-factor', 'active', {
        twoFactorEnabled: true,
        recoveryEnabled: true,
      }),
      user(tenant, 'enumeration', 'active', { enumerationSubject: true }),
    ],
    clients: [
      client(tenant, 'public', 'public', 'valid'),
      client(tenant, 'confidential', 'confidential', 'valid'),
      client(tenant, 'invalid-redirect', 'public', 'invalid', 'redirect-uri'),
      client(tenant, 'invalid-origin', 'confidential', 'invalid', 'origin'),
    ],
    sessions: [session(tenant)],
    tokens: [token(tenant)],
    resources: [resource(tenant)],
  };
}

/** Creates one active administrative actor definition with an exact Porta role. */
function administrativeActor(
  permissionSet: AdministrativeActor['permissionSet'],
  roleId: string,
  permissions: readonly string[],
): AdministrativeActor {
  return {
    id: `admin-actor-${permissionSet}`,
    organizationId: 'super-admin',
    state: 'active',
    permissionSet,
    roleId,
    permissions,
    passwordCredentialRef: `credential:super-admin:password:${permissionSet}`,
    tokenCredentialRef: `credential:super-admin:token:${permissionSet}`,
  };
}

/** Independent read-only permission subset assigned to the limited actor. */
export const limitedAdminPermissions = [
  'admin:org:read',
  'admin:app:read',
  'admin:client:read',
  'admin:user:read',
  'admin:role:read',
  'admin:permission:read',
  'admin:claim:read',
  'admin:config:read',
  'admin:key:read',
  'admin:audit:read',
  'admin:session:read',
  'admin:stats:read',
  'admin:export:read',
] as const;

/** Independent complete permission contract assigned by Porta's bootstrap super-admin role. */
export const fullAdminPermissions = [
  'admin:org:create',
  'admin:org:read',
  'admin:org:update',
  'admin:org:suspend',
  'admin:org:archive',
  'admin:app:create',
  'admin:app:read',
  'admin:app:update',
  'admin:app:archive',
  'admin:client:create',
  'admin:client:read',
  'admin:client:update',
  'admin:client:revoke',
  'admin:user:create',
  'admin:user:read',
  'admin:user:update',
  'admin:user:suspend',
  'admin:user:archive',
  'admin:user:invite',
  'admin:user:2fa',
  'admin:role:create',
  'admin:role:read',
  'admin:role:update',
  'admin:role:archive',
  'admin:role:assign',
  'admin:permission:create',
  'admin:permission:read',
  'admin:permission:archive',
  'admin:claim:create',
  'admin:claim:read',
  'admin:claim:update',
  'admin:claim:archive',
  'admin:config:read',
  'admin:config:update',
  'admin:key:read',
  'admin:key:generate',
  'admin:key:rotate',
  'admin:audit:read',
  'admin:session:read',
  'admin:session:revoke',
  'admin:stats:read',
  'admin:export:read',
  'admin:import:write',
] as const;

/** Stable active administrative controls in the super-admin organization. */
export const administrativeActors = [
  administrativeActor('full', 'porta-super-admin', fullAdminPermissions),
  administrativeActor('limited', 'porta-auditor', limitedAdminPermissions),
  administrativeActor('unprivileged', 'porta-assurance-unprivileged', []),
] as const;

/** Stable alpha fixture definition. */
export const alphaFixture = ordinaryTenant('alpha');

/** Stable bravo fixture definition. */
export const bravoFixture = ordinaryTenant('bravo');

/** Global application definitions with purpose-matched associations. */
export const globalApplications: readonly GlobalApplicationFixture[] = [
  {
    id: 'assurance-oidc',
    purpose: 'mixed',
    clientIds: [...alphaFixture.clients, ...bravoFixture.clients].map((entry) => entry.id),
    roleIds: ['alpha-resource-reader', 'bravo-resource-reader'],
  },
  {
    id: 'porta-admin',
    purpose: 'rbac',
    clientIds: [],
    roleIds: administrativeActors.map((actor) => actor.roleId),
  },
];

/** Global role definitions and their exact fixture-user assignments. */
export const globalRoles: readonly GlobalRoleFixture[] = [
  {
    id: 'alpha-resource-reader',
    applicationId: 'assurance-oidc',
    permissionProfile: 'ordinary',
    assignedUserIds: ['alpha-user-active'],
    permissions: ['assurance:resource:read'],
  },
  {
    id: 'bravo-resource-reader',
    applicationId: 'assurance-oidc',
    permissionProfile: 'ordinary',
    assignedUserIds: ['bravo-user-active'],
    permissions: ['assurance:resource:read'],
  },
  ...administrativeActors.map((actor) => ({
    id: actor.roleId,
    applicationId: 'porta-admin',
    permissionProfile: actor.permissionSet,
    assignedUserIds:
      actor.roleId === 'porta-auditor' ? [actor.id, 'alpha-user-active'] : [actor.id],
    permissions: actor.permissions,
  })),
];

/** Public identifier-only manifest used by immutable fixture specifications. */
export const publicFixtureManifest: PublicFixtureManifest = {
  alpha: alphaFixture,
  bravo: bravoFixture,
  superAdmin: { id: 'super-admin', actors: administrativeActors },
  globalApplications,
  globalRoles,
};

/** Run-owned endpoints used to resolve public client metadata without production-derived values. */
export interface FixtureManifestEndpoints {
  /** Retained SPA endpoint for the active port lease. */
  readonly appBaseUrl: string;
  /** Retained BFF endpoint for the active port lease. */
  readonly bffBaseUrl: string;
}

/** Resolves the independent fixture template to the exact active client endpoints. */
export function resolvePublicFixtureManifest(
  endpoints: FixtureManifestEndpoints,
): PublicFixtureManifest {
  const resolveTenant = (tenant: OrdinaryTenantFixture): OrdinaryTenantFixture => {
    const tenantApp =
      tenant.id === 'alpha'
        ? endpoints.appBaseUrl
        : endpoints.appBaseUrl.replace('app-harness.', 'bravo-app-harness.');
    const tenantBff =
      tenant.id === 'alpha'
        ? endpoints.bffBaseUrl
        : endpoints.bffBaseUrl.replace('app-harness.', 'bravo-app-harness.');
    return {
      ...tenant,
      clients: tenant.clients.map((entry) => {
        const base = entry.kind === 'public' ? tenantApp : tenantBff;
        return {
          ...entry,
          redirectUris: [`${base}${entry.kind === 'public' ? '/callback.html' : '/callback'}`],
          origins: [base],
        };
      }),
    };
  };
  const alpha = resolveTenant(alphaFixture);
  const bravo = resolveTenant(bravoFixture);
  return {
    alpha,
    bravo,
    superAdmin: publicFixtureManifest.superAdmin,
    globalApplications: publicFixtureManifest.globalApplications,
    globalRoles: publicFixtureManifest.globalRoles,
  };
}

/** Complete non-secret credential inventory; raw values remain runtime-only. */
export const protectedCredentialDescriptors: readonly ProtectedCredentialDescriptor[] = [
  ...[alphaFixture, bravoFixture].flatMap((tenant) => [
    ...tenant.users.map((entry) => protectedCredential(entry.passwordCredentialRef, 'password')),
    ...tenant.clients.flatMap((entry) =>
      entry.clientSecretCredentialRef === undefined
        ? []
        : [protectedCredential(entry.clientSecretCredentialRef, 'client-secret')],
    ),
    ...tenant.sessions.map((entry) => protectedCredential(entry.cookieCredentialRef, 'cookie')),
    ...tenant.tokens.map((entry) => protectedCredential(entry.tokenCredentialRef, 'token')),
  ]),
  ...administrativeActors.map((entry) =>
    protectedCredential(entry.passwordCredentialRef, 'password'),
  ),
  ...administrativeActors.map((entry) => protectedCredential(entry.tokenCredentialRef, 'token')),
  protectedCredential('credential:alpha:totp:two-factor', 'totp'),
  protectedCredential('credential:alpha:recovery:two-factor', 'recovery-code'),
  protectedCredential('credential:bravo:totp:two-factor', 'totp'),
  protectedCredential('credential:bravo:recovery:two-factor', 'recovery-code'),
];
