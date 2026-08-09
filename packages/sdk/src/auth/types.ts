/**
 * Authentication provider interface for the Porta SDK.
 *
 * Auth providers handle token management for server-side transports.
 * Three implementations are available:
 * - TokenAuth: static token (simplest, no refresh)
 * - ClientCredentialsAuth: OAuth2 client credentials flow
 * - CliAuth: reads from Porta CLI credentials file
 */

/**
 * Authentication provider that supplies access tokens to the transport.
 *
 * Implementations must provide `getToken()` to return a valid access token.
 * Optionally, `refreshToken()` can be implemented to support automatic
 * token refresh on 401 responses.
 */
export interface AuthProvider {
  /** Returns a valid access token for API requests */
  getToken(): Promise<string>;

  /**
   * Attempts to refresh the access token.
   * Called by NodeTransport on 401 responses for automatic retry.
   * Returns the new access token, or throws if refresh fails.
   * Optional — if not provided, 401 errors throw immediately.
   */
  refreshToken?(): Promise<string>;
}
