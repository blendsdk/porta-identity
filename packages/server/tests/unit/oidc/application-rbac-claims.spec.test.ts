import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../../../src/clients/types.js';
import type { Permission, Role } from '../../../src/rbac/types.js';
import type { User } from '../../../src/users/types.js';

const repository = vi.hoisted(() => ({
  findClientByClientId: vi.fn(),
  getRolesForUser: vi.fn<(userId: string, applicationId?: string) => Promise<Role[]>>(),
  getPermissionsForUser: vi.fn<(userId: string, applicationId?: string) => Promise<Permission[]>>(),
}));

const accountDependencies = vi.hoisted(() => ({
  findUserForOidc: vi.fn(),
  buildUserClaims: vi.fn(),
  buildCustomClaims: vi.fn(),
}));

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../../src/clients/repository.js', () => ({
  captureClientForDeletion: vi.fn(),
  deleteCapturedClient: vi.fn(),
  findClientByClientId: repository.findClientByClientId,
  findClientById: vi.fn(),
  insertClient: vi.fn(),
  listClients: vi.fn(),
  listClientsCursor: vi.fn(),
  updateClient: vi.fn(),
}));

vi.mock('../../../src/clients/cache.js', () => ({
  cacheClient: vi.fn(),
  getCachedClientByClientId: vi.fn(),
  getCachedClientById: vi.fn(),
  invalidateClientCache: vi.fn(),
}));

vi.mock('../../../src/clients/crypto.js', () => ({
  generateClientId: vi.fn(),
}));

vi.mock('../../../src/clients/validators.js', () => ({
  getDefaultGrantTypes: vi.fn(),
  getDefaultResponseTypes: vi.fn(),
  getDefaultScope: vi.fn(),
  getDefaultTokenEndpointAuthMethod: vi.fn(),
  validateClientProtocolCompatibility: vi.fn(),
  validateRedirectUris: vi.fn(),
}));

vi.mock('../../../src/clients/secret-repository.js', () => ({
  getLatestActiveSha256: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../src/clients/secret-service.js', () => ({
  verify: vi.fn(),
}));

vi.mock('../../../src/applications/service.js', () => ({
  getApplicationById: vi.fn(),
}));

vi.mock('../../../src/organizations/service.js', () => ({
  getOrganizationById: vi.fn(),
}));

vi.mock('../../../src/lib/database.js', () => ({
  getDatabaseTransactionClient: vi.fn(),
}));

vi.mock('../../../src/lib/deletion-cleanup.js', () => ({
  registerDeletionCleanup: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
}));

vi.mock('../../../src/rbac/mapping-repository.js', () => ({
  assignRolesToUser: vi.fn(),
  getPermissionsForUser: repository.getPermissionsForUser,
  getRolesForUser: repository.getRolesForUser,
  getUsersWithRole: vi.fn(),
  removeRolesFromUser: vi.fn(),
}));

vi.mock('../../../src/rbac/cache.js', () => ({
  invalidateUserRbacCache: vi.fn(),
}));

vi.mock('../../../src/users/service.js', () => ({
  findUserForOidc: accountDependencies.findUserForOidc,
  getUserById: vi.fn(),
}));

vi.mock('../../../src/users/claims.js', () => ({
  buildUserClaims: accountDependencies.buildUserClaims,
}));

vi.mock('../../../src/custom-claims/service.js', () => ({
  buildCustomClaims: accountDependencies.buildCustomClaims,
}));

vi.mock('../../../src/lib/logger.js', () => ({ logger }));

import { findForOidc } from '../../../src/clients/service.js';
import { findAccount } from '../../../src/oidc/account-finder.js';
import { buildProviderConfiguration } from '../../../src/oidc/configuration.js';
import { buildPermissionClaims, buildRoleClaims } from '../../../src/rbac/user-role-service.js';

const USER_ID = '67f6198e-d855-4a36-a928-6c9a7dc01bba';
const BILLING_APP_ID = '31570b20-8020-4786-8917-99b85f42dc76';
const CRM_APP_ID = 'b72a9062-bef7-4a28-95b8-0b6cfe31030f';
const CLIENT_ID = 'billing-client';

