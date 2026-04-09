/**
 * CLI health check command.
 *
 * Tests database and Redis connectivity, reporting status for each service.
 * Used by operators to verify infrastructure before deploying or debugging.
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
 * Check database connectivity by running a simple query.
 * Returns a ServiceHealth result indicating success or failure.
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
 * Check Redis connectivity by sending a PING command.
 * Returns a ServiceHealth result indicating success or failure.
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
  describe: 'Check system health',
  builder: (yargs) => {
    return yargs.command(
      'check',
      'Test database and Redis connectivity',
      {},
      async (argv) => {
        // Cast argv — yargs subcommand handlers don't inherit parent GlobalOptions type
        const args = argv as unknown as GlobalOptions;
        await withErrorHandling(async () => {
          await withBootstrap(args, async () => {
            const results = await Promise.all([checkDatabase(), checkRedis()]);

            outputResult(
              args.json,
              () => {
                // Table output with status icons
                const rows = results.map((r) => [
                  r.service,
                  r.status === 'ok' ? '✅ ok' : `❌ ${r.message ?? 'error'}`,
                ]);
                printTable(['Service', 'Status'], rows);

                // Summary line
                const allOk = results.every((r) => r.status === 'ok');
                if (allOk) {
                  success('All services healthy');
                } else {
                  errorMsg('Some services are unhealthy');
                }
              },
              Object.fromEntries(results.map((r) => [r.service, r.status])),
            );
          });
        }, args.verbose);
      },
    ).demandCommand(1, 'Specify a health subcommand: check');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
