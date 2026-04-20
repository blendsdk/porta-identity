import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bootstrap
vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withBootstrap: vi.fn().mockImplementation(async (_argv: unknown, fn: () => Promise<unknown>) => fn()),
  withHttpClient: vi.fn().mockImplementation(async (_argv: unknown, fn: (client: unknown) => Promise<unknown>) => fn({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() })),
}));

// Mock error handler — run fn directly
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandling: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
}));

// Mock output helpers
vi.mock('../../../../src/cli/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  outputResult: vi.fn(),
  truncateId: vi.fn().mockImplementation((s: string) => s.length > 8 ? s.substring(0, 8) + '...' : s),
  formatDate: vi.fn().mockImplementation((d: string | Date | null) => d ? String(d).split('T')[0] : '—'),
  printTotal: vi.fn(),
}));

// Mock prompt
vi.mock('../../../../src/cli/prompt.js', () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

// Mock readline for set-password hidden input
vi.mock('readline', () => ({
  createInterface: vi.fn().mockReturnValue({
    question: vi.fn().mockImplementation((_msg: string, cb: (answer: string) => void) => cb('SecureP@ss1')),
    close: vi.fn(),
  }),
}));

// Mock user service
vi.mock('../../../../src/users/index.js', () => ({
  createUser: vi.fn(),
  getUserById: vi.fn(),
  getUserByEmail: vi.fn(),
  updateUser: vi.fn(),
  listUsersByOrganization: vi.fn(),
  deactivateUser: vi.fn(),
  reactivateUser: vi.fn(),
  suspendUser: vi.fn(),
  unsuspendUser: vi.fn(),
  lockUser: vi.fn(),
  unlockUser: vi.fn(),
  setUserPassword: vi.fn(),
  markEmailVerified: vi.fn(),
  UserNotFoundError: class UserNotFoundError extends Error {
    constructor(id: string) { super(`User not found: ${id}`); this.name = 'UserNotFoundError'; }
  },
}));

// Mock RBAC service (for user roles)
vi.mock('../../../../src/rbac/index.js', () => ({
  assignRolesToUser: vi.fn(),
  removeRolesFromUser: vi.fn(),
  getUserRoles: vi.fn(),
}));

// Mock custom claims service (for user claims)
vi.mock('../../../../src/custom-claims/index.js', () => ({
  setValue: vi.fn(),
  getValuesForUser: vi.fn(),
  deleteValue: vi.fn(),
}));

// Mock two-factor service (for user 2fa commands)
vi.mock('../../../../src/two-factor/service.js', () => ({
  getTwoFactorStatus: vi.fn().mockResolvedValue({
    enabled: false,
    method: null,
    totpConfigured: false,
    recoveryCodesRemaining: 0,
  }),
  disableTwoFactor: vi.fn().mockResolvedValue(undefined),
}));

// Mock users repository (for user 2fa status lookup)
vi.mock('../../../../src/users/repository.js', () => ({
  findUserById: vi.fn().mockResolvedValue({
    id: 'user-uuid-1',
    email: 'test@example.com',
    givenName: 'Test',
    familyName: 'User',
    status: 'active',
  }),
}));

import { userCommand } from '../../../../src/cli/commands/user.js';
import { success, warn, outputResult, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import {
  createUser,
  getUserById,
  getUserByEmail,
  updateUser,
  listUsersByOrganization,
  deactivateUser,
  reactivateUser,
  suspendUser,
  lockUser,
  unlockUser,
  setUserPassword,
  markEmailVerified,
} from '../../../../src/users/index.js';
import { assignRolesToUser, removeRolesFromUser, getUserRoles } from '../../../../src/rbac/index.js';
import { setValue, getValuesForUser, deleteValue } from '../../../../src/custom-claims/index.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

/** Fake user for test data */
const fakeUser = {
  id: 'a1a2b3c4-d5e6-7890-abcd-ef1234567890',
  organizationId: 'org-1',
  email: 'john@example.com',
  emailVerified: true,
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
  status: 'active' as const,
  lockedAt: null,
  lockedReason: null,
  lastLoginAt: null,
  loginCount: 0,
  createdAt: new Date('2026-04-08'),
  updatedAt: new Date('2026-04-09'),
};

function createArgv(overrides: Partial<GlobalOptions & Record<string, unknown>> = {}): GlobalOptions & Record<string, unknown> {
  return { json: false, verbose: false, force: false, 'dry-run': false, ...overrides };
}

/**
 * Extract subcommand handlers from the user command builder.
 * Handles both simple commands and nested command groups.
 */
function getHandlers() {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
  const nestedGroups: Record<string, Record<string, (args: Record<string, unknown>) => Promise<void>>> = {};

  const fakeYargs = {
    command: (cmd: string | object, _desc?: string, _builder?: unknown, handler?: unknown) => {
      if (typeof cmd === 'string') {
        const name = cmd.split(' ')[0];
        handlers[name] = handler as (args: Record<string, unknown>) => Promise<void>;
      } else if (typeof cmd === 'object' && 'command' in cmd) {
        const group = cmd as { command: string; builder: (y: typeof fakeYargs) => typeof fakeYargs };
        const groupName = group.command;
        const groupHandlers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
        const groupYargs = {
          command: (subcmd: string, _d?: string, _b?: unknown, h?: unknown) => {
            if (typeof subcmd === 'string') {
              const subName = subcmd.split(' ')[0];
              groupHandlers[subName] = h as (args: Record<string, unknown>) => Promise<void>;
            }
            return groupYargs;
          },
          option: () => groupYargs,
          positional: () => groupYargs,
          demandCommand: () => groupYargs,
        };
        group.builder(groupYargs as unknown as typeof fakeYargs);
        nestedGroups[groupName] = groupHandlers;
      }
      return fakeYargs;
    },
    option: () => fakeYargs,
    positional: () => fakeYargs,
    demandCommand: () => fakeYargs,
  };
  (userCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return { handlers, nestedGroups };
}

// TODO: Phase 5 — rewrite tests to mock HTTP client instead of domain services
describe.skip('CLI User Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(getUserById).mockResolvedValue(fakeUser);
    vi.mocked(getUserByEmail).mockResolvedValue(fakeUser);
  });

  // ─── user create ──────────────────────────────────────────────────

  describe('user create', () => {
    it('should create a user and display success', async () => {
      vi.mocked(createUser).mockResolvedValue(fakeUser);

      const { handlers } = getHandlers();
      await handlers['create'](createArgv({
        org: 'org-1',
        email: 'john@example.com',
        'given-name': 'John',
        'family-name': 'Doe',
        'no-notify': false,
        passwordless: false,
      }));

      expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: 'org-1',
        email: 'john@example.com',
        givenName: 'John',
        familyName: 'Doe',
      }));
      expect(success).toHaveBeenCalledWith(expect.stringContaining('john@example.com'));
    });

    it('should skip password for passwordless users', async () => {
      vi.mocked(createUser).mockResolvedValue({ ...fakeUser, hasPassword: false });

      const { handlers } = getHandlers();
      await handlers['create'](createArgv({
        org: 'org-1', email: 'jane@example.com', passwordless: true, password: 'ignored', 'no-notify': true,
      }));

      expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ password: undefined }));
    });
  });

  // ─── user invite ──────────────────────────────────────────────────

  describe('user invite', () => {
    it('should resolve user by UUID and show invite message', async () => {
      const { handlers } = getHandlers();
      await handlers['invite'](createArgv({ 'id-or-email': fakeUser.id }));

      expect(getUserById).toHaveBeenCalledWith(fakeUser.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('john@example.com'));
    });

    it('should resolve user by email with --org', async () => {
      const { handlers } = getHandlers();
      await handlers['invite'](createArgv({ 'id-or-email': 'john@example.com', org: 'org-1' }));

      expect(getUserByEmail).toHaveBeenCalledWith('org-1', 'john@example.com');
    });
  });

  // ─── user list ────────────────────────────────────────────────────

  describe('user list', () => {
    it('should list users in table format', async () => {
      vi.mocked(listUsersByOrganization).mockResolvedValue({
        data: [fakeUser], total: 1, page: 1, pageSize: 20, totalPages: 1,
      });

      const { handlers } = getHandlers();
      await handlers['list'](createArgv({ org: 'org-1', page: 1, 'page-size': 20 }));

      expect(listUsersByOrganization).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: 'org-1', page: 1, pageSize: 20,
      }));
      expect(outputResult).toHaveBeenCalled();
    });

    it('should warn when no users found', async () => {
      vi.mocked(listUsersByOrganization).mockResolvedValue({
        data: [], total: 0, page: 1, pageSize: 20, totalPages: 0,
      });

      const { handlers } = getHandlers();
      await handlers['list'](createArgv({ org: 'org-1', page: 1, 'page-size': 20 }));

      expect(warn).toHaveBeenCalledWith('No users found');
    });
  });

  // ─── user show ────────────────────────────────────────────────────

  describe('user show', () => {
    it('should show user details by UUID', async () => {
      const { handlers } = getHandlers();
      await handlers['show'](createArgv({ 'id-or-email': fakeUser.id }));

      expect(getUserById).toHaveBeenCalledWith(fakeUser.id);
      expect(printTable).toHaveBeenCalled();
    });

    it('should throw NotFoundError when user not found', async () => {
      vi.mocked(getUserById).mockResolvedValue(null);

      const { handlers } = getHandlers();
      await expect(handlers['show'](createArgv({ 'id-or-email': fakeUser.id }))).rejects.toThrow('User not found');
    });
  });

  // ─── user update ──────────────────────────────────────────────────

  describe('user update', () => {
    it('should update user profile', async () => {
      vi.mocked(updateUser).mockResolvedValue({ ...fakeUser, givenName: 'Jane' });

      const { handlers } = getHandlers();
      await handlers['update'](createArgv({ id: fakeUser.id, 'given-name': 'Jane' }));

      expect(updateUser).toHaveBeenCalledWith(fakeUser.id, {
        givenName: 'Jane', familyName: undefined, email: undefined,
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('john@example.com'));
    });
  });

  // ─── user deactivate ──────────────────────────────────────────────

  describe('user deactivate', () => {
    it('should deactivate user with confirmation', async () => {
      const { handlers } = getHandlers();
      await handlers['deactivate'](createArgv({ id: fakeUser.id, force: true }));

      expect(deactivateUser).toHaveBeenCalledWith(fakeUser.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('deactivated'));
    });

    it('should show dry-run message', async () => {
      const { handlers } = getHandlers();
      await handlers['deactivate'](createArgv({ id: fakeUser.id, 'dry-run': true }));

      expect(deactivateUser).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    });
  });

  // ─── user reactivate ──────────────────────────────────────────────

  describe('user reactivate', () => {
    it('should reactivate a user', async () => {
      const { handlers } = getHandlers();
      await handlers['reactivate'](createArgv({ id: fakeUser.id }));

      expect(reactivateUser).toHaveBeenCalledWith(fakeUser.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('reactivated'));
    });
  });

  // ─── user suspend ─────────────────────────────────────────────────

  describe('user suspend', () => {
    it('should suspend user with confirmation', async () => {
      const { handlers } = getHandlers();
      await handlers['suspend'](createArgv({ id: fakeUser.id, force: true }));

      expect(suspendUser).toHaveBeenCalledWith(fakeUser.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('suspended'));
    });

    it('should cancel when confirmation declined', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const { handlers } = getHandlers();
      await handlers['suspend'](createArgv({ id: fakeUser.id }));

      expect(suspendUser).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });
  });

  // ─── user lock ────────────────────────────────────────────────────

  describe('user lock', () => {
    it('should lock user with reason', async () => {
      const { handlers } = getHandlers();
      await handlers['lock'](createArgv({ id: fakeUser.id, reason: 'Suspicious activity', force: true }));

      expect(lockUser).toHaveBeenCalledWith(fakeUser.id, 'Suspicious activity');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('locked'));
    });
  });

  // ─── user unlock ──────────────────────────────────────────────────

  describe('user unlock', () => {
    it('should unlock a user', async () => {
      const { handlers } = getHandlers();
      await handlers['unlock'](createArgv({ id: fakeUser.id }));

      expect(unlockUser).toHaveBeenCalledWith(fakeUser.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('unlocked'));
    });
  });

  // ─── user set-password ────────────────────────────────────────────

  describe('user set-password', () => {
    it('should prompt for password and set it', async () => {
      const { handlers } = getHandlers();
      await handlers['set-password'](createArgv({ id: fakeUser.id, force: true }));

      expect(setUserPassword).toHaveBeenCalledWith(fakeUser.id, 'SecureP@ss1');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Password set'));
    });
  });

  // ─── user verify-email ────────────────────────────────────────────

  describe('user verify-email', () => {
    it('should mark email as verified', async () => {
      const { handlers } = getHandlers();
      await handlers['verify-email'](createArgv({ id: fakeUser.id }));

      expect(markEmailVerified).toHaveBeenCalledWith(fakeUser.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Email verified'));
    });
  });

  // ─── user roles assign ───────────────────────────────────────────

  describe('user roles assign', () => {
    it('should assign roles to a user', async () => {
      const { nestedGroups } = getHandlers();
      await nestedGroups['roles']['assign'](createArgv({
        'user-id': fakeUser.id, 'role-ids': 'r1,r2', org: 'org-1',
      }));

      expect(assignRolesToUser).toHaveBeenCalledWith(fakeUser.id, ['r1', 'r2'], 'org-1');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('2 role'));
    });
  });

  // ─── user roles remove ───────────────────────────────────────────

  describe('user roles remove', () => {
    it('should remove roles from a user', async () => {
      const { nestedGroups } = getHandlers();
      await nestedGroups['roles']['remove'](createArgv({
        'user-id': fakeUser.id, 'role-ids': 'r1', org: 'org-1', force: true,
      }));

      expect(removeRolesFromUser).toHaveBeenCalledWith(fakeUser.id, ['r1'], 'org-1');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('1 role'));
    });

    it('should cancel when confirmation declined', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const { nestedGroups } = getHandlers();
      await nestedGroups['roles']['remove'](createArgv({
        'user-id': fakeUser.id, 'role-ids': 'r1', org: 'org-1',
      }));

      expect(removeRolesFromUser).not.toHaveBeenCalled();
    });
  });

  // ─── user roles list ─────────────────────────────────────────────

  describe('user roles list', () => {
    it('should list roles for a user', async () => {
      const fakeRole = { id: 'r1', name: 'Admin', slug: 'admin', applicationId: 'app-1', description: null, createdAt: new Date(), updatedAt: new Date() };
      vi.mocked(getUserRoles).mockResolvedValue([fakeRole]);

      const { nestedGroups } = getHandlers();
      await nestedGroups['roles']['list'](createArgv({ 'user-id': fakeUser.id }));

      expect(getUserRoles).toHaveBeenCalledWith(fakeUser.id);
      expect(outputResult).toHaveBeenCalled();
    });

    it('should warn when no roles assigned', async () => {
      vi.mocked(getUserRoles).mockResolvedValue([]);

      const { nestedGroups } = getHandlers();
      await nestedGroups['roles']['list'](createArgv({ 'user-id': fakeUser.id }));

      expect(warn).toHaveBeenCalledWith('No roles assigned');
    });
  });

  // ─── user claims set ─────────────────────────────────────────────

  describe('user claims set', () => {
    it('should set a claim value', async () => {
      const { nestedGroups } = getHandlers();
      await nestedGroups['claims']['set'](createArgv({
        'user-id': fakeUser.id, 'claim-id': 'cl1', value: 'Engineering',
      }));

      expect(setValue).toHaveBeenCalledWith(fakeUser.id, 'cl1', 'Engineering');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Claim value set'));
    });
  });

  // ─── user claims get ─────────────────────────────────────────────

  describe('user claims get', () => {
    it('should get claim values for a user', async () => {
      const fakeClaim = {
        definition: { id: 'cl1', applicationId: 'app-1', claimName: 'department', claimType: 'string', description: null, includeInIdToken: true, includeInAccessToken: false, includeInUserinfo: true, createdAt: new Date(), updatedAt: new Date() },
        value: { id: 'cv1', userId: fakeUser.id, claimId: 'cl1', value: 'Engineering', createdAt: new Date(), updatedAt: new Date() },
      };
      vi.mocked(getValuesForUser).mockResolvedValue([fakeClaim]);

      const { nestedGroups } = getHandlers();
      await nestedGroups['claims']['get'](createArgv({ 'user-id': fakeUser.id }));

      expect(getValuesForUser).toHaveBeenCalledWith(fakeUser.id);
      expect(outputResult).toHaveBeenCalled();
    });

    it('should warn when no claim values found', async () => {
      vi.mocked(getValuesForUser).mockResolvedValue([]);

      const { nestedGroups } = getHandlers();
      await nestedGroups['claims']['get'](createArgv({ 'user-id': fakeUser.id }));

      expect(warn).toHaveBeenCalledWith('No claim values found');
    });
  });

  // ─── user claims delete ───────────────────────────────────────────

  describe('user claims delete', () => {
    it('should delete a claim value with confirmation', async () => {
      const { nestedGroups } = getHandlers();
      await nestedGroups['claims']['delete'](createArgv({
        'user-id': fakeUser.id, 'claim-id': 'cl1', force: true,
      }));

      expect(deleteValue).toHaveBeenCalledWith(fakeUser.id, 'cl1');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Claim value deleted'));
    });
  });

  // ─── user 2fa ─────────────────────────────────────────────────────

  describe('user 2fa', () => {
    it('should show 2fa status for a user', async () => {
      const { nestedGroups } = getHandlers();
      await nestedGroups['2fa']['status'](createArgv({ id: fakeUser.id }));

      const { getTwoFactorStatus } = await import('../../../../src/two-factor/service.js');
      expect(getTwoFactorStatus).toHaveBeenCalledWith(fakeUser.id);
      expect(outputResult).toHaveBeenCalled();
    });

    it('should disable 2fa for a user', async () => {
      const { nestedGroups } = getHandlers();
      await nestedGroups['2fa']['disable'](createArgv({ id: fakeUser.id, force: true }));

      const { disableTwoFactor } = await import('../../../../src/two-factor/service.js');
      expect(disableTwoFactor).toHaveBeenCalledWith(fakeUser.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('2FA disabled'));
    });

    it('should reset 2fa for a user', async () => {
      const { nestedGroups } = getHandlers();
      await nestedGroups['2fa']['reset'](createArgv({ id: fakeUser.id, force: true }));

      const { disableTwoFactor } = await import('../../../../src/two-factor/service.js');
      expect(disableTwoFactor).toHaveBeenCalledWith(fakeUser.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('2FA reset'));
    });
  });

  // ─── command metadata ─────────────────────────────────────────────

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(userCommand.command).toBe('user');
    });

    it('should have a description', () => {
      expect(userCommand.describe).toBe('Manage users');
    });
  });
});
