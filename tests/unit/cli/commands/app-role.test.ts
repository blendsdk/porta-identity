import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock client + resolveApp
// ---------------------------------------------------------------------------

const { mockClient, mockResolveApp } = vi.hoisted(() => ({
  mockClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  mockResolveApp: vi.fn(),
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

vi.mock('../../../../src/cli/commands/app.js', () => ({
  resolveApp: mockResolveApp,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { appRoleCommand } from '../../../../src/cli/commands/app-role.js';
import { success, warn, outputResult, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const APP_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const fakeApp = { id: APP_UUID, name: 'BusinessSuite', slug: 'business-suite', status: 'active' };

const fakeRole = {
  id: 'bbb22222-2222-2222-2222-222222222222',
  name: 'Admin',
  slug: 'admin',
  description: 'Full access role',
  applicationId: APP_UUID,
  createdAt: '2026-04-10T00:00:00.000Z',
  updatedAt: '2026-04-11T00:00:00.000Z',
};

const fakePermission = {
  id: 'ccc33333-3333-3333-3333-333333333333',
  name: 'Read Users',
  slug: 'users:read',
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
  (appRoleCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI App Role Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
    mockResolveApp.mockResolvedValue(fakeApp);
  });

  // ── role create ───────────────────────────────────────────────────

  describe('role create', () => {
    it('should resolve app and POST to roles endpoint', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeRole } });

      const handlers = getHandlers();
      await handlers['create'](createArgv({ app: APP_UUID, name: 'Admin', description: 'Full access role' }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.post).toHaveBeenCalledWith(`/api/admin/applications/${APP_UUID}/roles`, {
        name: 'Admin',
        description: 'Full access role',
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Admin'));
    });
  });

  // ── role list ─────────────────────────────────────────────────────

  describe('role list', () => {
    it('should resolve app and GET roles', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { data: [fakeRole] } });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ app: APP_UUID }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.get).toHaveBeenCalledWith(`/api/admin/applications/${APP_UUID}/roles`);
      expect(printTable).toHaveBeenCalled();
    });

    it('should warn when no roles found', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { data: [] } });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ app: APP_UUID }));

      expect(warn).toHaveBeenCalledWith('No roles found');
    });
  });

  // ── role show ─────────────────────────────────────────────────────

  describe('role show', () => {
    it('should GET role details and permissions', async () => {
      mockClient.get
        .mockResolvedValueOnce({ status: 200, data: { data: fakeRole } })
        .mockResolvedValueOnce({ status: 200, data: { data: [fakePermission] } });

      const handlers = getHandlers();
      await handlers['show'](createArgv({ app: APP_UUID, 'role-id': fakeRole.id }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.get).toHaveBeenCalledWith(`/api/admin/applications/${APP_UUID}/roles/${fakeRole.id}`);
      expect(mockClient.get).toHaveBeenCalledWith(`/api/admin/applications/${APP_UUID}/roles/${fakeRole.id}/permissions`);
      expect(printTable).toHaveBeenCalled();
    });
  });

  // ── role update ───────────────────────────────────────────────────

  describe('role update', () => {
    it('should PUT role with updated fields', async () => {
      mockClient.put.mockResolvedValue({ status: 200, data: { data: { ...fakeRole, name: 'Super Admin' } } });

      const handlers = getHandlers();
      await handlers['update'](createArgv({ app: APP_UUID, 'role-id': fakeRole.id, name: 'Super Admin', description: 'Full access' }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/applications/${APP_UUID}/roles/${fakeRole.id}`,
        { name: 'Super Admin', description: 'Full access' },
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Super Admin'));
    });
  });

  // ── role delete ───────────────────────────────────────────────────

  describe('role delete', () => {
    it('should skip with dry-run', async () => {
      const handlers = getHandlers();
      await handlers['delete'](createArgv({ app: APP_UUID, 'role-id': fakeRole.id, 'dry-run': true }));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
      expect(mockClient.delete).not.toHaveBeenCalled();
    });

    it('should cancel when confirm rejects', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const handlers = getHandlers();
      await handlers['delete'](createArgv({ app: APP_UUID, 'role-id': fakeRole.id }));

      expect(warn).toHaveBeenCalledWith('Operation cancelled');
      expect(mockClient.delete).not.toHaveBeenCalled();
    });

    it('should DELETE role on confirmation', async () => {
      mockClient.delete.mockResolvedValue({ status: 204, data: {} });

      const handlers = getHandlers();
      await handlers['delete'](createArgv({ app: APP_UUID, 'role-id': fakeRole.id, force: true }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.delete).toHaveBeenCalledWith(`/api/admin/applications/${APP_UUID}/roles/${fakeRole.id}`);
      expect(success).toHaveBeenCalledWith(expect.stringContaining(fakeRole.id));
    });
  });

  // ── role assign-permissions ───────────────────────────────────────

  describe('role assign-permissions', () => {
    it('should PUT permission IDs to role', async () => {
      mockClient.put.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['assign-permissions'](createArgv({
        app: APP_UUID,
        'role-id': fakeRole.id,
        'permission-ids': `${fakePermission.id},ddd44444-4444-4444-4444-444444444444`,
      }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/applications/${APP_UUID}/roles/${fakeRole.id}/permissions`,
        { permissionIds: [fakePermission.id, 'ddd44444-4444-4444-4444-444444444444'] },
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('2 permission(s)'));
    });
  });

  // ── role remove-permissions ───────────────────────────────────────

  describe('role remove-permissions', () => {
    it('should cancel when confirm rejects', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const handlers = getHandlers();
      await handlers['remove-permissions'](createArgv({
        app: APP_UUID,
        'role-id': fakeRole.id,
        'permission-ids': fakePermission.id,
      }));

      expect(warn).toHaveBeenCalledWith('Operation cancelled');
      expect(mockClient.delete).not.toHaveBeenCalled();
    });

    it('should DELETE permissions on confirmation', async () => {
      mockClient.delete.mockResolvedValue({ status: 204, data: {} });

      const handlers = getHandlers();
      await handlers['remove-permissions'](createArgv({
        app: APP_UUID,
        'role-id': fakeRole.id,
        'permission-ids': fakePermission.id,
        force: true,
      }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.delete).toHaveBeenCalledWith(
        `/api/admin/applications/${APP_UUID}/roles/${fakeRole.id}/permissions`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('1 permission(s)'));
    });
  });

  // ── metadata ──────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should export command name "role"', () => {
      expect(appRoleCommand.command).toBe('role');
    });

    it('should have a describe string', () => {
      expect(appRoleCommand.describe).toBeDefined();
    });
  });
});
