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

            // Entity counts — StatusCounts always includes `total`; `active`
            // may be absent if there are no active rows, so default to 0.
            printTable(
              ['Metric', 'Total', 'Active'],
              [
                [
                  'Organizations',
                  String(stats.organizations.total),
                  String(stats.organizations.active ?? 0),
                ],
                [
                  'Applications',
                  String(stats.applications.total),
                  String(stats.applications.active ?? 0),
                ],
                ['Clients', String(stats.clients.total), String(stats.clients.active ?? 0)],
                ['Users', String(stats.users.total), String(stats.users.active ?? 0)],
              ],
            );

            // Login activity (successful / failed) across rolling windows.
            printTable(
              ['Window', 'Successful', 'Failed'],
              [
                [
                  'Last 24h',
                  String(stats.loginActivity.last24h.successful),
                  String(stats.loginActivity.last24h.failed),
                ],
                [
                  'Last 7d',
                  String(stats.loginActivity.last7d.successful),
                  String(stats.loginActivity.last7d.failed),
                ],
                [
                  'Last 30d',
                  String(stats.loginActivity.last30d.successful),
                  String(stats.loginActivity.last30d.failed),
                ],
              ],
            );

            // System health.
            printTable(
              ['Service', 'Healthy'],
              [
                ['Database', stats.systemHealth.database ? 'Yes' : 'No'],
                ['Redis', stats.systemHealth.redis ? 'Yes' : 'No'],
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
