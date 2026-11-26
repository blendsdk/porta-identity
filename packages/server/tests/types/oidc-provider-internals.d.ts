/**
 * Type declarations for the pinned node-oidc-provider helpers used by
 * compatibility specifications. The package does not publish declarations for
 * its internal helper modules; these narrow declarations let tests compare
 * Porta's normalization and path behavior with the exact installed provider.
 */

declare module 'oidc-provider/lib/helpers/user_codes.js' {
  /** Uppercase ASCII letters and remove every non-word character. */
  export function normalize(input: string): string;
}
