/**
 * Global CLI options and server URL resolution.
 *
 * Defines the `GlobalOptions` interface shared across all commands,
 * and the `resolveServerUrl()` function that determines the Porta
 * server URL using a priority chain:
 *
 *   1. `--server` flag (highest priority)
 *   2. `PORTA_SERVER` environment variable
 *   3. Server URL from stored credentials file
 *   4. Error — no server configured
 *
 * This resolution chain lets users configure once via `porta login`
 * and override per-command via flag or env var.
 *
 * @module global-options
 */

import { loadCredentials } from './credential-store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Global options available to all CLI commands.
 *
 * These are parsed by yargs from the command line and passed
 * through to command handlers.
 */
export interface GlobalOptions {
  /** Porta server URL override (e.g., https://porta.example.com) */
  server?: string;
  /** Output in JSON format instead of table */
  json: boolean;
  /** Show verbose output including stack traces on error */
  verbose: boolean;
  /** Skip TLS certificate verification (for self-signed certs) */
  insecure: boolean;
  /** Skip confirmation prompts for destructive operations */
  force: boolean;
}

// ---------------------------------------------------------------------------
// Server URL Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the Porta server URL using the priority chain.
 *
 * Resolution order:
 *   1. `--server` CLI flag
 *   2. `PORTA_SERVER` environment variable
 *   3. Server URL from stored credentials (`~/.porta/credentials.json`)
 *   4. Throws an error if no server URL is found
 *
 * @param options - Global CLI options (may contain `server` flag)
 * @returns The resolved server URL
 * @throws Error if no server URL can be determined
 */
export function resolveServerUrl(options: GlobalOptions): string {
  // Priority 1: --server flag
  if (options.server) {
    return normalizeUrl(options.server);
  }

  // Priority 2: PORTA_SERVER environment variable
  const envUrl = process.env.PORTA_SERVER;
  if (envUrl) {
    return normalizeUrl(envUrl);
  }

  // Priority 3: Credentials file
  const credentials = loadCredentials();
  if (credentials?.server) {
    return normalizeUrl(credentials.server);
  }

  // Priority 4: No server configured
  throw new Error(
    'No Porta server configured. Use --server, set PORTA_SERVER, or run "porta login" first.',
  );
}

/**
 * Normalizes a URL by removing trailing slashes.
 *
 * @param url - The URL to normalize
 * @returns URL without trailing slash
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}
