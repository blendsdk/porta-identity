/**
 * Static client fixtures for predictable test scenarios.
 *
 * These provide partial client input shapes — they do NOT insert into the
 * database and do NOT include organizationId, applicationId, or clientId
 * (which must be provided at creation time).
 *
 * Each fixture represents a distinct OIDC client type:
 * - WEB_CLIENT:  Server-rendered web app (confidential, auth code + refresh)
 * - SPA_CLIENT:  Single-page app (public, auth code + PKCE)
 * - M2M_CLIENT:  Machine-to-machine (confidential, client credentials)
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
