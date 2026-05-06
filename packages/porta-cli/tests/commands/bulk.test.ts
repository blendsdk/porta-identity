/**
 * Tests for the bulk command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBulk = {
  execute: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({ bulk: mockBulk })),
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
import { printTable, printJson, success, warn, error as printError } from '../../src/output.js';
import { confirm } from '../../src/prompt.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const successResult = { succeeded: 3, failed: 0, errors: [] };
const partialResult = {
  succeeded: 2,
  failed: 1,
  errors: [{ id: 'uuid-3', error: 'Not found' }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('bulk command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getCommand() {
    const { bulkCommand } = await import('../../src/commands/bulk.js');
    return bulkCommand;
  }

  async function invokeSubcommand(subcommand: string, extraArgs: Record<string, unknown> = {}) {
    const yargs = (await import('yargs')).default;
    const cmd = await getCommand();

    const args = ['bulk', subcommand];
    for (const [key, value] of Object.entries(extraArgs)) {
      if (key.startsWith('_pos_')) continue;
      if (typeof value === 'boolean') {
        if (value) args.push(`--${key}`);
      } else {
        args.push(`--${key}`, String(value));
      }
    }

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
      // yargs may throw
    }
  }

  describe('execute', () => {
    it('executes bulk operation with confirmation', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockBulk.execute.mockResolvedValue(successResult);

      await invokeSubcommand('execute', {
        'entity-type': 'users',
        action: 'suspend',
        ids: 'uuid-1,uuid-2,uuid-3',
      });

      expect(confirm).toHaveBeenCalled();
      expect(mockBulk.execute).toHaveBeenCalledWith({
        entityType: 'users',
        action: 'suspend',
        ids: ['uuid-1', 'uuid-2', 'uuid-3'],
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('3 succeeded'));
    });

    it('aborts when confirmation denied', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      await invokeSubcommand('execute', {
        'entity-type': 'users',
        action: 'suspend',
        ids: 'uuid-1,uuid-2',
      });

      expect(mockBulk.execute).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Aborted');
    });

    it('skips confirmation with --force', async () => {
      mockBulk.execute.mockResolvedValue(successResult);

      await invokeSubcommand('execute', {
        'entity-type': 'organizations',
        action: 'activate',
        ids: 'uuid-1',
        force: true,
      });

      expect(confirm).not.toHaveBeenCalled();
      expect(mockBulk.execute).toHaveBeenCalled();
    });

    it('displays errors when partial failure', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockBulk.execute.mockResolvedValue(partialResult);

      await invokeSubcommand('execute', {
        'entity-type': 'users',
        action: 'lock',
        ids: 'uuid-1,uuid-2,uuid-3',
      });

      expect(success).toHaveBeenCalledWith(expect.stringContaining('2 succeeded'));
      expect(printError).toHaveBeenCalled();
      expect(printTable).toHaveBeenCalled();
    });

    it('outputs JSON when --json', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockBulk.execute.mockResolvedValue(successResult);

      await invokeSubcommand('execute', {
        'entity-type': 'users',
        action: 'suspend',
        ids: 'uuid-1',
        json: true,
      });

      expect(printJson).toHaveBeenCalledWith(successResult);
    });

    it('handles errors', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockBulk.execute.mockRejectedValue(new Error('fail'));

      await invokeSubcommand('execute', {
        'entity-type': 'users',
        action: 'suspend',
        ids: 'uuid-1',
      });

      expect(handleError).toHaveBeenCalled();
    });
  });
});
