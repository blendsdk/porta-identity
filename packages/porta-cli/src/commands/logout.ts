/**
 * CLI logout command — clear stored authentication tokens.
 *
 * Removes the ~/.porta/credentials.json file, effectively logging out
 * the CLI user. Does NOT revoke tokens on the server — the access token
 * will expire naturally based on its TTL.
 *
 * This is a local-only operation that does not require a network connection
 * or a running Porta server.
 *
 * Usage:
 *   porta logout
 *
 * @module commands/logout
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import { clearCredentials, loadCredentials } from '../credential-store.js';
import { success, warn } from '../output.js';

// ---------------------------------------------------------------------------
// Command Definition
// ---------------------------------------------------------------------------

/**
 * The logout command module — clears stored CLI authentication tokens.
 *
 * Reads existing credentials to show who was logged in, then deletes
 * the credentials file. Safe to run even when not logged in.
 */
export const logoutCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'logout',
  describe: 'Clear stored authentication tokens',

  handler: async () => {
    // Check if there are existing credentials to clear
    const existing = loadCredentials();

    if (!existing) {
      warn('Not logged in — nothing to clear.');
      process.exit(0);
    }

    // Remove the credentials file
    clearCredentials();

    success(`Logged out${existing.userInfo.email ? ` (was: ${existing.userInfo.email})` : ''}`);
    process.exit(0);
  },
};
