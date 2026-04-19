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

// Mock client service
// `resolveLoginMethods` is imported by the `client show` handler — it pairs the
// client override with the org default. We mirror the real helper's contract:
// null override → org.defaultLoginMethods; explicit array → returned as-is.
vi.mock('../../../../src/clients/index.js', () => ({
  createClient: vi.fn(),
  getClientById: vi.fn(),
  updateClient: vi.fn(),
  listClientsByApplication: vi.fn(),
  revokeClient: vi.fn(),
  generateSecret: vi.fn(),
  listSecretsByClient: vi.fn(),
  revokeSecret: vi.fn(),
  resolveLoginMethods: vi.fn(
    (org: { defaultLoginMethods: string[] }, client: { loginMethods: string[] | null }) =>
      client.loginMethods === null || client.loginMethods.length === 0
        ? org.defaultLoginMethods
        : client.loginMethods,
  ),
  ClientNotFoundError: class ClientNotFoundError extends Error {
    constructor(id: string) { super(`Client not found: ${id}`); this.name = 'ClientNotFoundError'; }
  },
}));

// Mock application service (for resolveAppId)
vi.mock('../../../../src/applications/index.js', () => ({
  getApplicationBySlug: vi.fn(),
  ApplicationNotFoundError: class ApplicationNotFoundError extends Error {
    constructor(id: string) { super(`Application not found: ${id}`); this.name = 'ApplicationNotFoundError'; }
  },
}));

// Mock organization service (used by `client show` to load the org for resolveLoginMethods)
vi.mock('../../../../src/organizations/index.js', () => ({
  getOrganizationById: vi.fn(),
}));

