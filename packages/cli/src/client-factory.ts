/**
 * SDK client factory for CLI commands.
 *
 * Creates a configured `PortaClient` instance from CLI global options.
 * Uses the SDK's `createCliAuth` provider which reads credentials from
 * `~/.porta/credentials.json` and handles automatic token refresh.
 *
 * The factory resolves the server URL via the priority chain
 * (--server > PORTA_SERVER > credentials file) and configures
 * TLS handling based on the `--insecure` flag.
 *
 * @module client-factory
 */

import { createPortaClient } from '@portaidentity/sdk';
import { createNodeTransport, createCliAuth } from '@portaidentity/sdk/node';
import type { PortaClient } from '@portaidentity/sdk';
import { resolveServerUrl, type GlobalOptions } from './global-options.js';

// ---------------------------------------------------------------------------
// Client Creation
// ---------------------------------------------------------------------------

/**
 * Creates a PortaClient configured from CLI global options.
 *
 * Resolves the server URL, sets up CLI auth (with auto-refresh),
 * and creates a Node.js transport. The `--insecure` flag controls
 * whether TLS certificate verification is skipped by setting the
 * NODE_TLS_REJECT_UNAUTHORIZED environment variable.
 *
 * @param options - Global CLI options
 * @returns A configured PortaClient ready for API calls
 * @throws Error if no server URL can be resolved
 */
export function createClient(options: GlobalOptions): PortaClient {
  const baseUrl = resolveServerUrl(options);

  // Handle --insecure flag for self-signed certificates
  // This must be set before creating the transport so fetch() picks it up
  if (options.insecure) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  const auth = createCliAuth();
  const transport = createNodeTransport({ baseUrl, auth });

  return createPortaClient({ transport });
}
