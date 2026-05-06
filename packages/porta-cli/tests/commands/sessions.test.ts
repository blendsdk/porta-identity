/**
 * Tests for the sessions command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSessions = {
  list: vi.fn(),
  revoke: vi.fn(),
  revokeForUser: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({ sessions: mockSessions })),
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

const sampleSession = {
  sessionId: 'session-uuid-1234',
  userId: 'user-uuid-1',
  clientId: null,
  organizationId: null,
  grantId: null,
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
  lastActivityAt: '2024-01-01T12:00:00Z',
  createdAt: '2024-01-01T00:00:00Z',
  expiresAt: '2024-01-02T00:00:00Z',
  revokedAt: null,
};

const paginatedResult = {
  data: [sampleSession],
  page: 1,
  pageSize: 20,
  total: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sessions command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getCommand() {
    const { sessionsCommand } = await import('../../src/commands/sessions.js');
    return sessionsCommand;
  }

  async function invokeSubcommand(subcommand: string, extraArgs: Record<string, unknown> = {}) {
    const yargs = (await import('yargs')).default;
    const cmd = await getCommand();

    const args = ['sessions', subcommand];
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
      // yargs may throw
    }
  }

  describe('list', () => {
    it('displays sessions in a table', async () => {
      mockSessions.list.mockResolvedValue(paginatedResult);

      await invokeSubcommand('list');

      expect(mockSessions.list).toHaveBeenCalled();
      expect(printTable).toHaveBeenCalled();
      expect(success).toHaveBeenCalledWith(expect.stringContaining('1'));
    });

    it('shows warning when no sessions found', async () => {
      mockSessions.list.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });

      await invokeSubcommand('list');

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('No active'));
    });

    it('outputs JSON when --json', async () => {
      mockSessions.list.mockResolvedValue(paginatedResult);

      await invokeSubcommand('list', { json: true });

      expect(printJson).toHaveBeenCalledWith(paginatedResult);
    });

    it('passes filter params', async () => {
      mockSessions.list.mockResolvedValue(paginatedResult);

      await invokeSubcommand('list', { 'user-id': 'user-uuid-1', page: 2 });

      expect(mockSessions.list).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-uuid-1', page: 2 }),
      );
    });

    it('handles errors', async () => {
      mockSessions.list.mockRejectedValue(new Error('fail'));

      await invokeSubcommand('list');

      expect(handleError).toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('prompts and revokes a session', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockSessions.revoke.mockResolvedValue(undefined);

      await invokeSubcommand('revoke', { _pos_: 'session-uuid-1234' });

      expect(confirm).toHaveBeenCalled();
      expect(mockSessions.revoke).toHaveBeenCalledWith('session-uuid-1234');
      expect(success).toHaveBeenCalled();
    });

    it('aborts when denied', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      await invokeSubcommand('revoke', { _pos_: 'session-uuid-1234' });

      expect(mockSessions.revoke).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Aborted');
    });

    it('skips confirmation with --force', async () => {
      mockSessions.revoke.mockResolvedValue(undefined);

      await invokeSubcommand('revoke', { _pos_: 'session-uuid-1234', force: true });

      expect(confirm).not.toHaveBeenCalled();
      expect(mockSessions.revoke).toHaveBeenCalled();
    });

    it('outputs JSON when --json', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockSessions.revoke.mockResolvedValue(undefined);

      await invokeSubcommand('revoke', { _pos_: 'session-uuid-1234', json: true });

      expect(printJson).toHaveBeenCalledWith({ revoked: 'session-uuid-1234' });
    });
  });

  describe('revoke-user', () => {
    it('prompts and revokes all user sessions', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockSessions.revokeForUser.mockResolvedValue(undefined);

      await invokeSubcommand('revoke-user', { _pos_: 'user-uuid-1' });

      expect(confirm).toHaveBeenCalled();
      expect(mockSessions.revokeForUser).toHaveBeenCalledWith('user-uuid-1');
      expect(success).toHaveBeenCalled();
    });

    it('skips confirmation with --force', async () => {
      mockSessions.revokeForUser.mockResolvedValue(undefined);

      await invokeSubcommand('revoke-user', { _pos_: 'user-uuid-1', force: true });

      expect(confirm).not.toHaveBeenCalled();
      expect(mockSessions.revokeForUser).toHaveBeenCalled();
    });
  });
});
