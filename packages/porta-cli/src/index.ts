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
 * @module index
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

/**
 * Builds and runs the CLI.
 *
 * Configures yargs with global options, registers all command modules,
 * and parses the command line arguments. Commands are registered in
 * later phases as they are migrated from the server CLI.
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
    // Commands will be registered here as they are migrated
    .demandCommand(1, 'Please specify a command')
    .strict()
    .help()
    .version(false) // Disable default --version; we use a custom version command
    .parse();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
