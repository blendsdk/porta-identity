import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../../../src/lib/session-tracking.js', () => ({
  getSession: vi.fn(),
  revokeSession: vi.fn(),
  upsertSession: vi.fn(),
}));

import { getRedis } from '../../../src/lib/redis.js';
import { getSession, revokeSession, upsertSession } from '../../../src/lib/session-tracking.js';
import { RedisAdapter } from '../../../src/oidc/redis-adapter.js';

/** Return a live tracking record for Redis-backed Session tests. */
function createLiveTracking() {
  const now = new Date();
  return {
    sessionId: 'sess-1',
    userId: 'user-1',
    clientId: null,
    organizationId: null,
    grantId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 3_600_000),
    lastActivityAt: now,
    revokedAt: null,
  };
}

function createMockRedis() {
  const pipelineOps: Array<{ method: string; args: unknown[] }> = [];
  const mockPipeline = {
    set: vi.fn((...args: unknown[]) => {
      pipelineOps.push({ method: 'set', args });
      return mockPipeline;
    }),
    sadd: vi.fn((...args: unknown[]) => {
      pipelineOps.push({ method: 'sadd', args });
      return mockPipeline;
    }),
    expire: vi.fn((...args: unknown[]) => {
      pipelineOps.push({ method: 'expire', args });
      return mockPipeline;
    }),
    exec: vi.fn().mockResolvedValue([]),
  };

  const redis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(300),
    smembers: vi.fn().mockResolvedValue([]),
    sadd: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn().mockReturnValue(mockPipeline),
  };

  (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);
  return { redis, mockPipeline, pipelineOps };
}

