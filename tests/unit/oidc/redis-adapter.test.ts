import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getRedis } from '../../../src/lib/redis.js';
import { RedisAdapter } from '../../../src/oidc/redis-adapter.js';

function createMockRedis() {
  const pipelineOps: Array<{ method: string; args: unknown[] }> = [];
  const mockPipeline = {
    set: vi.fn((...args: unknown[]) => { pipelineOps.push({ method: 'set', args }); return mockPipeline; }),
    sadd: vi.fn((...args: unknown[]) => { pipelineOps.push({ method: 'sadd', args }); return mockPipeline; }),
    expire: vi.fn((...args: unknown[]) => { pipelineOps.push({ method: 'expire', args }); return mockPipeline; }),
    exec: vi.fn().mockResolvedValue([]),
  };

  const redis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
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

      expect(mockPipeline.set).toHaveBeenCalledWith(
        'oidc:Session:uid:uid-1',
        'sess-1',
        'EX',
        3600,
      );
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

      expect(mockPipeline.sadd).toHaveBeenCalledWith(
        'oidc:Session:grant:grant-1',
        'sess-1',
      );
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
        .mockResolvedValueOnce('sess-1')          // uid index lookup
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
      redis.get
        .mockResolvedValueOnce('dc-1')
        .mockResolvedValueOnce(JSON.stringify(payload));

      const result = await adapter.findByUserCode('ABCD');
      expect(redis.get).toHaveBeenCalledWith('oidc:Session:user_code:ABCD');
      expect(result).toEqual(payload);
    });
  });

  describe('consume', () => {
    it('reads payload, adds consumed timestamp, writes back with remaining TTL', async () => {
      const { redis } = createMockRedis();
      const payload = { accountId: 'user-1' };
      redis.get.mockResolvedValue(JSON.stringify(payload));
      redis.ttl.mockResolvedValue(1800);

      await adapter.consume('sess-1');

      expect(redis.get).toHaveBeenCalledWith('oidc:Session:sess-1');
      expect(redis.ttl).toHaveBeenCalledWith('oidc:Session:sess-1');
      expect(redis.set).toHaveBeenCalledWith(
        'oidc:Session:sess-1',
        expect.stringContaining('"consumed"'),
        'EX',
        1800,
      );
    });

    it('does nothing when key not found', async () => {
      const { redis } = createMockRedis();
      await adapter.consume('missing');
      expect(redis.set).not.toHaveBeenCalled();
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
      redis.get
        .mockResolvedValueOnce(JSON.stringify({}))
        .mockResolvedValueOnce(JSON.stringify({}));

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
});
