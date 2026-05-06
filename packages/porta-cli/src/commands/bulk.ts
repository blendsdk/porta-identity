/**
 * Bulk command — bulk status operations.
 *
 * Subcommands:
 *   execute    Execute a bulk status operation on organizations or users
 *
 * @module commands/bulk
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, error as printError } from '../output.js';
import { confirm } from '../prompt.js';

// ---------------------------------------------------------------------------
// Arg types
// ---------------------------------------------------------------------------

interface BulkExecuteArgs extends GlobalOptions {
  'entity-type': string;
  action: string;
  ids: string;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const bulkCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'bulk',
  describe: 'Bulk status operations',
  builder: (yargs) =>
    yargs
      .command<BulkExecuteArgs>(
        'execute',
        'Execute a bulk status operation',
        (y) =>
          y
            .option('entity-type', {
              type: 'string',
              describe: 'Entity type',
              choices: ['organizations', 'users'] as const,
              demandOption: true,
            })
            .option('action', {
              type: 'string',
              describe: 'Status action',
              choices: ['suspend', 'activate', 'deactivate', 'lock', 'unlock'] as const,
              demandOption: true,
            })
            .option('ids', {
              type: 'string',
              describe: 'Comma-separated entity IDs',
              demandOption: true,
            }),
        async (argv) => {
          try {
            const ids = argv.ids.split(',').map((id) => id.trim()).filter(Boolean);

            if (ids.length === 0) {
              printError('No IDs provided');
              return;
            }

            if (!argv.force) {
              const ok = await confirm(
                `${argv.action} ${ids.length} ${argv['entity-type']}?`,
              );
              if (!ok) {
                warn('Aborted');
                return;
              }
            }

            const client = createClient(argv);
            const result = await client.bulk.execute({
              entityType: argv['entity-type'] as 'organizations' | 'users',
              action: argv.action as 'suspend' | 'activate' | 'deactivate' | 'lock' | 'unlock',
              ids,
            });

            if (argv.json) {
              printJson(result);
              return;
            }

            success(`Bulk ${argv.action}: ${result.succeeded} succeeded, ${result.failed} failed`);

            if (result.errors.length > 0) {
              console.log();
              printError(`${result.errors.length} error(s):`);
              printTable(
                ['ID', 'Error'],
                result.errors.map((e) => [e.id, e.error]),
              );
            }
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Please specify a bulk subcommand: execute'),
  handler: () => {
    // No-op — subcommands handle execution
  },
};
