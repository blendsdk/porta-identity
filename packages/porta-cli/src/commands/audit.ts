/**
 * Audit command — view audit log entries.
 *
 * Subcommands:
 *   list       List audit log entries with optional filters
 *
 * @module commands/audit
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, formatDate, truncate } from '../output.js';

// ---------------------------------------------------------------------------
// Arg types
// ---------------------------------------------------------------------------

interface AuditListArgs extends GlobalOptions {
  'event-type'?: string;
  'actor-id'?: string;
  'org-id'?: string;
  'resource-type'?: string;
  'resource-id'?: string;
  from?: string;
  to?: string;
  page?: number;
  'page-size'?: number;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const auditCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'audit',
  describe: 'View audit log',
  builder: (yargs) =>
    yargs
      .command<AuditListArgs>(
        'list',
        'List audit log entries',
        (y) =>
          y
            .option('event-type', {
              type: 'string',
              describe: 'Filter by event type',
            })
            .option('actor-id', {
              type: 'string',
              describe: 'Filter by actor ID',
            })
            .option('org-id', {
              type: 'string',
              describe: 'Filter by organization ID',
            })
            .option('resource-type', {
              type: 'string',
              describe: 'Filter by resource type',
            })
            .option('resource-id', {
              type: 'string',
              describe: 'Filter by resource ID',
            })
            .option('from', {
              type: 'string',
              describe: 'Filter from date (ISO 8601)',
            })
            .option('to', {
              type: 'string',
              describe: 'Filter to date (ISO 8601)',
            })
            .option('page', {
              type: 'number',
              describe: 'Page number',
            })
            .option('page-size', {
              type: 'number',
              describe: 'Results per page',
            }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const result = await client.audit.list({
              eventType: argv['event-type'],
              actorId: argv['actor-id'],
              organizationId: argv['org-id'],
              resourceType: argv['resource-type'],
              resourceId: argv['resource-id'],
              from: argv.from,
              to: argv.to,
              page: argv.page,
              pageSize: argv['page-size'],
            });

            if (argv.json) {
              printJson(result);
              return;
            }

            const entries = result.data;
            if (entries.length === 0) {
              warn('No audit entries found');
              return;
            }

            printTable(
              ['Event', 'Actor', 'Resource', 'IP', 'Date'],
              entries.map((e) => [
                e.eventType,
                e.actorEmail ?? truncate(e.actorId ?? '—', 12),
                e.resourceType ? `${e.resourceType}:${truncate(e.resourceId ?? '', 12)}` : '—',
                e.ipAddress ?? '—',
                formatDate(e.createdAt),
              ]),
            );
            success(`${entries.length} audit entries (page ${result.page ?? 1})`);
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Please specify an audit subcommand: list'),
  handler: () => {
    // No-op — subcommands handle execution
  },
};
