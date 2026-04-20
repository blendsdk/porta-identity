import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock client
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { clientSecretCommand } from '../../../../src/cli/commands/client-secret.js';
import { success, warn, outputResult, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const CLIENT_UUID = 'e5f6a7b8-c901-2345-def0-123456789abc';
const SECRET_UUID = 'fff55555-5555-5555-5555-555555555555';

const fakeGeneratedSecret = {
  id: SECRET_UUID,
  plaintext: 'porta_secret_abcdef1234567890',
  label: 'production',
  status: 'active',
  createdAt: '2026-04-12T00:00:00.000Z',
};

const fakeSecretListItem = {
  id: SECRET_UUID,
  label: 'production',
  status: 'active',
  lastUsedAt: '2026-04-13T10:00:00.000Z',
  expiresAt: null,
  createdAt: '2026-04-12T00:00:00.000Z',
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
  (clientSecretCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI Client Secret Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
  });

  // ── secret generate ───────────────────────────────────────────────

  describe('secret generate', () => {
    it('should POST to client secrets endpoint', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeGeneratedSecret } });

      const handlers = getHandlers();
      await handlers['generate'](createArgv({ 'client-id': CLIENT_UUID, label: 'production' }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/clients/${CLIENT_UUID}/secrets`,
        { label: 'production' },
      );
    });

    it('should display secret in warning box', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeGeneratedSecret } });

      const handlers = getHandlers();
      await handlers['generate'](createArgv({ 'client-id': CLIENT_UUID }));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('IMPORTANT'));
    });

    it('should output JSON when --json flag is set', async () => {
      mockClient.post.mockResolvedValue({ status: 201, data: { data: fakeGeneratedSecret } });
      vi.mocked(outputResult).mockImplementation(
        (isJson: boolean, _tableRenderer: () => void, jsonData: unknown) => {
          if (isJson) expect(jsonData).toEqual(fakeGeneratedSecret);
        },
      );

      const handlers = getHandlers();
      await handlers['generate'](createArgv({ 'client-id': CLIENT_UUID, json: true }));

      expect(outputResult).toHaveBeenCalled();
    });
  });

  // ── secret list ───────────────────────────────────────────────────

  describe('secret list', () => {
    it('should GET client secrets', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { data: [fakeSecretListItem] } });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ 'client-id': CLIENT_UUID }));

      expect(mockClient.get).toHaveBeenCalledWith(`/api/admin/clients/${CLIENT_UUID}/secrets`);
      expect(printTable).toHaveBeenCalled();
    });

    it('should warn when no secrets found', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { data: [] } });

      const handlers = getHandlers();
      await handlers['list'](createArgv({ 'client-id': CLIENT_UUID }));

      expect(warn).toHaveBeenCalledWith('No secrets found');
    });
  });

  // ── secret revoke ─────────────────────────────────────────────────

  describe('secret revoke', () => {
    it('should skip with dry-run', async () => {
      const handlers = getHandlers();
      await handlers['revoke'](createArgv({
        'client-id': CLIENT_UUID,
        'secret-id': SECRET_UUID,
        'dry-run': true,
      }));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('should cancel when confirm rejects', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const handlers = getHandlers();
      await handlers['revoke'](createArgv({
        'client-id': CLIENT_UUID,
        'secret-id': SECRET_UUID,
      }));

      expect(warn).toHaveBeenCalledWith('Operation cancelled');
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('should POST revoke endpoint on confirmation', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['revoke'](createArgv({
        'client-id': CLIENT_UUID,
        'secret-id': SECRET_UUID,
        force: true,
      }));

      expect(mockClient.post).toHaveBeenCalledWith(
        `/api/admin/clients/${CLIENT_UUID}/secrets/${SECRET_UUID}/revoke`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining(SECRET_UUID));
    });
  });

  // ── metadata ──────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should export command name "secret"', () => {
      expect(clientSecretCommand.command).toBe('secret');
    });

    it('should have a describe string', () => {
      expect(clientSecretCommand.describe).toBeDefined();
    });
  });
});
