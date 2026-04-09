import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bootstrap
vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withBootstrap: vi.fn().mockImplementation(async (_argv: unknown, fn: () => Promise<unknown>) => fn()),
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

// Mock organization service
vi.mock('../../../../src/organizations/index.js', () => ({
  createOrganization: vi.fn(),
  listOrganizations: vi.fn(),
  getOrganizationById: vi.fn(),
  getOrganizationBySlug: vi.fn(),
  updateOrganization: vi.fn(),
  updateOrganizationBranding: vi.fn(),
  suspendOrganization: vi.fn(),
  activateOrganization: vi.fn(),
  archiveOrganization: vi.fn(),
  OrganizationNotFoundError: class OrganizationNotFoundError extends Error {
    constructor(id: string) { super(`Organization not found: ${id}`); this.name = 'OrganizationNotFoundError'; }
  },
}));

import { orgCommand } from '../../../../src/cli/commands/org.js';
import { success, warn, outputResult, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import {
  createOrganization,
  listOrganizations,
  getOrganizationById,
  getOrganizationBySlug,
  updateOrganization,
  updateOrganizationBranding,
  suspendOrganization,
  activateOrganization,
  archiveOrganization,
} from '../../../../src/organizations/index.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

/** Fake org for test data */
const fakeOrg = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name: 'Acme Corp',
  slug: 'acme-corp',
  status: 'active' as const,
  isSuperAdmin: false,
  brandingLogoUrl: null,
  brandingFaviconUrl: null,
  brandingPrimaryColor: null,
  brandingCompanyName: null,
  brandingCustomCss: null,
  defaultLocale: 'en',
  createdAt: new Date('2026-04-08'),
  updatedAt: new Date('2026-04-09'),
};

function createArgv(overrides: Partial<GlobalOptions & Record<string, unknown>> = {}): GlobalOptions & Record<string, unknown> {
  return { json: false, verbose: false, force: false, 'dry-run': false, ...overrides };
}

/**
 * Extract subcommand handlers from the org command builder.
 * Simulates yargs command registration to collect handler functions.
 */
