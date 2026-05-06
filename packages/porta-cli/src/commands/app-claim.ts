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
import { printTable, printJson, success, warn, info, formatDate, truncate } from '../output.js';

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

interface ClaimCreateArgs extends GlobalOptions {
  'app-id': string;
  name: string;
  slug?: string;
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

interface ClaimArchiveArgs extends GlobalOptions {
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
            .positional('app-id', { type: 'string', demandOption: true, description: 'Application ID' })
            .option('name', { type: 'string', demandOption: true, description: 'Claim name' })
            .option('slug', { type: 'string', description: 'Claim slug' })
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
              applicationId: argv['app-id'],
              name: argv.name,
              slug: argv.slug,
              valueType: argv.type as ClaimValueType,
              description: argv.description,
            });

            if (argv.json) {
              printJson(claim);
            } else {
              success(`Claim created: ${claim.name} (${claim.slug})`);
              printTable(
                ['Field', 'Value'],
                [
                  ['ID', claim.id],
                  ['Name', claim.name],
                  ['Slug', claim.slug],
                  ['Type', claim.valueType],
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
            .positional('app-id', { type: 'string', demandOption: true, description: 'Application ID' })
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
                ['ID', 'Name', 'Slug', 'Type', 'Created'],
                result.data.map((c) => [
                  truncate(c.id, 8),
                  c.name,
                  c.slug,
                  c.valueType,
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
            .positional('app-id', { type: 'string', demandOption: true, description: 'Application ID' })
            .positional('claim-id', { type: 'string', demandOption: true, description: 'Claim definition ID' }),
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
                  ['Name', claim.name],
                  ['Slug', claim.slug],
                  ['Type', claim.valueType],
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

      .command<ClaimArchiveArgs>(
        'archive <app-id> <claim-id>',
        'Archive a claim definition',
        (y) =>
          y
            .positional('app-id', { type: 'string', demandOption: true, description: 'Application ID' })
            .positional('claim-id', { type: 'string', demandOption: true, description: 'Claim definition ID' }),
        async (argv) => {
          try {
            const client = createClient(argv);
            await client.customClaims.archive(argv['app-id'], argv['claim-id']);
            success('Claim definition archived');
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Specify a claim subcommand: create, list, show, archive');
  },
  handler: () => {},
};
