import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis and logger — vi.mock factories are hoisted, use inline objects
vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getRedis } from '../../../src/lib/redis.js';
import {
  getCachedDefinitions,
  setCachedDefinitions,
  invalidateDefinitionsCache,
} from '../../../src/custom-claims/cache.js';
import type { CustomClaimDefinition } from '../../../src/custom-claims/types.js';

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

function createMockRedis() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  };
}

const now = new Date('2025-06-01T10:00:00Z');

const sampleDefinition: CustomClaimDefinition = {
  id: 'def-uuid-1',
  applicationId: 'app-uuid-1',
  claimName: 'department',
  claimType: 'string',
  description: 'User department',
  includeInIdToken: false,
  includeInAccessToken: true,
  includeInUserinfo: true,
  createdAt: now,
  updatedAt: now,
};

let mockRedis: ReturnType<typeof createMockRedis>;

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis = createMockRedis();
  vi.mocked(getRedis).mockReturnValue(mockRedis as never);
});

// ---------------------------------------------------------------------------
// getCachedDefinitions
// ---------------------------------------------------------------------------

describe('getCachedDefinitions', () => {
  it('should return definitions from cache on hit', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify([sampleDefinition]));

    const result = await getCachedDefinitions('app-uuid-1');

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].claimName).toBe('department');
    expect(mockRedis.get).toHaveBeenCalledWith('claims:defs:app-uuid-1');
  });

  it('should return null on cache miss', async () => {
    mockRedis.get.mockResolvedValue(null);

    const result = await getCachedDefinitions('app-uuid-1');
    expect(result).toBeNull();
  });

  it('should restore Date objects from ISO strings', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify([sampleDefinition]));

    const result = await getCachedDefinitions('app-uuid-1');

    expect(result![0].createdAt).toBeInstanceOf(Date);
    expect(result![0].updatedAt).toBeInstanceOf(Date);
  });

  it('should return null on Redis error (graceful degradation)', async () => {
    mockRedis.get.mockRejectedValue(new Error('Redis connection lost'));

    const result = await getCachedDefinitions('app-uuid-1');
    expect(result).toBeNull();
  });

  it('should return null on invalid JSON', async () => {
    mockRedis.get.mockResolvedValue('not-valid-json{{{');

    const result = await getCachedDefinitions('app-uuid-1');
    expect(result).toBeNull();
  });

  it('should handle empty array from cache', async () => {
    mockRedis.get.mockResolvedValue('[]');

    const result = await getCachedDefinitions('app-uuid-1');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setCachedDefinitions
// ---------------------------------------------------------------------------

describe('setCachedDefinitions', () => {
  it('should store definitions with correct key and TTL', async () => {
    mockRedis.set.mockResolvedValue('OK');

    await setCachedDefinitions('app-uuid-1', [sampleDefinition]);

    expect(mockRedis.set).toHaveBeenCalledWith(
      'claims:defs:app-uuid-1',
      expect.any(String),
      'EX',
      300,
    );
  });

  it('should serialize definitions as JSON', async () => {
    mockRedis.set.mockResolvedValue('OK');

    await setCachedDefinitions('app-uuid-1', [sampleDefinition]);

    const serialized = mockRedis.set.mock.calls[0][1];
    const parsed = JSON.parse(serialized);
    expect(parsed[0].claimName).toBe('department');
    expect(parsed[0].claimType).toBe('string');
  });

  it('should not throw on Redis error (graceful degradation)', async () => {
    mockRedis.set.mockRejectedValue(new Error('Redis connection lost'));

    // Should not throw
    await expect(
      setCachedDefinitions('app-uuid-1', [sampleDefinition]),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// invalidateDefinitionsCache
// ---------------------------------------------------------------------------

describe('invalidateDefinitionsCache', () => {
  it('should delete the correct cache key', async () => {
    mockRedis.del.mockResolvedValue(1);

    await invalidateDefinitionsCache('app-uuid-1');

    expect(mockRedis.del).toHaveBeenCalledWith('claims:defs:app-uuid-1');
  });

  it('should not throw on Redis error (graceful degradation)', async () => {
    mockRedis.del.mockRejectedValue(new Error('Redis connection lost'));

    await expect(invalidateDefinitionsCache('app-uuid-1')).resolves.toBeUndefined();
  });

  it('should handle missing key gracefully', async () => {
    mockRedis.del.mockResolvedValue(0);

    await expect(invalidateDefinitionsCache('app-uuid-1')).resolves.toBeUndefined();
  });
});
