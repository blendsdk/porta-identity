#!/usr/bin/env node

/**
 * Porta CLI entry point.
 *
 * Sets up yargs with global options and registers all command modules.
 * This is the standalone CLI package — commands use the SDK for all
 * API communication rather than direct HTTP or database access.
 *
 * Usage: porta <command> <subcommand> [options]
 *
 * Global options:
 *   --server     Porta server URL (overrides PORTA_SERVER env and credentials)
 *   --json       Output in JSON format (default: table)
 *   --verbose    Show detailed output including stack traces on error
 *   --insecure   Skip TLS certificate verification (self-signed certs)
 *   --force      Skip confirmation prompts for destructive operations
 *
 * Bootstrap commands (no auth required):
 *   login        Authenticate with a Porta server via OIDC browser flow
 *   logout       Clear stored authentication tokens
 *   whoami       Show current authenticated identity
 *   version      Show CLI, SDK, and server version information
 *   doctor       Run diagnostic checks on CLI configuration
 *   completion   Generate shell completion script
 *
 * @module index
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { versionCommand } from './commands/version.js';
import { doctorCommand } from './commands/doctor.js';
import { completionCommand } from './commands/completion.js';
import { orgCommand } from './commands/org.js';

/**
 * Builds and runs the CLI.
 *
 * Configures yargs with global options, registers all command modules,
 * and parses the command line arguments.
 */
async function main(): Promise<void> {
  await yargs(hideBin(process.argv))
    .scriptName('porta')
    .usage('$0 <command> [options]')
    .option('server', {
      type: 'string',
      describe: 'Porta server URL',
      global: true,
    })
    .option('json', {
      type: 'boolean',
      default: false,
      describe: 'Output in JSON format',
      global: true,
    })
    .option('verbose', {
      type: 'boolean',
      default: false,
      describe: 'Show detailed output',
      global: true,
    })
    .option('insecure', {
      type: 'boolean',
      default: false,
      describe: 'Skip TLS certificate verification',
      global: true,
    })
    .option('force', {
      type: 'boolean',
      default: false,
      describe: 'Skip confirmation prompts',
      global: true,
    })
    // Bootstrap commands (no auth required)
    .command(loginCommand)
    .command(logoutCommand)
    .command(whoamiCommand)
    .command(versionCommand)
    .command(doctorCommand)
    .command(completionCommand)
    // Domain commands (auth required)
    .command(orgCommand)
    .demandCommand(1, 'Please specify a command')
    .strict()
    .help()
    .version(false) // Disable default --version; we use a custom version command
    .completion('completion', false) // Enable yargs completion but hide from help (we have our own command)
    .parse();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
