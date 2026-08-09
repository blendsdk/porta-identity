/**
 * Tests for the user, user-role, and user-claim commands.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUsers = {
  create: vi.fn(),
  invite: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  suspend: vi.fn(),
  unsuspend: vi.fn(),
  reactivate: vi.fn(),
  lock: vi.fn(),

  unlock: vi.fn(),
  deactivate: vi.fn(),
  setPassword: vi.fn(),
  getHistory: vi.fn(),
};

const mockUserRoles = {
  list: vi.fn(),
  assign: vi.fn(),
  remove: vi.fn(),
};

const mockUserClaims = {
  list: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({
    users: mockUsers,
    userRoles: mockUserRoles,
    userClaims: mockUserClaims,
  })),
}));

vi.mock('../../src/error-handler.js', () => ({
  handleError: vi.fn(),
}));

vi.mock('../../src/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  formatDate: vi.fn((d: string) => d ?? 'N/A'),
  truncate: vi.fn((s: string) => s.slice(0, 8)),
}));

vi.mock('../../src/prompt.js', () => ({
  confirm: vi.fn(),
  question: vi.fn(),
}));

import { handleError } from '../../src/error-handler.js';
import { printTable, printJson, success, warn, info } from '../../src/output.js';
import { confirm } from '../../src/prompt.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const sampleUser = {
  id: 'user-uuid-1234',
  organizationId: 'org-uuid-1234',
  email: 'alice@example.com',
  givenName: 'Alice',
  familyName: 'Smith',
  status: 'active' as const,
  emailVerified: true,
  hasPassword: true,
  failedLoginCount: 0,
  lastLoginAt: '2024-06-01T00:00:00Z',
  lockedAt: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('user command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function invokeSubcommand(subcommand: string, extraArgs: Record<string, unknown> = {}) {
    const yargs = (await import('yargs')).default;
    const { userCommand } = await import('../../src/commands/user.js');

    const args = ['user', ...subcommand.split(' ')];
    for (const [key, value] of Object.entries(extraArgs)) {
      if (key.startsWith('_pos_')) continue;
      if (typeof value === 'boolean') {
        if (value) args.push(`--${key}`);
      } else {
        args.push(`--${key}`, String(value));
      }
    }
    if (extraArgs._pos_) {
      const posValues = Array.isArray(extraArgs._pos_)
        ? extraArgs._pos_.map(String)
        : [String(extraArgs._pos_)];
      const cmdParts = subcommand.split(' ').length;
      args.splice(1 + cmdParts, 0, ...posValues);
    }

    try {
      await yargs(args)
        .command(userCommand)
        .option('json', { type: 'boolean', default: false })
        .option('verbose', { type: 'boolean', default: false })
        .option('insecure', { type: 'boolean', default: false })
        .option('force', { type: 'boolean', default: false })
        .option('server', { type: 'string' })
        .fail(false)
        .parse();
    } catch {
      // yargs may throw on missing commands
    }
  }

  // =========================================================================
  // user create
  // =========================================================================

  describe('create', () => {
    it('creates a user and shows table output', async () => {
      mockUsers.create.mockResolvedValue(sampleUser);

      await invokeSubcommand('create', { org: 'org-uuid', email: 'alice@example.com' });

      expect(mockUsers.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-uuid', email: 'alice@example.com' }),
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('alice@example.com'));
      expect(printTable).toHaveBeenCalled();
    });

    it('creates a user with JSON output', async () => {
      mockUsers.create.mockResolvedValue(sampleUser);

      await invokeSubcommand('create', { org: 'org-uuid', email: 'alice@example.com', json: true });

      expect(printJson).toHaveBeenCalledWith(sampleUser);
    });

    it('passes name and password when provided', async () => {
      mockUsers.create.mockResolvedValue(sampleUser);

      await invokeSubcommand('create', {
        org: 'org-uuid',
        email: 'alice@example.com',
        name: 'Alice Smith',
        password: 'Secret123!',
      });

      // The CLI splits --name into OIDC given/family fields (server truth).
      expect(mockUsers.create).toHaveBeenCalledWith(
        expect.objectContaining({ givenName: 'Alice', familyName: 'Smith', password: 'Secret123!' }),
      );

    });

    it('handles create errors', async () => {
      mockUsers.create.mockRejectedValue(new Error('Validation failed'));

      await invokeSubcommand('create', { org: 'org-uuid', email: 'bad@example.com' });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // user invite
  // =========================================================================

  describe('invite', () => {
    it('invites a user', async () => {
      const bobUser = { ...sampleUser, email: 'bob@example.com' };
      mockUsers.invite.mockResolvedValue(bobUser);

      await invokeSubcommand('invite', { org: 'org-uuid', email: 'bob@example.com' });

      expect(mockUsers.invite).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-uuid', email: 'bob@example.com' }),
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('bob@example.com'));
    });

    it('invites with JSON output', async () => {
      mockUsers.invite.mockResolvedValue(sampleUser);

      await invokeSubcommand('invite', { org: 'org-uuid', email: 'bob@example.com', json: true });

      expect(printJson).toHaveBeenCalledWith(sampleUser);
    });

    it('handles invite errors', async () => {
      mockUsers.invite.mockRejectedValue(new Error('Already exists'));

      await invokeSubcommand('invite', { org: 'org-uuid', email: 'bob@example.com' });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // user list
  // =========================================================================

  describe('list', () => {
    it('lists users in table format', async () => {
      mockUsers.list.mockResolvedValue({ data: [sampleUser], total: 1, page: 1, pageSize: 20 });

      await invokeSubcommand('list', { org: 'org-uuid' });

      expect(mockUsers.list).toHaveBeenCalledWith('org-uuid', expect.any(Object));
      expect(printTable).toHaveBeenCalled();
      expect(info).toHaveBeenCalledWith('Total: 1 users');
    });

    it('lists users in JSON format', async () => {
      const result = { data: [sampleUser], total: 1, page: 1, pageSize: 20 };
      mockUsers.list.mockResolvedValue(result);

      await invokeSubcommand('list', { org: 'org-uuid', json: true });

      expect(printJson).toHaveBeenCalledWith(result);
    });

    it('shows warning when no users found', async () => {
      mockUsers.list.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

      await invokeSubcommand('list', { org: 'org-uuid' });

      expect(warn).toHaveBeenCalledWith('No users found');
    });

    it('passes search and status filters', async () => {
      mockUsers.list.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

      await invokeSubcommand('list', { org: 'org-uuid', status: 'active', search: 'alice' });

      expect(mockUsers.list).toHaveBeenCalledWith(
        'org-uuid',
        expect.objectContaining({ status: 'active', search: 'alice' }),
      );
    });

    it('handles list errors', async () => {
      mockUsers.list.mockRejectedValue(new Error('Forbidden'));

      await invokeSubcommand('list', { org: 'org-uuid' });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // user show
  // =========================================================================

  describe('show', () => {
    it('shows user details in table format', async () => {
      mockUsers.get.mockResolvedValue({ data: sampleUser, etag: 'etag-1' });

      await invokeSubcommand('show', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

      expect(mockUsers.get).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234');
      expect(printTable).toHaveBeenCalled();
    });

    it('shows user details in JSON format', async () => {
      mockUsers.get.mockResolvedValue({ data: sampleUser, etag: 'etag-1' });

      await invokeSubcommand('show', { org: 'org-uuid', _pos_: 'user-uuid-1234', json: true });

      expect(printJson).toHaveBeenCalledWith(sampleUser);
    });

    it('handles show errors', async () => {
      mockUsers.get.mockRejectedValue(new Error('Not found'));

      await invokeSubcommand('show', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // user update
  // =========================================================================

  describe('update', () => {
    it('updates user name (split into given/family)', async () => {
      mockUsers.get.mockResolvedValue({ data: sampleUser, etag: 'etag-1' });
      mockUsers.update.mockResolvedValue({ ...sampleUser, givenName: 'Alice', familyName: 'Updated' });

      await invokeSubcommand('update', { org: 'org-uuid', _pos_: 'user-uuid-1234', name: 'Alice Updated' });

      expect(mockUsers.update).toHaveBeenCalledWith(
        'org-uuid',
        'user-uuid-1234',
        expect.objectContaining({ givenName: 'Alice', familyName: 'Updated' }),
        'etag-1',
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('updated'));
    });


    it('outputs JSON on update', async () => {
      mockUsers.get.mockResolvedValue({ data: sampleUser, etag: 'etag-1' });
      mockUsers.update.mockResolvedValue(sampleUser);

      await invokeSubcommand('update', { org: 'org-uuid', _pos_: 'user-uuid-1234', name: 'New', json: true });

      expect(printJson).toHaveBeenCalledWith(sampleUser);
    });

    it('handles update errors', async () => {
      mockUsers.get.mockRejectedValue(new Error('Not found'));

      await invokeSubcommand('update', { org: 'org-uuid', _pos_: 'user-uuid-1234', name: 'New' });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // status lifecycle
  // =========================================================================

  describe('suspend', () => {
    it('suspends a user', async () => {
      await invokeSubcommand('suspend', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

      expect(mockUsers.suspend).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('suspended'));
    });

    it('handles suspend errors', async () => {
      mockUsers.suspend.mockRejectedValue(new Error('Already suspended'));

      await invokeSubcommand('suspend', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

      expect(handleError).toHaveBeenCalled();
    });
  });

  describe('unsuspend', () => {
    it('unsuspends a user (ST-23)', async () => {
      await invokeSubcommand('unsuspend', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

      expect(mockUsers.unsuspend).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('unsuspended'));
    });
  });

  describe('reactivate', () => {
    it('reactivates a user', async () => {
      await invokeSubcommand('reactivate', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

      expect(mockUsers.reactivate).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('reactivated'));
    });
  });


  describe('lock', () => {
    it('locks a user', async () => {
      await invokeSubcommand('lock', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

      expect(mockUsers.lock).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('locked'));
    });
  });

  describe('unlock', () => {
    it('unlocks a user', async () => {
      await invokeSubcommand('unlock', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

      expect(mockUsers.unlock).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('unlocked'));
    });
  });

  describe('deactivate', () => {
    it('deactivates a user after confirmation', async () => {
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await invokeSubcommand('deactivate', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

      expect(confirm).toHaveBeenCalled();
      expect(mockUsers.deactivate).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('deactivated'));
    });

    it('cancels deactivation when not confirmed', async () => {
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await invokeSubcommand('deactivate', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

      expect(mockUsers.deactivate).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });

    it('skips confirmation with --force', async () => {
      await invokeSubcommand('deactivate', { org: 'org-uuid', _pos_: 'user-uuid-1234', force: true });

      expect(confirm).not.toHaveBeenCalled();
      expect(mockUsers.deactivate).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234');
    });
  });

  // =========================================================================
  // set-password
  // =========================================================================

  describe('set-password', () => {
    it('sets a user password', async () => {
      await invokeSubcommand('set-password', {
        org: 'org-uuid',
        _pos_: 'user-uuid-1234',
        password: 'NewSecret123!',
      });

      expect(mockUsers.setPassword).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234', {
        password: 'NewSecret123!',
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Password set'));
    });

    it('handles set-password errors', async () => {
      mockUsers.setPassword.mockRejectedValue(new Error('Weak password'));

      await invokeSubcommand('set-password', {
        org: 'org-uuid',
        _pos_: 'user-uuid-1234',
        password: '123',
      });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // history
  // =========================================================================

  describe('history', () => {
    it('shows user history in table format', async () => {
      // Server HistoryEntry shape (src/lib/entity-history.ts).
      mockUsers.getHistory.mockResolvedValue([
        { id: 'h1', eventType: 'user.created', actorId: 'admin', metadata: null, createdAt: '2024-01-01T00:00:00Z' },
      ]);

      await invokeSubcommand('history', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

      expect(mockUsers.getHistory).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234');
      expect(printTable).toHaveBeenCalled();
    });

    it('shows history in JSON format', async () => {
      const history = [{ id: 'h1', eventType: 'user.created', actorId: 'admin', metadata: null, createdAt: '2024-01-01T00:00:00Z' }];
      mockUsers.getHistory.mockResolvedValue(history);


      await invokeSubcommand('history', { org: 'org-uuid', _pos_: 'user-uuid-1234', json: true });

      expect(printJson).toHaveBeenCalledWith(history);
    });

    it('shows warning when no history found', async () => {
      mockUsers.getHistory.mockResolvedValue([]);

      await invokeSubcommand('history', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

      expect(warn).toHaveBeenCalledWith('No history entries found');
    });
  });

  // =========================================================================
  // user roles
  // =========================================================================

  describe('roles', () => {
    describe('list', () => {
      it('lists assigned roles', async () => {
        mockUserRoles.list.mockResolvedValue([
          { roleId: 'role-uuid', roleName: 'admin', assignedAt: '2024-01-01T00:00:00Z' },
        ]);

        await invokeSubcommand('roles list', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

        expect(mockUserRoles.list).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234');
        expect(printTable).toHaveBeenCalled();
      });

      it('lists roles in JSON', async () => {
        const roles = [{ roleId: 'role-uuid', roleName: 'admin', assignedAt: '2024-01-01T00:00:00Z' }];
        mockUserRoles.list.mockResolvedValue(roles);

        await invokeSubcommand('roles list', { org: 'org-uuid', _pos_: 'user-uuid-1234', json: true });

        expect(printJson).toHaveBeenCalledWith(roles);
      });

      it('shows warning when no roles assigned', async () => {
        mockUserRoles.list.mockResolvedValue([]);

        await invokeSubcommand('roles list', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

        expect(warn).toHaveBeenCalledWith('No roles assigned');
      });
    });

    describe('assign', () => {
      it('assigns a role', async () => {
        await invokeSubcommand('roles assign', {
          org: 'org-uuid',
          _pos_: 'user-uuid-1234',
          role: 'role-uuid',
        });

        expect(mockUserRoles.assign).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234', 'role-uuid');
        expect(success).toHaveBeenCalledWith(expect.stringContaining('assigned'));
      });

      it('handles assign errors', async () => {
        mockUserRoles.assign.mockRejectedValue(new Error('Role not found'));

        await invokeSubcommand('roles assign', {
          org: 'org-uuid',
          _pos_: 'user-uuid-1234',
          role: 'bad-role',
        });

        expect(handleError).toHaveBeenCalled();
      });
    });

    describe('remove', () => {
      it('removes a role', async () => {
        await invokeSubcommand('roles remove', {
          org: 'org-uuid',
          _pos_: 'user-uuid-1234',
          role: 'role-uuid',
        });

        expect(mockUserRoles.remove).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234', 'role-uuid');
        expect(success).toHaveBeenCalledWith(expect.stringContaining('removed'));
      });
    });
  });

  // =========================================================================
  // user claims
  // =========================================================================

  describe('claims', () => {
    describe('list', () => {
      it('lists custom claims', async () => {
        mockUserClaims.list.mockResolvedValue([
          { claimDefinitionId: 'claim-uuid', claimName: 'department', value: 'Engineering' },
        ]);

        await invokeSubcommand('claims list', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

        expect(mockUserClaims.list).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234');
        expect(printTable).toHaveBeenCalled();
      });

      it('lists claims in JSON', async () => {
        const claims = [{ claimDefinitionId: 'claim-uuid', claimName: 'department', value: 'Engineering' }];
        mockUserClaims.list.mockResolvedValue(claims);

        await invokeSubcommand('claims list', { org: 'org-uuid', _pos_: 'user-uuid-1234', json: true });

        expect(printJson).toHaveBeenCalledWith(claims);
      });

      it('shows warning when no claims set', async () => {
        mockUserClaims.list.mockResolvedValue([]);

        await invokeSubcommand('claims list', { org: 'org-uuid', _pos_: 'user-uuid-1234' });

        expect(warn).toHaveBeenCalledWith('No custom claims set');
      });
    });

    describe('set', () => {
      it('sets a claim value', async () => {
        await invokeSubcommand('claims set', {
          org: 'org-uuid',
          _pos_: 'user-uuid-1234',
          claim: 'claim-uuid',
          value: 'Engineering',
        });

        expect(mockUserClaims.set).toHaveBeenCalledWith(
          'org-uuid',
          'user-uuid-1234',
          'claim-uuid',
          'Engineering',
        );
        expect(success).toHaveBeenCalledWith(expect.stringContaining('set'));
      });

      it('handles set errors', async () => {
        mockUserClaims.set.mockRejectedValue(new Error('Invalid value'));

        await invokeSubcommand('claims set', {
          org: 'org-uuid',
          _pos_: 'user-uuid-1234',
          claim: 'claim-uuid',
          value: 'bad',
        });

        expect(handleError).toHaveBeenCalled();
      });
    });

    describe('remove', () => {
      it('removes a claim value', async () => {
        await invokeSubcommand('claims remove', {
          org: 'org-uuid',
          _pos_: 'user-uuid-1234',
          claim: 'claim-uuid',
        });

        expect(mockUserClaims.remove).toHaveBeenCalledWith('org-uuid', 'user-uuid-1234', 'claim-uuid');
        expect(success).toHaveBeenCalledWith(expect.stringContaining('removed'));
      });
    });
  });
});