describe('RedisAdapter', () => {
  let adapter: RedisAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(createLiveTracking());
    vi.mocked(revokeSession).mockResolvedValue(undefined);
    vi.mocked(upsertSession).mockResolvedValue(undefined);
    adapter = new RedisAdapter('Session');
  });

  describe('key format', () => {
    it('follows oidc:{type}:{id} pattern', () => {
      // Access protected method via any cast for testing
      const key = (adapter as unknown as { key: (id: string) => string }).key('abc123');
      expect(key).toBe('oidc:Session:abc123');
    });
  });

  describe('upsert', () => {
    it('sets main key with TTL via pipeline', async () => {
      const { mockPipeline } = createMockRedis();
      const payload = { accountId: 'user-1' };
      await adapter.upsert('sess-1', payload, 3600);

      expect(mockPipeline.set).toHaveBeenCalledWith(
        'oidc:Session:sess-1',
        JSON.stringify(payload),
        'EX',
        3600,
      );
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('sets uid index key when payload has uid', async () => {
      const { mockPipeline } = createMockRedis();
      await adapter.upsert('sess-1', { uid: 'uid-1' }, 3600);

      expect(mockPipeline.set).toHaveBeenCalledWith('oidc:Session:uid:uid-1', 'sess-1', 'EX', 3600);
    });

    it('sets user_code index key when present', async () => {
      const { mockPipeline } = createMockRedis();
      await adapter.upsert('dc-1', { userCode: 'ABCD' }, 600);

      expect(mockPipeline.set).toHaveBeenCalledWith(
        'oidc:Session:user_code:ABCD',
        'dc-1',
        'EX',
        600,
      );
    });

    it('adds to grant set when payload has grantId', async () => {
      const { mockPipeline } = createMockRedis();
      await adapter.upsert('sess-1', { grantId: 'grant-1' }, 3600);

      expect(mockPipeline.sadd).toHaveBeenCalledWith('oidc:Session:grant:grant-1', 'sess-1');
    });
  });

  describe('find', () => {
    it('returns parsed payload for existing key', async () => {
      const { redis } = createMockRedis();
      const payload = { accountId: 'user-1', kind: 'Session' };
      redis.get.mockResolvedValue(JSON.stringify(payload));

      const result = await adapter.find('sess-1');
      expect(result).toEqual(payload);
      expect(redis.get).toHaveBeenCalledWith('oidc:Session:sess-1');
    });

    it('returns undefined for missing key', async () => {
      createMockRedis(); // redis.get returns null by default
      const result = await adapter.find('missing');
      expect(result).toBeUndefined();
    });

    it('returns undefined for invalid JSON', async () => {
      const { redis } = createMockRedis();
      redis.get.mockResolvedValue('not-json');
      const result = await adapter.find('bad-data');
      expect(result).toBeUndefined();
    });
  });

  describe('findByUid', () => {
    it('looks up index key then main key', async () => {
      const { redis } = createMockRedis();
      const payload = { accountId: 'user-1' };
      redis.get
        .mockResolvedValueOnce('sess-1') // uid index lookup
        .mockResolvedValueOnce(JSON.stringify(payload)); // main key lookup

      const result = await adapter.findByUid('uid-123');
      expect(redis.get).toHaveBeenCalledWith('oidc:Session:uid:uid-123');
      expect(redis.get).toHaveBeenCalledWith('oidc:Session:sess-1');
      expect(result).toEqual(payload);
    });

    it('returns undefined when uid index not found', async () => {
      createMockRedis();
      const result = await adapter.findByUid('unknown');
      expect(result).toBeUndefined();
    });
  });

  describe('findByUserCode', () => {
    it('looks up index key then main key', async () => {
      const { redis } = createMockRedis();
      const payload = { kind: 'DeviceCode' };
      redis.get.mockResolvedValueOnce('dc-1').mockResolvedValueOnce(JSON.stringify(payload));

      const result = await adapter.findByUserCode('ABCD');
      expect(redis.get).toHaveBeenCalledWith('oidc:Session:user_code:ABCD');
      expect(result).toEqual(payload);
    });
  });

  describe('consume', () => {
    it('atomically consumes the artifact while preserving its TTL', async () => {
      const { redis } = createMockRedis();

      await adapter.consume('sess-1');

      expect(redis.eval).toHaveBeenCalledWith(
        expect.stringContaining("'KEEPTTL'"),
        1,
        'oidc:Session:sess-1',
        expect.any(Number),
      );
    });

    it('rejects an artifact that another request already consumed', async () => {
      const { redis } = createMockRedis();
      redis.eval.mockResolvedValue(0);

      await expect(adapter.consume('sess-1')).rejects.toMatchObject({
        error: 'invalid_grant',
        status: 400,
      });
    });
  });

  describe('destroy', () => {
    it('deletes main key and index keys', async () => {
      const { redis } = createMockRedis();
      redis.get.mockResolvedValue(JSON.stringify({ uid: 'uid-1', userCode: 'UC-1' }));

      await adapter.destroy('sess-1');

      expect(redis.del).toHaveBeenCalledWith(
        'oidc:Session:sess-1',
        'oidc:Session:uid:uid-1',
        'oidc:Session:user_code:UC-1',
      );
    });

    it('deletes only main key when no index data', async () => {
      const { redis } = createMockRedis();
      redis.get.mockResolvedValue(JSON.stringify({ accountId: 'user-1' }));

      await adapter.destroy('sess-1');
      expect(redis.del).toHaveBeenCalledWith('oidc:Session:sess-1');
    });
  });

  describe('revokeByGrantId', () => {
    it('deletes all grant members and the set key', async () => {
      const { redis } = createMockRedis();
      redis.smembers.mockResolvedValue(['sess-1', 'sess-2']);
      // Each destroy call reads then deletes
      redis.get.mockResolvedValueOnce(JSON.stringify({})).mockResolvedValueOnce(JSON.stringify({}));

      await adapter.revokeByGrantId('grant-1');

      expect(redis.smembers).toHaveBeenCalledWith('oidc:Session:grant:grant-1');
      // Final del for the grant set itself
      expect(redis.del).toHaveBeenCalledWith('oidc:Session:grant:grant-1');
    });

    it('handles empty grant set', async () => {
      const { redis } = createMockRedis();
      redis.smembers.mockResolvedValue([]);

      await adapter.revokeByGrantId('empty-grant');
      expect(redis.del).toHaveBeenCalledWith('oidc:Session:grant:empty-grant');
    });
  });

  describe('cleanupRedisGrants', () => {
    it('deletes grant set keys for all provided grant IDs', async () => {
      const { redis } = createMockRedis();
      const { cleanupRedisGrants } = await import('../../../src/oidc/redis-adapter.js');

      await cleanupRedisGrants(['grant-a', 'grant-b']);

      // Should call redis.del with collected grant set keys (one per model × grantId)
      // smembers returns [] by default, so only grant set keys are collected
      expect(redis.del).toHaveBeenCalled();
      // Verify smembers was called for each model × grantId combination
      expect(redis.smembers).toHaveBeenCalled();
    });

    it('does nothing when the array is empty', async () => {
      const { redis } = createMockRedis();
      const { cleanupRedisGrants } = await import('../../../src/oidc/redis-adapter.js');

      await cleanupRedisGrants([]);

      // No del should be called for empty input
      expect(redis.del).not.toHaveBeenCalled();
      expect(redis.smembers).not.toHaveBeenCalled();
    });

    it('does not throw on Redis errors (best-effort)', async () => {
      const { redis } = createMockRedis();
      redis.smembers.mockRejectedValue(new Error('Redis down'));
      const { cleanupRedisGrants } = await import('../../../src/oidc/redis-adapter.js');

      // Should not throw — errors are caught and logged
      await expect(cleanupRedisGrants(['grant-1'])).resolves.toBeUndefined();
    });
  });
});