function getHandlers() {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
  const fakeYargs = {
    command: (cmd: string | object, _desc?: string, _builder?: unknown, handler?: unknown) => {
      if (typeof cmd === 'string') {
        // Strip positional arg syntax to get clean command name (e.g., "show <id-or-slug>" → "show")
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

describe('CLI Org Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock return values after clearAllMocks
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(getOrganizationById).mockResolvedValue(fakeOrg);
    vi.mocked(getOrganizationBySlug).mockResolvedValue(fakeOrg);
  });

  describe('org create', () => {
    it('should create an organization and display success', async () => {
      vi.mocked(createOrganization).mockResolvedValue(fakeOrg);

      const handlers = getHandlers();
      await handlers['create'](createArgv({ name: 'Acme Corp' }));

      expect(createOrganization).toHaveBeenCalledWith({
        name: 'Acme Corp',
        slug: undefined,
        defaultLocale: undefined,
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Acme Corp'));
    });

    it('should pass slug and locale options when provided', async () => {
      vi.mocked(createOrganization).mockResolvedValue(fakeOrg);

      const handlers = getHandlers();
      await handlers['create'](createArgv({ name: 'Acme Corp', slug: 'acme', locale: 'fr' }));

      expect(createOrganization).toHaveBeenCalledWith({
        name: 'Acme Corp',
        slug: 'acme',
        defaultLocale: 'fr',
      });
    });

    it('should output JSON when --json flag is set', async () => {
      vi.mocked(createOrganization).mockResolvedValue(fakeOrg);
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

  describe('org list', () => {
    it('should list organizations in table format', async () => {
      vi.mocked(listOrganizations).mockResolvedValue({
        data: [fakeOrg],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ page: 1, 'page-size': 20 }));

      expect(listOrganizations).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        status: undefined,
      });
      expect(outputResult).toHaveBeenCalled();
    });

    it('should warn when no organizations found', async () => {
      vi.mocked(listOrganizations).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ page: 1, 'page-size': 20 }));

      expect(warn).toHaveBeenCalledWith('No organizations found');
    });

    it('should pass status filter when provided', async () => {
      vi.mocked(listOrganizations).mockResolvedValue({
        data: [fakeOrg],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ status: 'active', page: 2, 'page-size': 10 }));

      expect(listOrganizations).toHaveBeenCalledWith({
        page: 2,
        pageSize: 10,
        status: 'active',
      });
    });
  });

  describe('org show', () => {
    it('should show org details by UUID', async () => {
      vi.mocked(getOrganizationById).mockResolvedValue(fakeOrg);

      const handlers = getHandlers();
      await handlers['show'](createArgv({ 'id-or-slug': fakeOrg.id }));

      expect(getOrganizationById).toHaveBeenCalledWith(fakeOrg.id);
      expect(printTable).toHaveBeenCalled();
    });

    it('should show org details by slug', async () => {
      vi.mocked(getOrganizationBySlug).mockResolvedValue(fakeOrg);

      const handlers = getHandlers();
      await handlers['show'](createArgv({ 'id-or-slug': 'acme-corp' }));

      expect(getOrganizationBySlug).toHaveBeenCalledWith('acme-corp');
    });

    it('should throw NotFoundError when org not found', async () => {
      vi.mocked(getOrganizationBySlug).mockResolvedValue(null);

      const handlers = getHandlers();
      await expect(handlers['show'](createArgv({ 'id-or-slug': 'nonexistent' }))).rejects.toThrow(
        'Organization not found',
      );
    });
  });

  describe('org update', () => {
    it('should update org name', async () => {
      vi.mocked(updateOrganization).mockResolvedValue({ ...fakeOrg, name: 'New Name' });

      const handlers = getHandlers();
      await handlers['update'](createArgv({ 'id-or-slug': 'acme-corp', name: 'New Name' }));

      expect(updateOrganization).toHaveBeenCalledWith(fakeOrg.id, {
        name: 'New Name',
        defaultLocale: undefined,
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('New Name'));
    });
  });

  describe('org suspend', () => {
    it('should suspend org with confirmation', async () => {
      const handlers = getHandlers();
      await handlers['suspend'](createArgv({ 'id-or-slug': 'acme-corp', force: true }));

      expect(suspendOrganization).toHaveBeenCalledWith(fakeOrg.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('suspended'));
    });

    it('should cancel suspend when confirmation declined', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const handlers = getHandlers();
      await handlers['suspend'](createArgv({ 'id-or-slug': 'acme-corp' }));

      expect(suspendOrganization).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });

    it('should show dry-run message for suspend', async () => {
      const handlers = getHandlers();
      await handlers['suspend'](createArgv({ 'id-or-slug': 'acme-corp', 'dry-run': true }));

      expect(suspendOrganization).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    });
  });

  describe('org activate', () => {
    it('should activate a suspended org', async () => {
      const handlers = getHandlers();
      await handlers['activate'](createArgv({ 'id-or-slug': 'acme-corp' }));

      expect(activateOrganization).toHaveBeenCalledWith(fakeOrg.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('activated'));
    });
  });

  describe('org archive', () => {
    it('should archive org with confirmation', async () => {
      const handlers = getHandlers();
      await handlers['archive'](createArgv({ 'id-or-slug': 'acme-corp', force: true }));

      expect(archiveOrganization).toHaveBeenCalledWith(fakeOrg.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('archived'));
    });

    it('should show dry-run message for archive', async () => {
      const handlers = getHandlers();
      await handlers['archive'](createArgv({ 'id-or-slug': 'acme-corp', 'dry-run': true }));

      expect(archiveOrganization).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    });
  });

  describe('org branding', () => {
    it('should update branding options', async () => {
      vi.mocked(updateOrganizationBranding).mockResolvedValue({ ...fakeOrg, brandingPrimaryColor: '#ff0000' });

      const handlers = getHandlers();
      await handlers['branding'](createArgv({
        'id-or-slug': 'acme-corp',
        'logo-url': 'https://example.com/logo.png',
        'primary-color': '#ff0000',
      }));

      expect(updateOrganizationBranding).toHaveBeenCalledWith(fakeOrg.id, {
        logoUrl: 'https://example.com/logo.png',
        faviconUrl: undefined,
        primaryColor: '#ff0000',
        companyName: undefined,
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Branding updated'));
    });
  });

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(orgCommand.command).toBe('org');
    });

    it('should have a description', () => {
      expect(orgCommand.describe).toBe('Manage organizations');
    });
  });
});
