/**
 * CLI user 2FA subcommands.
 *
 * Manages two-factor authentication for users — status, disable, reset.
 * Supports HTTP mode (default, via admin API) and direct-DB mode (--direct).
 *
 * HTTP mode requires --org-id because the API endpoints are org-scoped.
 * Direct mode connects to PostgreSQL directly and ignores --org-id.
 *
 * Usage:
 *   porta user 2fa status <user-id> --org-id <org-uuid>
 *   porta user 2fa disable <user-id> --org-id <org-uuid> [--force]
 *   porta user 2fa reset <user-id> --org-id <org-uuid> [--force]
 *   porta user 2fa status <user-id> --direct    # Direct DB access (offline)
 *
 * @module cli/commands/user-2fa
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap, withHttpClient } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId } from '../output.js';
import { confirm } from '../prompt.js';

// ---------------------------------------------------------------------------
// API response types (for HTTP mode)
// ---------------------------------------------------------------------------

/** 2FA status as returned by the Admin API (GET /two-factor/status) */
interface TwoFactorStatusData {
  enabled: boolean;
  method: string | null;
  totpConfigured: boolean;
  recoveryCodesRemaining: number;
}

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

/** Shared argument shape for all 2FA subcommands */
interface TwoFaArgs extends GlobalOptions {
  id: string;
  direct?: boolean;
  'org-id'?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the user-level 2FA API path.
 *
 * @param orgId - Organization UUID
 * @param userId - User UUID
 * @returns API base path for user 2FA endpoints
 */
function twoFaBasePath(orgId: string, userId: string): string {
  return `/api/admin/organizations/${orgId}/users/${userId}/two-factor`;
}

/**
 * Validate that --org-id is provided for HTTP mode.
 * Throws an Error (caught by withErrorHandling) if missing.
 *
 * @param orgId - The --org-id value from args
 * @returns The validated org ID string
 * @throws Error if orgId is undefined
 */
function validateOrgId(orgId: string | undefined): string {
  if (!orgId) {
    throw new Error(
      'The --org-id flag is required for HTTP mode. Use --direct for offline DB access.',
    );
  }
  return orgId;
}

/**
 * Add --direct and --org-id options to a yargs builder.
 * Shared by all 2FA subcommands for consistent flag definitions.
 *
 * @param y - Yargs builder instance with positional(id) already configured
 * @returns Builder with --direct and --org-id options added
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addModeOptions(y: any): any {
  return y
    .option('direct', {
      type: 'boolean' as const,
      default: false,
      description: 'Use direct DB access (bypass HTTP)',
    })
    .option('org-id', {
      type: 'string' as const,
      description: 'Organization UUID (required for HTTP mode)',
    });
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
      .command<TwoFaArgs>(
        'status <id>',
        'Check 2FA status for a user',
        (y) =>
          addModeOptions(
            y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
          ),
        async (argv) => {
          const args = argv as unknown as TwoFaArgs;
          await withErrorHandling(async () => {
            if (args.direct) {
              // Direct-DB mode: connect to PostgreSQL, look up user + status
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
            } else {
              // HTTP mode: call admin API (requires --org-id)
              const orgId = validateOrgId(args['org-id']);

              await withHttpClient(args, async (client) => {
                const response = await client.get<{ data: TwoFactorStatusData }>(
                  `${twoFaBasePath(orgId, args.id)}/status`,
                );
                const status = response.data.data;

                outputResult(
                  args.json,
                  () => {
                    printTable(
                      ['Field', 'Value'],
                      [
                        ['User ID', truncateId(args.id)],
                        ['2FA Enabled', status.enabled ? '✅ Yes' : '❌ No'],
                        ['Method', status.method ?? '—'],
                        ['TOTP Configured', status.totpConfigured ? '✅ Yes' : '❌ No'],
                        ['Recovery Codes', String(status.recoveryCodesRemaining ?? 0)],
                      ],
                    );
                  },
                  { userId: args.id, ...status },
                );
              });
            }
          }, args.verbose);
        },
      )

      // ── disable ─────────────────────────────────────────────────────
      .command<TwoFaArgs>(
        'disable <id>',
        'Disable 2FA for a user (removes TOTP config, OTP codes, and recovery codes)',
        (y) =>
          addModeOptions(
            y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
          ),
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

            if (args.direct) {
              // Direct-DB mode: connect to PostgreSQL and disable directly
              await withBootstrap(args, async () => {
                const { disableTwoFactor } = await import('../../two-factor/service.js');
                await disableTwoFactor(args.id);
                success(`2FA disabled for user ${truncateId(args.id)}`);
              });
            } else {
              // HTTP mode: call admin API (requires --org-id)
              const orgId = validateOrgId(args['org-id']);

              await withHttpClient(args, async (client) => {
                await client.post(`${twoFaBasePath(orgId, args.id)}/disable`);
                success(`2FA disabled for user ${truncateId(args.id)}`);
              });
            }
          }, args.verbose);
        },
      )

      // ── reset ───────────────────────────────────────────────────────
      .command<TwoFaArgs>(
        'reset <id>',
        'Reset 2FA for a user (disable + clear all 2FA data, user must re-enroll)',
        (y) =>
          addModeOptions(
            y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
          ),
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

            if (args.direct) {
              // Direct-DB mode: connect to PostgreSQL and disable directly
              await withBootstrap(args, async () => {
                const { disableTwoFactor } = await import('../../two-factor/service.js');
                // disableTwoFactor already removes TOTP config, OTP codes, and recovery codes
                await disableTwoFactor(args.id);
                success(`2FA reset for user ${truncateId(args.id)} — user must re-enroll`);
              });
            } else {
              // HTTP mode: call admin API (requires --org-id)
              const orgId = validateOrgId(args['org-id']);

              await withHttpClient(args, async (client) => {
                await client.post(`${twoFaBasePath(orgId, args.id)}/reset`);
                success(`2FA reset for user ${truncateId(args.id)} — user must re-enroll`);
              });
            }
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify a 2fa subcommand: status, disable, reset');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
