import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies
vi.mock('../../../src/users/repository.js', () => ({
  insertUser: vi.fn(),
  findUserById: vi.fn(),
  findUserByEmail: vi.fn(),
  getPasswordHash: vi.fn(),
  updateUser: vi.fn(),
  listUsers: vi.fn(),
  emailExists: vi.fn(),
  updateLoginStats: vi.fn(),
}));

vi.mock('../../../src/users/cache.js', () => ({
  getCachedUserById: vi.fn(),
  cacheUser: vi.fn(),
  invalidateUserCache: vi.fn(),
}));

vi.mock('../../../src/users/password.js', () => ({
  validatePassword: vi.fn().mockReturnValue({ isValid: true }),
  hashPassword: vi.fn().mockResolvedValue('$argon2id$hashed'),
  verifyPassword: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import * as repo from '../../../src/users/repository.js';
import * as cache from '../../../src/users/cache.js';
import * as pw from '../../../src/users/password.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import {
  createUser,
  getUserById,
  getUserByEmail,
  updateUser,
  listUsersByOrganization,
  deactivateUser,
  reactivateUser,
  suspendUser,
  unsuspendUser,
  lockUser,
  unlockUser,
  setUserPassword,
  verifyUserPassword,
  clearUserPassword,
  markEmailVerified,
  recordLogin,
  findUserForOidc,
} from '../../../src/users/service.js';
import { UserNotFoundError, UserValidationError } from '../../../src/users/errors.js';
import type { User } from '../../../src/users/types.js';

/** Helper to create a test user */
function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid-1',
    organizationId: 'org-uuid-1',
    email: 'john@example.com',
    emailVerified: false,
    hasPassword: true,
    passwordChangedAt: null,
    givenName: 'John',
    familyName: 'Doe',
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
    status: 'active',
    lockedAt: null,
    lockedReason: null,
    lastLoginAt: null,
    loginCount: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('user service', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // createUser
  // -------------------------------------------------------------------------

  describe('createUser', () => {
    it('should create user with email only', async () => {
      const user = createTestUser({ hasPassword: false });
      (repo.emailExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (repo.insertUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      const result = await createUser({ organizationId: 'org-uuid-1', email: 'john@example.com' });

      expect(result.email).toBe('john@example.com');
      expect(repo.insertUser).toHaveBeenCalledTimes(1);
      expect(cache.cacheUser).toHaveBeenCalledWith(user);
    });

    it('should create user with password (hashed)', async () => {
      const user = createTestUser();
      (repo.emailExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (repo.insertUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await createUser({ organizationId: 'org-uuid-1', email: 'john@example.com', password: 'secure123' });

      expect(pw.validatePassword).toHaveBeenCalledWith('secure123');
      expect(pw.hashPassword).toHaveBeenCalledWith('secure123');
      const insertCall = (repo.insertUser as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(insertCall.passwordHash).toBe('$argon2id$hashed');
    });

    it('should reject duplicate email in same org', async () => {
      (repo.emailExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await expect(
        createUser({ organizationId: 'org-uuid-1', email: 'john@example.com' }),
      ).rejects.toThrow(UserValidationError);
    });

    it('should reject invalid password length', async () => {
      (repo.emailExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (pw.validatePassword as ReturnType<typeof vi.fn>).mockReturnValue({
        isValid: false,
        error: 'Password must be at least 8 characters',
      });

      await expect(
        createUser({ organizationId: 'org-uuid-1', email: 'john@example.com', password: 'short' }),
      ).rejects.toThrow(UserValidationError);
    });

    it('should write audit log', async () => {
      const user = createTestUser();
      (repo.emailExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (repo.insertUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await createUser({ organizationId: 'org-uuid-1', email: 'john@example.com' }, 'actor-1');

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.created', actorId: 'actor-1' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getUserById
  // -------------------------------------------------------------------------

  describe('getUserById', () => {
    it('should return cached user on cache hit', async () => {
      const user = createTestUser();
      (cache.getCachedUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      const result = await getUserById('user-uuid-1');

      expect(result).toBe(user);
      expect(repo.findUserById).not.toHaveBeenCalled();
    });

    it('should return DB user on cache miss and cache it', async () => {
      const user = createTestUser();
      (cache.getCachedUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      const result = await getUserById('user-uuid-1');

      expect(result).toBe(user);
      expect(cache.cacheUser).toHaveBeenCalledWith(user);
    });

    it('should return null when not found', async () => {
      (cache.getCachedUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getUserById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getUserByEmail
  // -------------------------------------------------------------------------

  describe('getUserByEmail', () => {
    it('should return user from DB', async () => {
      const user = createTestUser();
      (repo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      const result = await getUserByEmail('org-uuid-1', 'john@example.com');

      expect(result).toBe(user);
    });
  });

  // -------------------------------------------------------------------------
  // updateUser
  // -------------------------------------------------------------------------

  describe('updateUser', () => {
    it('should update fields and invalidate/re-cache', async () => {
      const user = createTestUser({ givenName: 'Jane' });
      (repo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      const result = await updateUser('user-uuid-1', { givenName: 'Jane' });

      expect(result.givenName).toBe('Jane');
      expect(cache.invalidateUserCache).toHaveBeenCalledWith('user-uuid-1');
      expect(cache.cacheUser).toHaveBeenCalledWith(user);
    });

    it('should throw UserNotFoundError when not found', async () => {
      (repo.updateUser as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('User not found'));

      await expect(updateUser('nonexistent', { givenName: 'Test' })).rejects.toThrow(UserNotFoundError);
    });

    it('should write audit log', async () => {
      const user = createTestUser();
      (repo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await updateUser('user-uuid-1', { givenName: 'Jane' }, 'actor-1');

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.updated', actorId: 'actor-1' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // listUsersByOrganization
  // -------------------------------------------------------------------------

  describe('listUsersByOrganization', () => {
    it('should delegate to repository', async () => {
      const result = { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      (repo.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(result);

      const res = await listUsersByOrganization({ organizationId: 'org-uuid-1', page: 1, pageSize: 20 });

      expect(res).toBe(result);
      expect(repo.listUsers).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Status lifecycle
  // -------------------------------------------------------------------------

  describe('deactivateUser', () => {
    it('should deactivate active user', async () => {
      const user = createTestUser({ status: 'active' });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      (repo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await deactivateUser('user-uuid-1');

      expect(repo.updateUser).toHaveBeenCalledWith('user-uuid-1', { status: 'inactive' });
      expect(cache.invalidateUserCache).toHaveBeenCalled();
    });

    it('should reject already inactive user', async () => {
      const user = createTestUser({ status: 'inactive' });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await expect(deactivateUser('user-uuid-1')).rejects.toThrow(UserValidationError);
    });
  });

  describe('reactivateUser', () => {
    it('should reactivate inactive user', async () => {
      const user = createTestUser({ status: 'inactive' });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      (repo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await reactivateUser('user-uuid-1');

      expect(repo.updateUser).toHaveBeenCalledWith('user-uuid-1', { status: 'active' });
    });

    it('should reject non-inactive user', async () => {
      const user = createTestUser({ status: 'active' });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await expect(reactivateUser('user-uuid-1')).rejects.toThrow(UserValidationError);
    });
  });

  describe('suspendUser', () => {
    it('should suspend active user', async () => {
      const user = createTestUser({ status: 'active' });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      (repo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await suspendUser('user-uuid-1', 'policy violation');

      expect(repo.updateUser).toHaveBeenCalledWith('user-uuid-1', { status: 'suspended' });
    });

    it('should reject non-active user', async () => {
      const user = createTestUser({ status: 'suspended' });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await expect(suspendUser('user-uuid-1')).rejects.toThrow(UserValidationError);
    });
  });

  describe('unsuspendUser', () => {
    it('should unsuspend suspended user', async () => {
      const user = createTestUser({ status: 'suspended' });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      (repo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await unsuspendUser('user-uuid-1');

      expect(repo.updateUser).toHaveBeenCalledWith('user-uuid-1', { status: 'active' });
    });

    it('should reject non-suspended user', async () => {
      const user = createTestUser({ status: 'active' });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await expect(unsuspendUser('user-uuid-1')).rejects.toThrow(UserValidationError);
    });
  });

  describe('lockUser', () => {
    it('should lock active user with reason', async () => {
      const user = createTestUser({ status: 'active' });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      (repo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await lockUser('user-uuid-1', 'too many failed attempts');

      expect(repo.updateUser).toHaveBeenCalledWith('user-uuid-1', expect.objectContaining({
        status: 'locked',
        lockedReason: 'too many failed attempts',
      }));
    });

    it('should reject non-active user', async () => {
      const user = createTestUser({ status: 'locked' });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await expect(lockUser('user-uuid-1', 'reason')).rejects.toThrow(UserValidationError);
    });
  });

  describe('unlockUser', () => {
    it('should unlock locked user and clear lock fields', async () => {
      const user = createTestUser({ status: 'locked' });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      (repo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await unlockUser('user-uuid-1');

      expect(repo.updateUser).toHaveBeenCalledWith('user-uuid-1', {
        status: 'active',
        lockedAt: null,
        lockedReason: null,
      });
    });

    it('should reject non-locked user', async () => {
      const user = createTestUser({ status: 'active' });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await expect(unlockUser('user-uuid-1')).rejects.toThrow(UserValidationError);
    });
  });

  // -------------------------------------------------------------------------
  // Password management
  // -------------------------------------------------------------------------

  describe('setUserPassword', () => {
    it('should hash and store password', async () => {
      (pw.validatePassword as ReturnType<typeof vi.fn>).mockReturnValue({ isValid: true });
      (repo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(createTestUser());

      await setUserPassword('user-uuid-1', 'new_secure_password');

      expect(pw.validatePassword).toHaveBeenCalledWith('new_secure_password');
      expect(pw.hashPassword).toHaveBeenCalledWith('new_secure_password');
      expect(repo.updateUser).toHaveBeenCalledWith('user-uuid-1', expect.objectContaining({
        passwordHash: '$argon2id$hashed',
      }));
    });

    it('should reject invalid password length', async () => {
      (pw.validatePassword as ReturnType<typeof vi.fn>).mockReturnValue({
        isValid: false,
        error: 'Password too short',
      });

      await expect(setUserPassword('user-uuid-1', 'short')).rejects.toThrow(UserValidationError);
    });
  });

  describe('verifyUserPassword', () => {
    it('should return true for correct password', async () => {
      (repo.getPasswordHash as ReturnType<typeof vi.fn>).mockResolvedValue('$argon2id$hash');
      (pw.verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await verifyUserPassword('user-uuid-1', 'correct');

      expect(result).toBe(true);
    });

    it('should return false for wrong password', async () => {
      (repo.getPasswordHash as ReturnType<typeof vi.fn>).mockResolvedValue('$argon2id$hash');
      (pw.verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const result = await verifyUserPassword('user-uuid-1', 'wrong');

      expect(result).toBe(false);
    });

    it('should return false for passwordless user', async () => {
      (repo.getPasswordHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await verifyUserPassword('user-uuid-1', 'anything');

      expect(result).toBe(false);
      expect(pw.verifyPassword).not.toHaveBeenCalled();
    });
  });

  describe('clearUserPassword', () => {
    it('should set password_hash to null', async () => {
      (repo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(createTestUser());

      await clearUserPassword('user-uuid-1');

      expect(repo.updateUser).toHaveBeenCalledWith('user-uuid-1', {
        passwordHash: null,
        passwordChangedAt: null,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Email verification
  // -------------------------------------------------------------------------

  describe('markEmailVerified', () => {
    it('should set email_verified to true and write audit log', async () => {
      (repo.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(createTestUser());

      await markEmailVerified('user-uuid-1', 'actor-1');

      expect(repo.updateUser).toHaveBeenCalledWith('user-uuid-1', { emailVerified: true });
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.email.verified' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Login tracking
  // -------------------------------------------------------------------------

  describe('recordLogin', () => {
    it('should call updateLoginStats and invalidate cache', async () => {
      await recordLogin('user-uuid-1');

      expect(repo.updateLoginStats).toHaveBeenCalledWith('user-uuid-1');
      expect(cache.invalidateUserCache).toHaveBeenCalledWith('user-uuid-1');
    });
  });

  // -------------------------------------------------------------------------
  // OIDC integration
  // -------------------------------------------------------------------------

  describe('findUserForOidc', () => {
    it('should return active user', async () => {
      const user = createTestUser({ status: 'active' });
      (cache.getCachedUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      const result = await findUserForOidc('user-uuid-1');

      expect(result).toBe(user);
    });

    it('should return null for non-active user', async () => {
      const user = createTestUser({ status: 'suspended' });
      (cache.getCachedUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      const result = await findUserForOidc('user-uuid-1');

      expect(result).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      (cache.getCachedUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await findUserForOidc('nonexistent');

      expect(result).toBeNull();
    });
  });
});
