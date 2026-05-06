/**
 * CLI login command — authenticate with a Porta server.
 *
 * Implements the OIDC Authorization Code + PKCE flow for CLI authentication.
 * This is the same pattern used by `az login`, `gh auth login`, and similar
 * CLI tools that authenticate via browser-based flows.
 *
 * Usage:
 *   porta login                              # Login to default server
 *   porta login --server https://example.com # Login to remote server
 *   porta login --no-browser                 # Manual mode: print URL, paste callback
 *   porta login --client-id <id>             # Override auto-discovered client ID
 *
 * Docker / headless environments:
 *   When running inside a Docker container (auto-detected via /.dockerenv),
 *   the command automatically uses manual mode (--no-browser).
 *
 * @module commands/login
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import { executeBrowserFlow } from '../auth/browser-flow.js';
import { saveCredentials } from '../credential-store.js';
import { success } from '../output.js';
import { handleError } from '../error-handler.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default Porta server URL for local development */
const DEFAULT_SERVER = 'https://porta.local:3443';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options specific to the login command */
interface LoginOptions extends GlobalOptions {
  server: string;
  'client-id'?: string;
  'no-browser': boolean;
}

// ---------------------------------------------------------------------------
// Command Definition
// ---------------------------------------------------------------------------

/**
 * The login command module — authenticates the CLI with a Porta server.
 *
 * Uses OIDC Authorization Code + PKCE flow. Opens a browser for
 * interactive authentication, then stores the tokens locally.
 */
export const loginCommand: CommandModule<GlobalOptions, LoginOptions> = {
  command: 'login',
  describe: 'Authenticate with a Porta server',

  builder: (yargs) =>
    yargs
      .option('server', {
        type: 'string',
        describe: 'Porta server URL',
        default: DEFAULT_SERVER,
      })
      .option('client-id', {
        type: 'string',
        describe:
          'Override admin client ID (normally auto-discovered from server)',
      })
      .option('no-browser', {
        type: 'boolean',
        describe: 'Print login URL instead of opening browser',
        default: false,
      }),

  handler: async (argv) => {
    try {
      // Handle --insecure flag before any HTTP calls
      if (argv.insecure) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      }

      // Execute the OIDC browser flow
      const result = await executeBrowserFlow({
        server: argv.server,
        clientId: argv['client-id'],
        noBrowser: argv['no-browser'],
      });

      // Store credentials to disk
      saveCredentials(result);

      success(
        `Logged in as ${result.userInfo.email || result.userInfo.sub}`,
      );
      process.exit(0);
    } catch (err) {
      handleError(err, argv.verbose);
    }
  },
};
