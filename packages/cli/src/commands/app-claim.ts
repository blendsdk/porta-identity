/**
 * CLI custom claim definition subcommands.
 *
 * @module commands/app-claim
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import type { ClaimValueType } from '@portaidentity/sdk';

import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, info, formatDate } from '../output.js';
import { confirm } from '../prompt.js';

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface ClaimCreateArgs extends GlobalOptions {
  'app-id': string;
  name: string;
  type: string;
  description?: string;
}

interface ClaimListArgs extends GlobalOptions {
  'app-id': string;
  page: number;
  'page-size': number;
}

interface ClaimShowArgs extends GlobalOptions {
  'app-id': string;
  'claim-id': string;
}

interface ClaimDeleteArgs extends GlobalOptions {
  'app-id': string;
  'claim-id': string;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

export const appClaimCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'claim',
  describe: 'Manage custom claim definitions',
  builder: (yargs) => {
    return yargs
      .command<ClaimCreateArgs>(
        'create <app-id>',
        'Create a custom claim definition',
        (y) =>
          y
            .positional('app-id', {
              type: 'string',
              demandOption: true,
              description: 'Application ID',
            })
            .option('name', { type: 'string', demandOption: true, description: 'Claim name' })
            .option('type', {
              type: 'string',
              demandOption: true,
              choices: ['string', 'number', 'boolean', 'json'],
              description: 'Claim value type',
            })
            .option('description', { type: 'string', description: 'Claim description' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const claim = await client.customClaims.create(argv['app-id'], {
              claimName: argv.name,
              claimType: argv.type as ClaimValueType,
              description: argv.description,
            });

            if (argv.json) {
              printJson(claim);
            } else {
              success(`Claim created: ${claim.claimName} (${claim.claimType})`);
              printTable(
                ['Field', 'Value'],
                [
                  ['ID', claim.id],
                  ['Name', claim.claimName],
                  ['Type', claim.claimType],
                  ['Created', formatDate(claim.createdAt)],
                ],
              );
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<ClaimListArgs>(
        'list <app-id>',
        'List claim definitions for an application',
        (y) =>
          y
            .positional('app-id', {
              type: 'string',
              demandOption: true,
              description: 'Application ID',
            })
            .option('page', { type: 'number', default: 1, description: 'Page number' })
            .option('page-size', { type: 'number', default: 20, description: 'Items per page' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const result = await client.customClaims.list(argv['app-id'], {
              page: argv.page,
              pageSize: argv['page-size'],
            });

            if (result.data.length === 0) {
              warn('No claim definitions found');
              return;
            }

            if (argv.json) {
              printJson(result);
            } else {
              printTable(
                ['ID', 'Name', 'Type', 'Created'],
                result.data.map((c) => [
                  c.id,
                  c.claimName,
                  c.claimType,
                  formatDate(c.createdAt),
                ]),
              );
              info(`Total: ${result.total} claim definitions`);
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<ClaimShowArgs>(
        'show <app-id> <claim-id>',
        'Show claim definition details',
        (y) =>
          y
            .positional('app-id', {
              type: 'string',
              demandOption: true,
              description: 'Application ID',
            })
            .positional('claim-id', {
              type: 'string',
              demandOption: true,
              description: 'Claim definition ID',
            }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const claim = await client.customClaims.get(argv['app-id'], argv['claim-id']);

            if (argv.json) {
              printJson(claim);
            } else {
              printTable(
                ['Field', 'Value'],
                [
                  ['ID', claim.id],
                  ['Name', claim.claimName],
                  ['Type', claim.claimType],
                  ['Description', claim.description ?? '—'],
                  ['Created', formatDate(claim.createdAt)],
                  ['Updated', formatDate(claim.updatedAt)],
                ],
              );
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )

      .command<ClaimDeleteArgs>(
        'delete <app-id> <claim-id>',
        'Permanently delete a claim definition and its values',
        (y) =>
          y
            .positional('app-id', {
              type: 'string',
              demandOption: true,
              description: 'Application ID',
            })
            .positional('claim-id', {
              type: 'string',
              demandOption: true,
              description: 'Claim definition ID',
            }),
        async (argv) => {
            try {
              const client = createClient(argv);
              const claim = await client.customClaims.get(argv['app-id'], argv['claim-id']);
              const confirmed = await confirm(
                `Keep claim "${claim.claimName}" (${claim.claimType}), or Delete ${claim.claimName}? This permanently deletes its user values.`,
              );
              if (!confirmed) {
                warn('Operation cancelled');
                return;
              }
              await client.customClaims.delete(argv['app-id'], argv['claim-id']);
              success(`Claim definition deleted: ${claim.claimName} (${claim.claimType})`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Specify a claim subcommand: create, list, show, delete');
  },
  handler: () => {},
};