import { clientCommand } from '../../../../src/cli/commands/client.js';
import { success, warn, outputResult, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import {
  createClient,
  getClientById,
  updateClient,
  listClientsByApplication,
  revokeClient,
  generateSecret,
  listSecretsByClient,
  revokeSecret,
} from '../../../../src/clients/index.js';
import {
  getApplicationBySlug,
} from '../../../../src/applications/index.js';
import { getOrganizationById } from '../../../../src/organizations/index.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';


/** Fake client for test data */
const fakeClient = {
  id: 'd4e5f6a7-b8c9-0123-def0-123456789abc',
  organizationId: 'org-1',
  applicationId: 'app-1',
  clientId: 'porta_ci_abc123def456',
  clientName: 'My Web App',
  clientType: 'confidential' as const,
  applicationType: 'web' as const,
  redirectUris: ['https://example.com/callback'],
  postLogoutRedirectUris: [],
  grantTypes: ['authorization_code'],
  responseTypes: ['code'],
  scope: 'openid profile email',
  tokenEndpointAuthMethod: 'client_secret_basic',
  allowedOrigins: [],
  requirePkce: true,
  status: 'active' as const,
  loginMethods: null as ('password' | 'magic_link')[] | null,
  createdAt: new Date('2026-04-08'),
  updatedAt: new Date('2026-04-09'),
};

/** Fake org used by `client show` to resolve effective login methods. */
const fakeOrg = {
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  status: 'active' as const,
  isSuperAdmin: false,
  defaultLocale: 'en',
  defaultLoginMethods: ['password', 'magic_link'] as ('password' | 'magic_link')[],
  brandingLogoUrl: null,
  brandingFaviconUrl: null,
  brandingPrimaryColor: null,
  brandingCompanyName: null,
  brandingCustomCss: null,
  createdAt: new Date('2026-04-08'),
  updatedAt: new Date('2026-04-09'),
};


/** Fake app for resolveAppId */
const fakeApp = {
  id: 'app-1',
  organizationId: 'org-1',
  name: 'Test App',
  slug: 'test-app',
  description: null,
  status: 'active' as const,
  createdAt: new Date('2026-04-08'),
  updatedAt: new Date('2026-04-09'),
};

/** Fake secret for test data */
const fakeSecretPlaintext = {
  id: 'sec-1',
  clientId: fakeClient.id,
  label: 'production',
  plaintext: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo',
  expiresAt: null,
  createdAt: new Date('2026-04-09'),
};

/** Fake secret metadata (no plaintext) */
const fakeSecretMeta = {
  id: 'sec-1',
  clientId: fakeClient.id,
  label: 'production',
  status: 'active' as const,
  lastUsedAt: null,
  expiresAt: null,
  createdAt: new Date('2026-04-09'),
};

function createArgv(overrides: Partial<GlobalOptions & Record<string, unknown>> = {}): GlobalOptions & Record<string, unknown> {
  return { json: false, verbose: false, force: false, 'dry-run': false, ...overrides };
}

/**
 * Extract subcommand handlers from the client command builder.
 * Handles both simple commands and nested command groups (secret).
 */
function getHandlers() {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
  const nestedGroups: Record<string, Record<string, (args: Record<string, unknown>) => Promise<void>>> = {};

  const fakeYargs = {
    command: (cmd: string | object, _desc?: string, _builder?: unknown, handler?: unknown) => {
      if (typeof cmd === 'string') {
        const name = cmd.split(' ')[0];
        handlers[name] = handler as (args: Record<string, unknown>) => Promise<void>;
      } else if (typeof cmd === 'object' && 'command' in cmd) {
        // Nested command group (e.g., clientSecretCommand)
        const group = cmd as { command: string; builder: (y: typeof fakeYargs) => typeof fakeYargs };
        const groupName = group.command;
        const groupHandlers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
        const groupYargs = {
          command: (subcmd: string, _d?: string, _b?: unknown, h?: unknown) => {
            if (typeof subcmd === 'string') {
              const subName = subcmd.split(' ')[0];
              groupHandlers[subName] = h as (args: Record<string, unknown>) => Promise<void>;
            }
            return groupYargs;
          },
          option: () => groupYargs,
          positional: () => groupYargs,
          demandCommand: () => groupYargs,
        };
        group.builder(groupYargs as unknown as typeof fakeYargs);
        nestedGroups[groupName] = groupHandlers;
      }
      return fakeYargs;
    },
    option: () => fakeYargs,
    positional: () => fakeYargs,
    demandCommand: () => fakeYargs,
  };
  (clientCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return { handlers, nestedGroups };
}

describe('CLI Client Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock return values after clearAllMocks
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(getClientById).mockResolvedValue(fakeClient);
    vi.mocked(getApplicationBySlug).mockResolvedValue(fakeApp);
    vi.mocked(getOrganizationById).mockResolvedValue(fakeOrg);
  });


  // ─── client create ────────────────────────────────────────────────

  describe('client create', () => {
    it('should create a client and display success', async () => {
      vi.mocked(createClient).mockResolvedValue({ client: fakeClient, secret: null });

      const { handlers } = getHandlers();
      await handlers['create'](createArgv({
        org: 'org-1',
        app: 'test-app',
        type: 'confidential',
        'application-type': 'web',
        'redirect-uris': 'https://example.com/callback',
      }));

      expect(createClient).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: 'org-1',
        applicationId: 'app-1',
        clientType: 'confidential',
        redirectUris: ['https://example.com/callback'],
      }));
      expect(success).toHaveBeenCalledWith(expect.stringContaining('My Web App'));
    });

    it('should display one-time secret box for confidential clients', async () => {
      vi.mocked(createClient).mockResolvedValue({ client: fakeClient, secret: fakeSecretPlaintext });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { handlers } = getHandlers();
      await handlers['create'](createArgv({
        org: 'org-1',
        app: 'app-1',
        type: 'confidential',
        'application-type': 'web',
        'redirect-uris': 'https://example.com/callback',
      }));

      // Verify the one-time secret warning is shown
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('IMPORTANT'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Secret:'));

      consoleSpy.mockRestore();
    });

    it('should resolve app slug to ID', async () => {
      vi.mocked(createClient).mockResolvedValue({ client: fakeClient, secret: null });

      const { handlers } = getHandlers();
      await handlers['create'](createArgv({
        org: 'org-1',
        app: 'test-app',
        type: 'public',
        'application-type': 'spa',
        'redirect-uris': 'https://spa.example.com/callback',
      }));

      // resolveAppId calls getApplicationBySlug for non-UUID values
      expect(getApplicationBySlug).toHaveBeenCalledWith('test-app');
    });

    it('should forward an explicit --login-methods override on create', async () => {
      vi.mocked(createClient).mockResolvedValue({ client: fakeClient, secret: null });

      const { handlers } = getHandlers();
      await handlers['create'](createArgv({
        org: 'org-1',
        app: 'app-1',
        type: 'public',
        'application-type': 'spa',
        'redirect-uris': 'https://spa.example.com/callback',
        'login-methods': 'password',
      }));

      expect(createClient).toHaveBeenCalledWith(
        expect.objectContaining({ loginMethods: ['password'] }),
      );
    });

    it('should forward --login-methods inherit as null on create', async () => {
      vi.mocked(createClient).mockResolvedValue({ client: fakeClient, secret: null });

      const { handlers } = getHandlers();
      await handlers['create'](createArgv({
        org: 'org-1',
        app: 'app-1',
        type: 'public',
        'application-type': 'spa',
        'redirect-uris': 'https://spa.example.com/callback',
        'login-methods': 'inherit',
      }));

      expect(createClient).toHaveBeenCalledWith(
        expect.objectContaining({ loginMethods: null }),
      );
    });

    it('should omit loginMethods when --login-methods flag not provided on create', async () => {
      vi.mocked(createClient).mockResolvedValue({ client: fakeClient, secret: null });

      const { handlers } = getHandlers();
      await handlers['create'](createArgv({
        org: 'org-1',
        app: 'app-1',
        type: 'public',
        'application-type': 'spa',
        'redirect-uris': 'https://spa.example.com/callback',
      }));

      const callArg = vi.mocked(createClient).mock.calls[0][0];
      expect(callArg).not.toHaveProperty('loginMethods');
    });

    it('should reject unknown method on create', async () => {
      const { handlers } = getHandlers();
      await expect(
        handlers['create'](createArgv({
          org: 'org-1',
          app: 'app-1',
          type: 'public',
          'application-type': 'spa',
          'redirect-uris': 'https://spa.example.com/callback',
          'login-methods': 'foo',
        })),
      ).rejects.toThrow(/unknown method "foo"/);
      expect(createClient).not.toHaveBeenCalled();
    });
  });

  // ─── client list ──────────────────────────────────────────────────

  describe('client list', () => {
    it('should list clients in table format', async () => {
      vi.mocked(listClientsByApplication).mockResolvedValue({
        data: [fakeClient],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      const { handlers } = getHandlers();
      await handlers['list'](createArgv({ app: 'app-1', page: 1, 'page-size': 20 }));

      expect(listClientsByApplication).toHaveBeenCalledWith('app-1', {
        page: 1,
        pageSize: 20,
        status: undefined,
      });
      expect(outputResult).toHaveBeenCalled();
    });

    it('should warn when no clients found', async () => {
      vi.mocked(listClientsByApplication).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });

      const { handlers } = getHandlers();
      await handlers['list'](createArgv({ app: 'app-1', page: 1, 'page-size': 20 }));

      expect(warn).toHaveBeenCalledWith('No clients found');
    });

    it('should pass status filter when provided', async () => {
      vi.mocked(listClientsByApplication).mockResolvedValue({
        data: [fakeClient],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });

      const { handlers } = getHandlers();
      await handlers['list'](createArgv({ app: 'app-1', status: 'active', page: 1, 'page-size': 10 }));

      expect(listClientsByApplication).toHaveBeenCalledWith('app-1', {
        page: 1,
        pageSize: 10,
        status: 'active',
      });
    });
  });

  // ─── client show ──────────────────────────────────────────────────

  describe('client show', () => {
    it('should show client details', async () => {
      const { handlers } = getHandlers();
      await handlers['show'](createArgv({ 'client-id': fakeClient.id }));

      expect(getClientById).toHaveBeenCalledWith(fakeClient.id);
      expect(printTable).toHaveBeenCalled();
    });

    it('should throw NotFoundError when client not found', async () => {
      vi.mocked(getClientById).mockResolvedValue(null);

      const { handlers } = getHandlers();
      await expect(handlers['show'](createArgv({ 'client-id': 'nonexistent' }))).rejects.toThrow(
        'Client not found',
      );
    });

    it('should load the owning org and render effective login methods (inherit case)', async () => {
      // Client with `loginMethods: null` → effective methods come from the org default.
      vi.mocked(getClientById).mockResolvedValue({ ...fakeClient, loginMethods: null });

      const { handlers } = getHandlers();
      await handlers['show'](createArgv({ 'client-id': fakeClient.id, json: true }));

      expect(getOrganizationById).toHaveBeenCalledWith(fakeClient.organizationId);

      // Capture the JSON payload forwarded to outputResult and assert the merged field.
      const call = vi.mocked(outputResult).mock.calls[0];
      const payload = call[2] as { effectiveLoginMethods: string[]; loginMethods: string[] | null };
      expect(payload.loginMethods).toBeNull();
      expect(payload.effectiveLoginMethods).toEqual(['password', 'magic_link']);
    });

    it('should render explicit override for effective login methods', async () => {
      vi.mocked(getClientById).mockResolvedValue({
        ...fakeClient,
        loginMethods: ['password'],
      });

      const { handlers } = getHandlers();
      await handlers['show'](createArgv({ 'client-id': fakeClient.id, json: true }));

      const call = vi.mocked(outputResult).mock.calls[0];
      const payload = call[2] as { effectiveLoginMethods: string[]; loginMethods: string[] | null };
      expect(payload.loginMethods).toEqual(['password']);
      expect(payload.effectiveLoginMethods).toEqual(['password']);
    });
  });

  // ─── client update ────────────────────────────────────────────────

  describe('client update', () => {
    it('should update client name', async () => {
      vi.mocked(updateClient).mockResolvedValue({ ...fakeClient, clientName: 'New Name' });

      const { handlers } = getHandlers();
      await handlers['update'](createArgv({ 'client-id': fakeClient.id, name: 'New Name' }));

      expect(updateClient).toHaveBeenCalledWith(fakeClient.id, {
        clientName: 'New Name',
        redirectUris: undefined,
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('New Name'));
    });

    it('should update redirect URIs', async () => {
      vi.mocked(updateClient).mockResolvedValue(fakeClient);

      const { handlers } = getHandlers();
      await handlers['update'](createArgv({
        'client-id': fakeClient.id,
        'redirect-uris': 'https://new.example.com/callback,https://other.example.com/callback',
      }));

      expect(updateClient).toHaveBeenCalledWith(fakeClient.id, {
        clientName: undefined,
        redirectUris: ['https://new.example.com/callback', 'https://other.example.com/callback'],
      });
    });

    it('should forward an explicit --login-methods override on update', async () => {
      vi.mocked(updateClient).mockResolvedValue(fakeClient);

      const { handlers } = getHandlers();
      await handlers['update'](createArgv({
        'client-id': fakeClient.id,
        'login-methods': 'magic_link',
      }));

      expect(updateClient).toHaveBeenCalledWith(
        fakeClient.id,
        expect.objectContaining({ loginMethods: ['magic_link'] }),
      );
    });

    it('should forward --login-methods inherit as null on update', async () => {
      vi.mocked(updateClient).mockResolvedValue(fakeClient);

      const { handlers } = getHandlers();
      await handlers['update'](createArgv({
        'client-id': fakeClient.id,
        'login-methods': 'inherit',
      }));

      expect(updateClient).toHaveBeenCalledWith(
        fakeClient.id,
        expect.objectContaining({ loginMethods: null }),
      );
    });

    it('should omit loginMethods when --login-methods flag not provided on update', async () => {
      vi.mocked(updateClient).mockResolvedValue(fakeClient);

      const { handlers } = getHandlers();
      await handlers['update'](createArgv({
        'client-id': fakeClient.id,
        name: 'New',
      }));

      const callArg = vi.mocked(updateClient).mock.calls[0][1];
      expect(callArg).not.toHaveProperty('loginMethods');
    });

    it('should reject unknown method on update', async () => {
      const { handlers } = getHandlers();
      await expect(
        handlers['update'](createArgv({
          'client-id': fakeClient.id,
          'login-methods': 'oauth',
        })),
      ).rejects.toThrow(/unknown method "oauth"/);
      expect(updateClient).not.toHaveBeenCalled();
    });
  });

  // ─── client revoke ────────────────────────────────────────────────

  describe('client revoke', () => {
    it('should revoke client with confirmation', async () => {
      const { handlers } = getHandlers();
      await handlers['revoke'](createArgv({ 'client-id': fakeClient.id, force: true }));

      expect(revokeClient).toHaveBeenCalledWith(fakeClient.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('revoked'));
    });

    it('should cancel revoke when confirmation declined', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const { handlers } = getHandlers();
      await handlers['revoke'](createArgv({ 'client-id': fakeClient.id }));

      expect(revokeClient).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });

    it('should show dry-run message for revoke', async () => {
      const { handlers } = getHandlers();
      await handlers['revoke'](createArgv({ 'client-id': fakeClient.id, 'dry-run': true }));

      expect(revokeClient).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    });
  });

  // ─── client secret generate ───────────────────────────────────────

  describe('client secret generate', () => {
    it('should generate a secret and show one-time display', async () => {
      vi.mocked(generateSecret).mockResolvedValue(fakeSecretPlaintext);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { nestedGroups } = getHandlers();
      await nestedGroups['secret']['generate'](createArgv({
        'client-id': fakeClient.id,
        label: 'production',
      }));

      expect(generateSecret).toHaveBeenCalledWith(fakeClient.id, { label: 'production' });
      // One-time secret warning should be displayed
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('IMPORTANT'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Secret:'));

      consoleSpy.mockRestore();
    });
  });

  // ─── client secret list ───────────────────────────────────────────

  describe('client secret list', () => {
    it('should list secrets for a client', async () => {
      vi.mocked(listSecretsByClient).mockResolvedValue([fakeSecretMeta]);

      const { nestedGroups } = getHandlers();
      await nestedGroups['secret']['list'](createArgv({ 'client-id': fakeClient.id }));

      expect(listSecretsByClient).toHaveBeenCalledWith(fakeClient.id);
      expect(outputResult).toHaveBeenCalled();
    });

    it('should warn when no secrets found', async () => {
      vi.mocked(listSecretsByClient).mockResolvedValue([]);

      const { nestedGroups } = getHandlers();
      await nestedGroups['secret']['list'](createArgv({ 'client-id': fakeClient.id }));

      expect(warn).toHaveBeenCalledWith('No secrets found');
    });
  });

  // ─── client secret revoke ─────────────────────────────────────────

  describe('client secret revoke', () => {
    it('should revoke a secret with confirmation', async () => {
      const { nestedGroups } = getHandlers();
      await nestedGroups['secret']['revoke'](createArgv({ 'secret-id': 'sec-1', force: true }));

      expect(revokeSecret).toHaveBeenCalledWith('sec-1');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('revoked'));
    });

    it('should cancel secret revoke when declined', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const { nestedGroups } = getHandlers();
      await nestedGroups['secret']['revoke'](createArgv({ 'secret-id': 'sec-1' }));

      expect(revokeSecret).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });

    it('should show dry-run message for secret revoke', async () => {
      const { nestedGroups } = getHandlers();
      await nestedGroups['secret']['revoke'](createArgv({ 'secret-id': 'sec-1', 'dry-run': true }));

      expect(revokeSecret).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    });
  });

  // ─── command metadata ─────────────────────────────────────────────

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(clientCommand.command).toBe('client');
    });

    it('should have a description', () => {
      expect(clientCommand.describe).toBe('Manage OIDC clients');
    });
  });
});
