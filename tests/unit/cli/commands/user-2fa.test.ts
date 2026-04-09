/**
 * Unit tests for the CLI user 2FA commands (status, disable, reset).
 *
 * Mocks service layer, bootstrap, prompt, and output utilities to test
 * command handler logic in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withBootstrap: vi.fn(async (_args: unknown, fn: () => Promise<void>) => fn()),
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

vi.mock('../../../../src/two-factor/service.js', () => ({
  getTwoFactorStatus: vi.fn().mockResolvedValue({
    enabled: true,
    method: 'totp',
    totpConfigured: true,
    recoveryCodesRemaining: 8,
  }),
  disableTwoFactor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/users/repository.js', () => ({
  findUserById: vi.fn().mockResolvedValue({
    id: 'user-uuid-1',
    email: 'user@example.com',
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { userTwoFaCommand } from '../../../../src/cli/commands/user-2fa.js';
import { success, warn, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import { getTwoFactorStatus, disableTwoFactor } from '../../../../src/two-factor/service.js';
import { findUserById } from '../../../../src/users/repository.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Execute a subcommand by building yargs and running it. */
async function runSubcommand(args: string[]) {
  // Dynamically import yargs to build the command
  const yargs = (await import('yargs')).default;
  const parser = yargs()
    .command(userTwoFaCommand as any)
    .fail(false)
    .exitProcess(false);

  await parser.parseAsync(['2fa', ...args, '--force']);
}

describe('CLI user 2fa commands', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('userTwoFaCommand', () => {
    it('should have the correct command name', () => {
      expect(userTwoFaCommand.command).toBe('2fa');
    });

    it('should have a description', () => {
      expect(userTwoFaCommand.describe).toBeTruthy();
    });
  });

  describe('2fa status', () => {
    it('should display 2FA status for a user', async () => {
      await runSubcommand(['status', 'user-uuid-1']);

      expect(getTwoFactorStatus).toHaveBeenCalledWith('user-uuid-1');
      expect(printTable).toHaveBeenCalled();
    });

    it('should warn when user is not found', async () => {
      (findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await runSubcommand(['status', 'nonexistent']);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });
  });

  describe('2fa disable', () => {
    it('should disable 2FA after confirmation', async () => {
      await runSubcommand(['disable', 'user-uuid-1']);

      expect(disableTwoFactor).toHaveBeenCalledWith('user-uuid-1');
      expect(success).toHaveBeenCalled();
    });

    it('should warn when operation is cancelled', async () => {
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      await runSubcommand(['disable', 'user-uuid-1']);

      expect(disableTwoFactor).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });
  });

  describe('2fa reset', () => {
    it('should reset 2FA after confirmation', async () => {
      await runSubcommand(['reset', 'user-uuid-1']);

      expect(disableTwoFactor).toHaveBeenCalledWith('user-uuid-1');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('reset'));
    });

    it('should warn when operation is cancelled', async () => {
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      await runSubcommand(['reset', 'user-uuid-1']);

      expect(disableTwoFactor).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Operation cancelled');
    });
  });
});
