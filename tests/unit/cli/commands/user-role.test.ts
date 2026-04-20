import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock client
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { userRoleCommand } from '../../../../src/cli/commands/user-role.js';
import { success, warn, outputResult, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const ORG_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const USER_UUID = 'u1u2u3u4-u5u6-7890-abcd-ef1234567890';
const ROLE_UUID_1 = 'r1r2r3r4-r5r6-7890-abcd-ef1234567890';
const ROLE_UUID_2 = 'r2r3r4r5-r6r7-8901-bcde-f12345678901';

const fakeUserRole = {
  id: ROLE_UUID_1,
  name: 'Admin',
  slug: 'admin',
};

function createArgv(
  overrides: Partial<GlobalOptions & Record<string, unknown>> = {},
): GlobalOptions & Record<string, unknown> {
  return { json: false, verbose: false, force: false, 'dry-run': false, ...overrides };
}

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
  (userRoleCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI User Role Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
  });

  // ── roles assign ──────────────────────────────────────────────────

  describe('roles assign', () => {
    it('should PUT role IDs to user roles endpoint', async () => {
      mockClient.put.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['assign'](createArgv({
        'user-id': USER_UUID,
        'role-ids': `${ROLE_UUID_1},${ROLE_UUID_2}`,
        org: ORG_UUID,
      }));

      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_UUID}/users/${USER_UUID}/roles`,
        { roleIds: [ROLE_UUID_1, ROLE_UUID_2] },
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('2 role(s)'));
    });
  });

  // ── roles remove ──────────────────────────────────────────────────

  describe('roles remove', () => {
    it('should cancel when confirm rejects', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const handlers = getHandlers();
      await handlers['remove'](createArgv({
        'user-id': USER_UUID,
        'role-ids': ROLE_UUID_1,
        org: ORG_UUID,
      }));

      expect(warn).toHaveBeenCalledWith('Operation cancelled');
      expect(mockClient.delete).not.toHaveBeenCalled();
    });

    it('should DELETE user roles on confirmation', async () => {
      mockClient.delete.mockResolvedValue({ status: 204, data: {} });

      const handlers = getHandlers();
      await handlers['remove'](createArgv({
        'user-id': USER_UUID,
        'role-ids': ROLE_UUID_1,
        org: ORG_UUID,
        force: true,
      }));

      expect(mockClient.delete).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_UUID}/users/${USER_UUID}/roles`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('1 role(s)'));
    });
  });

  // ── roles list ────────────────────────────────────────────────────

  describe('roles list', () => {
    it('should GET user roles and display table', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { data: [fakeUserRole] } });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ 'user-id': USER_UUID, org: ORG_UUID }));

      expect(mockClient.get).toHaveBeenCalledWith(
        `/api/admin/organizations/${ORG_UUID}/users/${USER_UUID}/roles`,
      );
      expect(printTable).toHaveBeenCalled();
    });

    it('should warn when no roles assigned', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { data: [] } });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ 'user-id': USER_UUID, org: ORG_UUID }));

      expect(warn).toHaveBeenCalledWith('No roles assigned');
    });
  });

  // ── metadata ──────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should export command name "roles"', () => {
      expect(userRoleCommand.command).toBe('roles');
    });

    it('should have a describe string', () => {
      expect(userRoleCommand.describe).toBeDefined();
    });
  });
});
