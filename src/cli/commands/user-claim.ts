/**
 * CLI user claim subcommands.
 *
 * Manages custom claim values for users via the Admin API — set, get, delete.
 * All operations require an `--app` flag to scope claims to an application.
 *
 * Usage:
 *   porta user claims set <user-id> --app <app-id-or-slug> --claim-id <def-id> --value "Engineering"
 *   porta user claims get <user-id> --app <app-id-or-slug>
 *   porta user claims delete <user-id> --app <app-id-or-slug> --claim-id <def-id>
 *
 * @module cli/commands/user-claim
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';

import { withHttpClient } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, warn, outputResult, truncateId, printTotal } from '../output.js';
import { confirm } from '../prompt.js';
import { resolveApp } from './app.js';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/** Claim value data for a user */
interface UserClaimValue {
  claimId: string;
  claimName: string;
  value: unknown;
}

/** Array response for claim values */
interface UserClaimListResponse { data: UserClaimValue[]; }

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface ClaimSetArgs extends GlobalOptions {
  'user-id': string;
  app: string;
  'claim-id': string;
  value: string;
}

interface ClaimGetArgs extends GlobalOptions {
  'user-id': string;
  app: string;
}

interface ClaimDeleteArgs extends GlobalOptions {
  'user-id': string;
  app: string;
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
            .option('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' })
            .option('claim-id', { type: 'string', demandOption: true, description: 'Claim definition UUID' })
            .option('value', { type: 'string', demandOption: true, description: 'Claim value' }),
        async (argv) => {
          const args = argv as unknown as ClaimSetArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const app = await resolveApp(client, args.app);
              // PUT /api/admin/applications/:appId/claims/:claimId/users/:userId
              await client.put(
                `/api/admin/applications/${app.id}/claims/${args['claim-id']}/users/${args['user-id']}`,
                { value: args.value },
              );
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
            .positional('user-id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' }),
        async (argv) => {
          const args = argv as unknown as ClaimGetArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const app = await resolveApp(client, args.app);
              // GET /api/admin/applications/:appId/claims/users/:userId
              const resp = await client.get<UserClaimListResponse>(
                `/api/admin/applications/${app.id}/claims/users/${args['user-id']}`,
              );
              const values = resp.data.data;

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
                      truncateId(v.claimId),
                      v.claimName,
                      String(v.value ?? '—'),
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
            .option('app', { type: 'string', demandOption: true, description: 'Application UUID or slug' })
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
            await withHttpClient(args, async (client) => {
              const app = await resolveApp(client, args.app);
              // DELETE /api/admin/applications/:appId/claims/:claimId/users/:userId
              await client.delete(
                `/api/admin/applications/${app.id}/claims/${args['claim-id']}/users/${args['user-id']}`,
              );
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
