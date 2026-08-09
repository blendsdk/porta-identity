/**
 * Tests for the audit command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAudit = {
  list: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({ audit: mockAudit })),
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
import { printTable, printJson, success, warn } from '../../src/output.js';

// ---------------------------------------------------------------------------
// Test data — matches SDK AuditEntry type
// ---------------------------------------------------------------------------

const sampleEntry = {
  id: 'audit-uuid-1',
  eventType: 'user.login',
  eventCategory: 'auth',
  actorId: 'user-uuid-1',
  organizationId: 'org-uuid-1',
  userId: 'user-uuid-2',
  description: 'User logged in via password',
  metadata: { method: 'password' },
  ipAddress: '192.168.1.1',
  createdAt: '2024-01-01T00:00:00Z',
};

const paginatedResult = {
  data: [sampleEntry],
  page: 1,
  pageSize: 20,
  total: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('audit command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getCommand() {
    const { auditCommand } = await import('../../src/commands/audit.js');
    return auditCommand;
  }

  async function invokeSubcommand(subcommand: string, extraArgs: Record<string, unknown> = {}) {
    const yargs = (await import('yargs')).default;
    const cmd = await getCommand();

    const args = ['audit', subcommand];
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

  describe('list', () => {
    it('displays audit entries in a table', async () => {
      mockAudit.list.mockResolvedValue(paginatedResult);

      await invokeSubcommand('list');

      expect(mockAudit.list).toHaveBeenCalled();
      expect(printTable).toHaveBeenCalled();
      expect(success).toHaveBeenCalledWith(expect.stringContaining('1'));
    });

    it('shows warning when no entries found', async () => {
      mockAudit.list.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });

      await invokeSubcommand('list');

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('No audit'));
    });

    it('outputs JSON when --json', async () => {
      mockAudit.list.mockResolvedValue(paginatedResult);

      await invokeSubcommand('list', { json: true });

      expect(printJson).toHaveBeenCalledWith(paginatedResult);
    });

    it('passes filter params to SDK', async () => {
      mockAudit.list.mockResolvedValue(paginatedResult);

      await invokeSubcommand('list', {
        event: 'user.login',
        org: 'org-uuid-1',
        user: 'user-uuid-1',
        limit: 10,
      });

      expect(mockAudit.list).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'user.login',
          org: 'org-uuid-1',
          user: 'user-uuid-1',
          limit: 10,
        }),
      );
    });

    it('passes since filter', async () => {
      mockAudit.list.mockResolvedValue(paginatedResult);

      await invokeSubcommand('list', {
        since: '2024-01-01',
      });

      expect(mockAudit.list).toHaveBeenCalledWith(
        expect.objectContaining({
          since: '2024-01-01',
        }),
      );
    });

    it('handles errors', async () => {
      mockAudit.list.mockRejectedValue(new Error('fail'));

      await invokeSubcommand('list');

      expect(handleError).toHaveBeenCalled();
    });
  });
});
