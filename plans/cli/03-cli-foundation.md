# CLI Foundation: Entry Point, Bootstrap, Utilities

> **Document**: 03-cli-foundation.md
> **Parent**: [Index](00-index.md)

## Overview

The CLI foundation provides the core infrastructure that all commands depend on: the yargs entry point with global options, the bootstrap lifecycle (connect DB/Redis before command, disconnect after), output formatters for table and JSON rendering, confirmation prompts for destructive operations, and a centralized error handler that maps domain errors to user-friendly CLI output.

## Architecture

### Current Architecture

No CLI exists. The only entry point is `src/index.ts` for the HTTP server.

### Proposed Architecture

```
src/cli/
├── index.ts          # Yargs entry point — global options, command registration
├── bootstrap.ts      # DB + Redis lifecycle management
├── output.ts         # Table + JSON formatters, color helpers
├── error-handler.ts  # CLI error handler (wraps command handlers)
├── prompt.ts         # Confirmation prompt utility (readline-based)
└── commands/         # Command files (covered in docs 04 and 05)
```

The CLI entry point (`src/cli/index.ts`) is a separate file from the HTTP server entry point (`src/index.ts`). This gives each entry point its own startup logic without interference.

## Implementation Details

### Package Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "yargs": "^17.7.2",
    "cli-table3": "^0.6.5",
    "chalk": "^5.3.0"
  },
  "devDependencies": {
    "@types/yargs": "^17.0.33"
  },
  "bin": {
    "porta": "./dist/cli/index.js"
  },
  "scripts": {
    "porta": "tsx src/cli/index.ts"
  }
}
```

### CLI Entry Point (`src/cli/index.ts`)

The entry point sets up yargs with:
- Global options (`--json`, `--verbose`, `--force`, `--dry-run`, `--database-url`, `--redis-url`)
- Command registration for all 10 top-level commands
- Strict mode (unknown commands/flags cause errors)
- Help and version output
- Shebang line for direct execution (`#!/usr/bin/env node`)

```typescript
#!/usr/bin/env node

/**
 * Porta CLI entry point.
 *
 * Sets up yargs with global options and registers all command modules.
 * Each command module handles its own subcommand registration.
 *
 * Usage: porta <command> <subcommand> [options]
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Import command modules
import { orgCommand } from './commands/org.js';
import { appCommand } from './commands/app.js';
// ... etc

/** Global option types shared by all commands */
export interface GlobalOptions {
  json: boolean;
  verbose: boolean;
  force: boolean;
  'dry-run': boolean;
  'database-url'?: string;
  'redis-url'?: string;
}

const cli = yargs(hideBin(process.argv))
  .scriptName('porta')
  .usage('$0 <command> [options]')
  // Global options available to all commands
  .option('json', { type: 'boolean', default: false, description: 'Output in JSON format' })
  .option('verbose', { type: 'boolean', default: false, description: 'Verbose output' })
  .option('force', { type: 'boolean', default: false, description: 'Skip confirmation prompts' })
  .option('dry-run', { type: 'boolean', default: false, description: 'Preview destructive operations' })
  .option('database-url', { type: 'string', description: 'PostgreSQL connection URL override' })
  .option('redis-url', { type: 'string', description: 'Redis connection URL override' })
  // Register command modules
  .command(orgCommand)
  .command(appCommand)
  // ... register all commands
  .demandCommand(1, 'You need to specify a command')
  .strict()
  .help()
  .version()
  .wrap(Math.min(120, yargs.terminalWidth()));

await cli.parse();
```

### Bootstrap (`src/cli/bootstrap.ts`)

The bootstrap module manages DB + Redis connection lifecycle. It provides:
- `bootstrap(argv)` — connect to DB and Redis, with optional CLI flag overrides
- `shutdown()` — disconnect DB and Redis
- `withBootstrap(argv, fn)` — convenience wrapper: bootstrap → run fn → shutdown

```typescript
/**
 * CLI bootstrap — manages DB + Redis connection lifecycle.
 *
 * The CLI needs DB and Redis connections before running any command.
 * Unlike the HTTP server, the CLI connects, runs a single command,
 * and disconnects. CLI flags can override the connection URLs from .env.
 */

import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../lib/database.js';
import { connectRedis, disconnectRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import type { GlobalOptions } from './index.js';

/**
 * Bootstrap the CLI environment: load dotenv, connect DB + Redis.
 * CLI flags (--database-url, --redis-url) override env vars if provided.
 */
export async function bootstrap(argv: GlobalOptions): Promise<void> {
  // Override env vars if CLI flags provided
  if (argv['database-url']) {
    process.env.DATABASE_URL = argv['database-url'];
  }
  if (argv['redis-url']) {
    process.env.REDIS_URL = argv['redis-url'];
  }
  await connectDatabase();
  await connectRedis();
}

/**
 * Clean shutdown: disconnect DB + Redis.
 */
export async function shutdown(): Promise<void> {
  await disconnectRedis();
  await disconnectDatabase();
}

/**
 * Convenience wrapper: bootstrap → run command → shutdown.
 * Ensures cleanup happens even if the command throws.
 */
export async function withBootstrap<T>(
  argv: GlobalOptions,
  fn: () => Promise<T>,
): Promise<T> {
  await bootstrap(argv);
  try {
    return await fn();
  } finally {
    await shutdown();
  }
}
```

