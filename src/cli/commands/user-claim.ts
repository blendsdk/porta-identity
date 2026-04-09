/**
 * CLI user claim subcommands.
 *
 * Manages custom claim values for users — set, get, and delete.
 *
 * Usage:
 *   porta user claims set <user-id> --claim-id <claim-def-id> --value "Engineering"
 *   porta user claims get <user-id> [--app <app-id>]
 *   porta user claims delete <user-id> --claim-id <claim-def-id>
 *
 * @module cli/commands/user-claim
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId, printTotal } from '../output.js';
import { confirm } from '../prompt.js';

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface ClaimSetArgs extends GlobalOptions {
  'user-id': string;
  'claim-id': string;
  value: string;
}

interface ClaimGetArgs extends GlobalOptions {
  'user-id': string;
}

interface ClaimDeleteArgs extends GlobalOptions {
  'user-id': string;
  'claim-id': string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The user claims subcommand group — registered under `user` */
export const userClaimCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'claims',
  describe: 'Manage user custom claim values',
  builder: (yargs) => {
    return yargs
      // ── set ────────────────────────────────────────────────────────
      .command<ClaimSetArgs>(
        'set <user-id>',
        'Set a custom claim value for a user',
        (y) =>
          y
            .positional('user-id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('claim-id', { type: 'string', demandOption: true, description: 'Claim definition UUID' })
            .option('value', { type: 'string', demandOption: true, description: 'Claim value' }),
        async (argv) => {
          const args = argv as unknown as ClaimSetArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { setValue } = await import('../../custom-claims/index.js');
              await setValue(args['user-id'], args['claim-id'], args.value);
              success(`Claim value set for user ${truncateId(args['user-id'])}`);
            });
          }, args.verbose);
        },
      )

      // ── get ────────────────────────────────────────────────────────
      .command<ClaimGetArgs>(
        'get <user-id>',
        'Get custom claim values for a user',
        (y) =>
          y
            .positional('user-id', { type: 'string', demandOption: true, description: 'User UUID' }),
        async (argv) => {
          const args = argv as unknown as ClaimGetArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { getValuesForUser } = await import('../../custom-claims/index.js');
              const values = await getValuesForUser(args['user-id']);

              if (values.length === 0) {
                warn('No claim values found');
                return;
              }

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['Claim ID', 'Name', 'Value'],
                    values.map((v) => [
                      truncateId(v.definition.id),
                      v.definition.claimName,
                      String(v.value.value ?? '—'),
                    ]),
                  );
                  printTotal('claims', values.length);
                },
                values,
              );
            });
          }, args.verbose);
        },
      )

      // ── delete ─────────────────────────────────────────────────────
      .command<ClaimDeleteArgs>(
        'delete <user-id>',
        'Delete a custom claim value for a user',
        (y) =>
          y
            .positional('user-id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('claim-id', { type: 'string', demandOption: true, description: 'Claim definition UUID' }),
        async (argv) => {
          const args = argv as unknown as ClaimDeleteArgs;
          await withErrorHandling(async () => {
            const confirmed = await confirm(
              `Delete claim value for user ${args['user-id']}?`,
              args.force,
            );
            if (!confirmed) {
              warn('Operation cancelled');
              return;
            }
            await withBootstrap(args, async () => {
              const { deleteValue } = await import('../../custom-claims/index.js');
              await deleteValue(args['user-id'], args['claim-id']);
              success(`Claim value deleted for user ${truncateId(args['user-id'])}`);
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify a claims subcommand: set, get, delete');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
