/**
 * Tests for the client and client-secret commands.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockClients = {
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  revoke: vi.fn(),
  restore: vi.fn(),
  getHistory: vi.fn(),
  listSecrets: vi.fn(),
  generateSecret: vi.fn(),
  revokeSecret: vi.fn(),
};

const mockApplications = {
  get: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({
    clients: mockClients,
    applications: mockApplications,
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
  parseLoginMethodsFlag: vi.fn((value: string | undefined, _allowInherit: boolean) => {
    if (value === undefined) return undefined;
    if (value === 'inherit') return null;
    return value.split(',');
  }),
  parseCommaSeparated: vi.fn((input: string) => input.split(',').map((s: string) => s.trim())),
  parseLoginMethods: vi.fn((input: string) => input.split(',')),
}));

import { handleError } from '../../src/error-handler.js';
import { printTable, printJson, success, warn, info } from '../../src/output.js';
import { confirm } from '../../src/prompt.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const sampleClient = {
  id: 'client-uuid-1234-5678-abcd',
  applicationId: 'app-uuid-1234',
  clientId: 'porta_abc123def456',
  name: 'My Web App',
  description: null,
  clientType: 'confidential' as const,
  status: 'active' as const,
  redirectUris: ['https://example.com/callback'],
  postLogoutRedirectUris: [],
  grantTypes: ['authorization_code' as const, 'refresh_token' as const],
  responseTypes: ['code' as const],
  tokenEndpointAuthMethod: 'client_secret_post',
  loginMethods: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

const sampleSecret = {
  id: 'secret-uuid-1234',
  clientId: 'client-uuid-1234-5678-abcd',
  secret: 'super-secret-value-that-should-be-copied',
  label: 'production',
  expiresAt: null,
  createdAt: '2024-01-01T00:00:00Z',
};

const sampleSecretListItem = {
  id: 'secret-uuid-1234',
  clientId: 'client-uuid-1234-5678-abcd',
  label: 'production',
  lastUsedAt: '2024-06-01T00:00:00Z',
  expiresAt: null,
  createdAt: '2024-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('client command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper: invoke a subcommand handler through yargs builder
  async function invokeSubcommand(subcommand: string, extraArgs: Record<string, unknown> = {}) {
    const yargs = (await import('yargs')).default;
    const { clientCommand } = await import('../../src/commands/client.js');

    // Build argv array
    const args = ['client', ...subcommand.split(' ')];
    for (const [key, value] of Object.entries(extraArgs)) {
      if (key.startsWith('_pos_')) continue;
      if (typeof value === 'boolean') {
        if (value) args.push(`--${key}`);
      } else {
        args.push(`--${key}`, String(value));
      }
    }
    // Add positionals
    if (extraArgs._pos_) {
      const posValues = Array.isArray(extraArgs._pos_)
        ? extraArgs._pos_.map(String)
        : [String(extraArgs._pos_)];
      // Insert positionals after the subcommand parts
      const cmdParts = subcommand.split(' ').length;
      args.splice(1 + cmdParts, 0, ...posValues);
    }

    try {
      await yargs(args)
        .command(clientCommand)
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

  // =========================================================================
  // client create
  // =========================================================================

  describe('create', () => {
    it('creates a client and shows table output', async () => {
      mockClients.create.mockResolvedValue(sampleClient);

      await invokeSubcommand('create', {
        org: 'org-uuid',
        app: 'a1234567-1234-1234-1234-123456789abc',
        type: 'confidential',
        'redirect-uris': 'https://example.com/callback',
      });

      expect(mockClients.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Unnamed Client',
          clientType: 'confidential',
          redirectUris: ['https://example.com/callback'],
        }),
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('My Web App'));
      expect(printTable).toHaveBeenCalled();
    });

    it('creates a client and outputs JSON', async () => {
      mockClients.create.mockResolvedValue(sampleClient);

      await invokeSubcommand('create', {
        org: 'org-uuid',
        app: 'a1234567-1234-1234-1234-123456789abc',
        type: 'public',
        'redirect-uris': 'https://example.com/callback',
        name: 'My Public App',
        json: true,
      });

      expect(printJson).toHaveBeenCalledWith(sampleClient);
    });

    it('resolves app slug to UUID when not a UUID', async () => {
      mockApplications.get.mockResolvedValue({ data: { id: 'resolved-app-uuid' } });
      mockClients.create.mockResolvedValue(sampleClient);

      await invokeSubcommand('create', {
        org: 'org-uuid',
        app: 'my-app-slug',
        type: 'confidential',
        'redirect-uris': 'https://example.com/callback',
      });

      expect(mockApplications.get).toHaveBeenCalledWith('my-app-slug');
      expect(mockClients.create).toHaveBeenCalledWith(
        expect.objectContaining({ applicationId: 'resolved-app-uuid' }),
      );
    });

    it('passes login-methods when provided', async () => {
      mockClients.create.mockResolvedValue(sampleClient);

      await invokeSubcommand('create', {
        org: 'org-uuid',
        app: 'app-uuid-1234-5678-abcd-1234-567890ab',
        type: 'confidential',
        'redirect-uris': 'https://example.com/callback',
        'login-methods': 'password',
      });

      expect(mockClients.create).toHaveBeenCalledWith(
        expect.objectContaining({ loginMethods: ['password'] }),
      );
    });

    it('handles create errors', async () => {
      mockClients.create.mockRejectedValue(new Error('Validation failed'));

      await invokeSubcommand('create', {
        org: 'org-uuid',
        app: 'app-uuid-1234-5678-abcd-1234-567890ab',
        type: 'confidential',
        'redirect-uris': 'https://example.com/callback',
      });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // client list
  // =========================================================================

  describe('list', () => {
    it('lists clients in table format', async () => {
      mockClients.list.mockResolvedValue({
        data: [sampleClient],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      await invokeSubcommand('list', { app: 'app-uuid' });

      expect(mockClients.list).toHaveBeenCalledWith(
        expect.objectContaining({ applicationId: 'app-uuid' }),
      );
      expect(printTable).toHaveBeenCalled();
      expect(info).toHaveBeenCalledWith('Total: 1 clients');
    });

    it('lists clients in JSON format', async () => {
      const result = { data: [sampleClient], total: 1, page: 1, pageSize: 20 };
      mockClients.list.mockResolvedValue(result);

      await invokeSubcommand('list', { app: 'app-uuid', json: true });

      expect(printJson).toHaveBeenCalledWith(result);
    });

    it('shows warning when no clients found', async () => {
      mockClients.list.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

      await invokeSubcommand('list', { app: 'app-uuid' });

      expect(warn).toHaveBeenCalledWith('No clients found');
    });

    it('passes status filter', async () => {
      mockClients.list.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

      await invokeSubcommand('list', { app: 'app-uuid', status: 'active' });

      expect(mockClients.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' }),
      );
    });

    it('handles list errors', async () => {
      mockClients.list.mockRejectedValue(new Error('Network error'));

      await invokeSubcommand('list', { app: 'app-uuid' });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // client show
  // =========================================================================

  describe('show', () => {
    it('shows client details in table format', async () => {
      mockClients.get.mockResolvedValue({ data: sampleClient, etag: 'etag-1' });

      await invokeSubcommand('show', { _pos_: 'client-uuid-1234' });

      expect(mockClients.get).toHaveBeenCalledWith('client-uuid-1234');
      expect(printTable).toHaveBeenCalled();
    });

    it('shows client details in JSON format', async () => {
      mockClients.get.mockResolvedValue({ data: sampleClient, etag: 'etag-1' });

      await invokeSubcommand('show', { _pos_: 'client-uuid-1234', json: true });

      expect(printJson).toHaveBeenCalledWith(sampleClient);
    });

    it('handles show errors', async () => {
      mockClients.get.mockRejectedValue(new Error('Not found'));

      await invokeSubcommand('show', { _pos_: 'client-uuid-1234' });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // client update
  // =========================================================================

  describe('update', () => {
    it('updates client name', async () => {
      mockClients.get.mockResolvedValue({ data: sampleClient, etag: 'etag-1' });
      mockClients.update.mockResolvedValue({ ...sampleClient, name: 'Updated App' });

      await invokeSubcommand('update', { _pos_: 'client-uuid-1234', name: 'Updated App' });

      expect(mockClients.update).toHaveBeenCalledWith(
        sampleClient.id,
        expect.objectContaining({ name: 'Updated App' }),
        'etag-1',
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Updated App'));
    });

    it('updates client redirect URIs', async () => {
      mockClients.get.mockResolvedValue({ data: sampleClient, etag: 'etag-1' });
      mockClients.update.mockResolvedValue(sampleClient);

      await invokeSubcommand('update', {
        _pos_: 'client-uuid-1234',
        'redirect-uris': 'https://new.example.com/callback',
      });

      expect(mockClients.update).toHaveBeenCalledWith(
        sampleClient.id,
        expect.objectContaining({ redirectUris: ['https://new.example.com/callback'] }),
        'etag-1',
      );
    });

    it('updates login methods with inherit', async () => {
      mockClients.get.mockResolvedValue({ data: sampleClient, etag: 'etag-1' });
      mockClients.update.mockResolvedValue({ ...sampleClient, loginMethods: null });

      await invokeSubcommand('update', {
        _pos_: 'client-uuid-1234',
        'login-methods': 'inherit',
      });

      expect(mockClients.update).toHaveBeenCalledWith(
        sampleClient.id,
        expect.objectContaining({ loginMethods: null }),
        'etag-1',
      );
    });

    it('outputs JSON on update', async () => {
      mockClients.get.mockResolvedValue({ data: sampleClient, etag: 'etag-1' });
      mockClients.update.mockResolvedValue(sampleClient);

      await invokeSubcommand('update', { _pos_: 'client-uuid-1234', name: 'New', json: true });

      expect(printJson).toHaveBeenCalledWith(sampleClient);
    });

    it('handles update errors', async () => {
      mockClients.get.mockRejectedValue(new Error('Not found'));

      await invokeSubcommand('update', { _pos_: 'client-uuid-1234', name: 'New' });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // client revoke
  // =========================================================================

  describe('revoke', () => {
    it('revokes a client after confirmation', async () => {
      mockClients.get.mockResolvedValue({ data: sampleClient, etag: 'etag-1' });
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await invokeSubcommand('revoke', { _pos_: 'client-uuid-1234' });

      expect(confirm).toHaveBeenCalled();
      expect(mockClients.revoke).toHaveBeenCalledWith(sampleClient.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('revoked'));
    });

    it('cancels revoke when not confirmed', async () => {
      mockClients.get.mockResolvedValue({ data: sampleClient, etag: 'etag-1' });
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await invokeSubcommand('revoke', { _pos_: 'client-uuid-1234' });

      expect(mockClients.revoke).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });

    it('skips confirmation with --force', async () => {
      mockClients.get.mockResolvedValue({ data: sampleClient, etag: 'etag-1' });

      await invokeSubcommand('revoke', { _pos_: 'client-uuid-1234', force: true });

      expect(confirm).not.toHaveBeenCalled();
      expect(mockClients.revoke).toHaveBeenCalledWith(sampleClient.id);
    });

    it('handles revoke errors', async () => {
      mockClients.get.mockRejectedValue(new Error('Not found'));

      await invokeSubcommand('revoke', { _pos_: 'client-uuid-1234', force: true });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // client restore (NEW)
  // =========================================================================

  describe('restore', () => {
    it('restores a revoked client', async () => {
      mockClients.get.mockResolvedValue({ data: sampleClient, etag: 'etag-1' });

      await invokeSubcommand('restore', { _pos_: 'client-uuid-1234' });

      expect(mockClients.restore).toHaveBeenCalledWith(sampleClient.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('restored'));
    });

    it('handles restore errors', async () => {
      mockClients.get.mockRejectedValue(new Error('Not found'));

      await invokeSubcommand('restore', { _pos_: 'client-uuid-1234' });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // client history (NEW)
  // =========================================================================

  describe('history', () => {
    it('shows client change history in table format', async () => {
      mockClients.getHistory.mockResolvedValue([
        {
          action: 'created',
          performedBy: 'admin-user',
          changes: { name: 'My Web App' },
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]);

      await invokeSubcommand('history', { _pos_: 'client-uuid-1234' });

      expect(mockClients.getHistory).toHaveBeenCalledWith('client-uuid-1234');
      expect(printTable).toHaveBeenCalled();
    });

    it('shows history in JSON format', async () => {
      const history = [
        { action: 'created', performedBy: 'admin', changes: null, createdAt: '2024-01-01T00:00:00Z' },
      ];
      mockClients.getHistory.mockResolvedValue(history);

      await invokeSubcommand('history', { _pos_: 'client-uuid-1234', json: true });

      expect(printJson).toHaveBeenCalledWith(history);
    });

    it('shows warning when no history found', async () => {
      mockClients.getHistory.mockResolvedValue([]);

      await invokeSubcommand('history', { _pos_: 'client-uuid-1234' });

      expect(warn).toHaveBeenCalledWith('No history entries found');
    });

    it('handles history errors', async () => {
      mockClients.getHistory.mockRejectedValue(new Error('Not found'));

      await invokeSubcommand('history', { _pos_: 'client-uuid-1234' });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // client login-methods
  // =========================================================================

  describe('login-methods', () => {
    describe('get', () => {
      it('shows login methods (inherited)', async () => {
        mockClients.get.mockResolvedValue({ data: { ...sampleClient, loginMethods: null }, etag: 'etag-1' });

        await invokeSubcommand('login-methods get', { _pos_: 'client-uuid-1234' });

        expect(info).toHaveBeenCalledWith(expect.stringContaining('inherit'));
      });

      it('shows login methods (overridden)', async () => {
        mockClients.get.mockResolvedValue({
          data: { ...sampleClient, loginMethods: ['password'] },
          etag: 'etag-1',
        });

        await invokeSubcommand('login-methods get', { _pos_: 'client-uuid-1234' });

        expect(info).toHaveBeenCalledWith(expect.stringContaining('password'));
      });

      it('shows login methods in JSON format', async () => {
        mockClients.get.mockResolvedValue({ data: sampleClient, etag: 'etag-1' });

        await invokeSubcommand('login-methods get', { _pos_: 'client-uuid-1234', json: true });

        expect(printJson).toHaveBeenCalledWith(
          expect.objectContaining({ loginMethods: null }),
        );
      });

      it('handles get errors', async () => {
        mockClients.get.mockRejectedValue(new Error('Not found'));

        await invokeSubcommand('login-methods get', { _pos_: 'client-uuid-1234' });

        expect(handleError).toHaveBeenCalled();
      });
    });

    describe('set', () => {
      it('sets login methods', async () => {
        mockClients.get.mockResolvedValue({ data: sampleClient, etag: 'etag-1' });
        mockClients.update.mockResolvedValue(sampleClient);

        await invokeSubcommand('login-methods set', {
          _pos_: 'client-uuid-1234',
          methods: 'password,magic_link',
        });

        expect(mockClients.update).toHaveBeenCalledWith(
          sampleClient.id,
          expect.objectContaining({ loginMethods: ['password', 'magic_link'] }),
          'etag-1',
        );
        expect(success).toHaveBeenCalledWith(expect.stringContaining('Login methods set'));
      });

      it('handles set errors', async () => {
        mockClients.get.mockRejectedValue(new Error('Not found'));

        await invokeSubcommand('login-methods set', {
          _pos_: 'client-uuid-1234',
          methods: 'password',
        });

        expect(handleError).toHaveBeenCalled();
      });
    });

    describe('clear', () => {
      it('clears login methods (resets to inherit)', async () => {
        mockClients.get.mockResolvedValue({ data: sampleClient, etag: 'etag-1' });
        mockClients.update.mockResolvedValue({ ...sampleClient, loginMethods: null });

        await invokeSubcommand('login-methods clear', { _pos_: 'client-uuid-1234' });

        expect(mockClients.update).toHaveBeenCalledWith(
          sampleClient.id,
          expect.objectContaining({ loginMethods: null }),
          'etag-1',
        );
        expect(success).toHaveBeenCalledWith(expect.stringContaining('cleared'));
      });

      it('handles clear errors', async () => {
        mockClients.get.mockRejectedValue(new Error('Not found'));

        await invokeSubcommand('login-methods clear', { _pos_: 'client-uuid-1234' });

        expect(handleError).toHaveBeenCalled();
      });
    });
  });

  // =========================================================================
  // client secret generate
  // =========================================================================

  describe('secret generate', () => {
    it('generates a secret and shows warning box', async () => {
      mockClients.generateSecret.mockResolvedValue(sampleSecret);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await invokeSubcommand('secret generate', { _pos_: 'client-uuid-1234' });

      expect(mockClients.generateSecret).toHaveBeenCalledWith('client-uuid-1234', { label: undefined });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('IMPORTANT'));
      consoleSpy.mockRestore();
    });

    it('generates a secret with label', async () => {
      mockClients.generateSecret.mockResolvedValue(sampleSecret);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await invokeSubcommand('secret generate', {
        _pos_: 'client-uuid-1234',
        label: 'production',
      });

      expect(mockClients.generateSecret).toHaveBeenCalledWith('client-uuid-1234', { label: 'production' });
      consoleSpy.mockRestore();
    });

    it('generates a secret in JSON format', async () => {
      mockClients.generateSecret.mockResolvedValue(sampleSecret);

      await invokeSubcommand('secret generate', { _pos_: 'client-uuid-1234', json: true });

      expect(printJson).toHaveBeenCalledWith(sampleSecret);
    });

    it('handles generate errors', async () => {
      mockClients.generateSecret.mockRejectedValue(new Error('Failed'));

      await invokeSubcommand('secret generate', { _pos_: 'client-uuid-1234' });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // client secret list
  // =========================================================================

  describe('secret list', () => {
    it('lists secrets in table format', async () => {
      mockClients.listSecrets.mockResolvedValue([sampleSecretListItem]);

      await invokeSubcommand('secret list', { _pos_: 'client-uuid-1234' });

      expect(mockClients.listSecrets).toHaveBeenCalledWith('client-uuid-1234');
      expect(printTable).toHaveBeenCalled();
      expect(info).toHaveBeenCalledWith('Total: 1 secrets');
    });

    it('lists secrets in JSON format', async () => {
      mockClients.listSecrets.mockResolvedValue([sampleSecretListItem]);

      await invokeSubcommand('secret list', { _pos_: 'client-uuid-1234', json: true });

      expect(printJson).toHaveBeenCalledWith([sampleSecretListItem]);
    });

    it('shows warning when no secrets found', async () => {
      mockClients.listSecrets.mockResolvedValue([]);

      await invokeSubcommand('secret list', { _pos_: 'client-uuid-1234' });

      expect(warn).toHaveBeenCalledWith('No secrets found');
    });

    it('handles list errors', async () => {
      mockClients.listSecrets.mockRejectedValue(new Error('Failed'));

      await invokeSubcommand('secret list', { _pos_: 'client-uuid-1234' });

      expect(handleError).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // client secret revoke
  // =========================================================================

  describe('secret revoke', () => {
    it('revokes a secret after confirmation', async () => {
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await invokeSubcommand('secret revoke', {
        _pos_: ['client-uuid-1234', 'secret-uuid-5678'],
      });

      expect(confirm).toHaveBeenCalled();
      expect(mockClients.revokeSecret).toHaveBeenCalledWith('client-uuid-1234', 'secret-uuid-5678');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('revoked'));
    });

    it('cancels revoke when not confirmed', async () => {
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await invokeSubcommand('secret revoke', {
        _pos_: ['client-uuid-1234', 'secret-uuid-5678'],
      });

      expect(mockClients.revokeSecret).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });

    it('skips confirmation with --force', async () => {
      await invokeSubcommand('secret revoke', {
        _pos_: ['client-uuid-1234', 'secret-uuid-5678'],
        force: true,
      });

      expect(confirm).not.toHaveBeenCalled();
      expect(mockClients.revokeSecret).toHaveBeenCalledWith('client-uuid-1234', 'secret-uuid-5678');
    });

    it('handles revoke errors', async () => {
      mockClients.revokeSecret.mockRejectedValue(new Error('Failed'));

      await invokeSubcommand('secret revoke', {
        _pos_: ['client-uuid-1234', 'secret-uuid-5678'],
        force: true,
      });

      expect(handleError).toHaveBeenCalled();
    });
  });
});
