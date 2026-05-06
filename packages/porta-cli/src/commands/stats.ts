/**
 * Stats command — view dashboard statistics.
 *
 * Subcommands:
 *   show       Display dashboard statistics
 *
 * @module commands/stats
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success } from '../output.js';

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const statsCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'stats',
  describe: 'View dashboard statistics',
  builder: (yargs) =>
    yargs
      .command<GlobalOptions>(
        'show',
        'Display dashboard statistics',
        (y) => y,
        async (argv) => {
          try {
            const client = createClient(argv);
            const stats = await client.stats.get();

            if (argv.json) {
              printJson(stats);
              return;
            }

            printTable(
              ['Metric', 'Total', 'Active'],
              [
                ['Organizations', String(stats.organizations.total), String(stats.organizations.active)],
                ['Applications', String(stats.applications.total), String(stats.applications.active)],
                ['Clients', String(stats.clients.total), String(stats.clients.active)],
                ['Users', String(stats.users.total), String(stats.users.active)],
                ['Active Sessions', String(stats.activeSessionCount), '—'],
                ['Audit Events', String(stats.auditEventCount), '—'],
              ],
            );
            success('Dashboard statistics');
          } catch (err) {
            handleError(err, argv.verbose);
          }
        },
      )
      .demandCommand(1, 'Please specify a stats subcommand: show'),
  handler: () => {
    // No-op — subcommands handle execution
  },
};
