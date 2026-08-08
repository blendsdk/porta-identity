/**
 * Tests for the keys command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockKeys = {
  list: vi.fn(),
  generate: vi.fn(),
  rotate: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({ keys: mockKeys })),
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
}));

import { handleError } from '../../src/error-handler.js';
import { printTable, printJson, success, warn } from '../../src/output.js';
import { confirm } from '../../src/prompt.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const sampleKey = {
  id: 'key-uuid-1234-5678',
  kid: 'kid-abc123',
  algorithm: 'ES256',
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
  rotatedAt: null,
};

const retiredKey = {
  ...sampleKey,
  id: 'key-uuid-9999',
  kid: 'kid-old999',
  isActive: false,
  rotatedAt: '2024-06-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('keys command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getCommand() {
    const { keysCommand } = await import('../../src/commands/keys.js');
    return keysCommand;
  }

  async function invokeSubcommand(subcommand: string, extraArgs: Record<string, unknown> = {}) {
    const yargs = (await import('yargs')).default;
    const cmd = await getCommand();

    const args = ['keys', subcommand];
    for (const [key, value] of Object.entries(extraArgs)) {
      if (key.startsWith('_pos_')) continue;
      if (typeof value === 'boolean') {
        if (value) args.push(`--${key}`);
      } else {
        args.push(`--${key}`, String(value));
      }
    }
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
      // yargs may throw on missing commands
    }
  }

  describe('list', () => {
    it('displays keys in a table', async () => {
      mockKeys.list.mockResolvedValue([sampleKey, retiredKey]);

      await invokeSubcommand('list');

      expect(mockKeys.list).toHaveBeenCalled();
      expect(printTable).toHaveBeenCalled();
      expect(success).toHaveBeenCalledWith(expect.stringContaining('2'));
    });

    it('shows warning when no keys found', async () => {
      mockKeys.list.mockResolvedValue([]);

      await invokeSubcommand('list');

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('No signing keys'));
    });

    it('outputs JSON when --json', async () => {
      mockKeys.list.mockResolvedValue([sampleKey]);

      await invokeSubcommand('list', { json: true });

      expect(printJson).toHaveBeenCalledWith([sampleKey]);
    });

    it('handles errors', async () => {
      mockKeys.list.mockRejectedValue(new Error('fail'));

      await invokeSubcommand('list');

      expect(handleError).toHaveBeenCalled();
    });
  });

  describe('generate', () => {
    it('generates a key and shows success', async () => {
      mockKeys.generate.mockResolvedValue(sampleKey);

      await invokeSubcommand('generate');

      expect(mockKeys.generate).toHaveBeenCalled();
      expect(success).toHaveBeenCalledWith(expect.stringContaining('kid-abc1'));
    });

    it('outputs JSON when --json', async () => {
      mockKeys.generate.mockResolvedValue(sampleKey);

      await invokeSubcommand('generate', { json: true });

      expect(printJson).toHaveBeenCalledWith(sampleKey);
    });
  });

  describe('rotate', () => {
    it('prompts for confirmation', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockKeys.rotate.mockResolvedValue(sampleKey);

      await invokeSubcommand('rotate');

      expect(confirm).toHaveBeenCalled();
      expect(mockKeys.rotate).toHaveBeenCalled();
      expect(success).toHaveBeenCalledWith(expect.stringContaining('kid-abc1'));
    });

    it('aborts when confirmation denied', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      await invokeSubcommand('rotate');

      expect(mockKeys.rotate).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Aborted');
    });

    it('skips confirmation with --force', async () => {
      mockKeys.rotate.mockResolvedValue(sampleKey);

      await invokeSubcommand('rotate', { force: true });

      expect(confirm).not.toHaveBeenCalled();
      expect(mockKeys.rotate).toHaveBeenCalled();
    });

    it('outputs JSON when --json', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockKeys.rotate.mockResolvedValue(sampleKey);

      await invokeSubcommand('rotate', { json: true });

      expect(printJson).toHaveBeenCalledWith(sampleKey);
    });
  });
});
