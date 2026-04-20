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

// Mock bootstrap — withHttpClient passes mockClient to the callback
vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withHttpClient: vi.fn().mockImplementation(
    async (_argv: unknown, fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
  ),
}));

// Mock error handler — run fn directly
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandling: vi.fn().mockImplementation(
    async (fn: () => Promise<void>) => fn(),
  ),
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

// Mock nested subcommand modules — they register their own commands but
// we only test them in their dedicated test files (app-module, app-role, etc.)
vi.mock('../../../../src/cli/commands/app-module.js', () => ({
  appModuleCommand: { command: 'module', describe: 'mock', builder: () => {}, handler: () => {} },
}));
vi.mock('../../../../src/cli/commands/app-role.js', () => ({
  appRoleCommand: { command: 'role', describe: 'mock', builder: () => {}, handler: () => {} },
}));
vi.mock('../../../../src/cli/commands/app-permission.js', () => ({
  appPermissionCommand: { command: 'permission', describe: 'mock', builder: () => {}, handler: () => {} },
}));
vi.mock('../../../../src/cli/commands/app-claim.js', () => ({
  appClaimCommand: { command: 'claim', describe: 'mock', builder: () => {}, handler: () => {} },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { appCommand } from '../../../../src/cli/commands/app.js';
import { success, warn, outputResult, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

/** Fake app data as returned by the Admin API (JSON-serialized — dates are strings) */
const fakeApp = {
  id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  name: 'BusinessSuite',
  slug: 'business-suite',
  description: 'Main business app',
  status: 'active',
  createdAt: '2026-04-08T00:00:00.000Z',
  updatedAt: '2026-04-09T00:00:00.000Z',
};

/** Helper to build minimal argv with sensible defaults */
function createArgv(
  overrides: Partial<GlobalOptions & Record<string, unknown>> = {},
): GlobalOptions & Record<string, unknown> {
  return { json: false, verbose: false, force: false, 'dry-run': false, ...overrides };
}

/**
 * Extract subcommand handlers from the app command builder.
 *
 * Simulates yargs command registration to collect handler functions.
 * Nested command groups (module, role, permission, claim) are registered
 * as CommandModule objects and handled by their own test files.
 */
function getHandlers() {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
  const fakeYargs = {
    command: (cmd: string | object, _desc?: string, _builder?: unknown, handler?: unknown) => {
      if (typeof cmd === 'string') {
        const name = cmd.split(' ')[0];
        handlers[name] = handler as (args: Record<string, unknown>) => Promise<void>;
      }
      // Skip objects (nested command modules) — tested separately
      return fakeYargs;
    },
    option: () => fakeYargs,
    positional: () => fakeYargs,
    demandCommand: () => fakeYargs,
  };
  (appCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI App Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock behaviors after clearAllMocks
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
    // Default: resolveApp calls return fakeApp (used by show/update/archive)
    mockClient.get.mockResolvedValue({ status: 200, data: { data: fakeApp } });
  });

  // ── app create ──────────────────────────────────────────────────────

  describe('app create', () => {
    it('should POST to /api/admin/applications and display success', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeApp } });

      const handlers = getHandlers();
      await handlers['create'](createArgv({ name: 'BusinessSuite' }));

      expect(mockClient.post).toHaveBeenCalledWith('/api/admin/applications', {
        name: 'BusinessSuite',
        slug: undefined,
        description: undefined,
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('BusinessSuite'));
    });

    it('should pass slug and description options when provided', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeApp } });

      const handlers = getHandlers();
      await handlers['create'](createArgv({
        name: 'BusinessSuite',
        slug: 'biz',
        description: 'My business app',
      }));

      expect(mockClient.post).toHaveBeenCalledWith('/api/admin/applications', {
        name: 'BusinessSuite',
        slug: 'biz',
        description: 'My business app',
      });
    });

    it('should output JSON when --json flag is set', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeApp } });
      vi.mocked(outputResult).mockImplementation(
        (isJson: boolean, _tableRenderer: () => void, jsonData: unknown) => {
          if (isJson) expect(jsonData).toEqual(fakeApp);
        },
      );

      const handlers = getHandlers();
      await handlers['create'](createArgv({ name: 'BusinessSuite', json: true }));

      expect(outputResult).toHaveBeenCalled();
    });
  });

  // ── app list ────────────────────────────────────────────────────────

  describe('app list', () => {
    it('should GET /api/admin/applications with query params', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { data: [fakeApp], total: 1, page: 1, pageSize: 20 },
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ page: 1, 'page-size': 20 }));

      expect(mockClient.get).toHaveBeenCalledWith('/api/admin/applications', {
        page: '1',
        pageSize: '20',
      });
      expect(outputResult).toHaveBeenCalled();
    });

    it('should warn when no applications found', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { data: [], total: 0, page: 1, pageSize: 20 },
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ page: 1, 'page-size': 20 }));

      expect(warn).toHaveBeenCalledWith('No applications found');
    });

    it('should pass status filter when provided', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { data: [fakeApp], total: 1, page: 1, pageSize: 20 },
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ status: 'active', page: 2, 'page-size': 10 }));

      expect(mockClient.get).toHaveBeenCalledWith('/api/admin/applications', {
        page: '2',
        pageSize: '10',
        status: 'active',
      });
    });
  });

  // ── app show ────────────────────────────────────────────────────────

  describe('app show', () => {
    it('should GET app details by id-or-slug', async () => {
      const handlers = getHandlers();
      await handlers['show'](createArgv({ 'id-or-slug': 'business-suite' }));

      expect(mockClient.get).toHaveBeenCalledWith('/api/admin/applications/business-suite');
      expect(printTable).toHaveBeenCalled();
    });

    it('should output JSON when --json flag is set', async () => {
      vi.mocked(outputResult).mockImplementation(
        (isJson: boolean, _tableRenderer: () => void, jsonData: unknown) => {
          if (isJson) expect(jsonData).toEqual(fakeApp);
        },
      );

      const handlers = getHandlers();
      await handlers['show'](createArgv({ 'id-or-slug': 'business-suite', json: true }));

      expect(outputResult).toHaveBeenCalled();
    });
  });

  // ── app update ──────────────────────────────────────────────────────

  describe('app update', () => {
    it('should resolve app then PUT update', async () => {
      const updated = { ...fakeApp, name: 'New Name' };
      mockClient.put.mockResolvedValue({ status: 200, data: { data: updated } });

      const handlers = getHandlers();
      await handlers['update'](createArgv({ 'id-or-slug': 'business-suite', name: 'New Name' }));

      // 1st: resolveApp
      expect(mockClient.get).toHaveBeenCalledWith('/api/admin/applications/business-suite');
      // 2nd: PUT update with resolved UUID
      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/applications/${fakeApp.id}`,
        { name: 'New Name', description: undefined },
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('New Name'));
    });

    it('should pass description option when provided', async () => {
      mockClient.put.mockResolvedValue({ status: 200, data: { data: fakeApp } });

      const handlers = getHandlers();
      await handlers['update'](createArgv({
        'id-or-slug': 'business-suite',
        description: 'Updated desc',
      }));

      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/applications/${fakeApp.id}`,
        { name: undefined, description: 'Updated desc' },
      );
    });
  });

  // ── app archive ─────────────────────────────────────────────────────

  describe('app archive', () => {
    it('should resolve app, confirm, then POST archive', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['archive'](createArgv({ 'id-or-slug': 'business-suite', force: true }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/applications/${fakeApp.id}/archive`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('archived'));
    });

    it('should cancel archive when confirmation declined', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const handlers = getHandlers();
      await handlers['archive'](createArgv({ 'id-or-slug': 'business-suite' }));

      expect(mockClient.post).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });

    it('should show dry-run message for archive', async () => {
      const handlers = getHandlers();
      await handlers['archive'](createArgv({ 'id-or-slug': 'business-suite', 'dry-run': true }));

      expect(mockClient.post).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    });
  });

  // ── command metadata ────────────────────────────────────────────────

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(appCommand.command).toBe('app');
    });

    it('should have a description', () => {
      expect(appCommand.describe).toBe('Manage applications');
    });
  });
});
