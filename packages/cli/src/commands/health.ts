/**
 * Health command — check server health.
 *
 * Makes a simple HTTP GET to /health on the Porta server.
 * Does not require authentication.
 *
 * @module commands/health
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import { resolveServerUrl } from '../global-options.js';
import { handleError } from '../error-handler.js';
import { printJson, success, error as printError } from '../output.js';

// ---------------------------------------------------------------------------
// Health check response
// ---------------------------------------------------------------------------

interface HealthResponse {
  status: string;
  server: string;
  database: string;
  redis: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const healthCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'health',
  describe: 'Check Porta server health',
  builder: (y) => y,
  handler: async (argv) => {
    try {
      const serverUrl = resolveServerUrl(argv);
      const url = new URL('/health', serverUrl);

      // Use fetch (Node 22 built-in) for unauthenticated health check
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        // Respect --insecure flag for self-signed certs
        ...(argv.insecure ? { dispatcher: undefined } : {}),
      });

      const body = (await response.json()) as HealthResponse;

      if (argv.json) {
        printJson(body);
        return;
      }

      if (response.ok && body.status === 'ok') {
        success(`Server is healthy (${serverUrl})`);
        console.log(`  Database: ${body.database}`);
        console.log(`  Redis:    ${body.redis}`);
      } else {
        printError(`Server is unhealthy (${serverUrl})`);
        console.log(`  Status:   ${body.status}`);
        console.log(`  Database: ${body.database}`);
        console.log(`  Redis:    ${body.redis}`);
        process.exitCode = 1;
      }
    } catch (err) {
      handleError(err, argv.verbose);
    }
  },
};
