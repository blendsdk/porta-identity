/**
 * Tests for the org command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockOrganizations = {
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  suspend: vi.fn(),
  activate: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  destroy: vi.fn(),
  getHistory: vi.fn(),
};

const mockBranding = {
  updateSettings: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({
    organizations: mockOrganizations,
    branding: mockBranding,
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

vi.mock('../../src/parsers.js', () => ({
  parseLoginMethods: vi.fn((input: string) => input.split(',')),
}));

import { handleError } from '../../src/error-handler.js';
import { printTable, printJson, success, warn, error, info } from '../../src/output.js';
import { confirm, question } from '../../src/prompt.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const baseArgs = {
  json: false,
  verbose: false,
  insecure: false,
  force: false,
  server: undefined as string | undefined,
  _: ['org'],
  $0: 'porta',
};

const sampleOrg = {
  id: 'org-uuid-1234-5678-abcd',
  name: 'Acme Corp',
  slug: 'acme-corp',
  status: 'active',
  isSuperAdmin: false,
  defaultLocale: 'en',
  defaultLoginMethods: ['password', 'magic_link'],
  brandingLogoUrl: null,
  brandingFaviconUrl: null,
  brandingPrimaryColor: '#336699',
  brandingCompanyName: 'Acme',
  brandingCustomCss: null,
  twoFactorPolicy: 'optional',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('org command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // We need to import the command after mocks are set up
  async function getCommand() {
    const { orgCommand } = await import('../../src/commands/org.js');
    return orgCommand;
  }

  // Helper: invoke a subcommand handler through yargs builder
  async function invokeSubcommand(subcommand: string, extraArgs: Record<string, unknown> = {}) {
    const yargs = (await import('yargs')).default;
    const { hideBin } = await import('yargs/helpers');
    const cmd = await getCommand();

    // Build argv array
    const args = ['org', subcommand];
    for (const [key, value] of Object.entries(extraArgs)) {
      if (key.startsWith('_pos_')) continue; // positional handled below
      if (typeof value === 'boolean') {
        if (value) args.push(`--${key}`);
      } else {
        args.push(`--${key}`, String(value));
      }
    }
    // Add positionals
    if (extraArgs._pos_) args.splice(2, 0, String(extraArgs._pos_));

    try {
      await yargs(args)
        .command(cmd)
        .option('json', { type: 'boolean', default: false })
        .option('verbose', { type: 'boolean', default: false })
        .option('insecure', { type: 'boolean', default: false })
        .option('force', { type: 'boolean', default: false })
        .option('server', { type: 'string' })
        .fail(false)
        .parse();
    } catch {
      // yargs may throw on missing commands; we catch and check mocks
    }
  }

  describe('create', () => {
    it('creates an organization and shows table output', async () => {
      mockOrganizations.create.mockResolvedValue(sampleOrg);

      await invokeSubcommand('create', { name: 'Acme Corp' });

      expect(mockOrganizations.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Acme Corp' }),
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Acme Corp'));
      expect(printTable).toHaveBeenCalled();
    });

    it('creates an organization and outputs JSON', async () => {
      mockOrganizations.create.mockResolvedValue(sampleOrg);

      await invokeSubcommand('create', { name: 'Acme Corp', json: true });

      expect(printJson).toHaveBeenCalledWith(sampleOrg);
    });

    it('passes login-methods when provided', async () => {
      mockOrganizations.create.mockResolvedValue(sampleOrg);

      await invokeSubcommand('create', { name: 'Acme Corp', 'login-methods': 'password' });

      expect(mockOrganizations.create).toHaveBeenCalledWith(
        expect.objectContaining({ defaultLoginMethods: ['password'] }),
      );
    });

    it('handles create errors', async () => {
      mockOrganizations.create.mockRejectedValue(new Error('Validation failed'));

      await invokeSubcommand('create', { name: 'Bad Org' });

      expect(handleError).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('lists organizations in table format', async () => {
      mockOrganizations.list.mockResolvedValue({
        data: [sampleOrg],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      await invokeSubcommand('list', {});

      expect(mockOrganizations.list).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 20 }),
      );
      expect(printTable).toHaveBeenCalled();
      expect(info).toHaveBeenCalledWith('Total: 1 organizations');
    });

    it('lists organizations in JSON format', async () => {
      const result = { data: [sampleOrg], total: 1, page: 1, pageSize: 20 };
      mockOrganizations.list.mockResolvedValue(result);

      await invokeSubcommand('list', { json: true });

      expect(printJson).toHaveBeenCalledWith(result);
    });

    it('warns when no organizations found', async () => {
      mockOrganizations.list.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      await invokeSubcommand('list', {});

      expect(warn).toHaveBeenCalledWith('No organizations found');
    });

    it('passes status filter', async () => {
      mockOrganizations.list.mockResolvedValue({
        data: [sampleOrg],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      await invokeSubcommand('list', { status: 'active' });

      expect(mockOrganizations.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' }),
      );
    });
  });

  describe('show', () => {
    it('shows organization details', async () => {
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });

      await invokeSubcommand('show', { _pos_: 'acme-corp' });

      expect(mockOrganizations.get).toHaveBeenCalledWith('acme-corp');
      expect(printTable).toHaveBeenCalled();
    });

    it('shows organization in JSON format', async () => {
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });

      await invokeSubcommand('show', { _pos_: 'acme-corp', json: true });

      expect(printJson).toHaveBeenCalledWith(sampleOrg);
    });
  });

  describe('update', () => {
    it('updates organization with ETag', async () => {
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });
      mockOrganizations.update.mockResolvedValue({ ...sampleOrg, name: 'New Name' });

      await invokeSubcommand('update', { _pos_: 'acme-corp', name: 'New Name' });

      expect(mockOrganizations.update).toHaveBeenCalledWith(
        sampleOrg.id,
        expect.objectContaining({ name: 'New Name' }),
        '"v1"',
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('New Name'));
    });

    it('updates with login-methods', async () => {
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });
      mockOrganizations.update.mockResolvedValue(sampleOrg);

      await invokeSubcommand('update', { _pos_: 'acme-corp', 'login-methods': 'password,magic_link' });

      expect(mockOrganizations.update).toHaveBeenCalledWith(
        sampleOrg.id,
        expect.objectContaining({ defaultLoginMethods: ['password', 'magic_link'] }),
        '"v1"',
      );
    });
  });

  describe('suspend', () => {
    it('suspends organization after confirmation', async () => {
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });
      vi.mocked(confirm).mockResolvedValue(true);

      await invokeSubcommand('suspend', { _pos_: 'acme-corp' });

      expect(confirm).toHaveBeenCalled();
      expect(mockOrganizations.suspend).toHaveBeenCalledWith(sampleOrg.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('suspended'));
    });

    it('skips confirmation with --force', async () => {
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });

      await invokeSubcommand('suspend', { _pos_: 'acme-corp', force: true });

      expect(confirm).not.toHaveBeenCalled();
      expect(mockOrganizations.suspend).toHaveBeenCalledWith(sampleOrg.id);
    });

    it('cancels when user declines', async () => {
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });
      vi.mocked(confirm).mockResolvedValue(false);

      await invokeSubcommand('suspend', { _pos_: 'acme-corp' });

      expect(mockOrganizations.suspend).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });
  });

  describe('activate', () => {
    it('activates organization', async () => {
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });

      await invokeSubcommand('activate', { _pos_: 'acme-corp' });

      expect(mockOrganizations.activate).toHaveBeenCalledWith(sampleOrg.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('activated'));
    });
  });

  describe('archive', () => {
    it('archives organization after confirmation', async () => {
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });
      vi.mocked(confirm).mockResolvedValue(true);

      await invokeSubcommand('archive', { _pos_: 'acme-corp' });

      expect(confirm).toHaveBeenCalled();
      expect(mockOrganizations.archive).toHaveBeenCalledWith(sampleOrg.id);
    });

    it('skips confirmation with --force', async () => {
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });

      await invokeSubcommand('archive', { _pos_: 'acme-corp', force: true });

      expect(confirm).not.toHaveBeenCalled();
      expect(mockOrganizations.archive).toHaveBeenCalledWith(sampleOrg.id);
    });
  });

  describe('restore', () => {
    it('restores an archived organization', async () => {
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });

      await invokeSubcommand('restore', { _pos_: 'acme-corp' });

      expect(mockOrganizations.restore).toHaveBeenCalledWith(sampleOrg.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('restored'));
    });
  });

  describe('history', () => {
    it('shows change history in table format', async () => {
      const history = [
        {
          id: 'h1',
          entityType: 'organization',
          entityId: sampleOrg.id,
          action: 'created',
          changes: {},
          performedBy: 'admin@example.com',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];
      mockOrganizations.getHistory.mockResolvedValue(history);

      await invokeSubcommand('history', { _pos_: 'acme-corp' });

      expect(mockOrganizations.getHistory).toHaveBeenCalledWith('acme-corp');
      expect(printTable).toHaveBeenCalled();
    });

    it('shows history in JSON format', async () => {
      const history = [{
        id: 'h1',
        entityType: 'organization',
        entityId: sampleOrg.id,
        action: 'updated',
        changes: { name: { old: 'Old', new: 'New' } },
        performedBy: null,
        createdAt: '2024-01-02T00:00:00Z',
      }];
      mockOrganizations.getHistory.mockResolvedValue(history);

      await invokeSubcommand('history', { _pos_: 'acme-corp', json: true });

      expect(printJson).toHaveBeenCalledWith(history);
    });

    it('warns when no history found', async () => {
      mockOrganizations.getHistory.mockResolvedValue([]);

      await invokeSubcommand('history', { _pos_: 'acme-corp' });

      expect(warn).toHaveBeenCalledWith('No history entries found');
    });
  });

  describe('branding', () => {
    it('updates branding settings', async () => {
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });
      mockBranding.updateSettings.mockResolvedValue({
        brandingPrimaryColor: '#ff0000',
        brandingCompanyName: 'Acme Updated',
      });

      await invokeSubcommand('branding', {
        _pos_: 'acme-corp',
        'primary-color': '#ff0000',
        'company-name': 'Acme Updated',
      });

      expect(mockBranding.updateSettings).toHaveBeenCalledWith(
        sampleOrg.id,
        expect.objectContaining({
          brandingPrimaryColor: '#ff0000',
          brandingCompanyName: 'Acme Updated',
        }),
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Branding updated'));
    });
  });

  describe('destroy', () => {
    it('shows preview and destroys after type confirmation', async () => {
      mockOrganizations.destroy
        .mockResolvedValueOnce({ deleted: false, counts: { applications: 2, users: 5 } })
        .mockResolvedValueOnce({ deleted: true });
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });
      vi.mocked(question).mockResolvedValue('acme-corp');

      await invokeSubcommand('destroy', { _pos_: 'acme-corp' });

      // First call is dry-run
      expect(mockOrganizations.destroy).toHaveBeenCalledWith('acme-corp', { dryRun: true });
      // Type confirmation
      expect(question).toHaveBeenCalled();
      // Second call is actual destroy
      expect(mockOrganizations.destroy).toHaveBeenCalledWith('acme-corp');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('permanently destroyed'));
    });

    it('cancels when slug does not match', async () => {
      mockOrganizations.destroy.mockResolvedValue({ deleted: false, counts: {} });
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });
      vi.mocked(question).mockResolvedValue('wrong-slug');

      await invokeSubcommand('destroy', { _pos_: 'acme-corp' });

      expect(error).toHaveBeenCalledWith(expect.stringContaining('does not match'));
      // Only dry-run call, no actual destroy
      expect(mockOrganizations.destroy).toHaveBeenCalledTimes(1);
    });

    it('skips confirmation with --force', async () => {
      mockOrganizations.destroy
        .mockResolvedValueOnce({ deleted: false, counts: {} })
        .mockResolvedValueOnce({ deleted: true });
      mockOrganizations.get.mockResolvedValue({ data: sampleOrg, etag: '"v1"' });

      await invokeSubcommand('destroy', { _pos_: 'acme-corp', force: true });

      expect(question).not.toHaveBeenCalled();
      expect(mockOrganizations.destroy).toHaveBeenCalledTimes(2);
    });
  });
});
