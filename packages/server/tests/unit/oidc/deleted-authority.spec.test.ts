import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(),
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../../src/lib/session-tracking.js', () => ({
  getSession: vi.fn(),
  revokeSession: vi.fn(),
  upsertSession: vi.fn(),
}));

vi.mock('../../../src/clients/repository.js', () => ({
  findClientByClientId: vi.fn(),
  findClientById: vi.fn(),
  insertClient: vi.fn(),
  listClients: vi.fn(),
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
  getLatestActiveSha256: vi.fn(),
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

vi.mock('../../../src/rbac/mapping-repository.js', () => ({
  assignRolesToUser: vi.fn(),
  getPermissionsForUser: vi.fn(),
  getRolesForUser: vi.fn(),
  getUsersWithRole: vi.fn(),
  removeRolesFromUser: vi.fn(),
}));

vi.mock('../../../src/rbac/cache.js', () => ({
  getCachedUserPermissions: vi.fn(),
  getCachedUserRoles: vi.fn(),
  invalidateUserRbacCache: vi.fn(),
  setCachedUserPermissions: vi.fn(),
  setCachedUserRoles: vi.fn(),
}));

vi.mock('../../../src/custom-claims/repository.js', () => ({
  claimNameExists: vi.fn(),
  deleteDefinition: vi.fn(),
  deleteValue: vi.fn(),
  findDefinitionById: vi.fn(),
  findDefinitionByName: vi.fn(),
  findValue: vi.fn(),
  getValuesForUser: vi.fn(),
  getValuesForUserByApp: vi.fn(),
  insertDefinition: vi.fn(),
  listDefinitionsByApplication: vi.fn(),
  updateDefinition: vi.fn(),
  upsertValue: vi.fn(),
}));

vi.mock('../../../src/custom-claims/cache.js', () => ({
  getCachedDefinitions: vi.fn(),
  invalidateDefinitionsCache: vi.fn(),
  setCachedDefinitions: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

import { cacheClient, getCachedClientByClientId } from '../../../src/clients/cache.js';
import { findClientByClientId } from '../../../src/clients/repository.js';
import { findForOidc } from '../../../src/clients/service.js';
import { getCachedDefinitions } from '../../../src/custom-claims/cache.js';
import { getValuesForUserByApp } from '../../../src/custom-claims/repository.js';
import { buildCustomClaims } from '../../../src/custom-claims/service.js';
import { getPool } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import { getSession, revokeSession, upsertSession } from '../../../src/lib/session-tracking.js';
import { createAdapterFactory } from '../../../src/oidc/adapter-factory.js';
import { RedisAdapter } from '../../../src/oidc/redis-adapter.js';
import { getCachedUserPermissions, getCachedUserRoles } from '../../../src/rbac/cache.js';
import { getPermissionsForUser, getRolesForUser } from '../../../src/rbac/mapping-repository.js';
import { buildPermissionClaims, buildRoleClaims } from '../../../src/rbac/user-role-service.js';
import type { Client } from '../../../src/clients/types.js';
import type { CustomClaimWithValue } from '../../../src/custom-claims/types.js';

/** Creates active client data suitable for the OIDC client-model boundary. */
function createActiveClient(): Client {
  return {
    id: 'client-record-1',
    organizationId: 'organization-1',
    applicationId: 'application-1',
    clientId: 'client-public-1',
    clientName: 'Authority Client',
    clientType: 'public',
    applicationType: 'web',
    redirectUris: ['https://client.example/callback'],
    postLogoutRedirectUris: [],
    grantTypes: ['authorization_code'],
    responseTypes: ['code'],
    scope: 'openid',
    tokenEndpointAuthMethod: 'none',
    allowedOrigins: [],
    requirePkce: true,
    loginMethods: null,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

/** Creates Redis doubles and records when payload publication starts. */
function installRedis(payload: Record<string, unknown> = {}) {
  const pipeline = {
    exec: vi.fn().mockResolvedValue([]),
    expire: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  const redis = {
    del: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(JSON.stringify(payload)),
    pipeline: vi.fn().mockReturnValue(pipeline),
    sadd: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue('OK'),
    smembers: vi.fn().mockResolvedValue([]),
    ttl: vi.fn().mockResolvedValue(300),
  };
  vi.mocked(getRedis).mockReturnValue(redis);
  return { pipeline, redis };
}

/** Returns a live tracking record for a Session lookup. */
function createLiveTracking(sessionId = 'session-1') {
  return {
    sessionId,
    userId: 'user-1',
    clientId: null,
    organizationId: 'organization-1',
    grantId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2026-09-06T00:00:00Z'),
    expiresAt: new Date('2099-09-06T00:00:00Z'),
    lastActivityAt: new Date('2026-09-06T00:00:00Z'),
    revokedAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({
    query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
  });
  vi.mocked(getSession).mockResolvedValue(createLiveTracking());
  vi.mocked(revokeSession).mockResolvedValue(undefined);
  vi.mocked(upsertSession).mockResolvedValue(undefined);
});

describe('deleted PostgreSQL authority', () => {
  describe('Session tracking authority', () => {
    // A Session payload must not become usable in Redis before its PostgreSQL tracking row exists.
    it('should persist Session tracking before publishing the Redis payload', async () => {
      const { pipeline } = installRedis();
      const adapter = new RedisAdapter('Session');

      await adapter.upsert('session-1', { accountId: 'user-1' }, 3600);

      expect(upsertSession).toHaveBeenCalledOnce();
      expect(pipeline.exec).toHaveBeenCalledOnce();
      expect(vi.mocked(upsertSession).mock.invocationCallOrder[0]).toBeLessThan(
        pipeline.exec.mock.invocationCallOrder[0],
      );
    });

    // Tracking failure must abort publication instead of creating a Session with no database authority.
    it('should reject Session publication when PostgreSQL tracking fails', async () => {
      const { pipeline } = installRedis();
      vi.mocked(upsertSession).mockRejectedValue(new Error('tracking unavailable'));
      const adapter = new RedisAdapter('Session');

      await expect(adapter.upsert('session-1', { accountId: 'user-1' }, 3600)).rejects.toThrow(
        'tracking unavailable',
      );
      expect(pipeline.exec).not.toHaveBeenCalled();
    });

    // A later Redis failure may leave inert tracking, but the publication failure must still propagate.
    it('should leave only tracking when Redis publication fails after tracking succeeds', async () => {
      const { pipeline } = installRedis();
      pipeline.exec.mockRejectedValue(new Error('Redis unavailable'));
      const adapter = new RedisAdapter('Session');

      await expect(adapter.upsert('session-1', { accountId: 'user-1' }, 3600)).rejects.toThrow(
        'Redis unavailable',
      );
      expect(upsertSession).toHaveBeenCalledOnce();
    });

    // Redis pipelines report individual command failures in resolved result tuples.
    it('should reject Session publication when a Redis pipeline command fails', async () => {
      const { pipeline } = installRedis();
      pipeline.exec.mockResolvedValue([[new Error('Redis command failed'), null]]);
      const adapter = new RedisAdapter('Session');

      await expect(adapter.upsert('session-1', { accountId: 'user-1' }, 3600)).rejects.toThrow(
        'Redis pipeline execution failed',
      );
      expect(upsertSession).toHaveBeenCalledOnce();
    });

    // A null pipeline result means Redis did not return command outcomes and cannot be treated as success.
    it('should reject Session publication when Redis returns no pipeline result', async () => {
      const { pipeline } = installRedis();
      pipeline.exec.mockResolvedValue(null);
      const adapter = new RedisAdapter('Session');

      await expect(adapter.upsert('session-1', { accountId: 'user-1' }, 3600)).rejects.toThrow(
        'Redis pipeline execution failed',
      );
      expect(upsertSession).toHaveBeenCalledOnce();
    });

    // Logout must establish durable revocation before removing the cache entry.
    it('should await Session revocation before deleting the Redis payload', async () => {
      const { redis } = installRedis({ accountId: 'user-1' });
      let finishRevocation: (() => void) | undefined;
      vi.mocked(revokeSession).mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finishRevocation = resolve;
          }),
      );
      const adapter = new RedisAdapter('Session');

      const destroying = adapter.destroy('session-1');
      await vi.waitFor(() => expect(revokeSession).toHaveBeenCalledWith('session-1'));
      expect(redis.del).not.toHaveBeenCalled();

      finishRevocation?.();
      await destroying;

      expect(redis.del).toHaveBeenCalledOnce();
    });

    // A failed durable revocation must fail logout without removing its Redis evidence.
    it('should preserve the Redis payload when Session revocation fails', async () => {
      const { redis } = installRedis({ accountId: 'user-1' });
      vi.mocked(revokeSession).mockRejectedValue(new Error('tracking unavailable'));
      const adapter = new RedisAdapter('Session');

      await expect(adapter.destroy('session-1')).rejects.toThrow('tracking unavailable');
      expect(redis.del).not.toHaveBeenCalled();
    });

    const readCases = [
      {
        method: 'find' as const,
        prepare: (redis: ReturnType<typeof installRedis>['redis']) => {
          redis.get.mockResolvedValue(JSON.stringify({ accountId: 'user-1' }));
        },
        read: (adapter: RedisAdapter) => adapter.find('session-1'),
      },
      {
        method: 'findByUid' as const,
        prepare: (redis: ReturnType<typeof installRedis>['redis']) => {
          redis.get
            .mockResolvedValueOnce('session-1')
            .mockResolvedValueOnce(JSON.stringify({ accountId: 'user-1' }));
        },
        read: (adapter: RedisAdapter) => adapter.findByUid('uid-1'),
      },
      {
        method: 'findByUserCode' as const,
        prepare: (redis: ReturnType<typeof installRedis>['redis']) => {
          redis.get
            .mockResolvedValueOnce('session-1')
            .mockResolvedValueOnce(JSON.stringify({ accountId: 'user-1' }));
        },
        read: (adapter: RedisAdapter) => adapter.findByUserCode('user-code-1'),
      },
    ];

    const invalidTrackingCases = [
      { state: 'missing', tracking: null },
      {
        state: 'expired',
        tracking: { ...createLiveTracking(), expiresAt: new Date('2000-01-01T00:00:00Z') },
      },
      {
        state: 'revoked',
        tracking: { ...createLiveTracking(), revokedAt: new Date('2026-09-06T00:00:00Z') },
      },
    ];

    for (const readCase of readCases) {
      for (const trackingCase of invalidTrackingCases) {
        // Missing, expired, and revoked tracking all remove a cached Session's authority.
        it(`should reject ${trackingCase.state} Session tracking when ${readCase.method} reads Redis`, async () => {
          const { redis } = installRedis();
          readCase.prepare(redis);
          vi.mocked(getSession).mockResolvedValue(trackingCase.tracking);
          const adapter = new RedisAdapter('Session');

          await expect(readCase.read(adapter)).resolves.toBeUndefined();
        });
      }

      // Revoking one user's sessions must not disable an unrelated Session whose tracking remains live.
      it(`should preserve an unrelated live Session when ${readCase.method} reads Redis`, async () => {
        const { redis } = installRedis();
        readCase.prepare(redis);
        vi.mocked(getSession).mockResolvedValue(createLiveTracking());
        const adapter = new RedisAdapter('Session');

        await expect(readCase.read(adapter)).resolves.toEqual({ accountId: 'user-1' });
      });
    }
  });

  describe('direct client authority', () => {
    // OIDC client lookup must ignore stale cached metadata after the database record is deleted.
    it('should return no OIDC client when only stale Redis client metadata remains', async () => {
      vi.mocked(getCachedClientByClientId).mockResolvedValue(createActiveClient());
      vi.mocked(findClientByClientId).mockResolvedValue(null);

      await expect(findForOidc('client-public-1')).resolves.toBeUndefined();
      expect(findClientByClientId).toHaveBeenCalledWith('client-public-1');
      expect(getCachedClientByClientId).not.toHaveBeenCalled();
      expect(cacheClient).not.toHaveBeenCalled();
    });

    // A live database client must be returned without reading or repopulating the Redis client cache.
    it('should return active OIDC client metadata directly from PostgreSQL', async () => {
      vi.mocked(findClientByClientId).mockResolvedValue(createActiveClient());

      const result = await findForOidc('client-public-1');

      expect(result?.client_id).toBe('client-public-1');
      expect(getCachedClientByClientId).not.toHaveBeenCalled();
      expect(cacheClient).not.toHaveBeenCalled();
    });
  });

  describe('cached OIDC artifact authority', () => {
    const artifactReadCases = [
      {
        method: 'find' as const,
        read: (adapter: InstanceType<ReturnType<typeof createAdapterFactory>>) =>
          adapter.find('artifact-1'),
      },
      {
        method: 'findByUid' as const,
        read: (adapter: InstanceType<ReturnType<typeof createAdapterFactory>>) =>
          adapter.findByUid('uid-1'),
      },
      {
        method: 'findByUserCode' as const,
        read: (adapter: InstanceType<ReturnType<typeof createAdapterFactory>>) =>
          adapter.findByUserCode('user-code-1'),
      },
    ];

    for (const readCase of artifactReadCases) {
      // Every non-Client read must re-check all referenced database authority after reading cached data.
      it(`should reject deleted top-level authority when ${readCase.method} returns a cached artifact`, async () => {
        const Factory = createAdapterFactory();
        const adapter = new Factory('AuthorizationCode');
        vi.spyOn(adapter.delegate, readCase.method).mockResolvedValue({
          accountId: 'deleted-user-1',
          clientId: 'deleted-client-1',
          grantId: 'deleted-grant-1',
        });

        await expect(readCase.read(adapter)).resolves.toBeUndefined();
        expect(vi.mocked(getPool).mock.results[0]?.value.query).toHaveBeenCalled();
      });

      // Session authorization maps can contain additional client/grant pairs that must remain live.
      it(`should reject a deleted Session authorization pair when ${readCase.method} returns cached data`, async () => {
        const Factory = createAdapterFactory();
        const adapter = new Factory('Session');
        vi.spyOn(adapter.delegate, readCase.method).mockResolvedValue({
          authorizations: {
            'deleted-client-1': { grantId: 'deleted-grant-1' },
          },
        });

        await expect(readCase.read(adapter)).resolves.toBeUndefined();
        expect(vi.mocked(getPool).mock.results[0]?.value.query).toHaveBeenCalled();
      });
    }
  });

  describe('direct token claim authority', () => {
    const applicationId = 'application-1';

    // Deleted role assignments must disappear from issued claims even while stale Redis data remains.
    it('should build role claims from PostgreSQL when Redis contains deleted roles', async () => {
      vi.mocked(getCachedUserRoles).mockResolvedValue(['deleted-role']);
      vi.mocked(getRolesForUser).mockResolvedValue([]);

      await expect(buildRoleClaims('user-1', applicationId)).resolves.toEqual([]);
      expect(getRolesForUser).toHaveBeenCalledWith('user-1', applicationId);
      expect(getCachedUserRoles).not.toHaveBeenCalled();
    });

    // Deleted permission assignments must disappear from issued claims despite a stale cache entry.
    it('should build permission claims from PostgreSQL when Redis contains deleted permissions', async () => {
      vi.mocked(getCachedUserPermissions).mockResolvedValue(['deleted:permission']);
      vi.mocked(getPermissionsForUser).mockResolvedValue([]);

      await expect(buildPermissionClaims('user-1', applicationId)).resolves.toEqual([]);
      expect(getPermissionsForUser).toHaveBeenCalledWith('user-1', applicationId);
      expect(getCachedUserPermissions).not.toHaveBeenCalled();
    });

    // Claim issuance must use live definitions and values instead of stale cached definitions.
    it('should omit deleted custom claims when Redis contains a stale definition', async () => {
      const staleClaim: CustomClaimWithValue = {
        definition: {
          id: 'claim-1',
          applicationId: 'application-1',
          claimName: 'deleted_claim',
          claimType: 'string',
          description: null,
          includeInIdToken: true,
          includeInAccessToken: true,
          includeInUserinfo: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
        value: {
          id: 'claim-value-1',
          userId: 'user-1',
          claimId: 'claim-1',
          value: 'stale',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      };
      vi.mocked(getCachedDefinitions).mockResolvedValue([staleClaim.definition]);
      vi.mocked(getValuesForUserByApp).mockResolvedValue([]);

      await expect(buildCustomClaims('user-1', 'application-1', 'id_token')).resolves.toEqual({});
      expect(getValuesForUserByApp).toHaveBeenCalledWith('user-1', 'application-1');
      expect(getCachedDefinitions).not.toHaveBeenCalled();
    });
  });
});
