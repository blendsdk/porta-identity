import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../../src/lib/session-tracking.js', () => ({
  getSession: vi.fn(),
  revokeSession: vi.fn(),
  upsertSession: vi.fn(),
}));

vi.mock('../../../src/clients/service.js', () => ({
  findForOidc: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import { getSession, upsertSession } from '../../../src/lib/session-tracking.js';
import { createAdapterFactory } from '../../../src/oidc/adapter-factory.js';
import { RedisAdapter } from '../../../src/oidc/redis-adapter.js';

/** PostgreSQL query double installed fresh for each test. */
let databaseQuery: ReturnType<typeof vi.fn>;

/** Install a Redis double that exposes the publication pipeline. */
function installRedis() {
  const pipeline = {
    exec: vi.fn().mockResolvedValue([]),
    expire: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  const redis = {
    del: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    pipeline: vi.fn().mockReturnValue(pipeline),
    sadd: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue('OK'),
    smembers: vi.fn().mockResolvedValue([]),
    ttl: vi.fn().mockResolvedValue(300),
  };
  vi.mocked(getRedis).mockReturnValue(redis);
  return { pipeline, redis };
}

/** Return one fully live result from the set-based authority query. */
function liveAuthorityResult() {
  return {
    rowCount: 1,
    rows: [{ clientsLive: true, grantsLive: true, usersLive: true }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  databaseQuery = vi.fn().mockResolvedValue(liveAuthorityResult());
  vi.mocked(getPool).mockReturnValue({
    query: databaseQuery,
  });
  vi.mocked(getSession).mockResolvedValue(null);
  vi.mocked(upsertSession).mockResolvedValue(undefined);
});

describe('deleted authority implementation', () => {
  describe('Session publication internals', () => {
    it('should not create a Redis pipeline when Session tracking fails', async () => {
      const { redis } = installRedis();
      vi.mocked(upsertSession).mockRejectedValue(new Error('tracking failed'));

      await expect(
        new RedisAdapter('Session').upsert('session-1', { accountId: 'user-1' }, 60),
      ).rejects.toThrow('tracking failed');

      expect(redis.pipeline).not.toHaveBeenCalled();
    });

    it('should publish non-Session artifacts without creating tracking rows', async () => {
      const { pipeline } = installRedis();

      await new RedisAdapter('Interaction').upsert('interaction-1', { uid: 'uid-1' }, 60);

      expect(upsertSession).not.toHaveBeenCalled();
      expect(pipeline.exec).toHaveBeenCalledOnce();
    });

    it('should pass only string authority fields to Session tracking', async () => {
      installRedis();

      await new RedisAdapter('Session').upsert(
        'session-1',
        { accountId: 42, grantId: 'grant-1', orgId: { unsafe: true } },
        60,
      );

      expect(upsertSession).toHaveBeenCalledWith(
        expect.objectContaining({
          grantId: 'grant-1',
          organizationId: undefined,
          sessionId: 'session-1',
          userId: undefined,
        }),
      );
    });
  });

  describe('post-read reference validation', () => {
    const lookupCases = [
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
          adapter.findByUserCode('code-1'),
      },
    ];

    for (const lookupCase of lookupCases) {
      it(`should skip PostgreSQL when ${lookupCase.method} returns no authority references`, async () => {
        const Adapter = createAdapterFactory();
        const adapter = new Adapter('Interaction');
        vi.spyOn(adapter.delegate, lookupCase.method).mockResolvedValue({ kind: 'Interaction' });

        await expect(lookupCase.read(adapter)).resolves.toEqual({ kind: 'Interaction' });
        expect(databaseQuery).not.toHaveBeenCalled();
      });
    }

    it('should deduplicate top-level and Session authorization references in one query', async () => {
      const Adapter = createAdapterFactory();
      const adapter = new Adapter('Session');
      vi.spyOn(adapter.delegate, 'find').mockResolvedValue({
        accountId: 'user-1',
        clientId: 'client-1',
        grantId: 'grant-1',
        authorizations: {
          'client-1': { grantId: 'grant-1' },
          'client-2': { grantId: 'grant-2' },
        },
      });

      await expect(adapter.find('session-1')).resolves.toBeDefined();

      expect(databaseQuery).toHaveBeenCalledOnce();
      expect(databaseQuery.mock.calls[0]?.[1]).toEqual([
        ['client-1', 'client-2'],
        ['user-1'],
        ['grant-1', 'grant-2'],
      ]);
    });

    for (const failedColumn of ['clientsLive', 'usersLive', 'grantsLive'] as const) {
      it(`should reject the artifact when ${failedColumn} is false`, async () => {
        databaseQuery.mockResolvedValue({
          rowCount: 1,
          rows: [{ ...liveAuthorityResult().rows[0], [failedColumn]: false }],
        });
        const Adapter = createAdapterFactory();
        const adapter = new Adapter('AuthorizationCode');
        vi.spyOn(adapter.delegate, 'find').mockResolvedValue({
          accountId: 'user-1',
          clientId: 'client-1',
          grantId: 'grant-1',
        });

        await expect(adapter.find('artifact-1')).resolves.toBeUndefined();
      });
    }

    it('should propagate a PostgreSQL validation failure', async () => {
      databaseQuery.mockRejectedValue(new Error('database unavailable'));
      const Adapter = createAdapterFactory();
      const adapter = new Adapter('AuthorizationCode');
      vi.spyOn(adapter.delegate, 'find').mockResolvedValue({ clientId: 'client-1' });

      await expect(adapter.find('artifact-1')).rejects.toThrow('database unavailable');
    });
  });
});
