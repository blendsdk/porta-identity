/**
 * CLI user 2FA subcommands — direct-DB mode only.
 *
 * Manages two-factor authentication for users — status, disable, reset.
 * Uses direct database access via withBootstrap.
 *
 * HTTP-based 2FA management is available in the standalone
 * `@portaidentity/cli` package via the `user` command.
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

/** Shared argument shape for all 2FA subcommands */
interface TwoFaArgs extends GlobalOptions {
  id: string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The user 2fa subcommand group — registered as `user` in the reduced CLI */
export const userTwoFaCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: '2fa',
  describe: 'Manage user two-factor authentication (direct-DB)',
  builder: (yargs) => {
    return yargs
      // ── status ──────────────────────────────────────────────────────
      .command<TwoFaArgs>(
        'status <id>',
        'Check 2FA status for a user',
        (y) =>
          y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
        async (argv) => {
          const args = argv as unknown as TwoFaArgs;
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
      .command<TwoFaArgs>(
        'disable <id>',
        'Disable 2FA for a user (removes TOTP config, OTP codes, and recovery codes)',
        (y) =>
          y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
        async (argv) => {
          const args = argv as unknown as TwoFaArgs;
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
      .command<TwoFaArgs>(
        'reset <id>',
        'Reset 2FA for a user (disable + clear all 2FA data, user must re-enroll)',
        (y) =>
          y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
        async (argv) => {
          const args = argv as unknown as TwoFaArgs;
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

/**
 * The `user` command for the reduced server CLI.
 *
 * In the Docker-embedded CLI, the only `user` subcommand is `2fa`
 * for direct-DB two-factor administration. All other user management
 * (CRUD, status, roles, claims) is in `@portaidentity/cli`.
 */
export const userCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'user',
  describe: 'User administration (2FA only, direct-DB)',
  builder: (yargs) => {
    return yargs
      .command(userTwoFaCommand)
      .demandCommand(1, 'Specify a user subcommand: 2fa');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
