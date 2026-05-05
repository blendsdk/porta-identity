/**
 * TokenAuth — static Bearer token authentication provider.
 *
 * The simplest auth provider: takes a pre-obtained Bearer token
 * and returns it on every `getToken()` call. No refresh support —
 * if the token expires, the consumer must create a new provider.
 *
 * Suitable for scripts, CI/CD pipelines, AI agents, and one-off
 * automation where the token is obtained out-of-band.
 *
 * @example
 * ```typescript
 * import { createTokenAuth } from '@porta/sdk';
 *
 * const auth = createTokenAuth({ token: 'eyJhbGciOi...' });
 * const client = createPortaClient({ baseUrl: '...', auth });
 * ```
 *
 * @module auth/token-auth
 */

import type { AuthProvider } from './types.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for creating a static token auth provider.
 */
export interface TokenAuthOptions {
  /** Static Bearer token to use for all requests */
  token: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a static token authentication provider.
 *
 * Returns an {@link AuthProvider} that always returns the provided token.
 * No `refreshToken()` is defined — on 401 responses, the transport will
 * throw a `PortaAuthenticationError` immediately.
 *
 * @param options - Token auth configuration
 * @returns An AuthProvider that returns the static token
 */
export function createTokenAuth(options: TokenAuthOptions): AuthProvider {
  const { token } = options;

  return {
    async getToken(): Promise<string> {
      return token;
    },
    // No refreshToken — 401 errors propagate immediately to the caller.
    // The consumer must create a new TokenAuth with a fresh token.
  };
}
