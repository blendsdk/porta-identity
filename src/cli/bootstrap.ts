/**
 * CLI bootstrap — manages two execution modes for CLI commands.
 *
 * **Direct-DB mode** (`withBootstrap`):
 *   Used by `porta init`, `porta migrate`, and `porta seed` — commands
 *   that need direct database/Redis access because the HTTP server may
 *   not be running yet. Connects to PostgreSQL + Redis, runs the command,
 *   and disconnects.
 *
 * **HTTP mode** (`withHttpClient`):
 *   Used by all other CLI commands. Reads stored credentials from
 *   `~/.porta/credentials.json`, creates an authenticated HTTP client,
 *   and passes it to the command handler. No DB/Redis connection needed.
 *
 * Uses dynamic imports so that the config module (which validates env vars
 * at load time) isn't triggered until bootstrap() is called. This allows
 * CLI flag overrides (--database-url, --redis-url) to set process.env
 * BEFORE config parses, making the overrides effective.
 *
 * @module cli/bootstrap
 */

import 'dotenv/config';
import type { GlobalOptions } from './index.js';
import { createHttpClient, type AdminHttpClient } from './http-client.js';

/**
 * Bootstrap the CLI environment: load dotenv, connect DB + Redis.
 *
 * CLI flags (--database-url, --redis-url) override env vars if provided.
 * The overrides are applied to process.env BEFORE the config module loads,
 * so they propagate through to connectDatabase() and connectRedis().
 *
 * @param argv - Parsed CLI global options from yargs
 */
export async function bootstrap(argv: GlobalOptions): Promise<void> {
  // CLI is a run-and-exit tool — suppress infrastructure logs (Database connected,
  // Redis connected, etc.) that clutter both table and JSON output.
  // Use --verbose to opt in to full diagnostic logging for debugging.
  // Uses 'fatal' (quietest valid level) since the config schema doesn't allow 'silent'.
  if (!argv.verbose) {
    process.env.LOG_LEVEL = 'fatal';
  }

  // Override env vars BEFORE config module loads (via dynamic imports below).
  // This ensures the config schema parses the CLI-provided URLs instead of .env values.
  if (argv['database-url']) {
    process.env.DATABASE_URL = argv['database-url'];
  }
  if (argv['redis-url']) {
    process.env.REDIS_URL = argv['redis-url'];
  }

  // Dynamic imports ensure config/index.ts loads AFTER env var overrides are set.
  // Static imports would trigger config validation at module-load time, before
  // yargs has parsed argv, making CLI flag overrides ineffective.
  const { connectDatabase } = await import('../lib/database.js');
  const { connectRedis } = await import('../lib/redis.js');

  await connectDatabase();
  await connectRedis();
}

/**
 * Clean shutdown: disconnect Redis then DB.
 *
 * Redis is disconnected first because some operations may flush
 * cache entries to the database during shutdown.
 */
export async function shutdown(): Promise<void> {
  const { disconnectRedis } = await import('../lib/redis.js');
  const { disconnectDatabase } = await import('../lib/database.js');

  await disconnectRedis();
  await disconnectDatabase();
}

/**
 * Convenience wrapper: bootstrap → run command → shutdown.
 *
 * Ensures cleanup happens even if the command throws an error.
 * This is the recommended way for command handlers to use bootstrap:
 *
 * ```typescript
 * await withBootstrap(argv, async () => {
 *   const orgs = await listOrganizations(pool);
 *   printTable(headers, rows);
 * });
 * ```
 *
 * @param argv - Parsed CLI global options from yargs
 * @param fn - The command handler function to execute
 * @returns The return value of the command handler
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

/**
 * HTTP client wrapper for authenticated CLI commands.
 *
 * Creates an AdminHttpClient from stored credentials and passes it to
 * the command handler. No DB/Redis connection is needed — all data
 * flows through the admin API over HTTP.
 *
 * Use this instead of `withBootstrap()` for all commands that operate
 * against a running Porta server (everything except init/migrate/seed).
 *
 * ```typescript
 * await withHttpClient(argv, async (client) => {
 *   const { data } = await client.get('/api/admin/organizations');
 *   printTable(headers, data.data.map(...));
 * });
 * ```
 *
 * @param argv - Parsed CLI global options from yargs
 * @param fn - The command handler that receives an authenticated HTTP client
 * @returns The return value of the command handler
 * @throws HttpAuthError if not logged in or session expired
 */
export async function withHttpClient<T>(
  argv: GlobalOptions,
  fn: (client: AdminHttpClient) => Promise<T>,
): Promise<T> {
  // Suppress logs in non-verbose mode — consistent with direct-DB mode
  if (!argv.verbose) {
    process.env.LOG_LEVEL = 'fatal';
  }

  const client = createHttpClient();
  return fn(client);
}
