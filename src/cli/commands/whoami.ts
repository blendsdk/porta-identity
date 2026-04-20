/**
 * CLI whoami command — display current authenticated identity.
 *
 * Reads stored credentials from ~/.porta/credentials.json and displays
 * the authenticated user's identity. Does not make any HTTP calls —
 * all information comes from the locally stored ID token claims.
 *
 * Also checks if the access token has expired and warns the user
 * to re-authenticate if needed.
 *
 * Usage:
 *   porta whoami          # Show current identity (human-readable)
 *   porta whoami --json   # JSON output (machine-readable)
 *
 * @module cli/commands/whoami
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { readCredentials, isTokenExpired } from '../token-store.js';
import { printJson, warn } from '../output.js';

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/**
 * The whoami command module — shows the currently authenticated user.
 *
 * Displays server, email, name, user ID, org, and token expiry.
 * Warns if the token is expired. Supports --json for scripting.
 */
export const whoamiCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'whoami',
  describe: 'Show current authenticated identity',

  handler: async (argv) => {
    // Read credentials from disk — no network call needed
    const creds = readCredentials();

    if (!creds) {
      warn('Not logged in. Run "porta login" to authenticate.');
      process.exit(1);
    }

    // Check if the access token has expired
    const expired = isTokenExpired(creds);
    if (expired) {
      warn(
        'Access token expired. Run "porta login" to re-authenticate.',
      );
    }

    // Output format depends on --json flag
    if (argv.json) {
      printJson({
        server: creds.server,
        orgSlug: creds.orgSlug,
        ...creds.userInfo,
        expiresAt: creds.expiresAt,
        expired,
      });
    } else {
      console.log('');
      console.log(`  Server:   ${creds.server}`);
      console.log(`  Email:    ${creds.userInfo.email}`);
      console.log(`  Name:     ${creds.userInfo.name ?? '(not set)'}`);
      console.log(`  User ID:  ${creds.userInfo.sub}`);
      console.log(`  Org:      ${creds.orgSlug}`);
      console.log(`  Expires:  ${creds.expiresAt}${expired ? ' (EXPIRED)' : ''}`);
      console.log('');
    }

    process.exit(0);
  },
};
