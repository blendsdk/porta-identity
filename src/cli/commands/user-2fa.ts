/**
 * CLI user 2FA subcommands.
 *
 * Manages two-factor authentication for users — status, disable, reset.
 *
 * Usage:
 *   porta user 2fa status <user-id>
 *   porta user 2fa disable <user-id> [--force]
 *   porta user 2fa reset <user-id> [--force]
 *
 * @module cli/commands/user-2fa
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId } from '../output.js';
import { confirm } from '../prompt.js';

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface TwoFaStatusArgs extends GlobalOptions {
  id: string;
}

interface TwoFaDisableArgs extends GlobalOptions {
  id: string;
}

interface TwoFaResetArgs extends GlobalOptions {
  id: string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The user 2fa subcommand group — registered under `user` */
export const userTwoFaCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: '2fa',
  describe: 'Manage user two-factor authentication',
  builder: (yargs) => {
    return yargs
      // ── status ──────────────────────────────────────────────────────
      .command<TwoFaStatusArgs>(
        'status <id>',
        'Check 2FA status for a user',
        (y) =>
          y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
        async (argv) => {
          const args = argv as unknown as TwoFaStatusArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { getTwoFactorStatus } = await import('../../two-factor/service.js');
              const { findUserById } = await import('../../users/repository.js');

              const user = await findUserById(args.id);
              if (!user) {
                warn(`User ${args.id} not found`);
                return;
              }

              const status = await getTwoFactorStatus(args.id);

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['Field', 'Value'],
                    [
                      ['User ID', truncateId(args.id)],
                      ['Email', user.email],
                      ['2FA Enabled', status.enabled ? '✅ Yes' : '❌ No'],
                      ['Method', status.method ?? '—'],
                      ['TOTP Configured', status.totpConfigured ? '✅ Yes' : '❌ No'],
                      ['Recovery Codes', String(status.recoveryCodesRemaining ?? 0)],
                    ],
                  );
                },
                { userId: args.id, email: user.email, ...status },
              );
            });
          }, args.verbose);
        },
      )

      // ── disable ─────────────────────────────────────────────────────
      .command<TwoFaDisableArgs>(
        'disable <id>',
        'Disable 2FA for a user (removes TOTP config, OTP codes, and recovery codes)',
        (y) =>
          y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
        async (argv) => {
          const args = argv as unknown as TwoFaDisableArgs;
          await withErrorHandling(async () => {
            const confirmed = await confirm(
              `Disable 2FA for user ${args.id}? This will remove all 2FA configuration.`,
              args.force,
            );
            if (!confirmed) {
              warn('Operation cancelled');
              return;
            }
            await withBootstrap(args, async () => {
              const { disableTwoFactor } = await import('../../two-factor/service.js');
              await disableTwoFactor(args.id);
              success(`2FA disabled for user ${truncateId(args.id)}`);
            });
          }, args.verbose);
        },
      )

      // ── reset ───────────────────────────────────────────────────────
      .command<TwoFaResetArgs>(
        'reset <id>',
        'Reset 2FA for a user (disable + clear all 2FA data, user must re-enroll)',
        (y) =>
          y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
        async (argv) => {
          const args = argv as unknown as TwoFaResetArgs;
          await withErrorHandling(async () => {
            const confirmed = await confirm(
              `Reset 2FA for user ${args.id}? This will completely remove all 2FA data and the user will need to re-enroll.`,
              args.force,
            );
            if (!confirmed) {
              warn('Operation cancelled');
              return;
            }
            await withBootstrap(args, async () => {
              const { disableTwoFactor } = await import('../../two-factor/service.js');
              // disableTwoFactor already removes TOTP config, OTP codes, and recovery codes
              await disableTwoFactor(args.id);
              success(`2FA reset for user ${truncateId(args.id)} — user must re-enroll`);
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify a 2fa subcommand: status, disable, reset');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
