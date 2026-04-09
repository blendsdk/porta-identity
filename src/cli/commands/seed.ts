/**
 * CLI seed command.
 *
 * Runs seed data for development environments by executing the seed SQL file
 * (migrations/011_seed.sql) against the database. Requires confirmation
 * to prevent accidental execution in production.
 *
 * Usage:
 *   porta seed run           # Run with confirmation prompt
 *   porta seed run --force   # Skip confirmation
 *   porta seed run --dry-run # Preview without executing
 *
 * @module cli/commands/seed
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { success, warn } from '../output.js';
import { confirm } from '../prompt.js';

/** Path to the seed SQL file relative to the project root */
const SEED_FILE = join(process.cwd(), 'migrations', '011_seed.sql');

/**
 * Extract the "Up Migration" portion from the seed SQL file.
 * The file contains both up and down sections separated by "-- Down Migration".
 * We only want the up section when seeding.
 */
function extractUpMigration(sql: string): string {
  const downMarker = '-- Down Migration';
  const downIndex = sql.indexOf(downMarker);
  // If there's a down section, take only the part before it
  return downIndex >= 0 ? sql.substring(0, downIndex).trim() : sql.trim();
}

/** The seed command module — registered at the top level of the CLI */
export const seedCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'seed',
  describe: 'Manage seed data',
  builder: (yargs) => {
    return yargs.command(
      'run',
      'Insert development seed data',
      {},
      async (argv) => {
        const args = argv as unknown as GlobalOptions;
        await withErrorHandling(async () => {
          // Warn if running in production
          if (process.env.NODE_ENV === 'production') {
            warn('Running seed in production environment!');
          }

          if (args['dry-run']) {
            warn('Dry run — would execute seed SQL from migrations/011_seed.sql');
            return;
          }

          // Require confirmation unless --force is set
          const confirmed = await confirm(
            'This will insert seed data into the database. Continue?',
            args.force,
          );
          if (!confirmed) {
            warn('Seed operation cancelled');
            return;
          }

          await withBootstrap(args, async () => {
            const { getPool } = await import('../../lib/database.js');

            // Read and extract the up portion of the seed SQL
            const rawSql = await readFile(SEED_FILE, 'utf-8');
            const upSql = extractUpMigration(rawSql);

            await getPool().query(upSql);
            success('Seed data inserted successfully');
          });
        }, args.verbose);
      },
    ).demandCommand(1, 'Specify a seed subcommand: run');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
