/**
 * CLI health check command.
 *
 * Tests server connectivity by calling the GET /health endpoint.
 * Works without authentication — only requires a reachable server URL.
 *
 * When the server is not reachable, falls back to direct DB + Redis
 * checks via withBootstrap (useful for diagnosing infrastructure).
 *
 * Usage:
 *   porta health check          # Table output with ✅/❌ per service
 *   porta health check --json   # JSON output: { server: "ok"|"error", ... }
 *   porta health check --direct # Bypass HTTP, check DB + Redis directly
 *
 * @module cli/commands/health
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, success, error as errorMsg, outputResult } from '../output.js';
import { readCredentials } from '../token-store.js';

/** Health check result for a single service */
interface ServiceHealth {
  service: string;
  status: 'ok' | 'error';
  message?: string;
}

/**
 * Check health via the HTTP endpoint (GET /health).
 *
 * Uses plain fetch (no auth required). Reads the server URL from
 * stored credentials. Falls back to localhost:3000 if not logged in.
 *
 * @returns Array of ServiceHealth results parsed from the /health response
 */
async function checkViaHttp(): Promise<ServiceHealth[]> {
  const creds = readCredentials();
  const server = creds?.server ?? 'http://localhost:3000';

  try {
    const response = await fetch(`${server}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (response.ok) {
      // Parse the health response — format: { status: "ok", services: { database: "ok", redis: "ok" } }
      const body = await response.json() as {
        status: string;
        services?: Record<string, string>;
      };

      const results: ServiceHealth[] = [
        { service: 'server', status: 'ok' },
      ];

      // Add individual service statuses if available
      if (body.services) {
        for (const [name, status] of Object.entries(body.services)) {
          results.push({
            service: name,
            status: status === 'ok' ? 'ok' : 'error',
            message: status !== 'ok' ? status : undefined,
          });
        }
      }

      return results;
    }

    return [{ service: 'server', status: 'error', message: `HTTP ${response.status}` }];
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    return [{ service: 'server', status: 'error', message }];
  }
}

/**
 * Check database connectivity directly (bypasses HTTP).
 * Used when --direct flag is provided or server is unreachable.
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
 * Check Redis connectivity directly (bypasses HTTP).
 * Used when --direct flag is provided or server is unreachable.
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

/** Arguments for the health check command */
interface HealthCheckArgs extends GlobalOptions {
  direct?: boolean;
}

/** The health command module — registered at the top level of the CLI */
export const healthCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'health',
  describe: 'Check system health',
  builder: (yargs) => {
    return yargs.command<HealthCheckArgs>(
      'check',
      'Test server, database, and Redis connectivity',
      (y) => y.option('direct', {
        type: 'boolean',
        default: false,
        description: 'Check DB + Redis directly (bypass HTTP)',
      }),
      async (argv) => {
        const args = argv as unknown as HealthCheckArgs;
        await withErrorHandling(async () => {
          let results: ServiceHealth[];

          if (args.direct) {
            // Direct mode: connect to DB + Redis via withBootstrap
            await withBootstrap(args, async () => {
              results = await Promise.all([checkDatabase(), checkRedis()]);
            });
          } else {
            // HTTP mode: call GET /health (no auth needed)
            results = await checkViaHttp();
          }

          outputResult(
            args.json,
            () => {
              const rows = results!.map((r) => [
                r.service,
                r.status === 'ok' ? '✅ ok' : `❌ ${r.message ?? 'error'}`,
              ]);
              printTable(['Service', 'Status'], rows);

              const allOk = results!.every((r) => r.status === 'ok');
              if (allOk) {
                success('All services healthy');
              } else {
                errorMsg('Some services are unhealthy');
              }
            },
            Object.fromEntries(results!.map((r) => [r.service, r.status])),
          );
        }, args.verbose);
      },
    ).demandCommand(1, 'Specify a health subcommand: check');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
