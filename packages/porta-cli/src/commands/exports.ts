/**
 * Exports command — export data as CSV or JSON.
 *
 * Subcommands:
 *   download   Export entity data to a file or stdout
 *
 * @module commands/exports
 */

import fs from 'node:fs';
import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { success, info } from '../output.js';

// ---------------------------------------------------------------------------
// Arg types
// ---------------------------------------------------------------------------

interface ExportDownloadArgs extends GlobalOptions {
  'entity-type': string;
  format: string;
  'org-id'?: string;
  'app-id'?: string;
  output?: string;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const exportsCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'exports',
  describe: 'Export data as CSV or JSON',
  builder: (yargs) =>
    yargs
      .command<ExportDownloadArgs>(
        'download',
        'Export entity data',
        (y) =>
          y
            .option('entity-type', {
              type: 'string',
              describe: 'Entity type to export',
              choices: ['organizations', 'applications', 'clients', 'users', 'roles', 'permissions', 'audit'] as const,
              demandOption: true,
            })
            .option('format', {
              type: 'string',
              describe: 'Export format',
              choices: ['csv', 'json'] as const,
              default: 'csv',
            })
            .option('org-id', {
              type: 'string',
              describe: 'Filter by organization ID',
            })
            .option('app-id', {
              type: 'string',
              describe: 'Filter by application ID',
            })
            .option('output', {
              alias: 'o',
              type: 'string',
              describe: 'Output file path (default: stdout)',
            }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const response = await client.exports.download({
              entityType: argv['entity-type'] as 'organizations' | 'applications' | 'clients' | 'users' | 'roles' | 'permissions' | 'audit',
              format: argv.format as 'csv' | 'json',
              organizationId: argv['org-id'],
              applicationId: argv['app-id'],
            });

            // The SDK returns a TransportResponse with raw body
            const content = typeof response.body === 'string'
              ? response.body
              : JSON.stringify(response.body, null, 2);

            if (argv.output) {
              fs.writeFileSync(argv.output, content, 'utf-8');
              success(`Exported ${argv['entity-type']} to ${argv.output}`);
            } else {
              // Write to stdout
              process.stdout.write(content);
              if (!content.endsWith('\n')) {
                process.stdout.write('\n');
              }
              info(`Exported ${argv['entity-type']} (${argv.format})`);
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Please specify an exports subcommand: download'),
  handler: () => {
    // No-op — subcommands handle execution
  },
};
