import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn().mockReturnValue({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
}));

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn().mockReturnValue({
    get: vi.fn(), set: vi.fn(), del: vi.fn(),
    pipeline: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnThis(), sadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue([]),
    }),
  }),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock the clients service (findForOidc is imported by adapter-factory)
vi.mock('../../../src/clients/service.js', () => ({
  findForOidc: vi.fn().mockResolvedValue(undefined),
}));

// Mock remaining transitive dependencies
vi.mock('../../../src/clients/cache.js', () => ({
  getCachedClientByClientId: vi.fn(), getCachedClientById: vi.fn(),
  cacheClient: vi.fn(), invalidateClientCache: vi.fn(),
}));
vi.mock('../../../src/clients/repository.js', () => ({
  findClientByClientId: vi.fn(), findClientById: vi.fn(),
  insertClient: vi.fn(), updateClient: vi.fn(), listClients: vi.fn(),
}));
vi.mock('../../../src/clients/secret-repository.js', () => ({
  getLatestActiveSha256: vi.fn(),
}));

import { createAdapterFactory, REDIS_MODELS, isRedisModel } from '../../../src/oidc/adapter-factory.js';
import { RedisAdapter } from '../../../src/oidc/redis-adapter.js';
import { PostgresAdapter } from '../../../src/oidc/postgres-adapter.js';