### Output Helpers (`src/cli/output.ts`)

The output module provides:
- `formatTable(headers, rows)` — render a cli-table3 table
- `formatJson(data)` — render JSON to stdout
- `outputResult(argv, tableData, jsonData)` — smart output based on `--json` flag
- `successMessage(msg)` — green checkmark message
- `errorMessage(msg)` — red X message
- `warnMessage(msg)` — yellow warning message
- Entity-specific formatters for common types (organization, user, etc.)

```typescript
/**
 * CLI output helpers.
 *
 * Provides table and JSON formatters, color helpers, and entity-specific
 * display functions. All commands use these helpers for consistent output.
 */

import Table from 'cli-table3';
import chalk from 'chalk';

/** Format data as a table and print to stdout */
export function printTable(headers: string[], rows: string[][]): void {
  const table = new Table({ head: headers.map(h => chalk.bold(h)) });
  rows.forEach(row => table.push(row));
  console.log(table.toString());
}

/** Print data as formatted JSON to stdout */
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/** Print a success message with green checkmark */
export function success(message: string): void {
  console.log(chalk.green('✅ ' + message));
}

/** Print a warning message with yellow icon */
export function warn(message: string): void {
  console.log(chalk.yellow('⚠️  ' + message));
}

/** Print an error message with red X */
export function error(message: string): void {
  console.error(chalk.red('❌ ' + message));
}

/** Print a "total" summary line below a table */
export function printTotal(label: string, count: number): void {
  console.log(`\nTotal: ${count} ${label}`);
}

/**
 * Smart output: if --json, print JSON; otherwise, print table.
 * Common pattern used by all list/show commands.
 */
export function outputResult(
  isJson: boolean,
  tableRenderer: () => void,
  jsonData: unknown,
): void {
  if (isJson) {
    printJson(jsonData);
  } else {
    tableRenderer();
  }
}

/**
 * Truncate a string for table display.
 * UUIDs and long fields are shortened to fit table columns.
 */
export function truncateId(id: string, length = 8): string {
  return id.length > length ? id.substring(0, length) + '...' : id;
}

/**
 * Format a Date for display. Shows YYYY-MM-DD format.
 */
export function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}
```

### Error Handler (`src/cli/error-handler.ts`)

The error handler wraps every command handler, catching domain errors and formatting them for CLI output:

```typescript
/**
 * CLI error handler.
 *
 * Wraps command handlers to catch domain errors and display
 * user-friendly messages with appropriate exit codes.
 */

import { error } from './output.js';

/**
 * Wrap a command handler with error handling.
 * Catches known domain errors and displays formatted messages.
 * Unknown errors show a generic message (verbose mode shows stack).
 */
export async function withErrorHandling(
  fn: () => Promise<void>,
  verbose = false,
): Promise<void> {
  try {
    await fn();
    process.exit(0);
  } catch (err: unknown) {
    if (err instanceof Error) {
      // Map known domain error types to user-friendly messages
      const name = err.constructor.name;
      if (name.endsWith('NotFoundError')) {
        error(`Not found: ${err.message}`);
      } else if (name.endsWith('ValidationError')) {
        error(`Validation error: ${err.message}`);
      } else {
        error(`Error: ${err.message}`);
      }
      if (verbose && err.stack) {
        console.error('\n' + err.stack);
      }
    } else {
      error('An unexpected error occurred');
    }
    process.exit(1);
  }
}
```

### Confirmation Prompt (`src/cli/prompt.ts`)

Simple y/N confirmation using Node.js built-in `readline`:

```typescript
/**
 * CLI confirmation prompt utility.
 *
 * Uses Node.js readline for simple y/N confirmation prompts.
 * Respects the --force flag to skip prompts for automation.
 */

import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

/**
 * Ask a y/N confirmation question.
 * Returns true if user confirms, false otherwise.
 * If force is true, skip the prompt and return true.
 */
export async function confirm(
  message: string,
  force = false,
): Promise<boolean> {
  if (force) return true;

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${message} (y/N): `);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}
```

### Integration Points

- **Bootstrap** ← `src/lib/database.ts`, `src/lib/redis.ts`, `src/config/index.ts`
- **Output** ← cli-table3, chalk (new deps)
- **Error handler** ← Domain error classes from all modules
- **Prompt** ← Node.js readline (built-in, no dependency)
- **Entry point** ← yargs (new dep), all command modules

## Error Handling

| Error Case | Handling Strategy |
| --- | --- |
| Database connection fails | Print connection error, suggest checking DATABASE_URL, exit 1 |
| Redis connection fails | Print connection error, suggest checking REDIS_URL, exit 1 |
| Domain NotFoundError | Print "Not found: [entity] [id]", exit 1 |
| Domain ValidationError | Print "Validation error: [details]", exit 1 |
| Unknown error | Print "Unexpected error", show stack in verbose mode, exit 1 |
| User cancels confirmation | Print "Operation cancelled", exit 0 |

## Testing Requirements

- Unit tests for `output.ts` — table formatting, JSON output, color helpers
- Unit tests for `error-handler.ts` — each error type mapped correctly, exit codes
- Unit tests for `prompt.ts` — confirm returns true/false, force bypass
- Unit tests for `bootstrap.ts` — connection lifecycle, CLI flag overrides
- Tests should mock `process.exit`, `console.log`, `console.error`, and readline
