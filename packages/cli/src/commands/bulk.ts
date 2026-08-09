/**
 * Bulk command — bulk status operations.
 *
 * Subcommands:
 *   execute    Execute a bulk status operation on organizations or users
 *
 * The server has two separate endpoints:
 *   POST /api/admin/bulk/organizations/status
 *   POST /api/admin/bulk/users/status
 *
 * The CLI routes to the correct SDK method based on --entity-type.
 *
 * @module commands/bulk
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import type { BulkOperationResult } from '@portaidentity/sdk';
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
  reason?: string;
  'organization-id'?: string;
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
              choices: ['suspend', 'activate', 'deactivate', 'lock', 'unlock', 'archive'] as const,
              demandOption: true,
            })
            .option('ids', {
              type: 'string',
              describe: 'Comma-separated entity IDs',
              demandOption: true,
            })
            .option('reason', {
              type: 'string',
              describe: 'Reason for the action (optional)',
            })
            .option('organization-id', {
              type: 'string',
              describe: 'Organization ID scope (required for user operations)',
            }),
        async (argv) => {
          try {
            const ids = argv.ids
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean);

            if (ids.length === 0) {
              printError('No IDs provided');
              return;
            }

            if (!argv.force) {
              const ok = await confirm(`${argv.action} ${ids.length} ${argv['entity-type']}?`);
              if (!ok) {
                warn('Aborted');
                return;
              }
            }

            const client = createClient(argv);
            let result: BulkOperationResult;

            if (argv['entity-type'] === 'organizations') {
              // Route to organization bulk endpoint
              result = await client.bulk.organizationStatus({
                ids,
                action: argv.action as 'activate' | 'suspend' | 'archive',
                reason: argv.reason,
              });
            } else {
              // Route to user bulk endpoint — requires organizationId
              if (!argv['organization-id']) {
                printError('--organization-id is required for user bulk operations');
                return;
              }
              result = await client.bulk.userStatus({
                ids,
                action: argv.action as 'activate' | 'deactivate' | 'suspend' | 'lock' | 'unlock',
                organizationId: argv['organization-id'],
                reason: argv.reason,
              });
            }

            if (argv.json) {
              printJson(result);
              return;
            }

            success(
              `Bulk ${argv.action}: ${result.succeeded} succeeded, ${result.failed} failed (${result.total} total)`,
            );

            // Show per-item failures from results array
            const failures = result.results.filter((r) => !r.success);
            if (failures.length > 0) {
              console.log();
              printError(`${failures.length} error(s):`);
              printTable(
                ['ID', 'Previous Status', 'Error'],
                failures.map((r) => [r.id, r.previousStatus ?? '—', r.error ?? 'Unknown error']),
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
