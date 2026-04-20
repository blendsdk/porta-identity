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

import { appPermissionCommand } from '../../../../src/cli/commands/app-permission.js';
import { success, warn, outputResult, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const APP_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const fakeApp = { id: APP_UUID, name: 'BusinessSuite', slug: 'business-suite', status: 'active' };

const fakePerm = {
  id: 'ccc33333-3333-3333-3333-333333333333',
  name: 'Read Users',
  slug: 'crm:users:read',
  description: 'Can read user data',
  applicationId: APP_UUID,
  createdAt: '2026-04-10T00:00:00.000Z',
  updatedAt: '2026-04-11T00:00:00.000Z',
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
  (appPermissionCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI App Permission Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
    mockResolveApp.mockResolvedValue(fakeApp);
  });

  // ── permission create ─────────────────────────────────────────────

  describe('permission create', () => {
    it('should resolve app and POST to permissions endpoint', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakePerm } });

      const handlers = getHandlers();
      await handlers['create'](createArgv({
        app: APP_UUID,
        name: 'Read Users',
        slug: 'crm:users:read',
        description: 'Can read user data',
      }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.post).toHaveBeenCalledWith(`/api/admin/applications/${APP_UUID}/permissions`, {
        name: 'Read Users',
        slug: 'crm:users:read',
        description: 'Can read user data',
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Read Users'));
    });
  });

  // ── permission list ───────────────────────────────────────────────

  describe('permission list', () => {
    it('should resolve app and GET permissions', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { data: [fakePerm] } });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ app: APP_UUID }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.get).toHaveBeenCalledWith(`/api/admin/applications/${APP_UUID}/permissions`);
      expect(printTable).toHaveBeenCalled();
    });

    it('should warn when no permissions found', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { data: [] } });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ app: APP_UUID }));

      expect(warn).toHaveBeenCalledWith('No permissions found');
    });
  });

  // ── permission update ─────────────────────────────────────────────

  describe('permission update', () => {
    it('should PUT permission with updated fields', async () => {
      mockClient.put.mockResolvedValue({ status: 200, data: { data: { ...fakePerm, name: 'Write Users' } } });

      const handlers = getHandlers();
      await handlers['update'](createArgv({
        app: APP_UUID,
        'permission-id': fakePerm.id,
        name: 'Write Users',
        description: 'Can write user data',
      }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/applications/${APP_UUID}/permissions/${fakePerm.id}`,
        { name: 'Write Users', description: 'Can write user data' },
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Write Users'));
    });
  });

  // ── permission delete ─────────────────────────────────────────────

  describe('permission delete', () => {
    it('should skip with dry-run', async () => {
      const handlers = getHandlers();
      await handlers['delete'](createArgv({ app: APP_UUID, 'permission-id': fakePerm.id, 'dry-run': true }));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
      expect(mockClient.delete).not.toHaveBeenCalled();
    });

    it('should cancel when confirm rejects', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const handlers = getHandlers();
      await handlers['delete'](createArgv({ app: APP_UUID, 'permission-id': fakePerm.id }));

      expect(warn).toHaveBeenCalledWith('Operation cancelled');
      expect(mockClient.delete).not.toHaveBeenCalled();
    });

    it('should DELETE permission on confirmation', async () => {
      mockClient.delete.mockResolvedValue({ status: 204, data: {} });

      const handlers = getHandlers();
      await handlers['delete'](createArgv({ app: APP_UUID, 'permission-id': fakePerm.id, force: true }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.delete).toHaveBeenCalledWith(
        `/api/admin/applications/${APP_UUID}/permissions/${fakePerm.id}`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining(fakePerm.id));
    });
  });

  // ── metadata ──────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should export command name "permission"', () => {
      expect(appPermissionCommand.command).toBe('permission');
    });

    it('should have a describe string', () => {
      expect(appPermissionCommand.describe).toBeDefined();
    });
  });
});
