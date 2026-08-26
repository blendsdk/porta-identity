/**
 * Client validators — redirect URI validation and default grant type logic.
 *
 * Redirect URI validation follows OIDC/OAuth 2.0 security best practices:
 * - HTTPS required in production (localhost exempted for development)
 * - No fragment components (#) allowed
 * - No wildcards in path or query
 * - Custom URI schemes allowed for native apps
 *
 * Default grant types and auth methods are determined by the combination
 * of client type (confidential/public) and application type (web/spa/native).
 */

import type { ClientType, ApplicationType } from './types.js';

// ===========================================================================
// Redirect URI Validation
// ===========================================================================

/** Maximum redirect URIs allowed per client */
const DEFAULT_MAX_REDIRECT_URIS = 10;

/**
 * Validate a single redirect URI according to OIDC security rules.
 *
 * Rules:
 * 1. Must be a parseable URL
 * 2. HTTPS required in production (except localhost)
 * 3. No fragment components (#)
 * 4. No wildcards (* in path or query)
 * 5. Custom URI schemes allowed for native apps (e.g., com.example.app:/callback)
 *
 * @param uri - The redirect URI to validate
 * @param isProduction - Whether to enforce HTTPS (true in production)
 * @returns Validation result with optional error message
 */
export function validateRedirectUri(
  uri: string,
  isProduction: boolean,
): { isValid: boolean; error?: string } {
  // Empty URI check
  if (!uri || uri.trim().length === 0) {
    return { isValid: false, error: 'Redirect URI cannot be empty' };
  }

  // Try to parse the URI
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    // Could be a custom scheme for native apps (e.g., com.example.app:/callback)
    // Custom schemes won't parse with URL constructor if they don't use //
    if (/^[a-z][a-z0-9+.-]*:/.test(uri) && !uri.startsWith('http')) {
      // Allow custom schemes — they're valid for native apps
      // Still check for fragments
      if (uri.includes('#')) {
        return { isValid: false, error: 'Redirect URI must not contain a fragment (#)' };
      }
      return { isValid: true };
    }
    return { isValid: false, error: `Invalid URI: ${uri}` };
  }

  // No fragments allowed
  if (parsed.hash) {
    return { isValid: false, error: 'Redirect URI must not contain a fragment (#)' };
  }

  // No wildcards in path or query
  if (parsed.pathname.includes('*') || parsed.search.includes('*')) {
    return { isValid: false, error: 'Redirect URI must not contain wildcards (*)' };
  }

  // HTTPS required in production (except localhost)
  if (isProduction) {
    const isLocalhost =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !isLocalhost) {
      return {
        isValid: false,
        error: 'Redirect URI must use HTTPS in production (except localhost)',
      };
    }
  }

  return { isValid: true };
}

/**
 * Validate an array of redirect URIs.
 *
 * Checks each URI individually and enforces a maximum count.
 *
 * @param uris - Array of redirect URIs to validate
 * @param isProduction - Whether to enforce HTTPS
 * @param max - Maximum allowed URIs (default: 10)
 * @returns Validation result with optional array of errors
 */
export function validateRedirectUris(
  uris: string[],
  isProduction: boolean,
  max: number = DEFAULT_MAX_REDIRECT_URIS,
): { isValid: boolean; errors?: string[] } {
  if (uris.length === 0) {
    return { isValid: false, errors: ['At least one redirect URI is required'] };
  }

  if (uris.length > max) {
    return {
      isValid: false,
      errors: [`Maximum ${max} redirect URIs allowed, got ${uris.length}`],
    };
  }

  const errors: string[] = [];
  for (const uri of uris) {
    const result = validateRedirectUri(uri, isProduction);
    if (!result.isValid) {
      errors.push(result.error!);
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true };
}

// ===========================================================================
// Default Grant Types
// ===========================================================================

/**
 * Get default grant types based on client type and application type.
 *
 * | ClientType    | AppType | Default Grants                                        |
 * |--------------|---------|-------------------------------------------------------|
 * | confidential | web     | authorization_code, refresh_token, client_credentials |
 * | confidential | native  | authorization_code, refresh_token                     |
 * | confidential | spa     | authorization_code, refresh_token                     |
 * | public       | spa     | authorization_code, refresh_token                     |
 * | public       | native  | authorization_code, refresh_token                     |
 * | public       | web     | authorization_code, refresh_token                     |
 *
 * @param clientType - The client type (confidential or public)
 * @param applicationType - The application deployment type
 * @returns Array of default grant type strings
 */
export function getDefaultGrantTypes(
  clientType: ClientType,
  applicationType: ApplicationType,
): string[] {
  // Confidential web clients get client_credentials in addition to auth code
  if (clientType === 'confidential' && applicationType === 'web') {
    return ['authorization_code', 'refresh_token', 'client_credentials'];
  }

  // All other combinations: authorization_code + refresh_token
  return ['authorization_code', 'refresh_token'];
}

/**
 * Get default token endpoint authentication method based on client type.
 *
 * - confidential → 'client_secret_basic' (sends credentials in Authorization header)
 * - public → 'none' (public clients cannot authenticate at token endpoint)
 *
 * @param clientType - The client type
 * @returns Token endpoint auth method string
 */
export function getDefaultTokenEndpointAuthMethod(clientType: ClientType): string {
  return clientType === 'confidential' ? 'client_secret_basic' : 'none';
}

/**
 * Get default response types.
 * All clients default to ['code'] (authorization code flow).
 *
 * @returns Array of default response type strings
 */
export function getDefaultResponseTypes(): string[] {
  return ['code'];
}

/**
 * Get default scope.
 * All clients default to 'openid profile email'.
 *
 * @returns Default scope string
 */
export function getDefaultScope(): string {
  return 'openid profile email';
}
