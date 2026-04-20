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

// Mock app.js to provide resolveApp without loading the full app command chain
vi.mock('../../../../src/cli/commands/app.js', () => ({
  resolveApp: mockResolveApp,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { appModuleCommand } from '../../../../src/cli/commands/app-module.js';
import { success, warn, outputResult } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const APP_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const fakeApp = {
  id: APP_UUID,
  name: 'BusinessSuite',
  slug: 'business-suite',
  status: 'active',
};

const fakeModule = {
  id: 'aaa11111-1111-1111-1111-111111111111',
  name: 'Users Module',
  slug: 'users',
  description: 'User management module',
  status: 'active',
  applicationId: APP_UUID,
  createdAt: '2026-04-10T00:00:00.000Z',
  updatedAt: '2026-04-11T00:00:00.000Z',
};

function createArgv(
  overrides: Partial<GlobalOptions & Record<string, unknown>> = {},
): GlobalOptions & Record<string, unknown> {
  return { json: false, verbose: false, force: false, 'dry-run': false, ...overrides };
}

/**
 * Extract subcommand handlers from the appModuleCommand builder.
 */
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
  (appModuleCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI App Module Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
    mockResolveApp.mockResolvedValue(fakeApp);
  });

  // ── module create ─────────────────────────────────────────────────

  describe('module create', () => {
    it('should resolve app and POST to modules endpoint', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeModule } });

      const handlers = getHandlers();
      await handlers['create'](createArgv({ app: APP_UUID, name: 'Users Module', slug: 'users', description: 'User management module' }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.post).toHaveBeenCalledWith(`/api/admin/applications/${APP_UUID}/modules`, {
        name: 'Users Module',
        slug: 'users',
        description: 'User management module',
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Users Module'));
    });

    it('should resolve app by slug', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeModule } });

      const handlers = getHandlers();
      await handlers['create'](createArgv({ app: 'business-suite', name: 'Users Module' }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, 'business-suite');
    });
  });

  // ── module list ───────────────────────────────────────────────────

  describe('module list', () => {
    it('should resolve app and GET modules', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { data: [fakeModule] } });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ app: APP_UUID }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.get).toHaveBeenCalledWith(`/api/admin/applications/${APP_UUID}/modules`);
    });

    it('should warn when no modules found', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { data: [] } });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ app: APP_UUID }));

      expect(warn).toHaveBeenCalledWith('No modules found');
    });
  });

  // ── module update ─────────────────────────────────────────────────

  describe('module update', () => {
    it('should resolve app and PUT module', async () => {
      mockClient.put.mockResolvedValue({ status: 200, data: { data: { ...fakeModule, name: 'Updated Module' } } });

      const handlers = getHandlers();
      await handlers['update'](createArgv({
        app: APP_UUID,
        'module-id': fakeModule.id,
        name: 'Updated Module',
        description: 'New description',
      }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/applications/${APP_UUID}/modules/${fakeModule.id}`,
        { name: 'Updated Module', description: 'New description' },
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Updated Module'));
    });
  });

  // ── module deactivate ─────────────────────────────────────────────

  describe('module deactivate', () => {
    it('should skip with dry-run', async () => {
      const handlers = getHandlers();
      await handlers['deactivate'](createArgv({
        app: APP_UUID,
        'module-id': fakeModule.id,
        'dry-run': true,
      }));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('should cancel when confirm rejects', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const handlers = getHandlers();
      await handlers['deactivate'](createArgv({
        app: APP_UUID,
        'module-id': fakeModule.id,
      }));

      expect(warn).toHaveBeenCalledWith('Operation cancelled');
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('should POST deactivate endpoint on confirmation', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['deactivate'](createArgv({
        app: APP_UUID,
        'module-id': fakeModule.id,
        force: true,
      }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/applications/${APP_UUID}/modules/${fakeModule.id}/deactivate`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining(fakeModule.id));
    });
  });

  // ── metadata ──────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should export command name "module"', () => {
      expect(appModuleCommand.command).toBe('module');
    });

    it('should have a describe string', () => {
      expect(appModuleCommand.describe).toBeDefined();
    });
  });
});
