/** Real parser construction, separated from executable process ownership. */

import yargs from 'yargs';
import type { Argv } from 'yargs';
import type { GlobalOptions } from './global-options.js';
import { CliArgumentError } from './error-format.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { versionCommand } from './commands/version.js';
import { doctorCommand } from './commands/doctor.js';
import { completionCommand } from './commands/completion.js';
import { orgCommand } from './commands/org.js';
import { appCommand } from './commands/app.js';
import { clientCommand } from './commands/client.js';
import { userCommand } from './commands/user.js';
import { keysCommand } from './commands/keys.js';
import { configCommand } from './commands/config.js';
import { auditCommand } from './commands/audit.js';
import { healthCommand } from './commands/health.js';
import { sessionsCommand } from './commands/sessions.js';
import { bulkCommand } from './commands/bulk.js';
import { statsCommand } from './commands/stats.js';
import { exportsCommand } from './commands/exports.js';
import { exportCommand } from './commands/export.js';
import { importCommand } from './commands/import.js';
import { adminCommand } from './commands/admin.js';

/**
 * Resolve only early output mode using installed public Boolean-parser semantics.
 * No command registration, handler execution, help output or process exit occurs here.
 * Tokens after `--` remain positional data rather than output flags.
 * @example resolveJsonMode(['user', 'list', '--json']) // true
 */
export function resolveJsonMode(args: readonly string[]): boolean {
  return (
    yargs([...args])
      .option('json', { type: 'boolean', default: false })
      .help(false)
      .version(false)
      .exitProcess(false)
      .parseSync().json === true
  );
}

/**
 * Construct the conventional CLI without running it; callers own parse and error handling.
 * Only JSON mode replaces yargs diagnostics, which can contain submitted argument values.
 * @example await createCli(['health', '--server', 'https://identity.example.com']).parseAsync()
 */
export function createCli(args: readonly string[]): Argv<GlobalOptions> {
  const parser = yargs([...args])
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
    .command(appCommand)
    .command(clientCommand)
    .command(userCommand)
    // Infrastructure commands (auth required)
    .command(keysCommand)
    .command(configCommand)
    .command(auditCommand)
    .command(sessionsCommand)
    .command(statsCommand)
    .command(bulkCommand)
    .command(exportsCommand)
    .command(exportCommand)
    .command(importCommand)
    // Unauthenticated commands
    .command(healthCommand)
    // Embedded administration application (handles its own session)
    .command(adminCommand)
    .demandCommand(1, 'Please specify a command')
    .strict()
    .help()
    .version(false) // Disable default --version; we use a custom version command
    .completion('completion', false) // The public completion command owns its help entry.
    // Handlers and the executable own termination; help and parse results return to the caller.
    .exitProcess(false);
  if (resolveJsonMode(args)) {
    parser.fail(() => {
      // Discard yargs' raw text. The executable formats this trusted discriminator once.
      throw new CliArgumentError();
    });
  }
  return parser;
}
