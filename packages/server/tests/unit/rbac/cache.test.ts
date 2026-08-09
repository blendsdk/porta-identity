/**
 * Unit tests for RBAC cache.
 *
 * Tests Redis cache operations for roles, user role slugs,
 * and user permission slugs. Redis is mocked — these are pure
 * unit tests verifying correct key construction, TTL, serialization,
 * and graceful degradation on errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis and logger before importing the cache module
vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

import { getRedis } from '../../../src/lib/redis.js';
import { logger } from '../../../src/lib/logger.js';
import {
  getCachedRole,
  setCachedRole,
  invalidateRoleCache,
  getCachedUserRoles,
  setCachedUserRoles,
  getCachedUserPermissions,
  setCachedUserPermissions,
  invalidateUserRbacCache,
  invalidateAllUserRbacCaches,
} from '../../../src/rbac/cache.js';
import type { Role } from '../../../src/rbac/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a test Role object */
function createTestRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-uuid-1',
    applicationId: 'app-uuid-1',
    name: 'CRM Editor',
    slug: 'crm-editor',
    description: 'Can edit CRM records',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Create a mock Redis client with standard operations */
function mockRedis() {
  const mock = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    scan: vi.fn().mockResolvedValue(['0', []]),
  };
  (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(mock);
  return mock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Role cache
// ===========================================================================

describe('getCachedRole', () => {
  it('should return null on cache miss', async () => {
    const redis = mockRedis();
    redis.get.mockResolvedValue(null);

    const result = await getCachedRole('role-1');

    expect(result).toBeNull();
    expect(redis.get).toHaveBeenCalledWith('rbac:role:role-1');
  });

  it('should return deserialized role on cache hit', async () => {
    const redis = mockRedis();
    const role = createTestRole();
    redis.get.mockResolvedValue(JSON.stringify(role));

    const result = await getCachedRole('role-uuid-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('role-uuid-1');
    expect(result!.name).toBe('CRM Editor');
    // Verify Date objects are restored
    expect(result!.createdAt).toBeInstanceOf(Date);
    expect(result!.updatedAt).toBeInstanceOf(Date);
  });

  it('should return null and log warning on Redis error (graceful degradation)', async () => {
    const redis = mockRedis();
    redis.get.mockRejectedValue(new Error('Redis connection lost'));

    const result = await getCachedRole('role-1');

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), id: 'role-1' }),
      'Failed to read role from cache',
    );
  });

  it('should return null on invalid JSON', async () => {
    const redis = mockRedis();
    redis.get.mockResolvedValue('not-valid-json{{{');

    const result = await getCachedRole('role-1');

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('Failed to parse cached role JSON');
  });
});

describe('setCachedRole', () => {
  it('should store role as JSON with 5-minute TTL', async () => {
    const redis = mockRedis();
    const role = createTestRole();

    await setCachedRole(role);

    expect(redis.set).toHaveBeenCalledWith(
      'rbac:role:role-uuid-1',
      JSON.stringify(role),
      'EX',
      300,
    );
  });

  it('should log warning but not throw on Redis error', async () => {
    const redis = mockRedis();
    redis.set.mockRejectedValue(new Error('Redis full'));

    // Should not throw
    await setCachedRole(createTestRole());

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Failed to cache role',
    );
  });
});

describe('invalidateRoleCache', () => {
  it('should delete the role cache key', async () => {
    const redis = mockRedis();

    await invalidateRoleCache('role-1');

    expect(redis.del).toHaveBeenCalledWith('rbac:role:role-1');
  });

  it('should log warning but not throw on Redis error', async () => {
    const redis = mockRedis();
    redis.del.mockRejectedValue(new Error('Redis error'));

    await invalidateRoleCache('role-1');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Failed to invalidate role cache',
    );
  });
});

// ===========================================================================
// User roles cache
// ===========================================================================

