/**
 * CLI health check command — direct-DB mode only.
 *
 * Tests database and Redis connectivity directly by connecting
 * to PostgreSQL and Redis via the bootstrap module.
 *
 * HTTP-based health checks are available in the standalone
 * `@portaidentity/cli` package.
 *
 * Usage:
 *   porta health check          # Table output with ✅/❌ per service
 *   porta health check --json   # JSON output: { database: "ok"|"error", redis: "ok"|"error" }
 *
 * @module cli/commands/health
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, error as errorMsg, outputResult } from '../output.js';

/** Health check result for a single service */
interface ServiceHealth {
  service: string;
  status: 'ok' | 'error';
  message?: string;
}

/**
 * Check database connectivity directly.
 */
async function checkDatabase(): Promise<ServiceHealth> {
  try {
    const { getPool } = await import('../../lib/database.js');
    await getPool().query('SELECT 1');
    return { service: 'database', status: 'ok' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { service: 'database', status: 'error', message };
  }
}

/**
 * Check Redis connectivity directly.
 */
async function checkRedis(): Promise<ServiceHealth> {
  try {
    const { getRedis } = await import('../../lib/redis.js');
    await getRedis().ping();
    return { service: 'redis', status: 'ok' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { service: 'redis', status: 'error', message };
  }
}

/** The health command module — registered at the top level of the CLI */
export const healthCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'health',
  describe: 'Check system health (direct DB + Redis)',
  builder: (yargs) => {
    return yargs.command<GlobalOptions>(
      'check',
      'Test database and Redis connectivity',
      (y) => y,
      async (argv) => {
        const args = argv as unknown as GlobalOptions;
        await withErrorHandling(async () => {
          let results: ServiceHealth[] = [];

          await withBootstrap(args, async () => {
            results = await Promise.all([checkDatabase(), checkRedis()]);
          });

          outputResult(
            args.json,
            () => {
              const rows = results.map((r) => [
                r.service,
                r.status === 'ok' ? '✅ ok' : `❌ ${r.message ?? 'error'}`,
              ]);
              printTable(['Service', 'Status'], rows);

              const allOk = results.every((r) => r.status === 'ok');
              if (allOk) {
                success('All services healthy');
              } else {
                errorMsg('Some services are unhealthy');
              }
            },
            Object.fromEntries(results.map((r) => [r.service, r.status])),
          );
        }, args.verbose);
      },
    ).demandCommand(1, 'Specify a health subcommand: check');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
