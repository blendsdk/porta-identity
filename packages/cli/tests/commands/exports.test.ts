/**
 * Tests for the exports command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExports = {
  download: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({ exports: mockExports })),
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

vi.mock('node:fs', () => ({
  default: {
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

import { handleError } from '../../src/error-handler.js';
import { success, info } from '../../src/output.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exports command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getCommand() {
    const { exportsCommand } = await import('../../src/commands/exports.js');
    return exportsCommand;
  }

  async function invokeSubcommand(subcommand: string, extraArgs: Record<string, unknown> = {}) {
    const yargs = (await import('yargs')).default;
    const cmd = await getCommand();

    const args = ['exports', subcommand];
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

  describe('download', () => {
    it('exports to stdout by default', async () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      mockExports.download.mockResolvedValue({ body: 'id,name\n1,Acme\n' });

      await invokeSubcommand('download', {
        'entity-type': 'organizations',
        format: 'csv',
      });

      expect(mockExports.download).toHaveBeenCalledWith({
        entityType: 'organizations',
        format: 'csv',
        organizationId: undefined,
        applicationId: undefined,
      });
      expect(writeSpy).toHaveBeenCalled();
      expect(info).toHaveBeenCalledWith(expect.stringContaining('organizations'));
      writeSpy.mockRestore();
    });

    it('exports to file when --output specified', async () => {
      mockExports.download.mockResolvedValue({ body: 'id,name\n1,Acme\n' });

      await invokeSubcommand('download', {
        'entity-type': 'users',
        format: 'csv',
        output: '/tmp/users.csv',
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/users.csv', 'id,name\n1,Acme\n', 'utf-8');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('/tmp/users.csv'));
    });

    it('handles JSON body from SDK', async () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      mockExports.download.mockResolvedValue({ body: [{ id: '1', name: 'Acme' }] });

      await invokeSubcommand('download', {
        'entity-type': 'organizations',
        format: 'json',
      });

      expect(writeSpy).toHaveBeenCalled();
      writeSpy.mockRestore();
    });

    it('passes filter params', async () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      mockExports.download.mockResolvedValue({ body: '' });

      await invokeSubcommand('download', {
        'entity-type': 'roles',
        format: 'json',
        'org-id': 'org-uuid-1',
        'app-id': 'app-uuid-1',
      });

      expect(mockExports.download).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-uuid-1',
          applicationId: 'app-uuid-1',
        }),
      );
      writeSpy.mockRestore();
    });

    it('handles errors', async () => {
      mockExports.download.mockRejectedValue(new Error('fail'));

      await invokeSubcommand('download', {
        'entity-type': 'organizations',
        format: 'csv',
      });

      expect(handleError).toHaveBeenCalled();
    });
  });
});
