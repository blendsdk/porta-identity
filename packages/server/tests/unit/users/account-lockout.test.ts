/**
 * Account lockout service tests.
 *
 * Tests the recordFailedLogin() and checkAutoUnlock() functions from
 * the user service. These implement the automatic account lockout
 * feature (Phase F of the production readiness plan).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock variables — available inside vi.mock factories
// ---------------------------------------------------------------------------
const { mockIncrementFailedLoginCount, mockResetFailedLoginCount, mockInvalidateUserCache } =
  vi.hoisted(() => ({
    mockIncrementFailedLoginCount: vi.fn(),
    mockResetFailedLoginCount: vi.fn(),
    mockInvalidateUserCache: vi.fn(),
  }));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../../../src/users/repository.js', () => ({
  insertUser: vi.fn(),
  findUserById: vi.fn(),
  findUserByEmail: vi.fn(),
  getPasswordHash: vi.fn(),
  updateUser: vi.fn(),
  listUsers: vi.fn(),
  emailExists: vi.fn(),
  updateLoginStats: vi.fn(),
  incrementFailedLoginCount: mockIncrementFailedLoginCount,
  resetFailedLoginCount: mockResetFailedLoginCount,
}));

vi.mock('../../../src/users/cache.js', () => ({
  getCachedUserById: vi.fn(),
  cacheUser: vi.fn(),
  invalidateUserCache: mockInvalidateUserCache,
}));

vi.mock('../../../src/users/password.js', () => ({
  validatePassword: vi.fn().mockReturnValue({ isValid: true }),
  hashPassword: vi.fn().mockResolvedValue('hashed'),
  verifyPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock('../../../src/lib/system-config.js', () => ({
  getSystemConfigNumber: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

import { recordFailedLogin, checkAutoUnlock } from '../../../src/users/service.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import { getSystemConfigNumber } from '../../../src/lib/system-config.js';
import type { User } from '../../../src/users/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a minimal active User for testing */
function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    email: 'test@example.com',
    emailVerified: true,
    hasPassword: true,
    passwordChangedAt: null,
    givenName: null,
    familyName: null,
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
    twoFactorEnabled: false,
    twoFactorMethod: null,
    status: 'active',
    lockedAt: null,
    lockedReason: null,
    lastLoginAt: null,
    loginCount: 0,
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// recordFailedLogin tests
// ---------------------------------------------------------------------------

describe('recordFailedLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSystemConfigNumber).mockResolvedValue(5); // max_failed_logins = 5
  });

  it('should increment counter and return locked:false when under threshold', async () => {
    mockIncrementFailedLoginCount.mockResolvedValue({
      status: 'active',
      failedLoginCount: 2,
    });

    const user = makeUser();
    const result = await recordFailedLogin(user);

    expect(result.locked).toBe(false);
    expect(result.failedCount).toBe(2);
    expect(mockIncrementFailedLoginCount).toHaveBeenCalledWith('user-1', 5);
    expect(mockInvalidateUserCache).toHaveBeenCalledWith('user-1');
  });

  it('should return locked:true when threshold is reached', async () => {
    mockIncrementFailedLoginCount.mockResolvedValue({
      status: 'locked',
      failedLoginCount: 5,
    });

    const user = makeUser({ status: 'active' });
    const result = await recordFailedLogin(user);

    expect(result.locked).toBe(true);
    expect(result.failedCount).toBe(5);
  });

  it('should write audit log when auto-locked', async () => {
    mockIncrementFailedLoginCount.mockResolvedValue({
      status: 'locked',
      failedLoginCount: 5,
    });

    const user = makeUser({ status: 'active' });
    await recordFailedLogin(user);

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'user.auto_locked',
        eventCategory: 'security',
        userId: 'user-1',
        organizationId: 'org-1',
      }),
    );
  });

  it('should NOT write auto_locked audit log when already locked', async () => {
    mockIncrementFailedLoginCount.mockResolvedValue({
      status: 'locked',
      failedLoginCount: 6,
    });

    // User was already locked — not transitioning from active
    const user = makeUser({ status: 'locked', lockedReason: 'auto_lockout' });
    const result = await recordFailedLogin(user);

    expect(result.locked).toBe(false); // not "just locked"
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('should use configurable max_failed_logins threshold', async () => {
    vi.mocked(getSystemConfigNumber).mockResolvedValue(10);
    mockIncrementFailedLoginCount.mockResolvedValue({
      status: 'active',
      failedLoginCount: 9,
    });

    const user = makeUser();
    await recordFailedLogin(user);

    expect(mockIncrementFailedLoginCount).toHaveBeenCalledWith('user-1', 10);
  });
});

// ---------------------------------------------------------------------------
// checkAutoUnlock tests
// ---------------------------------------------------------------------------

describe('checkAutoUnlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default lockout_duration_seconds = 900 (15 minutes)
    vi.mocked(getSystemConfigNumber).mockResolvedValue(900);
  });

  it('should return false for active users', async () => {
    const user = makeUser({ status: 'active' });
    const result = await checkAutoUnlock(user);

    expect(result).toBe(false);
    expect(mockResetFailedLoginCount).not.toHaveBeenCalled();
  });

  it('should return false for manually locked users', async () => {
    const user = makeUser({
      status: 'locked',
      lockedReason: 'admin_action',
      lockedAt: new Date(Date.now() - 999_999_000),
    });
    const result = await checkAutoUnlock(user);

    expect(result).toBe(false);
    expect(mockResetFailedLoginCount).not.toHaveBeenCalled();
  });

  it('should return false when cooldown has NOT elapsed', async () => {
    // Locked 5 minutes ago, cooldown is 15 minutes
    const user = makeUser({
      status: 'locked',
      lockedReason: 'auto_lockout',
      lockedAt: new Date(Date.now() - 5 * 60 * 1000),
    });
    const result = await checkAutoUnlock(user);

    expect(result).toBe(false);
    expect(mockResetFailedLoginCount).not.toHaveBeenCalled();
  });

  it('should return true and reset counter when cooldown has elapsed', async () => {
    // Locked 20 minutes ago, cooldown is 15 minutes
    const user = makeUser({
      status: 'locked',
      lockedReason: 'auto_lockout',
      lockedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    const result = await checkAutoUnlock(user);

    expect(result).toBe(true);
    expect(mockResetFailedLoginCount).toHaveBeenCalledWith('user-1');
    expect(mockInvalidateUserCache).toHaveBeenCalledWith('user-1');
  });

  it('should write audit log when auto-unlocked', async () => {
    const user = makeUser({
      status: 'locked',
      lockedReason: 'auto_lockout',
      lockedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await checkAutoUnlock(user);

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'user.auto_unlocked',
        eventCategory: 'security',
        userId: 'user-1',
      }),
    );
  });

  it('should use configurable lockout_duration_seconds', async () => {
    // Set cooldown to 60 seconds
    vi.mocked(getSystemConfigNumber).mockResolvedValue(60);

    // Locked 90 seconds ago — should auto-unlock
    const user = makeUser({
      status: 'locked',
      lockedReason: 'auto_lockout',
      lockedAt: new Date(Date.now() - 90 * 1000),
    });
    const result = await checkAutoUnlock(user);

    expect(result).toBe(true);
    expect(getSystemConfigNumber).toHaveBeenCalledWith('lockout_duration_seconds', 900);
  });

  it('should return false when lockedAt is null (edge case)', async () => {
    const user = makeUser({
      status: 'locked',
      lockedReason: 'auto_lockout',
      lockedAt: null, // shouldn't happen, but handle gracefully
    });
    const result = await checkAutoUnlock(user);

    expect(result).toBe(false);
  });
});
