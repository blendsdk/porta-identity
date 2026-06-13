/**
 * Unit tests for the OIDC authorization URL builder.
 *
 * Verifies that `buildAuthorizationUrl` requests `offline_access` and includes
 * `prompt=consent`. The `consent` prompt is REQUIRED: node-oidc-provider's
 * check_scope strips `offline_access` from any request whose `prompt` does not
 * contain `consent`, which would suppress the refresh token and break silent
 * BFF session renewal.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

// Mock openid-client's buildAuthorizationUrl so we can capture the params and
// avoid needing a real discovered Configuration.
vi.mock('openid-client', () => ({
  buildAuthorizationUrl: vi.fn(),
}));

import * as oidcClient from 'openid-client';
import { buildAuthorizationUrl, type OidcConfig } from '../../src/auth/oidc.js';

const mockBuildAuthorizationUrl = vi.mocked(oidcClient.buildAuthorizationUrl);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOidcConfig(): OidcConfig {
  return {
    // `config` is opaque to our code — it is only forwarded to openid-client.
    config: {} as OidcConfig['config'],
    clientId: 'test-gui-client',
    issuer: 'https://porta.local:3443',
    redirectUri: 'http://127.0.0.1:4180/auth/callback',
    postLogoutRedirectUri: 'http://127.0.0.1:4180',
    port: 4180,
    serverUrl: 'https://porta.local:3443',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildAuthorizationUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildAuthorizationUrl.mockReturnValue(
      new URL('https://porta.local:3443/porta-admin/auth?mocked=1'),
    );
  });

  it('requests offline_access so a refresh token is issued', () => {
    buildAuthorizationUrl(makeOidcConfig(), 'test-challenge', 'test-state');

    const params = mockBuildAuthorizationUrl.mock.calls[0]?.[1] as Record<string, string>;
    expect(params.scope).toBe('openid profile email offline_access');
  });

  it('includes prompt=consent so offline_access is not stripped by the provider', () => {
    buildAuthorizationUrl(makeOidcConfig(), 'test-challenge', 'test-state');

    const params = mockBuildAuthorizationUrl.mock.calls[0]?.[1] as Record<string, string>;
    expect(params.prompt).toBe('consent');
  });

  it('forwards PKCE, redirect URI, and state', () => {
    const config = makeOidcConfig();
    buildAuthorizationUrl(config, 'test-challenge', 'test-state');

    const params = mockBuildAuthorizationUrl.mock.calls[0]?.[1] as Record<string, string>;
    expect(params.redirect_uri).toBe(config.redirectUri);
    expect(params.code_challenge).toBe('test-challenge');
    expect(params.code_challenge_method).toBe('S256');
    expect(params.state).toBe('test-state');
  });

  it('returns the href of the built URL', () => {
    const href = buildAuthorizationUrl(makeOidcConfig(), 'test-challenge', 'test-state');
    expect(href).toBe('https://porta.local:3443/porta-admin/auth?mocked=1');
  });
});
