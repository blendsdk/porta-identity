/**
 * Tests for the bulk command.
 *
 * The server has two separate endpoints for org and user bulk operations.
 * The CLI routes to the correct SDK method based on --entity-type.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBulk = {
  organizationStatus: vi.fn(),
  userStatus: vi.fn(),
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
// Test data — matches server BulkOperationResult shape
// ---------------------------------------------------------------------------

const orgSuccessResult = {
  total: 3, succeeded: 3, failed: 0,
  results: [
    { id: 'o1', success: true, previousStatus: 'active', newStatus: 'suspended' },
    { id: 'o2', success: true, previousStatus: 'active', newStatus: 'suspended' },
    { id: 'o3', success: true, previousStatus: 'active', newStatus: 'suspended' },
  ],
};

const userPartialResult = {
  total: 3, succeeded: 2, failed: 1,
  results: [
    { id: 'u1', success: true, previousStatus: 'active', newStatus: 'suspended' },
    { id: 'u2', success: true, previousStatus: 'active', newStatus: 'suspended' },
    { id: 'u3', success: false, error: 'User not found', previousStatus: undefined },
  ],
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

  describe('execute — organizations', () => {
    it('calls organizationStatus with correct input', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockBulk.organizationStatus.mockResolvedValue(orgSuccessResult);

      await invokeSubcommand('execute', {
        'entity-type': 'organizations',
        action: 'suspend',
        ids: 'o1,o2,o3',
        force: true,
      });

      expect(mockBulk.organizationStatus).toHaveBeenCalledWith({
        ids: ['o1', 'o2', 'o3'],
        action: 'suspend',
        reason: undefined,
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('3 succeeded'));
    });

    it('passes reason to organization operation', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockBulk.organizationStatus.mockResolvedValue(orgSuccessResult);

      await invokeSubcommand('execute', {
        'entity-type': 'organizations',
        action: 'suspend',
        ids: 'o1',
        reason: 'Maintenance',
        force: true,
      });

      expect(mockBulk.organizationStatus).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Maintenance' }),
      );
    });
  });

  describe('execute — users', () => {
    it('calls userStatus with organizationId', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockBulk.userStatus.mockResolvedValue(userPartialResult);

      await invokeSubcommand('execute', {
        'entity-type': 'users',
        action: 'suspend',
        ids: 'u1,u2,u3',
        'organization-id': 'org-id-123',
        force: true,
      });

      expect(mockBulk.userStatus).toHaveBeenCalledWith({
        ids: ['u1', 'u2', 'u3'],
        action: 'suspend',
        organizationId: 'org-id-123',
        reason: undefined,
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('2 succeeded'));
    });

    it('shows errors from failed results', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockBulk.userStatus.mockResolvedValue(userPartialResult);

      await invokeSubcommand('execute', {
        'entity-type': 'users',
        action: 'suspend',
        ids: 'u1,u2,u3',
        'organization-id': 'org-id',
        force: true,
      });

      expect(printError).toHaveBeenCalled();
      expect(printTable).toHaveBeenCalled();
    });

    it('errors when organization-id missing for users', async () => {
      vi.mocked(confirm).mockResolvedValue(true);

      await invokeSubcommand('execute', {
        'entity-type': 'users',
        action: 'suspend',
        ids: 'u1',
        force: true,
      });

      expect(printError).toHaveBeenCalledWith(expect.stringContaining('--organization-id'));
      expect(mockBulk.userStatus).not.toHaveBeenCalled();
    });
  });

  describe('execute — common', () => {
    it('aborts when confirmation denied', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      await invokeSubcommand('execute', {
        'entity-type': 'users',
        action: 'suspend',
        ids: 'u1,u2',
        'organization-id': 'org-id',
      });

      expect(mockBulk.userStatus).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Aborted');
    });

    it('skips confirmation with --force', async () => {
      mockBulk.organizationStatus.mockResolvedValue(orgSuccessResult);

      await invokeSubcommand('execute', {
        'entity-type': 'organizations',
        action: 'activate',
        ids: 'o1',
        force: true,
      });

      expect(confirm).not.toHaveBeenCalled();
      expect(mockBulk.organizationStatus).toHaveBeenCalled();
    });

    it('outputs JSON when --json', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockBulk.organizationStatus.mockResolvedValue(orgSuccessResult);

      await invokeSubcommand('execute', {
        'entity-type': 'organizations',
        action: 'suspend',
        ids: 'o1',
        json: true,
        force: true,
      });

      expect(printJson).toHaveBeenCalledWith(orgSuccessResult);
    });

    it('handles errors', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      mockBulk.organizationStatus.mockRejectedValue(new Error('fail'));

      await invokeSubcommand('execute', {
        'entity-type': 'organizations',
        action: 'suspend',
        ids: 'o1',
        force: true,
      });

      expect(handleError).toHaveBeenCalled();
    });
  });
});
