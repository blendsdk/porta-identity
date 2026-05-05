/**
 * @porta/sdk/node — Node.js entrypoint.
 *
 * Exports Node.js-specific transport and all auth providers.
 *
 * @module @porta/sdk/node
 */

// Node transport
export { createNodeTransport } from './transport/node-transport.js';
export type { NodeTransportOptions } from './transport/node-transport.js';

// Auth providers
export { createTokenAuth, createClientCredentialsAuth, createCliAuth } from './auth/index.js';
export type { AuthProvider } from './auth/index.js';
export type { ClientCredentialsAuthOptions } from './auth/client-credentials-auth.js';
export type { CliAuthOptions, StoredCredentials } from './auth/cli-auth.js';
