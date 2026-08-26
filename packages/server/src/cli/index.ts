#!/usr/bin/env node

/**
 * Porta server CLI entry point — infrastructure commands only.
 *
 * This is the reduced server-embedded CLI that ships inside the Docker image.
 * It provides only direct-DB commands that need to run before or without
 * the HTTP server (bootstrap, migrations, seed, health check, 2FA admin).
 *
 * All HTTP-based admin commands (org, app, client, user, keys, config,
 * audit, sessions, stats, bulk, exports, provision) have been extracted
 * to the standalone `@portaidentity/cli` package.
 *
 * Usage: porta <command> <subcommand> [options]
 *
 * Commands:
 *   init       Bootstrap admin infrastructure (first-time setup)
 *   migrate    Run database migrations (up/down/status)
 *   seed       Load development seed data
 *   health     Check server health (--direct mode, DB + Redis)
 *   user       2FA admin commands (status/disable/reset --direct)
 *
 * Global options:
 *   --json          Output in JSON format (default: table)
 *   --verbose       Show detailed output including stack traces on error
 *   --force         Skip confirmation prompts for destructive operations
 *   --dry-run       Preview destructive operations without executing
 *   --database-url  Override DATABASE_URL from .env
 *   --redis-url     Override REDIS_URL from .env
 */

import yargs, { type Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';
import { initCommand } from './commands/init.js';
import { migrateCommand } from './commands/migrate.js';
import { seedCommand } from './commands/seed.js';
import { healthCommand } from './commands/health.js';
import { userCommand } from './commands/user-2fa.js';

/** Global option types shared by all commands */
export interface GlobalOptions {
  json: boolean;
  verbose: boolean;
  force: boolean;
  'dry-run': boolean;
  'database-url'?: string;
  'redis-url'?: string;
}

/**
 * Build and configure the CLI application.
 *
 * Creates a yargs instance with all global options and command registrations.
 * Separated from execution for testability — the entry point calls buildCli()
 * then .parse(), while tests can inspect the builder without executing.
 */
export function buildCli(argv?: string[]): Argv<GlobalOptions> {
  const args = argv ?? hideBin(process.argv);

  const cli = yargs(args)
    .scriptName('porta')
    .usage('$0 <command> [options]')
    // Global options available to all commands
    .option('json', {
      type: 'boolean',
      default: false,
      description: 'Output in JSON format',
    })
    .option('verbose', {
      type: 'boolean',
      default: false,
      description: 'Verbose output',
    })
    .option('force', {
      type: 'boolean',
      default: false,
      description: 'Skip confirmation prompts',
    })
    .option('dry-run', {
      type: 'boolean',
      default: false,
      description: 'Preview destructive operations',
    })
    .option('database-url', {
      type: 'string',
      description: 'PostgreSQL connection URL override',
    })
    .option('redis-url', {
      type: 'string',
      description: 'Redis connection URL override',
    })
    // Infrastructure commands (direct-DB only)
    .command(initCommand)
    .command(migrateCommand)
    .command(seedCommand)
    .command(healthCommand)
    .command(userCommand)
    .demandCommand(1, 'You need to specify a command')
    .strict()
    .help()
    .version()
    .epilogue(
      'For full admin CLI (org, app, client, user, etc.), install @portaidentity/cli',
    )
    .wrap(Math.min(120, process.stdout.columns ?? 80));

  return cli as Argv<GlobalOptions>;
}

// Only execute when run directly (not when imported for testing)
// Node ESM doesn't have require.main, so we check if the file is the entry point
// by looking at process.argv — tsx and node both set argv[1] to the executed file
const isDirectExecution =
  process.argv[1]?.includes('cli/index') || process.argv[1]?.endsWith('porta');

if (isDirectExecution) {
  await buildCli().parse();
}
