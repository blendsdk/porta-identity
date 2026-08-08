import { join } from 'node:path';
import { runner } from 'node-pg-migrate';
import type { RunnerOption } from 'node-pg-migrate';
import { config } from '../config/index.js';
import { logger } from './logger.js';

/**
 * Run database migrations using node-pg-migrate's programmatic API.
 *
 * Executes SQL migrations from the `migrations/` directory against the
 * database specified by `DATABASE_URL`. This is useful for:
 * - Integration test setup (run migrations before tests)
 * - Application startup (auto-migrate in development)
 * - Programmatic rollback in tests
 *
 * @param direction - 'up' to apply pending migrations, 'down' to rollback
 * @param count - Number of migrations to run (undefined = all pending for 'up', 1 for 'down')
 */
export async function runMigrations(
  direction: 'up' | 'down' = 'up',
  count?: number
): Promise<void> {
  // Resolve migrations directory relative to project root (cwd)
  const migrationsDir = join(process.cwd(), 'migrations');

  const options: RunnerOption = {
    databaseUrl: config.databaseUrl,
    migrationsTable: 'pgmigrations',
    dir: migrationsDir,
    direction,
    // For 'up', run all pending migrations; for 'down', default to rolling back 1
    count: count ?? (direction === 'up' ? Infinity : 1),
    // Redirect migration log output to pino logger
    log: (msg: string) => logger.debug({ migration: true }, msg),
    // Don't decamelize SQL file names — we use snake_case already
    decamelize: false,
  };

  await runner(options);
  logger.info({ direction, count }, 'Migrations complete');
}
