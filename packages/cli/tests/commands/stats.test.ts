/**
 * Tests for the stats command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStats = {
  get: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({ stats: mockStats })),
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

// Server StatsOverview shape (src/lib/stats.ts).
const sampleStats = {
  organizations: { total: 5, active: 4 },
  applications: { total: 10, active: 8 },
  clients: { total: 15, active: 12 },
  users: { total: 100, active: 90, newLast7d: 3, newLast30d: 10, activeLast30d: 50 },
  loginActivity: {
    last24h: { successful: 20, failed: 2 },
    last7d: { successful: 100, failed: 8 },
    last30d: { successful: 400, failed: 30 },
  },
  systemHealth: { database: true, redis: true },
  generatedAt: '2026-01-01T00:00:00Z',
};


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stats command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getCommand() {
    const { statsCommand } = await import('../../src/commands/stats.js');
    return statsCommand;
  }

  async function invokeSubcommand(subcommand: string, extraArgs: Record<string, unknown> = {}) {
    const yargs = (await import('yargs')).default;
    const cmd = await getCommand();

    const args = ['stats', subcommand];
    for (const [key, value] of Object.entries(extraArgs)) {
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

  describe('show', () => {
    it('displays statistics in a table', async () => {
      mockStats.get.mockResolvedValue(sampleStats);

      await invokeSubcommand('show');

      expect(mockStats.get).toHaveBeenCalled();
      expect(printTable).toHaveBeenCalled();
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Dashboard'));
    });

    it('outputs JSON when --json', async () => {
      mockStats.get.mockResolvedValue(sampleStats);

      await invokeSubcommand('show', { json: true });

      expect(printJson).toHaveBeenCalledWith(sampleStats);
    });

    it('handles errors', async () => {
      mockStats.get.mockRejectedValue(new Error('fail'));

      await invokeSubcommand('show');

      expect(handleError).toHaveBeenCalled();
    });
  });
});