describe('getCachedUserRoles', () => {
  it('should return null on cache miss', async () => {
    const redis = mockRedis();
    redis.get.mockResolvedValue(null);

    const result = await getCachedUserRoles('user-1');

    expect(result).toBeNull();
    expect(redis.get).toHaveBeenCalledWith('rbac:user-roles:user-1');
  });

  it('should return parsed slug array on cache hit', async () => {
    const redis = mockRedis();
    redis.get.mockResolvedValue(JSON.stringify(['admin', 'editor']));

    const result = await getCachedUserRoles('user-1');

    expect(result).toEqual(['admin', 'editor']);
  });

  it('should return null on Redis error (graceful degradation)', async () => {
    const redis = mockRedis();
    redis.get.mockRejectedValue(new Error('Redis down'));

    const result = await getCachedUserRoles('user-1');

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('setCachedUserRoles', () => {
  it('should store role slugs as JSON with TTL', async () => {
    const redis = mockRedis();

    await setCachedUserRoles('user-1', ['admin', 'editor']);

    expect(redis.set).toHaveBeenCalledWith(
      'rbac:user-roles:user-1',
      JSON.stringify(['admin', 'editor']),
      'EX',
      300,
    );
  });

  it('should store empty array for users with no roles', async () => {
    const redis = mockRedis();

    await setCachedUserRoles('user-1', []);

    expect(redis.set).toHaveBeenCalledWith(
      'rbac:user-roles:user-1',
      '[]',
      'EX',
      300,
    );
  });

  it('should log warning but not throw on Redis error', async () => {
    const redis = mockRedis();
    redis.set.mockRejectedValue(new Error('Redis full'));

    await setCachedUserRoles('user-1', ['admin']);

    expect(logger.warn).toHaveBeenCalled();
  });
});

// ===========================================================================
// User permissions cache
// ===========================================================================

describe('getCachedUserPermissions', () => {
  it('should return null on cache miss', async () => {
    const redis = mockRedis();
    redis.get.mockResolvedValue(null);

    const result = await getCachedUserPermissions('user-1');

    expect(result).toBeNull();
    expect(redis.get).toHaveBeenCalledWith('rbac:user-perms:user-1');
  });

  it('should return parsed slug array on cache hit', async () => {
    const redis = mockRedis();
    redis.get.mockResolvedValue(JSON.stringify(['crm:contacts:read', 'crm:deals:write']));

    const result = await getCachedUserPermissions('user-1');

    expect(result).toEqual(['crm:contacts:read', 'crm:deals:write']);
  });

  it('should return null on Redis error (graceful degradation)', async () => {
    const redis = mockRedis();
    redis.get.mockRejectedValue(new Error('Redis down'));

    const result = await getCachedUserPermissions('user-1');

    expect(result).toBeNull();
  });
});

describe('setCachedUserPermissions', () => {
  it('should store permission slugs as JSON with TTL', async () => {
    const redis = mockRedis();

    await setCachedUserPermissions('user-1', ['crm:contacts:read']);

    expect(redis.set).toHaveBeenCalledWith(
      'rbac:user-perms:user-1',
      JSON.stringify(['crm:contacts:read']),
      'EX',
      300,
    );
  });

  it('should log warning but not throw on Redis error', async () => {
    const redis = mockRedis();
    redis.set.mockRejectedValue(new Error('Redis full'));

    await setCachedUserPermissions('user-1', ['crm:contacts:read']);

    expect(logger.warn).toHaveBeenCalled();
  });
});

// ===========================================================================
// Invalidation
// ===========================================================================

describe('invalidateUserRbacCache', () => {
  it('should delete both user roles and permissions cache keys', async () => {
    const redis = mockRedis();

    await invalidateUserRbacCache('user-1');

    expect(redis.del).toHaveBeenCalledWith(
      'rbac:user-roles:user-1',
      'rbac:user-perms:user-1',
    );
  });

  it('should log warning but not throw on Redis error', async () => {
    const redis = mockRedis();
    redis.del.mockRejectedValue(new Error('Redis error'));

    await invalidateUserRbacCache('user-1');

    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('invalidateAllUserRbacCaches', () => {
  it('should use SCAN to find and delete user RBAC keys', async () => {
    const redis = mockRedis();
    // First SCAN returns some keys, second returns empty (cursor 0)
    redis.scan
      .mockResolvedValueOnce(['42', ['rbac:user-roles:user-1', 'rbac:user-roles:user-2']])
      .mockResolvedValueOnce(['0', []])
      .mockResolvedValueOnce(['0', ['rbac:user-perms:user-1']])
      .mockResolvedValueOnce(['0', []]);

    // Need to handle cursor iteration — first pattern scans twice, second once
    // Actually the mock will be called for each pattern's do-while loop
    // Pattern 1 (user-roles): scan returns cursor 42 + keys, then cursor 0 + no keys
    // Pattern 2 (user-perms): scan returns cursor 0 + keys
    // But since pattern 2 starts with cursor 0, it does once and checks cursor !== '0'
    // Wait, the initial cursor is '0', and it runs do-while cursor !== '0'
    // So it always runs at least once, and stops when cursor returns '0'

    await invalidateAllUserRbacCaches();

    // Should scan for both patterns
    expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'rbac:user-roles:*', 'COUNT', 100);
    // Should delete found keys
    expect(redis.del).toHaveBeenCalledWith('rbac:user-roles:user-1', 'rbac:user-roles:user-2');
  });

  it('should handle empty scan results gracefully', async () => {
    const redis = mockRedis();
    // Both patterns return no keys
    redis.scan.mockResolvedValue(['0', []]);

    await invalidateAllUserRbacCaches();

    // del should not be called when no keys found
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('should log warning but not throw on Redis error', async () => {
    const redis = mockRedis();
    redis.scan.mockRejectedValue(new Error('Redis error'));

    await invalidateAllUserRbacCaches();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Failed to invalidate all user RBAC caches',
    );
  });
});