describe('adapter-factory', () => {
  describe('isRedisModel', () => {
    it('returns true for Redis models', () => {
      expect(isRedisModel('Session')).toBe(true);
      expect(isRedisModel('Interaction')).toBe(true);
      expect(isRedisModel('AuthorizationCode')).toBe(true);
      expect(isRedisModel('ReplayDetection')).toBe(true);
      expect(isRedisModel('ClientCredentials')).toBe(true);
      expect(isRedisModel('PushedAuthorizationRequest')).toBe(true);
    });

    it('returns false for Postgres models', () => {
      expect(isRedisModel('AccessToken')).toBe(false);
      expect(isRedisModel('RefreshToken')).toBe(false);
      expect(isRedisModel('Grant')).toBe(false);
    });

    it('returns false for unknown models', () => {
      expect(isRedisModel('FutureModel')).toBe(false);
    });
  });

  describe('REDIS_MODELS', () => {
    it('contains exactly 6 models', () => {
      expect(REDIS_MODELS.size).toBe(6);
    });
  });

  describe('createAdapterFactory', () => {
    it('returns a class constructor', () => {
      const Factory = createAdapterFactory();
      expect(typeof Factory).toBe('function');
    });

    it('routes Session to RedisAdapter', () => {
      const Factory = createAdapterFactory();
      const instance = new Factory('Session');
      expect(instance.delegate).toBeInstanceOf(RedisAdapter);
    });

    it('routes Interaction to RedisAdapter', () => {
      const Factory = createAdapterFactory();
      const instance = new Factory('Interaction');
      expect(instance.delegate).toBeInstanceOf(RedisAdapter);
    });

    it('routes AuthorizationCode to RedisAdapter', () => {
      const Factory = createAdapterFactory();
      const instance = new Factory('AuthorizationCode');
      expect(instance.delegate).toBeInstanceOf(RedisAdapter);
    });

    it('routes AccessToken to PostgresAdapter', () => {
      const Factory = createAdapterFactory();
      const instance = new Factory('AccessToken');
      expect(instance.delegate).toBeInstanceOf(PostgresAdapter);
    });

    it('routes RefreshToken to PostgresAdapter', () => {
      const Factory = createAdapterFactory();
      const instance = new Factory('RefreshToken');
      expect(instance.delegate).toBeInstanceOf(PostgresAdapter);
    });

    it('routes Grant to PostgresAdapter', () => {
      const Factory = createAdapterFactory();
      const instance = new Factory('Grant');
      expect(instance.delegate).toBeInstanceOf(PostgresAdapter);
    });

    it('routes unknown model to PostgresAdapter (default)', () => {
      const Factory = createAdapterFactory();
      const instance = new Factory('FutureModel');
      expect(instance.delegate).toBeInstanceOf(PostgresAdapter);
    });

    it('delegates upsert to the underlying adapter', async () => {
      const Factory = createAdapterFactory();
      const instance = new Factory('AccessToken');
      const spy = vi.spyOn(instance.delegate, 'upsert').mockResolvedValue(undefined);
      await instance.upsert('id', {}, 300);
      expect(spy).toHaveBeenCalledWith('id', {}, 300);
    });

    it('stores the model name on the instance', () => {
      const Factory = createAdapterFactory();
      const sessionAdapter = new Factory('Session');
      const tokenAdapter = new Factory('AccessToken');
      const clientAdapter = new Factory('Client');

      expect(sessionAdapter.name).toBe('Session');
      expect(tokenAdapter.name).toBe('AccessToken');
      expect(clientAdapter.name).toBe('Client');
    });
  });

  // =========================================================================
  // Client model routing
  // =========================================================================

  describe('Client model routing', () => {
    it('routes Client.find() to findForOidc instead of delegate', async () => {
      const Factory = createAdapterFactory();
      const adapter = new Factory('Client');
      const delegateSpy = vi.spyOn(adapter.delegate, 'find').mockResolvedValue({ client_id: 'test' });

      // findForOidc is mocked via the service module mock — it returns undefined by default
      const result = await adapter.find('some-client-id');

      // The delegate should NOT be called for Client model
      expect(delegateSpy).not.toHaveBeenCalled();
      // Result comes from findForOidc (undefined because not mocked in detail)
      expect(result).toBeUndefined();
    });

    it('still routes non-Client models to delegate.find()', async () => {
      const Factory = createAdapterFactory();
      const adapter = new Factory('AccessToken');
      const delegateSpy = vi.spyOn(adapter.delegate, 'find').mockResolvedValue({ jti: 'token-1' });

      const result = await adapter.find('token-id');

      expect(delegateSpy).toHaveBeenCalledWith('token-id');
      expect(result).toEqual({ jti: 'token-1' });
    });

    it('still routes Session to Redis delegate.find()', async () => {
      const Factory = createAdapterFactory();
      const adapter = new Factory('Session');
      const delegateSpy = vi.spyOn(adapter.delegate, 'find').mockResolvedValue({ uid: 'session-1' });

      const result = await adapter.find('session-id');

      expect(delegateSpy).toHaveBeenCalledWith('session-id');
      expect(result).toEqual({ uid: 'session-1' });
    });

    it('delegates upsert to delegate even for Client model', async () => {
      const Factory = createAdapterFactory();
      const adapter = new Factory('Client');
      const spy = vi.spyOn(adapter.delegate, 'upsert').mockResolvedValue(undefined);

      await adapter.upsert('id', { client_id: 'test' }, 0);
      expect(spy).toHaveBeenCalledWith('id', { client_id: 'test' }, 0);
    });
  });

  // =========================================================================
  // Session destroy cascade
  // =========================================================================

  describe('Session destroy() cascade', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('reads session authorizations before destroying', async () => {
      const Factory = createAdapterFactory();
      const adapter = new Factory('Session');
      const findSpy = vi.spyOn(adapter.delegate, 'find').mockResolvedValue({
        authorizations: {
          'client-1': { grantId: 'grant-abc', sid: 'sid-1' },
        },
      });
      const destroySpy = vi.spyOn(adapter.delegate, 'destroy').mockResolvedValue(undefined);

      await adapter.destroy('session-123');

      expect(findSpy).toHaveBeenCalledWith('session-123');
      expect(destroySpy).toHaveBeenCalledWith('session-123');
    });

    it('destroys session even when cascade fails', async () => {
      const Factory = createAdapterFactory();
      const adapter = new Factory('Session');
      // find throws — cascade fails
      vi.spyOn(adapter.delegate, 'find').mockRejectedValue(new Error('Redis down'));
      const destroySpy = vi.spyOn(adapter.delegate, 'destroy').mockResolvedValue(undefined);

      await adapter.destroy('session-123');

      // Session must still be destroyed — user must always be able to log out
      expect(destroySpy).toHaveBeenCalledWith('session-123');
    });

    it('skips cascade when session has no authorizations', async () => {
      const Factory = createAdapterFactory();
      const adapter = new Factory('Session');
      vi.spyOn(adapter.delegate, 'find').mockResolvedValue({ accountId: 'user-1' });
      const destroySpy = vi.spyOn(adapter.delegate, 'destroy').mockResolvedValue(undefined);

      await adapter.destroy('session-123');

      // Only the session destroy should be called, no cascade
      expect(destroySpy).toHaveBeenCalledWith('session-123');
    });

    it('skips cascade when session is not found', async () => {
      const Factory = createAdapterFactory();
      const adapter = new Factory('Session');
      vi.spyOn(adapter.delegate, 'find').mockResolvedValue(undefined);
      const destroySpy = vi.spyOn(adapter.delegate, 'destroy').mockResolvedValue(undefined);

      await adapter.destroy('session-123');

      expect(destroySpy).toHaveBeenCalledWith('session-123');
    });

    it('does not cascade for non-Session models', async () => {
      const Factory = createAdapterFactory();
      const adapter = new Factory('AccessToken');
      const findSpy = vi.spyOn(adapter.delegate, 'find');
      const destroySpy = vi.spyOn(adapter.delegate, 'destroy').mockResolvedValue(undefined);

      await adapter.destroy('token-123');

      // For non-Session models, find() should NOT be called (no cascade)
      expect(findSpy).not.toHaveBeenCalled();
      expect(destroySpy).toHaveBeenCalledWith('token-123');
    });

    it('extracts grant IDs from multiple authorizations', async () => {
      const Factory = createAdapterFactory();
      const adapter = new Factory('Session');
      vi.spyOn(adapter.delegate, 'find').mockResolvedValue({
        authorizations: {
          'client-1': { grantId: 'grant-1', sid: 'sid-1' },
          'client-2': { grantId: 'grant-2', sid: 'sid-2' },
          'client-3': { sid: 'sid-3' }, // no grantId — should be skipped
        },
      });
      const destroySpy = vi.spyOn(adapter.delegate, 'destroy').mockResolvedValue(undefined);

      await adapter.destroy('session-multi');

      // Session should still be destroyed
      expect(destroySpy).toHaveBeenCalledWith('session-multi');
    });
  });
});
