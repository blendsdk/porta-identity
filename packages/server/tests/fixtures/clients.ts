/**
 * Static client fixtures and builder helpers for predictable test scenarios.
 *
 * These provide partial client input shapes — they do NOT insert into the
 * database and do NOT include organizationId, applicationId, or clientId
 * (which must be provided at creation time).
 *
 * Each fixture represents a distinct OIDC client type:
 * - WEB_CLIENT:  Server-rendered web app (confidential, auth code + refresh)
 * - SPA_CLIENT:  Single-page app (public, auth code + PKCE)
 * - M2M_CLIENT:  Machine-to-machine (confidential, client credentials)
 *
 * The `buildTestClient()` helper merges defaults with overrides so tests can
 * express only the fields they care about. This pattern keeps downstream tests
 * insulated from schema additions: when a new column is added (e.g.,
 * `loginMethods` from plans/client-login-methods), only this file needs to
 * update its defaults.
 */

import type { InsertClientData } from '../../src/clients/repository.js';

/** Keys that must be provided at creation time — excluded from fixture shapes */
type ClientFixtureKeys = 'organizationId' | 'applicationId' | 'clientId';

/** Confidential web application — server-rendered, uses client_secret_basic */
export const WEB_CLIENT: Omit<InsertClientData, ClientFixtureKeys> = {
  clientName: 'Test Web Client',
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: ['http://localhost:3001/callback'],
  postLogoutRedirectUris: ['http://localhost:3001'],
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  scope: 'openid profile email',
  tokenEndpointAuthMethod: 'client_secret_basic',
  allowedOrigins: [],
  requirePkce: true,
};

/** Public SPA application — browser-only, no client secret, PKCE required */
export const SPA_CLIENT: Omit<InsertClientData, ClientFixtureKeys> = {
  clientName: 'Test SPA Client',
  clientType: 'public',
  applicationType: 'web',
  redirectUris: ['http://localhost:3001/callback'],
  postLogoutRedirectUris: ['http://localhost:3001'],
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  scope: 'openid profile email',
  tokenEndpointAuthMethod: 'none',
  allowedOrigins: ['http://localhost:3001'],
  requirePkce: true,
};

/** Machine-to-machine client — no user interaction, client credentials only */
export const M2M_CLIENT: Omit<InsertClientData, ClientFixtureKeys> = {
  clientName: 'Test M2M Client',
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: [],
  postLogoutRedirectUris: [],
  grantTypes: ['client_credentials'],
  responseTypes: [],
  scope: 'openid',
  tokenEndpointAuthMethod: 'client_secret_basic',
  allowedOrigins: [],
  requirePkce: false,
};

/** Required identity fields — caller must always supply these. */
export interface ClientIdentityOverrides {
  organizationId: string;
  applicationId: string;
  /** Defaults to a random `test-client-<timestamp>-<n>` if omitted. */
  clientId?: string;
}

/**
 * Build a test client input shape with sensible defaults.
 *
 * Tests should use this helper instead of constructing `InsertClientData`
 * objects manually. The caller MUST provide `organizationId` and
 * `applicationId` (these can never be defaulted); everything else falls back
 * to a sane value. Override any field by passing an `overrides` object.
 *
 * Defaults to a public SPA-shaped client because that's the most common test
 * scenario in this codebase. Override `clientType: 'confidential'` etc. when
 * you need a different shape, or splice in a fixture: `{ ...WEB_CLIENT, ... }`.
 *
 * @param identity - Required: organizationId + applicationId; optional clientId
 * @param overrides - Partial client fields to override the defaults
 * @returns A fully-populated `InsertClientData` object suitable for `insertClient()`
 *
 * @example
 *   const data = buildTestClient({ organizationId: org.id, applicationId: app.id });
 *   const client = await insertClient(data);
 *
 * @example
 *   // Confidential client with custom redirect URI
 *   const data = buildTestClient(
 *     { organizationId: org.id, applicationId: app.id },
 *     { ...WEB_CLIENT, redirectUris: ['https://example.com/cb'] },
 *   );
 */
export function buildTestClient(
  identity: ClientIdentityOverrides,
  overrides: Partial<Omit<InsertClientData, ClientFixtureKeys>> = {},
): InsertClientData {
  const generatedClientId =
    identity.clientId ??
    `test-client-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  return {
    organizationId: identity.organizationId,
    applicationId: identity.applicationId,
    clientId: generatedClientId,
    // Defaults match SPA_CLIENT shape — most common test scenario.
    clientName: 'Test Client',
    clientType: 'public',
    applicationType: 'web',
    redirectUris: ['http://localhost:3001/callback'],
    postLogoutRedirectUris: ['http://localhost:3001'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    scope: 'openid profile email',
    tokenEndpointAuthMethod: 'none',
    allowedOrigins: ['http://localhost:3001'],
    requirePkce: true,
    ...overrides,
  };
}
