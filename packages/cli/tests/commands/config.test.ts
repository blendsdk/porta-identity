/**
 * Tests for the config command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockConfig = {
  list: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({ config: mockConfig })),
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

import { handleError } from '../../src/error-handler.js';
import { printTable, printJson, success } from '../../src/output.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const sampleEntry = {
  key: 'session_ttl',
  value: '3600',
  description: 'Session time-to-live in seconds',
  updatedAt: '2024-01-01T00:00:00Z',
};

const sampleEntries = [
  sampleEntry,
  { key: 'max_login_attempts', value: '5', description: null, updatedAt: '2024-01-02T00:00:00Z' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('config command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getCommand() {
    const { configCommand } = await import('../../src/commands/config.js');
    return configCommand;
  }

  async function invokeSubcommand(subcommand: string, extraArgs: Record<string, unknown> = {}) {
    const yargs = (await import('yargs')).default;
    const cmd = await getCommand();

    const args = ['config', subcommand];
    for (const [key, value] of Object.entries(extraArgs)) {
      if (key.startsWith('_pos_')) continue;
      if (typeof value === 'boolean') {
        if (value) args.push(`--${key}`);
      } else {
        args.push(`--${key}`, String(value));
      }
    }
    if (extraArgs._pos_) args.splice(2, 0, String(extraArgs._pos_));
    if (extraArgs._pos2_) args.splice(3, 0, String(extraArgs._pos2_));

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
      // yargs may throw on missing commands
    }
  }

  describe('list', () => {
    it('displays config entries in a table', async () => {
      mockConfig.list.mockResolvedValue(sampleEntries);

      await invokeSubcommand('list');

      expect(mockConfig.list).toHaveBeenCalled();
      expect(printTable).toHaveBeenCalled();
    });

    it('outputs JSON when --json', async () => {
      mockConfig.list.mockResolvedValue(sampleEntries);

      await invokeSubcommand('list', { json: true });

      expect(printJson).toHaveBeenCalledWith(sampleEntries);
    });

    it('handles errors', async () => {
      mockConfig.list.mockRejectedValue(new Error('fail'));

      await invokeSubcommand('list');

      expect(handleError).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('displays a single config entry', async () => {
      mockConfig.get.mockResolvedValue(sampleEntry);

      await invokeSubcommand('get', { _pos_: 'session_ttl' });

      expect(mockConfig.get).toHaveBeenCalledWith('session_ttl');
      expect(printTable).toHaveBeenCalled();
    });

    it('outputs JSON when --json', async () => {
      mockConfig.get.mockResolvedValue(sampleEntry);

      await invokeSubcommand('get', { _pos_: 'session_ttl', json: true });

      expect(printJson).toHaveBeenCalledWith(sampleEntry);
    });
  });

  describe('set', () => {
    it('sets a config value and shows success', async () => {
      mockConfig.set.mockResolvedValue({ ...sampleEntry, value: '7200' });

      await invokeSubcommand('set', { _pos_: 'session_ttl', _pos2_: '7200' });

      expect(mockConfig.set).toHaveBeenCalledWith('session_ttl', '7200');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('session_ttl'));
    });

    it('outputs JSON when --json', async () => {
      const updated = { ...sampleEntry, value: '7200' };
      mockConfig.set.mockResolvedValue(updated);

      await invokeSubcommand('set', { _pos_: 'session_ttl', _pos2_: '7200', json: true });

      expect(printJson).toHaveBeenCalledWith(updated);
    });
  });
});