const user: User = {
  id: USER_ID,
  organizationId: '19699103-b7fb-479b-a76f-3273b35bdc2f',
  email: 'operator@example.com',
  emailVerified: true,
  status: 'active',
  givenName: 'Test',
  familyName: 'Operator',
  middleName: null,
  nickname: null,
  preferredUsername: null,
  profileUrl: null,
  pictureUrl: null,
  websiteUrl: null,
  gender: null,
  birthdate: null,
  zoneinfo: null,
  locale: null,
  phoneNumber: null,
  phoneNumberVerified: false,
  addressStreet: null,
  addressLocality: null,
  addressRegion: null,
  addressPostalCode: null,
  addressCountry: null,
  loginCount: 0,
  lastLoginAt: null,
  lockedAt: null,
  lockedReason: null,
  passwordChangedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const billingClient: Client = {
  id: '1a289c3e-0982-4c33-b98f-57a97b6929ee',
  organizationId: user.organizationId,
  applicationId: BILLING_APP_ID,
  clientId: CLIENT_ID,
  clientName: 'Billing',
  clientType: 'public',
  applicationType: 'native',
  redirectUris: ['http://127.0.0.1/callback'],
  postLogoutRedirectUris: [],
  grantTypes: ['authorization_code'],
  responseTypes: ['code'],
  scope: 'openid profile',
  tokenEndpointAuthMethod: 'none',
  allowedOrigins: [],
  requirePkce: true,
  loginMethods: null,
  status: 'active',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function role(id: string, applicationId: string, slug: string): Role {
  return {
    id,
    applicationId,
    name: slug,
    slug,
    description: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function permission(id: string, applicationId: string, slug: string): Permission {
  return {
    id,
    applicationId,
    moduleId: null,
    name: slug,
    slug,
    description: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

const billingRole = role('9255a5c5-f15f-49af-a88c-978403820a42', BILLING_APP_ID, 'billing-reader');
const crmRole = role('62442e76-d2e5-47ca-9736-1246690f6c99', CRM_APP_ID, 'crm-editor');
const billingPermission = permission(
  'c775e56f-6a1d-4500-96eb-df7384970545',
  BILLING_APP_ID,
  'billing:invoices:read',
);
const crmPermission = permission(
  '07361bb7-0026-4280-a751-d1457b6d7649',
  CRM_APP_ID,
  'crm:contacts:write',
);

const buildScopedRoleClaims: (userId: string, applicationId: string) => Promise<string[]> =
  buildRoleClaims;
const buildScopedPermissionClaims: (userId: string, applicationId: string) => Promise<string[]> =
  buildPermissionClaims;

function installQualifiedRepositoryResults(): void {
  repository.getRolesForUser.mockImplementation(async (_userId, applicationId) => {
    if (applicationId === BILLING_APP_ID) return [billingRole];
    if (applicationId === CRM_APP_ID) return [crmRole];
    return [billingRole, crmRole];
  });
  repository.getPermissionsForUser.mockImplementation(async (_userId, applicationId) => {
    if (applicationId === BILLING_APP_ID) return [billingPermission];
    if (applicationId === CRM_APP_ID) return [crmPermission];
    return [billingPermission, crmPermission];
  });
}

function portaApplicationMetadataEntry(
  metadata: Record<string, unknown>,
): [string, unknown] | undefined {
  return Object.entries(metadata).find(
    ([property, value]) => property.startsWith('urn:porta:') && value === BILLING_APP_ID,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  installQualifiedRepositoryResults();
  repository.findClientByClientId.mockResolvedValue(billingClient);
  accountDependencies.findUserForOidc.mockResolvedValue(user);
  accountDependencies.buildUserClaims.mockReturnValue({
    sub: USER_ID,
    email: user.email,
    email_verified: true,
  });
  accountDependencies.buildCustomClaims.mockResolvedValue({});
});

describe('application-scoped RBAC claims', () => {
  // A client receives authority owned only by its linked application.
  it('returns only the requested application roles and permissions', async () => {
    await expect(buildScopedRoleClaims(USER_ID, BILLING_APP_ID)).resolves.toEqual([
      'billing-reader',
    ]);
    await expect(buildScopedPermissionClaims(USER_ID, BILLING_APP_ID)).resolves.toEqual([
      'billing:invoices:read',
    ]);

    expect(repository.getRolesForUser).toHaveBeenCalledWith(USER_ID, BILLING_APP_ID);
    expect(repository.getPermissionsForUser).toHaveBeenCalledWith(USER_ID, BILLING_APP_ID);
  });

  // Reused slugs remain separate because application ownership is the trust boundary.
  it('does not merge duplicate slugs owned by another application', async () => {
    const billingMember = role('b86142fa-1a62-4581-8d44-2a22f0661f8b', BILLING_APP_ID, 'member');
    const crmMember = role('c7affdf9-1c69-41d9-8996-5ccef581d609', CRM_APP_ID, 'member');
    const billingRead = permission(
      '6fa9e1cc-1096-4efa-8519-761fbce2b5f6',
      BILLING_APP_ID,
      'shared:records:read',
    );
    const crmRead = permission(
      '34bdc74c-b7eb-48b3-b600-1e78489a1351',
      CRM_APP_ID,
      'shared:records:read',
    );
    repository.getRolesForUser.mockImplementation(async (_userId, applicationId) =>
      applicationId === BILLING_APP_ID ? [billingMember] : [billingMember, crmMember],
    );
    repository.getPermissionsForUser.mockImplementation(async (_userId, applicationId) =>
      applicationId === BILLING_APP_ID ? [billingRead] : [billingRead, crmRead],
    );

    await expect(buildScopedRoleClaims(USER_ID, BILLING_APP_ID)).resolves.toEqual(['member']);
    await expect(buildScopedPermissionClaims(USER_ID, BILLING_APP_ID)).resolves.toEqual([
      'shared:records:read',
    ]);
  });

  // Missing application context must fail closed without removing ordinary identity claims.
  it('keeps standard claims but emits empty RBAC arrays without application context', async () => {
    const account = await findAccount({ oidc: { client: {} } }, USER_ID);
    const claims = await account?.claims('id_token', 'openid email');

    expect(claims).toMatchObject({
      sub: USER_ID,
      email: user.email,
      roles: [],
      permissions: [],
    });
    expect(repository.getRolesForUser).not.toHaveBeenCalled();
    expect(repository.getPermissionsForUser).not.toHaveBeenCalled();
  });

  // Invalid application context is treated like absent context and never triggers a global lookup.
  it('keeps standard claims but emits empty RBAC arrays for malformed application context', async () => {
    const metadata = await findForOidc(CLIENT_ID);
    const applicationEntry = portaApplicationMetadataEntry(metadata ?? {});
    expect(applicationEntry).toBeDefined();
    const account = await findAccount(
      {
        oidc: {
          client: { ...metadata, [applicationEntry?.[0] ?? 'missing-property']: 'not-a-uuid' },
        },
      },
      USER_ID,
    );
    const claims = await account?.claims('id_token', 'openid email');

    expect(claims).toMatchObject({
      sub: USER_ID,
      email: user.email,
      roles: [],
      permissions: [],
    });
    expect(repository.getRolesForUser).not.toHaveBeenCalled();
    expect(repository.getPermissionsForUser).not.toHaveBeenCalled();
  });

  // A database failure must not return a partial authority result that appears trustworthy.
  it('fails claim construction when a qualified authority query fails', async () => {
    repository.getRolesForUser.mockRejectedValue(new Error('authority lookup failed'));
    const metadata = await findForOidc(CLIENT_ID);
    const applicationEntry = portaApplicationMetadataEntry(metadata ?? {});
    expect(applicationEntry).toBeDefined();
    const account = await findAccount({ oidc: { client: metadata } }, USER_ID);

    await expect(account?.claims('id_token', 'openid')).rejects.toThrow('authority lookup failed');
  });

  // Internal routing metadata may scope claims but must not become public authentication data.
  it('carries application authority through provider metadata without publishing it as a claim', async () => {
    const metadata = await findForOidc(CLIENT_ID);
    expect(metadata).toBeDefined();
    const applicationEntry = portaApplicationMetadataEntry(metadata ?? {});
    expect(applicationEntry).toBeDefined();

    const providerConfiguration = buildProviderConfiguration({
      ttl: {
        accessToken: 3600,
        authorizationCode: 600,
        idToken: 3600,
        refreshToken: 86400,
        interaction: 3600,
        session: 1209600,
        grant: 1209600,
      },
      jwks: { keys: [] },
      cookieKeys: ['test-cookie-key-0123456789'],
      findAccount,
      adapterFactory: class TestAdapter {},
      interactionUrl: (_ctx, interaction) => `/interaction/${interaction.uid}`,
    });
    const preservedProperties = (
      providerConfiguration.extraClientMetadata as { properties: string[] }
    ).properties;
    expect(preservedProperties).toContain(applicationEntry?.[0]);

    const account = await findAccount({ oidc: { client: metadata } }, USER_ID);
    expect(account).toBeDefined();

    for (const use of ['id_token', 'userinfo', 'introspection']) {
      const claims = await account?.claims(use, 'openid profile');
      expect(claims?.roles).toEqual(['billing-reader']);
      expect(claims?.permissions).toEqual(['billing:invoices:read']);
      expect(JSON.stringify(claims)).not.toContain(BILLING_APP_ID);
      expect(claims).not.toHaveProperty(applicationEntry?.[0] ?? 'missing-internal-property');
    }

    expect(repository.getRolesForUser).toHaveBeenCalledWith(USER_ID, BILLING_APP_ID);
    expect(repository.getPermissionsForUser).toHaveBeenCalledWith(USER_ID, BILLING_APP_ID);
    expect(accountDependencies.buildCustomClaims).toHaveBeenCalledWith(
      USER_ID,
      BILLING_APP_ID,
      'access_token',
    );
    const loggedValues = Object.values(logger).flatMap((method) => method.mock.calls);
    expect(JSON.stringify(loggedValues)).not.toContain(BILLING_APP_ID);
  });
});
