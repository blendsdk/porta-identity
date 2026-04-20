/**
 * Unit tests for the CLI config command (HTTP mode).
 *
 * Tests list, get, and set subcommands via mocked AdminHttpClient.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any module imports
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  withHttpClient: vi.fn(),
}));

vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withHttpClient: mocks.withHttpClient.mockImplementation(
    async (_argv: unknown, fn: (client: unknown) => Promise<unknown>) =>
      fn({ get: mocks.get, post: mocks.post, put: mocks.put, delete: mocks.del }),
  ),
}));

vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandling: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
}));

vi.mock('../../../../src/cli/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  outputResult: vi.fn(),
  printTotal: vi.fn(),
}));

import { configCommand } from '../../../../src/cli/commands/config.js';
import { success, warn, outputResult, printTable } from '../../../../src/cli/output.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createArgv(overrides: Partial<GlobalOptions & { key?: string; value?: string }> = {}) {
  return { json: false, verbose: false, force: false, 'dry-run': false, ...overrides };
}

function getHandlers() {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
  const fakeYargs = {
    command: (cmd: string | object, _desc?: string, _builder?: unknown, handler?: unknown) => {
      if (typeof cmd === 'string') handlers[cmd] = handler as (args: Record<string, unknown>) => Promise<void>;
      return fakeYargs;
    },
    demandCommand: () => fakeYargs,
    positional: () => fakeYargs,
    option: () => fakeYargs,
  };
  (configCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI Config Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
  });

  describe('config list', () => {
    it('should warn when no config entries found', async () => {
      mocks.get.mockResolvedValue({ data: { data: [] } });
      const handlers = getHandlers();
      await handlers['list'](createArgv());
      expect(warn).toHaveBeenCalledWith('No config entries found');
    });

    it('should display config entries in table', async () => {
      mocks.get.mockResolvedValue({
        data: {
          data: [
            { key: 'access_token_ttl', value: '3600', valueType: 'duration', isSensitive: false },
          ],
        },
      });
      const handlers = getHandlers();
      await handlers['list'](createArgv());
      expect(mocks.get).toHaveBeenCalledWith('/api/admin/config');
      expect(outputResult).toHaveBeenCalled();
    });

    it('should display values from API response (sensitive already masked server-side)', async () => {
      mocks.get.mockResolvedValue({
        data: {
          data: [
            { key: 'secret_key', value: '***', valueType: 'string', isSensitive: true },
          ],
        },
      });
      const handlers = getHandlers();
      await handlers['list'](createArgv());
      expect(printTable).toHaveBeenCalledWith(
        ['Key', 'Value', 'Type'],
        [['secret_key', '***', 'string']],
      );
    });
  });

  describe('config get', () => {
    it('should GET the specific config key via HTTP', async () => {
      mocks.get.mockResolvedValue({
        data: {
          data: { key: 'access_token_ttl', value: '3600', valueType: 'duration', description: 'TTL' },
        },
      });
      const handlers = getHandlers();
      await handlers['get <key>'](createArgv({ key: 'access_token_ttl' }));
      expect(mocks.get).toHaveBeenCalledWith('/api/admin/config/access_token_ttl');
      expect(outputResult).toHaveBeenCalled();
    });
  });

  describe('config set', () => {
    it('should PUT the value via HTTP', async () => {
      mocks.put.mockResolvedValue({
        data: { data: { key: 'access_token_ttl', value: '7200', valueType: 'duration' } },
      });
      const handlers = getHandlers();
      await handlers['set <key> <value>'](createArgv({ key: 'access_token_ttl', value: '7200' }));
      expect(mocks.put).toHaveBeenCalledWith(
        '/api/admin/config/access_token_ttl',
        { value: '7200' },
      );
      expect(success).toHaveBeenCalledWith('Set access_token_ttl = 7200');
    });

    it('should skip in dry-run mode', async () => {
      const handlers = getHandlers();
      await handlers['set <key> <value>'](createArgv({ 'dry-run': true, key: 'x', value: 'y' }));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dry run'));
      expect(mocks.put).not.toHaveBeenCalled();
    });
  });

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(configCommand.command).toBe('config');
    });
  });
});
