import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerPortabilityCleanup,
  type PortabilityWriteIds,
} from '../../../src/portability/cleanup.js';
import { writePortabilityClient } from '../../../src/portability/import-user-client-writers.js';
import type { ResolvedPortabilityPlan } from '../../../src/portability/plan.js';
import type {
  PortabilityActionCounts,
  PortabilityEntityType,
} from '../../../src/portability/types.js';
import {
  alphaOrganization,
  alphaUser,
  confidentialClient,
  importManifest,
  portableUser,
} from './portability-import-fixtures.js';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  afterCommit: vi.fn(),
  runTransaction: vi.fn(),
  revokeAuthority: vi.fn(),
  authorityCleanup: vi.fn(),
  invalidateOrganization: vi.fn(),
  invalidateApplication: vi.fn(),
  invalidateClient: vi.fn(),
  invalidateDefinitions: vi.fn(),
  invalidateRole: vi.fn(),
  invalidateUserRbac: vi.fn(),
  invalidateUser: vi.fn(),
  generateSecret: vi.fn(() => 'one-time-secret'),
  hashSecret: vi.fn(() => Promise.resolve('$argon2id$hashed')),
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: mocks.query }),
  afterDatabaseCommit: mocks.afterCommit,
  runDatabaseTransaction: mocks.runTransaction,
}));
vi.mock('../../../src/lib/authority-revocation.js', () => ({
  revokeAffectedAuthorityInTransaction: mocks.revokeAuthority,
}));
vi.mock('../../../src/lib/deletion-cleanup.js', () => ({
  registerAuthorityCleanup: mocks.authorityCleanup,
}));
vi.mock('../../../src/organizations/cache.js', () => ({
  invalidateOrganizationCache: mocks.invalidateOrganization,
}));
vi.mock('../../../src/applications/cache.js', () => ({
  invalidateApplicationCache: mocks.invalidateApplication,
}));
vi.mock('../../../src/clients/cache.js', () => ({
  invalidateClientCache: mocks.invalidateClient,
}));
vi.mock('../../../src/custom-claims/cache.js', () => ({
  invalidateDefinitionsCache: mocks.invalidateDefinitions,
}));
vi.mock('../../../src/rbac/cache.js', () => ({
  invalidateRoleCache: mocks.invalidateRole,
  invalidateUserRbacCache: mocks.invalidateUserRbac,
}));
vi.mock('../../../src/users/cache.js', () => ({ invalidateUserCache: mocks.invalidateUser }));
vi.mock('../../../src/clients/crypto.js', () => ({
  generateSecret: mocks.generateSecret,
  hashSecret: mocks.hashSecret,
}));

/** Build zeroed result counters for every portable collection. */
function emptySummary(): Record<PortabilityEntityType, PortabilityActionCounts> {
  const zero = (): PortabilityActionCounts => ({ created: 0, updated: 0, skipped: 0, rejected: 0 });
  return {
    organizations: zero(),
    applications: zero(),
    application_modules: zero(),
    roles: zero(),
    permissions: zero(),
    claim_definitions: zero(),
    role_permission_mappings: zero(),
    users: zero(),
    user_role_assignments: zero(),
    user_claim_values: zero(),
    clients: zero(),
  };
}

/** Build the resolved state for one existing-user lifecycle update. */
function inactiveUserPlan(): ResolvedPortabilityPlan {
  const manifest = importManifest({
    categories: ['users_assignments'],
    application_selection: { all_applications: true, application_slugs: [] },
    users: [{ ...portableUser, status: 'inactive' }],
  });
  const summary = emptySummary();
  summary.users = { created: 0, updated: 1, skipped: 0, rejected: 0 };
  return {
    manifest,
    snapshot: {
      organizations: [alphaOrganization],
      brandingAssets: [],
      applications: [],
      applicationModules: [],
      roles: [],
      permissions: [],
      claimDefinitions: [],
      rolePermissions: [],
      users: [alphaUser],
      userRoles: [],
      userClaimValues: [],
      clients: [],
    },
    result: {
      mode: 'update-existing',
      summary,
      items: [
        {
          entity_type: 'users',
          action: 'updated',
          natural_key: {
            organization_slug: portableUser.organization_slug,
            email: portableUser.email,
          },
        },
      ],
      errors: [],
    },
  };
}

/** Build identifier maps matching the lifecycle fixture. */
function writeIds(): PortabilityWriteIds {
  return {
    organizationIds: new Map([['alpha', alphaOrganization.id]]),
    applicationIds: new Map(),
    roleIds: new Map(),
    claimIds: new Map(),
    userIds: new Map([['alpha\u001fmember@alpha.example', alphaUser.id]]),
    clientIds: new Map(),
  };
}

describe('portability apply implementation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
    mocks.runTransaction.mockImplementation(async (work: () => Promise<unknown>) => work());
    mocks.revokeAuthority.mockResolvedValue({ grantIds: ['grant-1'] });
    mocks.authorityCleanup.mockResolvedValue(undefined);
  });

  afterEach(() => vi.useRealTimers());

  it('defers exact inactive-user authority cleanup until after commit', async () => {
    await registerPortabilityCleanup(inactiveUserPlan(), writeIds());

    expect(mocks.invalidateUser).toHaveBeenCalledWith(alphaUser.id);
    expect(mocks.afterCommit).toHaveBeenCalledOnce();
    expect(mocks.revokeAuthority).not.toHaveBeenCalled();

    const effect = mocks.afterCommit.mock.calls[0]?.[0];
    expect(effect).toBeTypeOf('function');
    await effect?.();

    expect(mocks.revokeAuthority).toHaveBeenCalledWith([alphaUser.id]);
    expect(mocks.authorityCleanup).toHaveBeenCalledWith({
      userIds: [alphaUser.id],
      grantIds: ['grant-1'],
      roleIds: [],
      revokeOidcState: true,
    });
  });

  it('clamps a new confidential-client secret to six UTC calendar months', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-31T23:45:12.345Z'));

    const result = await writePortabilityClient(
      confidentialClient,
      'organization-id',
      'application-id',
      null,
    );

    expect(result.credential).toMatchObject({
      client_id: confidentialClient.client_id,
      secret: 'one-time-secret',
      expires_at: '2027-02-28T23:45:12.345Z',
    });
    const secretInsert = mocks.query.mock.calls.find(([sql]) =>
      /insert into client_secrets/i.test(String(sql)),
    );
    expect(secretInsert?.[1]).not.toContain('one-time-secret');
  });
});
