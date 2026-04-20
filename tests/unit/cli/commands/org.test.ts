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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { orgCommand } from '../../../../src/cli/commands/org.js';
import { success, warn, outputResult, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

/** Fake org data as returned by the Admin API (JSON-serialized — dates are strings) */
const fakeOrg = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name: 'Acme Corp',
  slug: 'acme-corp',
  status: 'active',
  isSuperAdmin: false,
  defaultLocale: 'en',
  defaultLoginMethods: ['password', 'magic_link'],
  brandingLogoUrl: null,
  brandingFaviconUrl: null,
  brandingPrimaryColor: null,
  brandingCompanyName: null,
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
 * Extract subcommand handlers from the org command builder.
 *
 * Simulates yargs command registration to collect handler functions.
 * Strips positional arg syntax from command names (e.g., "show <id-or-slug>" → "show").
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
  (orgCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI Org Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock behaviors after clearAllMocks
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
    // Default: resolveOrg calls return fakeOrg (used by show/update/suspend/…)
    mockClient.get.mockResolvedValue({ status: 200, data: { data: fakeOrg } });
  });

  // ── org create ──────────────────────────────────────────────────────

  describe('org create', () => {
    it('should POST to /api/admin/organizations and display success', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeOrg } });

      const handlers = getHandlers();
      await handlers['create'](createArgv({ name: 'Acme Corp' }));

      expect(mockClient.post).toHaveBeenCalledWith('/api/admin/organizations', {
        name: 'Acme Corp',
        slug: undefined,
        defaultLocale: undefined,
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Acme Corp'));
    });

    it('should forward --login-methods as defaultLoginMethods on create', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeOrg } });

      const handlers = getHandlers();
      await handlers['create'](createArgv({ name: 'Acme Corp', 'login-methods': 'password' }));

      expect(mockClient.post).toHaveBeenCalledWith('/api/admin/organizations', {
        name: 'Acme Corp',
        slug: undefined,
        defaultLocale: undefined,
        defaultLoginMethods: ['password'],
      });
    });

    it('should parse a comma-separated --login-methods list on create', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeOrg } });

      const handlers = getHandlers();
      await handlers['create'](
        createArgv({ name: 'Acme Corp', 'login-methods': 'password,magic_link' }),
      );

      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/admin/organizations',
        expect.objectContaining({ defaultLoginMethods: ['password', 'magic_link'] }),
      );
    });

    it('should omit defaultLoginMethods when --login-methods not provided', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeOrg } });

      const handlers = getHandlers();
      await handlers['create'](createArgv({ name: 'Acme Corp' }));

      // Verify the POST body does NOT include the field at all
      const callBody = mockClient.post.mock.calls[0][1] as Record<string, unknown>;
      expect(callBody).not.toHaveProperty('defaultLoginMethods');
    });

    it('should reject --login-methods inherit on org create', async () => {
      const handlers = getHandlers();
      await expect(
        handlers['create'](createArgv({ name: 'Acme Corp', 'login-methods': 'inherit' })),
      ).rejects.toThrow(/only valid on client commands/);
      // No HTTP call should have been made
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('should reject an unknown method on org create', async () => {
      const handlers = getHandlers();
      await expect(
        handlers['create'](createArgv({ name: 'Acme Corp', 'login-methods': 'sso' })),
      ).rejects.toThrow(/unknown method "sso"/);
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('should reject an empty --login-methods on org create', async () => {
      const handlers = getHandlers();
      await expect(
        handlers['create'](createArgv({ name: 'Acme Corp', 'login-methods': '' })),
      ).rejects.toThrow(/must not be empty/);
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('should pass slug and locale options when provided', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeOrg } });

      const handlers = getHandlers();
      await handlers['create'](createArgv({ name: 'Acme Corp', slug: 'acme', locale: 'fr' }));

      expect(mockClient.post).toHaveBeenCalledWith('/api/admin/organizations', {
        name: 'Acme Corp',
        slug: 'acme',
        defaultLocale: 'fr',
      });
    });

    it('should output JSON when --json flag is set', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeOrg } });
      vi.mocked(outputResult).mockImplementation(
        (isJson: boolean, _tableRenderer: () => void, jsonData: unknown) => {
          if (isJson) expect(jsonData).toEqual(fakeOrg);
        },
      );

      const handlers = getHandlers();
      await handlers['create'](createArgv({ name: 'Acme Corp', json: true }));

      expect(outputResult).toHaveBeenCalled();
    });
  });

  // ── org list ────────────────────────────────────────────────────────

  describe('org list', () => {
    it('should GET /api/admin/organizations with query params', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { data: [fakeOrg], total: 1, page: 1, pageSize: 20 },
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ page: 1, 'page-size': 20 }));

      expect(mockClient.get).toHaveBeenCalledWith('/api/admin/organizations', {
        page: '1',
        pageSize: '20',
      });
      expect(outputResult).toHaveBeenCalled();
    });

    it('should warn when no organizations found', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { data: [], total: 0, page: 1, pageSize: 20 },
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ page: 1, 'page-size': 20 }));

      expect(warn).toHaveBeenCalledWith('No organizations found');
    });

    it('should pass status filter when provided', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { data: [fakeOrg], total: 1, page: 1, pageSize: 20 },
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ status: 'active', page: 2, 'page-size': 10 }));

      expect(mockClient.get).toHaveBeenCalledWith('/api/admin/organizations', {
        page: '2',
        pageSize: '10',
        status: 'active',
      });
    });
  });

  // ── org show ────────────────────────────────────────────────────────

  describe('org show', () => {
    it('should GET org details by id-or-slug', async () => {
      const handlers = getHandlers();
      await handlers['show'](createArgv({ 'id-or-slug': 'acme-corp' }));

      // resolveOrg calls GET with encoded id-or-slug
      expect(mockClient.get).toHaveBeenCalledWith('/api/admin/organizations/acme-corp');
      expect(printTable).toHaveBeenCalled();
    });

    it('should encode the id-or-slug in the URL', async () => {
      const handlers = getHandlers();
      await handlers['show'](createArgv({ 'id-or-slug': fakeOrg.id }));

      expect(mockClient.get).toHaveBeenCalledWith(
        `/api/admin/organizations/${fakeOrg.id}`,
      );
    });

    it('should output JSON when --json flag is set', async () => {
      vi.mocked(outputResult).mockImplementation(
        (isJson: boolean, _tableRenderer: () => void, jsonData: unknown) => {
          if (isJson) expect(jsonData).toEqual(fakeOrg);
        },
      );

      const handlers = getHandlers();
      await handlers['show'](createArgv({ 'id-or-slug': 'acme-corp', json: true }));

      expect(outputResult).toHaveBeenCalled();
    });
  });

  // ── org update ──────────────────────────────────────────────────────

  describe('org update', () => {
    it('should resolve org then PUT update', async () => {
      const updated = { ...fakeOrg, name: 'New Name' };
      mockClient.put.mockResolvedValue({ status: 200, data: { data: updated } });

      const handlers = getHandlers();
      await handlers['update'](createArgv({ 'id-or-slug': 'acme-corp', name: 'New Name' }));

      // 1st HTTP call: resolveOrg (GET)
      expect(mockClient.get).toHaveBeenCalledWith('/api/admin/organizations/acme-corp');
      // 2nd HTTP call: update (PUT) using the resolved UUID
      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/organizations/${fakeOrg.id}`,
        { name: 'New Name', defaultLocale: undefined },
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('New Name'));
    });

    it('should forward --login-methods as defaultLoginMethods on update', async () => {
      mockClient.put.mockResolvedValue({ status: 200, data: { data: fakeOrg } });

      const handlers = getHandlers();
      await handlers['update'](
        createArgv({ 'id-or-slug': 'acme-corp', 'login-methods': 'magic_link' }),
      );

      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/organizations/${fakeOrg.id}`,
        { name: undefined, defaultLocale: undefined, defaultLoginMethods: ['magic_link'] },
      );
    });

    it('should omit defaultLoginMethods on update when flag not provided', async () => {
      mockClient.put.mockResolvedValue({ status: 200, data: { data: fakeOrg } });

      const handlers = getHandlers();
      await handlers['update'](createArgv({ 'id-or-slug': 'acme-corp', name: 'New' }));

      const callBody = mockClient.put.mock.calls[0][1] as Record<string, unknown>;
      expect(callBody).not.toHaveProperty('defaultLoginMethods');
    });

    it('should reject --login-methods inherit on org update', async () => {
      const handlers = getHandlers();
      await expect(
        handlers['update'](
          createArgv({ 'id-or-slug': 'acme-corp', 'login-methods': 'inherit' }),
        ),
      ).rejects.toThrow(/only valid on client commands/);
      expect(mockClient.put).not.toHaveBeenCalled();
    });
  });

  // ── org suspend ─────────────────────────────────────────────────────

  describe('org suspend', () => {
    it('should resolve org, confirm, then POST suspend', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['suspend'](createArgv({ 'id-or-slug': 'acme-corp', force: true }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/organizations/${fakeOrg.id}/suspend`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('suspended'));
    });

    it('should cancel suspend when confirmation declined', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const handlers = getHandlers();
      await handlers['suspend'](createArgv({ 'id-or-slug': 'acme-corp' }));

      expect(mockClient.post).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });

    it('should show dry-run message for suspend', async () => {
      const handlers = getHandlers();
      await handlers['suspend'](createArgv({ 'id-or-slug': 'acme-corp', 'dry-run': true }));

      expect(mockClient.post).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    });
  });

  // ── org activate ────────────────────────────────────────────────────

  describe('org activate', () => {
    it('should resolve org then POST activate', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['activate'](createArgv({ 'id-or-slug': 'acme-corp' }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/organizations/${fakeOrg.id}/activate`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('activated'));
    });
  });

  // ── org archive ─────────────────────────────────────────────────────

  describe('org archive', () => {
    it('should resolve org, confirm, then POST archive', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['archive'](createArgv({ 'id-or-slug': 'acme-corp', force: true }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/organizations/${fakeOrg.id}/archive`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('archived'));
    });

    it('should show dry-run message for archive', async () => {
      const handlers = getHandlers();
      await handlers['archive'](createArgv({ 'id-or-slug': 'acme-corp', 'dry-run': true }));

      expect(mockClient.post).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    });
  });

  // ── org branding ────────────────────────────────────────────────────

  describe('org branding', () => {
    it('should resolve org then PUT branding', async () => {
      const branded = { ...fakeOrg, brandingPrimaryColor: '#ff0000' };
      mockClient.put.mockResolvedValue({ status: 200, data: { data: branded } });

      const handlers = getHandlers();
      await handlers['branding'](createArgv({
        'id-or-slug': 'acme-corp',
        'logo-url': 'https://example.com/logo.png',
        'primary-color': '#ff0000',
      }));

      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/organizations/${fakeOrg.id}/branding`,
        {
          logoUrl: 'https://example.com/logo.png',
          faviconUrl: undefined,
          primaryColor: '#ff0000',
          companyName: undefined,
        },
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Branding updated'));
    });
  });

  // ── command metadata ────────────────────────────────────────────────

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(orgCommand.command).toBe('org');
    });

    it('should have a description', () => {
      expect(orgCommand.describe).toBe('Manage organizations');
    });
  });
});
