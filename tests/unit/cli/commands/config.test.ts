import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withBootstrap: vi.fn().mockImplementation(async (_argv: unknown, fn: () => Promise<unknown>) => fn()),
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

vi.mock('../../../../src/lib/database.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  }),
}));

import { configCommand } from '../../../../src/cli/commands/config.js';
import { success, warn, outputResult } from '../../../../src/cli/output.js';
import { getPool } from '../../../../src/lib/database.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

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

describe('CLI Config Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPool).mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as never);
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
  });

  describe('config list', () => {
    it('should warn when no config entries found', async () => {
      const handlers = getHandlers();
      await handlers['list'](createArgv());
      expect(warn).toHaveBeenCalledWith('No config entries found');
    });

    it('should display config entries in table', async () => {
      vi.mocked(getPool).mockReturnValue({
        query: vi.fn().mockResolvedValue({
          rows: [
            { key: 'access_token_ttl', value: '"3600"', value_type: 'duration', is_sensitive: false },
          ],
        }),
      } as never);

      const handlers = getHandlers();
      await handlers['list'](createArgv());
      expect(outputResult).toHaveBeenCalled();
    });

    it('should mask sensitive values', async () => {
      vi.mocked(getPool).mockReturnValue({
        query: vi.fn().mockResolvedValue({
          rows: [
            { key: 'secret_key', value: 'super-secret', value_type: 'string', is_sensitive: true },
          ],
        }),
      } as never);

      const { printTable } = await import('../../../../src/cli/output.js');
      const handlers = getHandlers();
      await handlers['list'](createArgv());

      expect(printTable).toHaveBeenCalledWith(
        ['Key', 'Value', 'Type'],
        [['secret_key', '***', 'string']],
      );
    });
  });

  describe('config get', () => {
    it('should warn when key not found', async () => {
      const handlers = getHandlers();
      await handlers['get <key>'](createArgv({ key: 'nonexistent' }));
      expect(warn).toHaveBeenCalledWith('Config key not found: nonexistent');
    });

    it('should display value when key exists', async () => {
      vi.mocked(getPool).mockReturnValue({
        query: vi.fn().mockResolvedValue({
          rows: [{ key: 'access_token_ttl', value: '3600', value_type: 'duration', description: 'TTL', is_sensitive: false }],
        }),
      } as never);

      const handlers = getHandlers();
      await handlers['get <key>'](createArgv({ key: 'access_token_ttl' }));
      expect(outputResult).toHaveBeenCalled();
    });
  });

  describe('config set', () => {
    it('should update config value', async () => {
      vi.mocked(getPool).mockReturnValue({
        query: vi.fn().mockResolvedValue({ rows: [{ key: 'access_token_ttl' }] }),
      } as never);

      const handlers = getHandlers();
      await handlers['set <key> <value>'](createArgv({ key: 'access_token_ttl', value: '7200' }));
      expect(success).toHaveBeenCalledWith('Set access_token_ttl = 7200');
    });

    it('should warn when key not found on set', async () => {
      const handlers = getHandlers();
      await handlers['set <key> <value>'](createArgv({ key: 'nonexistent', value: 'val' }));
      expect(warn).toHaveBeenCalledWith('Config key not found: nonexistent');
    });

    it('should skip in dry-run mode', async () => {
      const handlers = getHandlers();
      await handlers['set <key> <value>'](createArgv({ 'dry-run': true, key: 'x', value: 'y' }));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dry run'));
    });
  });

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(configCommand.command).toBe('config');
    });
  });
});
