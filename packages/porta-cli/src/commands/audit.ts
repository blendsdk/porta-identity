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
  event?: string;
  org?: string;
  user?: string;
  since?: string;
  limit?: number;
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
            .option('event', {
              type: 'string',
              describe: 'Filter by event type (e.g., "user.login")',
            })
            .option('org', {
              type: 'string',
              describe: 'Filter by organization ID',
            })
            .option('user', {
              type: 'string',
              describe: 'Filter by user ID',
            })
            .option('since', {
              type: 'string',
              describe: 'Filter events after this date (ISO 8601)',
            })
            .option('limit', {
              type: 'number',
              describe: 'Maximum results (default: 50, max: 500)',
            }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const result = await client.audit.list({
              event: argv.event,
              org: argv.org,
              user: argv.user,
              since: argv.since,
              limit: argv.limit,
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
              ['Event', 'Actor', 'Description', 'IP', 'Date'],
              entries.map((e) => [
                e.eventType,
                truncate(e.actorId ?? '—', 12),
                truncate(e.description ?? '—', 40),
                e.ipAddress ?? '—',
                formatDate(e.createdAt),
              ]),
            );
            success(`${entries.length} audit entries`);
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
