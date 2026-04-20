import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock client — accessible inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withHttpClient: vi.fn().mockImplementation(
    async (_argv: unknown, fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
  ),
}));

vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandling: vi.fn().mockImplementation(
    async (fn: () => Promise<void>) => fn(),
  ),
}));

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

vi.mock('../../../../src/cli/prompt.js', () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

// Mock nested subcommand modules — tested in their own files
vi.mock('../../../../src/cli/commands/user-role.js', () => ({
  userRoleCommand: { command: 'roles', describe: 'mock', builder: () => {}, handler: () => {} },
}));
vi.mock('../../../../src/cli/commands/user-claim.js', () => ({
  userClaimCommand: { command: 'claims', describe: 'mock', builder: () => {}, handler: () => {} },
}));
vi.mock('../../../../src/cli/commands/user-2fa.js', () => ({
  userTwoFaCommand: { command: '2fa', describe: 'mock', builder: () => {}, handler: () => {} },
}));

// Mock readline for set-password (promptPassword)
vi.mock('readline', () => ({
  createInterface: vi.fn().mockReturnValue({
    question: vi.fn((_msg: string, cb: (answer: string) => void) => cb('SecureP@ss1')),
    close: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { userCommand } from '../../../../src/cli/commands/user.js';
import { success, warn, outputResult, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const ORG_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const USER_ID = 'e5f6a7b8-c9d0-1234-ef01-23456789abcd';

const fakeUser = {
  id: USER_ID,
  organizationId: ORG_ID,
  email: 'john@example.com',
  emailVerified: true,
  givenName: 'John',
  familyName: 'Doe',
  status: 'active',
  hasPassword: true,
  loginCount: 5,
  lastLoginAt: '2026-04-10T08:00:00.000Z',
  createdAt: '2026-04-08T00:00:00.000Z',
  updatedAt: '2026-04-09T00:00:00.000Z',
};

function createArgv(
  overrides: Partial<GlobalOptions & Record<string, unknown>> = {},
): GlobalOptions & Record<string, unknown> {
  return { json: false, verbose: false, force: false, 'dry-run': false, ...overrides };
}

/** Extract subcommand handlers from the user command builder. */
function getHandlers() {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
  const fakeYargs = {
    command: (cmd: string | object, _desc?: string, _builder?: unknown, handler?: unknown) => {
      if (typeof cmd === 'string') {
        const name = cmd.split(' ')[0];
        handlers[name] = handler as (args: Record<string, unknown>) => Promise<void>;
      }
      return fakeYargs;
    },
    option: () => fakeYargs,
    positional: () => fakeYargs,
    demandCommand: () => fakeYargs,
  };
  (userCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI User Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
    // Default: resolveUser by UUID returns fakeUser
    mockClient.get.mockResolvedValue({ status: 200, data: { data: fakeUser } });
  });

  // ── user create ─────────────────────────────────────────────────────

  describe('user create', () => {
    it('should POST to /api/admin/organizations/:orgId/users', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeUser } });

      const handlers = getHandlers();
      await handlers['create'](createArgv({
        org: ORG_ID,
        email: 'john@example.com',
        'given-name': 'John',
        'family-name': 'Doe',
      }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users`,
        {
          email: 'john@example.com',
          givenName: 'John',
          familyName: 'Doe',
          password: undefined,
        },
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('john@example.com'));
    });

    it('should pass password when provided', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeUser } });

      const handlers = getHandlers();
      await handlers['create'](createArgv({
        org: ORG_ID,
        email: 'john@example.com',
        password: 'SecureP@ss1',
        passwordless: false,
        'no-notify': false,
      }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users`,
        expect.objectContaining({ password: 'SecureP@ss1' }),
      );
    });

    it('should omit password when --passwordless is set', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeUser } });

      const handlers = getHandlers();
      await handlers['create'](createArgv({
        org: ORG_ID,
        email: 'john@example.com',
        password: 'ignored',
        passwordless: true,
      }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users`,
        expect.objectContaining({ password: undefined }),
      );
    });
  });

  // ── user list ───────────────────────────────────────────────────────

  describe('user list', () => {
    it('should GET /api/admin/organizations/:orgId/users with query params', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { data: [fakeUser], total: 1, page: 1, pageSize: 20 },
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ org: ORG_ID, page: 1, 'page-size': 20 }));

      expect(mockClient.get).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users`,
        { page: '1', pageSize: '20' },
      );
      expect(outputResult).toHaveBeenCalled();
    });

    it('should warn when no users found', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { data: [], total: 0, page: 1, pageSize: 20 },
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ org: ORG_ID, page: 1, 'page-size': 20 }));

      expect(warn).toHaveBeenCalledWith('No users found');
    });

    it('should pass status and search filters', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { data: [fakeUser], total: 1, page: 1, pageSize: 20 },
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({
        org: ORG_ID,
        status: 'active',
        search: 'john',
        page: 1,
        'page-size': 20,
      }));

      expect(mockClient.get).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users`,
        { page: '1', pageSize: '20', status: 'active', search: 'john' },
      );
    });
  });

  // ── user show ───────────────────────────────────────────────────────

  describe('user show', () => {
    it('should resolve user by UUID and display details', async () => {
      const handlers = getHandlers();
      await handlers['show'](createArgv({ 'id-or-email': USER_ID, org: ORG_ID }));

      expect(mockClient.get).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users/${USER_ID}`,
      );
      expect(printTable).toHaveBeenCalled();
    });

    it('should resolve user by email via search', async () => {
      // resolveUser for email calls list endpoint with search param
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { data: [fakeUser], total: 1, page: 1, pageSize: 10 },
      });

      const handlers = getHandlers();
      await handlers['show'](createArgv({ 'id-or-email': 'john@example.com', org: ORG_ID }));

      expect(mockClient.get).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users`,
        { search: 'john@example.com', pageSize: '10' },
      );
    });
  });

  // ── user update ─────────────────────────────────────────────────────

  describe('user update', () => {
    it('should PUT user update with given-name', async () => {
      const updated = { ...fakeUser, givenName: 'Jane' };
      mockClient.put.mockResolvedValue({ status: 200, data: { data: updated } });

      const handlers = getHandlers();
      await handlers['update'](createArgv({
        id: USER_ID,
        org: ORG_ID,
        'given-name': 'Jane',
      }));

      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users/${USER_ID}`,
        { givenName: 'Jane', familyName: undefined, email: undefined },
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining(fakeUser.email));
    });
  });

  // ── status transitions ──────────────────────────────────────────────

  describe('user deactivate', () => {
    it('should confirm then POST deactivate', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['deactivate'](createArgv({ id: USER_ID, org: ORG_ID, force: true }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users/${USER_ID}/deactivate`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('deactivated'));
    });

    it('should show dry-run message', async () => {
      const handlers = getHandlers();
      await handlers['deactivate'](createArgv({ id: USER_ID, org: ORG_ID, 'dry-run': true }));

      expect(mockClient.post).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    });

    it('should cancel when confirmation declined', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const handlers = getHandlers();
      await handlers['deactivate'](createArgv({ id: USER_ID, org: ORG_ID }));

      expect(mockClient.post).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });
  });

  describe('user reactivate', () => {
    it('should POST reactivate', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['reactivate'](createArgv({ id: USER_ID, org: ORG_ID }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users/${USER_ID}/reactivate`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('reactivated'));
    });
  });

  describe('user suspend', () => {
    it('should confirm then POST suspend', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['suspend'](createArgv({ id: USER_ID, org: ORG_ID, force: true }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users/${USER_ID}/suspend`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('suspended'));
    });
  });

  describe('user lock', () => {
    it('should confirm then POST lock with reason', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['lock'](createArgv({
        id: USER_ID,
        org: ORG_ID,
        reason: 'Suspicious activity',
        force: true,
      }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users/${USER_ID}/lock`,
        { reason: 'Suspicious activity' },
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('locked'));
    });
  });

  describe('user unlock', () => {
    it('should POST unlock', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['unlock'](createArgv({ id: USER_ID, org: ORG_ID }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users/${USER_ID}/unlock`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('unlocked'));
    });
  });

  // ── set-password ────────────────────────────────────────────────────

  describe('user set-password', () => {
    it('should prompt for password then POST', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['set-password'](createArgv({ id: USER_ID, org: ORG_ID, force: true }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users/${USER_ID}/password`,
        { password: 'SecureP@ss1' },
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Password set'));
    });
  });

  // ── verify-email ────────────────────────────────────────────────────

  describe('user verify-email', () => {
    it('should POST verify-email', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['verify-email'](createArgv({ id: USER_ID, org: ORG_ID }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_ID}/users/${USER_ID}/verify-email`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Email verified'));
    });
  });

  // ── command metadata ────────────────────────────────────────────────

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(userCommand.command).toBe('user');
    });

    it('should have a description', () => {
      expect(userCommand.describe).toBe('Manage users');
    });
  });
});
