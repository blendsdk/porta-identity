import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getRedis } from '../../../src/lib/redis.js';
import { logger } from '../../../src/lib/logger.js';
import {
  getCachedClientByClientId,
  getCachedClientById,
  cacheClient,
  invalidateClientCache,
} from '../../../src/clients/cache.js';
import type { Client } from '../../../src/clients/types.js';

/** Create a mock Redis client with get/set/del methods */
function createMockRedis() {
  const redis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  };
  (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);
  return redis;
}

/** Standard test client object (camelCase) */
function createTestClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-uuid-1',
    organizationId: 'org-uuid-1',
    applicationId: 'app-uuid-1',
    clientId: 'oidc-client-id-abc123',
    clientName: 'My Web App',
    clientType: 'confidential',
    applicationType: 'web',
    redirectUris: ['https://example.com/callback'],
    postLogoutRedirectUris: ['https://example.com/logout'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    scope: 'openid profile email',
    tokenEndpointAuthMethod: 'client_secret_basic',
    allowedOrigins: ['https://example.com'],
    requirePkce: true,
    // null = inherit from org default (the common case). Tests that need a
    // non-null override pass an explicit array via overrides.
    loginMethods: null,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-15T12:00:00Z'),
    ...overrides,
  };
}


describe('client cache', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // getCachedClientByClientId
  // -------------------------------------------------------------------------

  describe('getCachedClientByClientId', () => {
    it('should return deserialized client on cache hit', async () => {
      const redis = createMockRedis();
      const client = createTestClient();
      redis.get.mockResolvedValue(JSON.stringify(client));

      const result = await getCachedClientByClientId('oidc-client-id-abc123');

      expect(redis.get).toHaveBeenCalledWith('client:cid:oidc-client-id-abc123');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('client-uuid-1');
      expect(result!.clientId).toBe('oidc-client-id-abc123');
      expect(result!.clientName).toBe('My Web App');
    });

    it('should return null on cache miss', async () => {
      createMockRedis(); // get returns null by default

      const result = await getCachedClientByClientId('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null and log warning on invalid JSON', async () => {
      const redis = createMockRedis();
      redis.get.mockResolvedValue('not-valid-json{{{');

      const result = await getCachedClientByClientId('bad-data');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getCachedClientById
  // -------------------------------------------------------------------------

  describe('getCachedClientById', () => {
    it('should return deserialized client on cache hit', async () => {
      const redis = createMockRedis();
      const client = createTestClient();
      redis.get.mockResolvedValue(JSON.stringify(client));

      const result = await getCachedClientById('client-uuid-1');

      expect(redis.get).toHaveBeenCalledWith('client:id:client-uuid-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('client-uuid-1');
    });

    it('should return null on cache miss', async () => {
      createMockRedis();

      const result = await getCachedClientById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // cacheClient
  // -------------------------------------------------------------------------

  describe('cacheClient', () => {
    it('should store under both client_id and internal ID keys', async () => {
      const redis = createMockRedis();
      const client = createTestClient();

      await cacheClient(client);

      expect(redis.set).toHaveBeenCalledTimes(2);
      // First call: client_id key
      expect(redis.set.mock.calls[0][0]).toBe('client:cid:oidc-client-id-abc123');
      // Second call: ID key
      expect(redis.set.mock.calls[1][0]).toBe('client:id:client-uuid-1');
    });

    it('should set correct TTL (300 seconds)', async () => {
      const redis = createMockRedis();
      const client = createTestClient();

      await cacheClient(client);

      // Both calls should use EX 300
      expect(redis.set.mock.calls[0][2]).toBe('EX');
      expect(redis.set.mock.calls[0][3]).toBe(300);
      expect(redis.set.mock.calls[1][2]).toBe('EX');
      expect(redis.set.mock.calls[1][3]).toBe(300);
    });

    it('should serialize dates as ISO strings and deserialize back correctly', async () => {
      const redis = createMockRedis();
      const client = createTestClient({
        createdAt: new Date('2026-03-15T10:30:00Z'),
        updatedAt: new Date('2026-04-01T14:45:00Z'),
      });

      await cacheClient(client);

      // Capture the serialized JSON
      const serialized = redis.set.mock.calls[0][1] as string;
      const parsed = JSON.parse(serialized);

      // Dates should be ISO strings in the JSON
      expect(parsed.createdAt).toBe('2026-03-15T10:30:00.000Z');
      expect(parsed.updatedAt).toBe('2026-04-01T14:45:00.000Z');

      // Now simulate reading it back from cache
      redis.get.mockResolvedValue(serialized);
      const result = await getCachedClientByClientId(client.clientId);

      // Dates should be restored as Date objects
      expect(result!.createdAt).toBeInstanceOf(Date);
      expect(result!.updatedAt).toBeInstanceOf(Date);
      expect(result!.createdAt.toISOString()).toBe('2026-03-15T10:30:00.000Z');
    });

    it('should preserve array fields through serialization round-trip', async () => {
      const redis = createMockRedis();
      const client = createTestClient({
        redirectUris: ['https://a.com/cb', 'https://b.com/cb'],
        grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
        allowedOrigins: ['https://a.com', 'https://b.com'],
      });

      await cacheClient(client);

      // Read it back
      const serialized = redis.set.mock.calls[0][1] as string;
      redis.get.mockResolvedValue(serialized);
      const result = await getCachedClientByClientId(client.clientId);

      expect(result!.redirectUris).toEqual(['https://a.com/cb', 'https://b.com/cb']);
      expect(result!.grantTypes).toEqual(['authorization_code', 'refresh_token', 'client_credentials']);
      expect(result!.allowedOrigins).toEqual(['https://a.com', 'https://b.com']);
    });

    // -----------------------------------------------------------------------
    // login_methods roundtrip
    // -----------------------------------------------------------------------
    // JSON.stringify preserves `null` as the literal `null` and arrays as
    // arrays. We assert both states roundtrip without data loss or coercion
    // so downstream readers (resolveLoginMethods) behave identically against
    // cache hits vs fresh DB reads.

    it('should roundtrip null loginMethods (inherit sentinel)', async () => {
      const redis = createMockRedis();
      const client = createTestClient({ loginMethods: null });

      await cacheClient(client);

      const serialized = redis.set.mock.calls[0][1] as string;
      redis.get.mockResolvedValue(serialized);
      const result = await getCachedClientByClientId(client.clientId);

      expect(result!.loginMethods).toBeNull();
    });

    it('should roundtrip non-null loginMethods array', async () => {
      const redis = createMockRedis();
      const client = createTestClient({ loginMethods: ['password', 'magic_link'] });

      await cacheClient(client);

      const serialized = redis.set.mock.calls[0][1] as string;
      redis.get.mockResolvedValue(serialized);
      const result = await getCachedClientByClientId(client.clientId);

      expect(result!.loginMethods).toEqual(['password', 'magic_link']);
    });
  });


  // -------------------------------------------------------------------------
  // invalidateClientCache
  // -------------------------------------------------------------------------

  describe('invalidateClientCache', () => {
    it('should delete both client_id and ID keys', async () => {
      const redis = createMockRedis();

      await invalidateClientCache('oidc-client-id-abc123', 'client-uuid-1');

      expect(redis.del).toHaveBeenCalledWith(
        'client:cid:oidc-client-id-abc123',
        'client:id:client-uuid-1',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Graceful degradation on Redis errors
  // -------------------------------------------------------------------------

  describe('graceful degradation', () => {
    it('should return null on Redis get error for client_id lookup', async () => {
      const redis = createMockRedis();
      redis.get.mockRejectedValue(new Error('Connection refused'));

      const result = await getCachedClientByClientId('any-client-id');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should return null on Redis get error for ID lookup', async () => {
      const redis = createMockRedis();
      redis.get.mockRejectedValue(new Error('Connection refused'));

      const result = await getCachedClientById('any-id');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should not throw on Redis set error', async () => {
      const redis = createMockRedis();
      redis.set.mockRejectedValue(new Error('Connection refused'));
      const client = createTestClient();

      // Should not throw
      await expect(cacheClient(client)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should not throw on Redis del error', async () => {
      const redis = createMockRedis();
      redis.del.mockRejectedValue(new Error('Connection refused'));

      // Should not throw
      await expect(
        invalidateClientCache('cid', 'id'),
      ).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
