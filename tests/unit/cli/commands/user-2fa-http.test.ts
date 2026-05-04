/**
 * Unit tests for the CLI user 2FA commands in HTTP mode.
 *
 * Tests the withHttpClient path: authenticated HTTP requests to the
 * admin API, --org-id validation, correct API paths, and error handling.
 * Direct-DB mode (--direct) tests are in user-2fa.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock HTTP client
// ---------------------------------------------------------------------------

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockClient = { get: mockGet, post: mockPost };

vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withBootstrap: vi.fn(async (_args: unknown, fn: () => Promise<void>) => fn()),
  withHttpClient: vi.fn(
    async (_args: unknown, fn: (client: typeof mockClient) => Promise<void>) => fn(mockClient),
  ),
}));

vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandling: vi.fn(async (fn: () => Promise<void>) => fn()),
}));

vi.mock('../../../../src/cli/output.js', () => ({
  printTable: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  outputResult: vi.fn((_json: boolean, tableFn: () => void) => tableFn()),
  truncateId: vi.fn((id: string) => id.slice(0, 8)),
}));

vi.mock('../../../../src/cli/prompt.js', () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { userTwoFaCommand } from '../../../../src/cli/commands/user-2fa.js';
import { withHttpClient } from '../../../../src/cli/bootstrap.js';
import { success, warn, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_ORG_ID = 'org-uuid-1';
const TEST_USER_ID = 'user-uuid-1';

/** Expected API base path for the test user */
const expectedBasePath = `/api/admin/organizations/${TEST_ORG_ID}/users/${TEST_USER_ID}/two-factor`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Execute a subcommand in HTTP mode with --org-id provided. */
async function runHttpSubcommand(args: string[]) {
  const yargs = (await import('yargs')).default;
  const parser = yargs()
    .command(userTwoFaCommand as any)
    .fail(false)
    .exitProcess(false);

  await parser.parseAsync(['2fa', ...args, '--force', '--org-id', TEST_ORG_ID]);
}

/** Execute a subcommand without --org-id (for validation tests). */
async function runWithoutOrgId(args: string[]) {
  const yargs = (await import('yargs')).default;
  const parser = yargs()
    .command(userTwoFaCommand as any)
    .fail(false)
    .exitProcess(false);

  await parser.parseAsync(['2fa', ...args, '--force']);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI user 2fa commands — HTTP mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock response for GET /status
    mockGet.mockResolvedValue({
      data: {
        data: {
          enabled: true,
          method: 'totp',
          totpConfigured: true,
          recoveryCodesRemaining: 8,
        },
      },
    });

    // Default mock response for POST (disable/reset → 204)
    mockPost.mockResolvedValue({ status: 204, data: {} });
  });

  // -------------------------------------------------------------------------
  // status command
  // -------------------------------------------------------------------------
  describe('2fa status (HTTP)', () => {
    it('should call GET /two-factor/status via HTTP client', async () => {
      await runHttpSubcommand(['status', TEST_USER_ID]);

      expect(withHttpClient).toHaveBeenCalled();
      expect(mockGet).toHaveBeenCalledWith(`${expectedBasePath}/status`);
    });

    it('should display status table from API response', async () => {
      await runHttpSubcommand(['status', TEST_USER_ID]);

      expect(printTable).toHaveBeenCalledWith(
        ['Field', 'Value'],
        expect.arrayContaining([
          expect.arrayContaining(['2FA Enabled', '✅ Yes']),
          expect.arrayContaining(['Method', 'totp']),
          expect.arrayContaining(['TOTP Configured', '✅ Yes']),
          expect.arrayContaining(['Recovery Codes', '8']),
        ]),
      );
    });

    it('should display disabled status correctly', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          data: {
            enabled: false,
            method: null,
            totpConfigured: false,
            recoveryCodesRemaining: 0,
          },
        },
      });

      await runHttpSubcommand(['status', TEST_USER_ID]);

      expect(printTable).toHaveBeenCalledWith(
        ['Field', 'Value'],
        expect.arrayContaining([
          expect.arrayContaining(['2FA Enabled', '❌ No']),
          expect.arrayContaining(['Method', '—']),
        ]),
      );
    });
  });

  // -------------------------------------------------------------------------
  // disable command
  // -------------------------------------------------------------------------
  describe('2fa disable (HTTP)', () => {
    it('should call POST /two-factor/disable via HTTP client', async () => {
      await runHttpSubcommand(['disable', TEST_USER_ID]);

      expect(withHttpClient).toHaveBeenCalled();
      expect(mockPost).toHaveBeenCalledWith(`${expectedBasePath}/disable`);
    });

    it('should show success message after disable', async () => {
      await runHttpSubcommand(['disable', TEST_USER_ID]);

      expect(success).toHaveBeenCalledWith(expect.stringContaining('disabled'));
    });

    it('should not call API when operation is cancelled', async () => {
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      await runHttpSubcommand(['disable', TEST_USER_ID]);

      expect(mockPost).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });
  });

  // -------------------------------------------------------------------------
  // reset command
  // -------------------------------------------------------------------------
  describe('2fa reset (HTTP)', () => {
    it('should call POST /two-factor/reset via HTTP client', async () => {
      await runHttpSubcommand(['reset', TEST_USER_ID]);

      expect(withHttpClient).toHaveBeenCalled();
      expect(mockPost).toHaveBeenCalledWith(`${expectedBasePath}/reset`);
    });

    it('should show success message with re-enroll hint after reset', async () => {
      await runHttpSubcommand(['reset', TEST_USER_ID]);

      expect(success).toHaveBeenCalledWith(expect.stringContaining('reset'));
      expect(success).toHaveBeenCalledWith(expect.stringContaining('re-enroll'));
    });

    it('should not call API when operation is cancelled', async () => {
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      await runHttpSubcommand(['reset', TEST_USER_ID]);

      expect(mockPost).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });
  });

  // -------------------------------------------------------------------------
  // --org-id validation
  // -------------------------------------------------------------------------
  describe('--org-id validation', () => {
    it('should throw when --org-id is missing for status in HTTP mode', async () => {
      await expect(runWithoutOrgId(['status', TEST_USER_ID])).rejects.toThrow(
        '--org-id flag is required',
      );
    });

    it('should throw when --org-id is missing for disable in HTTP mode', async () => {
      await expect(runWithoutOrgId(['disable', TEST_USER_ID])).rejects.toThrow(
        '--org-id flag is required',
      );
    });

    it('should throw when --org-id is missing for reset in HTTP mode', async () => {
      await expect(runWithoutOrgId(['reset', TEST_USER_ID])).rejects.toThrow(
        '--org-id flag is required',
      );
    });

    it('should suggest --direct when --org-id is missing', async () => {
      await expect(runWithoutOrgId(['status', TEST_USER_ID])).rejects.toThrow(
        '--direct',
      );
    });
  });
});
