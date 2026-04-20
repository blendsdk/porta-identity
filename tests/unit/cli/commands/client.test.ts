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

// Mock nested client-secret subcommand — tested in its own file
vi.mock('../../../../src/cli/commands/client-secret.js', () => ({
  clientSecretCommand: { command: 'secret', describe: 'mock', builder: () => {}, handler: () => {} },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { clientCommand } from '../../../../src/cli/commands/client.js';
import { success, warn, outputResult, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

/** Fake client data as returned by the Admin API (JSON-serialized) */
const fakeClientData = {
  id: 'd4e5f6a7-b8c9-0123-def0-123456789abc',
  clientId: 'porta_ci_abc123def456',
  clientName: 'My Web App',
  clientType: 'confidential',
  applicationType: 'web',
  organizationId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  applicationId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  status: 'active',
  redirectUris: ['https://example.com/callback'],
  grantTypes: ['authorization_code'],
  scope: 'openid profile email',
  requirePkce: true,
  loginMethods: null as string[] | null,
  effectiveLoginMethods: ['password', 'magic_link'],
  createdAt: '2026-04-08T00:00:00.000Z',
  updatedAt: '2026-04-09T00:00:00.000Z',
};

/** Fake secret included in create response */
const fakeSecretData = {
  id: 'sec-1',
  clientId: fakeClientData.id,
  label: 'production',
  plaintext: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo',
  sha256Prefix: 'abc123',
  expiresAt: null,
  createdAt: '2026-04-09T00:00:00.000Z',
};

/** App UUID used in most tests (avoids slug resolution calls) */
const APP_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

/** Helper to build minimal argv with sensible defaults */
function createArgv(
  overrides: Partial<GlobalOptions & Record<string, unknown>> = {},
): GlobalOptions & Record<string, unknown> {
  return { json: false, verbose: false, force: false, 'dry-run': false, ...overrides };
}

/**
 * Extract subcommand handlers from the client command builder.
 * Nested command groups (secret) are handled by their own test file.
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
  (clientCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI Client Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
    // Default: GET client returns fakeClientData (used by show/revoke)
    mockClient.get.mockResolvedValue({ status: 200, data: { data: fakeClientData } });
  });

  // ── client create ───────────────────────────────────────────────────

  describe('client create', () => {
    it('should POST to /api/admin/clients and display success', async () => {
      mockClient.post.mockResolvedValue({
        status: 201,
        data: { data: { client: fakeClientData, secret: null } },
      });

      const handlers = getHandlers();
      await handlers['create'](createArgv({
        org: fakeClientData.organizationId,
        app: APP_UUID,
        type: 'confidential',
        'application-type': 'web',
        'redirect-uris': 'https://example.com/callback',
      }));

      expect(mockClient.post).toHaveBeenCalledWith('/api/admin/clients', {
        organizationId: fakeClientData.organizationId,
        applicationId: APP_UUID,
        clientName: 'Unnamed Client',
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: ['https://example.com/callback'],
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('My Web App'));
    });

    it('should display one-time secret for confidential clients', async () => {
      mockClient.post.mockResolvedValue({
        status: 201,
        data: { data: { client: fakeClientData, secret: fakeSecretData } },
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const handlers = getHandlers();
      await handlers['create'](createArgv({
        org: fakeClientData.organizationId,
        app: APP_UUID,
        type: 'confidential',
        'application-type': 'web',
        'redirect-uris': 'https://example.com/callback',
      }));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('IMPORTANT'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Secret:'));
      consoleSpy.mockRestore();
    });

    it('should resolve app slug via GET /api/admin/applications/:slug', async () => {
      // First GET: resolveAppId for slug → UUID
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { data: { id: APP_UUID } },
      });
      mockClient.post.mockResolvedValue({
        status: 201,
        data: { data: { client: fakeClientData, secret: null } },
      });

      const handlers = getHandlers();
      await handlers['create'](createArgv({
        org: fakeClientData.organizationId,
        app: 'test-app',
        type: 'public',
        'application-type': 'spa',
        'redirect-uris': 'https://spa.example.com/callback',
      }));

      // Verify slug was resolved via the API
      expect(mockClient.get).toHaveBeenCalledWith('/api/admin/applications/test-app');
      // And the resolved UUID was used in the POST body
      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/admin/clients',
        expect.objectContaining({ applicationId: APP_UUID }),
      );
    });

    it('should forward --login-methods override on create', async () => {
      mockClient.post.mockResolvedValue({
        status: 201,
        data: { data: { client: fakeClientData, secret: null } },
      });

      const handlers = getHandlers();
      await handlers['create'](createArgv({
        org: fakeClientData.organizationId,
        app: APP_UUID,
        type: 'public',
        'application-type': 'spa',
        'redirect-uris': 'https://spa.example.com/callback',
        'login-methods': 'password',
      }));

      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/admin/clients',
        expect.objectContaining({ loginMethods: ['password'] }),
      );
    });

    it('should forward --login-methods inherit as null on create', async () => {
      mockClient.post.mockResolvedValue({
        status: 201,
        data: { data: { client: fakeClientData, secret: null } },
      });

      const handlers = getHandlers();
      await handlers['create'](createArgv({
        org: fakeClientData.organizationId,
        app: APP_UUID,
        type: 'public',
        'application-type': 'spa',
        'redirect-uris': 'https://spa.example.com/callback',
        'login-methods': 'inherit',
      }));

      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/admin/clients',
        expect.objectContaining({ loginMethods: null }),
      );
    });

    it('should omit loginMethods when --login-methods not provided', async () => {
      mockClient.post.mockResolvedValue({
        status: 201,
        data: { data: { client: fakeClientData, secret: null } },
      });

      const handlers = getHandlers();
      await handlers['create'](createArgv({
        org: fakeClientData.organizationId,
        app: APP_UUID,
        type: 'public',
        'application-type': 'spa',
        'redirect-uris': 'https://spa.example.com/callback',
      }));

      const callBody = mockClient.post.mock.calls[0][1] as Record<string, unknown>;
      expect(callBody).not.toHaveProperty('loginMethods');
    });

    it('should reject unknown method on create', async () => {
      const handlers = getHandlers();
      await expect(
        handlers['create'](createArgv({
          org: fakeClientData.organizationId,
          app: APP_UUID,
          type: 'public',
          'application-type': 'spa',
          'redirect-uris': 'https://spa.example.com/callback',
          'login-methods': 'foo',
        })),
      ).rejects.toThrow(/unknown method "foo"/);
      expect(mockClient.post).not.toHaveBeenCalled();
    });
  });

  // ── client list ─────────────────────────────────────────────────────

  describe('client list', () => {
    it('should GET /api/admin/clients with query params', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { data: [fakeClientData], total: 1, page: 1, pageSize: 20 },
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ app: APP_UUID, page: 1, 'page-size': 20 }));

      expect(mockClient.get).toHaveBeenCalledWith('/api/admin/clients', {
        applicationId: APP_UUID,
        page: '1',
        pageSize: '20',
      });
      expect(outputResult).toHaveBeenCalled();
    });

    it('should warn when no clients found', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { data: [], total: 0, page: 1, pageSize: 20 },
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ app: APP_UUID, page: 1, 'page-size': 20 }));

      expect(warn).toHaveBeenCalledWith('No clients found');
    });

    it('should pass status filter when provided', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { data: [fakeClientData], total: 1, page: 1, pageSize: 10 },
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({
        app: APP_UUID,
        status: 'active',
        page: 1,
        'page-size': 10,
      }));

      expect(mockClient.get).toHaveBeenCalledWith('/api/admin/clients', {
        applicationId: APP_UUID,
        page: '1',
        pageSize: '10',
        status: 'active',
      });
    });

    it('should resolve app slug for list', async () => {
      // 1st GET: resolve app slug → UUID
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { data: { id: APP_UUID } },
      });
      // 2nd GET: client list
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { data: [fakeClientData], total: 1, page: 1, pageSize: 20 },
      });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ app: 'test-app', page: 1, 'page-size': 20 }));

      expect(mockClient.get).toHaveBeenCalledWith('/api/admin/applications/test-app');
      expect(mockClient.get).toHaveBeenCalledWith('/api/admin/clients', {
        applicationId: APP_UUID,
        page: '1',
        pageSize: '20',
      });
    });
  });

  // ── client show ─────────────────────────────────────────────────────

  describe('client show', () => {
    it('should GET client details by client-id', async () => {
      const handlers = getHandlers();
      await handlers['show'](createArgv({ 'client-id': fakeClientData.id }));

      expect(mockClient.get).toHaveBeenCalledWith(
        `/api/admin/clients/${fakeClientData.id}`,
      );
      expect(printTable).toHaveBeenCalled();
    });

    it('should render effectiveLoginMethods from API response', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: {
          data: {
            ...fakeClientData,
            loginMethods: null,
            effectiveLoginMethods: ['password', 'magic_link'],
          },
        },
      });

      vi.mocked(outputResult).mockImplementation(
        (isJson: boolean, _tableRenderer: () => void, jsonData: unknown) => {
          if (isJson) {
            const payload = jsonData as { loginMethods: null; effectiveLoginMethods: string[] };
            expect(payload.loginMethods).toBeNull();
            expect(payload.effectiveLoginMethods).toEqual(['password', 'magic_link']);
          }
        },
      );

      const handlers = getHandlers();
      await handlers['show'](createArgv({ 'client-id': fakeClientData.id, json: true }));

      expect(outputResult).toHaveBeenCalled();
    });

    it('should render explicit login methods override', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: {
          data: {
            ...fakeClientData,
            loginMethods: ['password'],
            effectiveLoginMethods: ['password'],
          },
        },
      });

      vi.mocked(outputResult).mockImplementation(
        (isJson: boolean, _tableRenderer: () => void, jsonData: unknown) => {
          if (isJson) {
            const payload = jsonData as { loginMethods: string[]; effectiveLoginMethods: string[] };
            expect(payload.loginMethods).toEqual(['password']);
            expect(payload.effectiveLoginMethods).toEqual(['password']);
          }
        },
      );

      const handlers = getHandlers();
      await handlers['show'](createArgv({ 'client-id': fakeClientData.id, json: true }));

      expect(outputResult).toHaveBeenCalled();
    });
  });

  // ── client update ───────────────────────────────────────────────────

  describe('client update', () => {
    it('should PUT update client name', async () => {
      const updated = { ...fakeClientData, clientName: 'New Name' };
      mockClient.put.mockResolvedValue({ status: 200, data: { data: updated } });

      const handlers = getHandlers();
      await handlers['update'](createArgv({ 'client-id': fakeClientData.id, name: 'New Name' }));

      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/clients/${fakeClientData.id}`,
        { clientName: 'New Name', redirectUris: undefined },
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('New Name'));
    });

    it('should update redirect URIs', async () => {
      mockClient.put.mockResolvedValue({ status: 200, data: { data: fakeClientData } });

      const handlers = getHandlers();
      await handlers['update'](createArgv({
        'client-id': fakeClientData.id,
        'redirect-uris': 'https://new.example.com/callback,https://other.example.com/callback',
      }));

      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/clients/${fakeClientData.id}`,
        {
          clientName: undefined,
          redirectUris: ['https://new.example.com/callback', 'https://other.example.com/callback'],
        },
      );
    });

    it('should forward --login-methods override on update', async () => {
      mockClient.put.mockResolvedValue({ status: 200, data: { data: fakeClientData } });

      const handlers = getHandlers();
      await handlers['update'](createArgv({
        'client-id': fakeClientData.id,
        'login-methods': 'magic_link',
      }));

      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/clients/${fakeClientData.id}`,
        expect.objectContaining({ loginMethods: ['magic_link'] }),
      );
    });

    it('should forward --login-methods inherit as null on update', async () => {
      mockClient.put.mockResolvedValue({ status: 200, data: { data: fakeClientData } });

      const handlers = getHandlers();
      await handlers['update'](createArgv({
        'client-id': fakeClientData.id,
        'login-methods': 'inherit',
      }));

      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/clients/${fakeClientData.id}`,
        expect.objectContaining({ loginMethods: null }),
      );
    });

    it('should omit loginMethods when --login-methods not provided', async () => {
      mockClient.put.mockResolvedValue({ status: 200, data: { data: fakeClientData } });

      const handlers = getHandlers();
      await handlers['update'](createArgv({
        'client-id': fakeClientData.id,
        name: 'New',
      }));

      const callBody = mockClient.put.mock.calls[0][1] as Record<string, unknown>;
      expect(callBody).not.toHaveProperty('loginMethods');
    });

    it('should reject unknown method on update', async () => {
      const handlers = getHandlers();
      await expect(
        handlers['update'](createArgv({
          'client-id': fakeClientData.id,
          'login-methods': 'oauth',
        })),
      ).rejects.toThrow(/unknown method "oauth"/);
      expect(mockClient.put).not.toHaveBeenCalled();
    });
  });

  // ── client revoke ───────────────────────────────────────────────────

  describe('client revoke', () => {
    it('should fetch client, confirm, then POST revoke', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['revoke'](createArgv({ 'client-id': fakeClientData.id, force: true }));

      // 1st: fetch client details
      expect(mockClient.get).toHaveBeenCalledWith(
        `/api/admin/clients/${fakeClientData.id}`,
      );
      // 2nd: POST revoke
      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/clients/${fakeClientData.id}/revoke`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('revoked'));
    });

    it('should cancel revoke when confirmation declined', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const handlers = getHandlers();
      await handlers['revoke'](createArgv({ 'client-id': fakeClientData.id }));

      expect(mockClient.post).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });

    it('should show dry-run message for revoke', async () => {
      const handlers = getHandlers();
      await handlers['revoke'](createArgv({ 'client-id': fakeClientData.id, 'dry-run': true }));

      expect(mockClient.post).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    });
  });

  // ── command metadata ────────────────────────────────────────────────

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(clientCommand.command).toBe('client');
    });

    it('should have a description', () => {
      expect(clientCommand.describe).toBe('Manage OIDC clients');
    });
  });
});
