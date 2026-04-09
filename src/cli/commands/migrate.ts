/**
 * CLI migration commands.
 *
 * Manages database schema migrations using the existing migrator module
 * (node-pg-migrate). Provides up, down, and status subcommands.
 *
 * Usage:
 *   porta migrate up              # Apply all pending migrations
 *   porta migrate down            # Rollback last migration
 *   porta migrate down --count 3  # Rollback last 3 migrations
 *   porta migrate status          # Show migration status
 *
 * @module cli/commands/migrate
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { success, warn } from '../output.js';

/** Extended args for the migrate down subcommand */
interface MigrateDownArgs extends GlobalOptions {
  count: number;
}

/** The migrate command module — registered at the top level of the CLI */
export const migrateCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'migrate',
  describe: 'Manage database migrations',
  builder: (yargs) => {
    return yargs
      .command(
        'up',
        'Apply all pending migrations',
        {},
        async (argv) => {
          const args = argv as unknown as GlobalOptions;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              // Dynamic import to delay config loading until after env overrides
              const { runMigrations } = await import('../../lib/migrator.js');

              if (args['dry-run']) {
                warn('Dry run — no migrations applied');
                return;
              }

              await runMigrations('up');
              success('All migrations applied');
            });
          }, args.verbose);
        },
      )
      .command<MigrateDownArgs>(
        'down',
        'Rollback migrations',
        (y) =>
          y.option('count', {
            type: 'number',
            default: 1,
            description: 'Number of migrations to rollback',
          }),
        async (argv) => {
          const args = argv as unknown as MigrateDownArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { runMigrations } = await import('../../lib/migrator.js');

              if (args['dry-run']) {
                warn(`Dry run — would rollback ${args.count} migration(s)`);
                return;
              }

              await runMigrations('down', args.count);
              success(`Rolled back ${args.count} migration(s)`);
            });
          }, args.verbose);
        },
      )
      .command(
        'status',
        'Show migration status',
        {},
        async (argv) => {
          const args = argv as unknown as GlobalOptions;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              // Query the pgmigrations table directly to show applied migrations
              const { getPool } = await import('../../lib/database.js');
              const result = await getPool().query(
                'SELECT id, name, run_on FROM pgmigrations ORDER BY id',
              );

              if (result.rows.length === 0) {
                warn('No migrations have been applied');
                return;
              }

              // Dynamic import for output helpers (keeps top-level imports clean)
              const { printTable, outputResult, formatDate, printTotal } =
                await import('../output.js');

              outputResult(
                args.json,
                () => {
                  const rows = result.rows.map((r: { id: number; name: string; run_on: string }) => [
                    String(r.id),
                    r.name,
                    formatDate(r.run_on),
                  ]);
                  printTable(['ID', 'Name', 'Applied'], rows);
                  printTotal('migrations applied', result.rows.length);
                },
                result.rows,
              );
            });
          }, args.verbose);
        },
      )
      .demandCommand(1, 'Specify a migrate subcommand: up, down, status');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
