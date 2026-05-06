/**
 * CLI version command — display CLI, SDK, and server version info.
 *
 * Shows the installed CLI package version, the bundled SDK version,
 * and (optionally) the remote Porta server version by calling the
 * health endpoint.
 *
 * Usage:
 *   porta version          # Show CLI + SDK versions
 *   porta version --json   # JSON output (machine-readable)
 *
 * @module commands/version
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import { SDK_VERSION } from '@portaidentity/sdk';
import { printJson } from '../output.js';
import { loadCredentials } from '../credential-store.js';
import { fetchHealthStatus } from '../auth/metadata.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * CLI version — read from package.json at build time.
 * This must be kept in sync with package.json version.
 */
export const CLI_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Command Definition
// ---------------------------------------------------------------------------

/**
 * The version command module — shows version info for CLI, SDK, and server.
 */
export const versionCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'version',
  describe: 'Show CLI, SDK, and server version information',

  handler: async (argv) => {
    // Handle --insecure flag before any HTTP calls
    if (argv.insecure) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    // Gather version info
    const versions: Record<string, string> = {
      cli: CLI_VERSION,
      sdk: SDK_VERSION,
      node: process.version,
    };

    // Try to reach the server for its version (best-effort)
    const creds = loadCredentials();
    const serverUrl = argv.server || process.env.PORTA_SERVER || creds?.server;

    if (serverUrl) {
      const health = await fetchHealthStatus(serverUrl);
      if (health) {
        versions.server = health.status === 'ok' ? 'reachable' : 'degraded';
        versions.serverUrl = serverUrl;
      } else {
        versions.server = 'unreachable';
        versions.serverUrl = serverUrl;
      }
    } else {
      versions.server = 'not configured';
    }

    // Output
    if (argv.json) {
      printJson(versions);
    } else {
      console.log('');
      console.log(`  Porta CLI:    v${versions.cli}`);
      console.log(`  Porta SDK:    v${versions.sdk}`);
      console.log(`  Node.js:      ${versions.node}`);
      if (versions.serverUrl) {
        console.log(`  Server:       ${versions.server} (${versions.serverUrl})`);
      } else {
        console.log(`  Server:       ${versions.server}`);
      }
      console.log('');
    }

    process.exit(0);
  },
};
