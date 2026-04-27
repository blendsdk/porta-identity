#!/usr/bin/env node

/**
 * Porta CLI entry point.
 *
 * Sets up yargs with global options and registers all command modules.
 * Each command module handles its own subcommand registration.
 *
 * The CLI is a thin presentation layer over the existing service modules.
 * It connects to DB/Redis, runs a single command, and disconnects.
 *
 * Usage: porta <command> <subcommand> [options]
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
import { healthCommand } from './commands/health.js';
import { migrateCommand } from './commands/migrate.js';
import { seedCommand } from './commands/seed.js';
import { keysCommand } from './commands/keys.js';
import { configCommand } from './commands/config.js';
import { auditCommand } from './commands/audit.js';
import { orgCommand } from './commands/org.js';
import { appCommand } from './commands/app.js';
import { clientCommand } from './commands/client.js';
import { userCommand } from './commands/user.js';
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { provisionCommand } from './commands/provision.js';

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
    // Bootstrap & authentication commands
    .command(initCommand)
    .command(loginCommand)
    .command(logoutCommand)
    .command(whoamiCommand)
    // Infrastructure commands
    .command(healthCommand)
    .command(migrateCommand)
    .command(seedCommand)
    .command(keysCommand)
    .command(configCommand)
    .command(auditCommand)
    // Domain commands
    .command(orgCommand)
    .command(appCommand)
    .command(clientCommand)
    .command(userCommand)
    // Provisioning command
    .command(provisionCommand)
    .demandCommand(1, 'You need to specify a command')
    .strict()
    .help()
    .version()
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
