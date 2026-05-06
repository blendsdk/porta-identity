/**
 * CLI user custom claim value subcommands.
 *
 * Manages custom claim values for users within an organization.
 *
 * Usage:
 *   porta user claims list --org <org-id> <user-id>
 *   porta user claims set --org <org-id> <user-id> --claim <claim-id> --value <value>
 *   porta user claims remove --org <org-id> <user-id> --claim <claim-id>
 *
 * @module commands/user-claim
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';

import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, info, truncate } from '../output.js';

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface ClaimListArgs extends GlobalOptions {
  org: string;
  'user-id': string;
}

interface ClaimSetArgs extends ClaimListArgs {
  claim: string;
  value: string;
}

interface ClaimRemoveArgs extends ClaimListArgs {
  claim: string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** User claims subcommand group — registered under `user` */
export const userClaimsCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'claims',
  describe: 'Manage user custom claim values',
  builder: (yargs) => {
    return yargs
      // ── list ───────────────────────────────────────────────────────
      .command<ClaimListArgs>(
        'list <user-id>',
        'List custom claim values for a user',
        (y) =>
          y
            .positional('user-id', {
              type: 'string',
              demandOption: true,
              description: 'User UUID',
            })
            .option('org', {
              type: 'string',
              demandOption: true,
              description: 'Organization UUID',
            }),
        async (argv) => {
          try {
            const sdkClient = createClient(argv);
            const claims = await sdkClient.userClaims.list(argv.org, argv['user-id']);

            if (claims.length === 0) {
              warn('No custom claims set');
              return;
            }

            if (argv.json) {
              printJson(claims);
            } else {
              printTable(
                ['Claim ID', 'Claim Name', 'Value'],
                claims.map((c) => [
                  truncate(c.claimDefinitionId, 8),
                  c.claimName ?? '—',
                  String(c.value),
                ]),
              );
              info(`Total: ${claims.length} claims`);
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      // ── set ────────────────────────────────────────────────────────
      .command<ClaimSetArgs>(
        'set <user-id>',
        'Set a custom claim value for a user',
        (y) =>
          y
            .positional('user-id', {
              type: 'string',
              demandOption: true,
              description: 'User UUID',
            })
            .option('org', {
              type: 'string',
              demandOption: true,
              description: 'Organization UUID',
            })
            .option('claim', {
              type: 'string',
              demandOption: true,
              description: 'Claim definition UUID',
            })
            .option('value', {
              type: 'string',
              demandOption: true,
              description: 'Claim value',
            }),
        async (argv) => {
          try {
            const sdkClient = createClient(argv);
            await sdkClient.userClaims.set(argv.org, argv['user-id'], argv.claim, argv.value);
            success(`Claim ${argv.claim} set for user ${argv['user-id']}`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      // ── remove ─────────────────────────────────────────────────────
      .command<ClaimRemoveArgs>(
        'remove <user-id>',
        'Remove a custom claim value from a user',
        (y) =>
          y
            .positional('user-id', {
              type: 'string',
              demandOption: true,
              description: 'User UUID',
            })
            .option('org', {
              type: 'string',
              demandOption: true,
              description: 'Organization UUID',
            })
            .option('claim', {
              type: 'string',
              demandOption: true,
              description: 'Claim definition UUID to remove',
            }),
        async (argv) => {
          try {
            const sdkClient = createClient(argv);
            await sdkClient.userClaims.remove(argv.org, argv['user-id'], argv.claim);
            success(`Claim ${argv.claim} removed from user ${argv['user-id']}`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Specify a claims subcommand: list, set, remove');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
