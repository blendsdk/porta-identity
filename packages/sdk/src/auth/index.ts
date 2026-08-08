/**
 * Authentication providers for the Porta SDK.
 *
 * Three auth providers are available for server-side (Node.js) transports:
 * - {@link createTokenAuth} — Static Bearer token (simplest)
 * - {@link createClientCredentialsAuth} — OIDC client_credentials grant (M2M)
 * - {@link createCliAuth} — Reads Porta CLI stored credentials
 *
 * Browser transports use cookie-based auth and don't need auth providers.
 *
 * @module auth
 */

export type { AuthProvider } from './types.js';
export { createTokenAuth } from './token-auth.js';
export type { TokenAuthOptions } from './token-auth.js';
export { createClientCredentialsAuth } from './client-credentials-auth.js';
export type { ClientCredentialsAuthOptions } from './client-credentials-auth.js';
export { createCliAuth } from './cli-auth.js';
export type { CliAuthOptions, StoredCredentials } from './cli-auth.js';
