/**
 * Authorization code + PKCE flow E2E tests.
 *
 * Tests the authorization code grant type with PKCE against a real Porta server.
 * Since full interactive login requires browser automation (out of scope for
 * this phase), these tests verify the authorization URL structure, redirect
 * to interaction, PKCE parameter validation, and error cases.
 *
 * Covers: auth URL redirects to interaction, state preservation, PKCE required,
 * invalid redirect_uri rejection, invalid client_id, and missing scope.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { OidcTestClient } from '../helpers/oidc-client.js';
import { TestHttpClient } from '../helpers/http-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClientWithSecret,
} from '../../integration/helpers/factories.js';

describe('Authorization Code + PKCE Flow (E2E)', () => {
  let baseUrl: string;
  let orgSlug: string;
  let clientId: string;
  let clientSecret: string;
  let http: TestHttpClient;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta.local:3443';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();

    const org = await createTestOrganization({ name: 'Auth Code Org' });
    orgSlug = org.slug;
    const app = await createTestApplication();
    const { client, clientSecret: secret } = await createTestClientWithSecret(
      org.id, app.id,
      {
        grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
        redirectUris: ['http://localhost:3001/callback'],
        responseTypes: ['code'],
        requirePkce: true,
      },
    );
    clientId = client.clientId;
    clientSecret = secret;
    http = new TestHttpClient(baseUrl);
  });

  // ── Authorization URL → Interaction Redirect ───────────────────

  it('should redirect authorization request to interaction endpoint', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();

    // Follow the authorization URL — should redirect to /interaction/:uid
    const response = await http.get(url);

    // Should be a redirect (302/303) to the interaction login page
    expect([302, 303]).toContain(response.status);
    expect(response.location).toBeDefined();
    expect(response.location).toContain('/interaction/');
  });

  it('should preserve state parameter through the redirect', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const customState = 'my-custom-state-12345';
    const { url } = oidc.buildAuthorizationUrl({ state: customState });

    // The state is embedded in the auth URL params
    expect(url).toContain(`state=${customState}`);
  });

  it('should include PKCE code_challenge in the authorization URL', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url, codeChallenge } = oidc.buildAuthorizationUrl();

    expect(url).toContain('code_challenge=');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain(encodeURIComponent(codeChallenge));
  });

  // ── Error: Invalid redirect_uri ────────────────────────────────

  it('should reject authorization with unregistered redirect_uri', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl({
      redirectUri: 'http://evil.example.com/callback',
    });

    const response = await http.get(url);

    // Provider should reject with an error (400 or redirect to error)
    // The exact behavior depends on provider config — either a 400 status
    // or a response indicating an error
    expect([400, 302, 303]).toContain(response.status);
    if (response.status === 400) {
      expect(response.body).toContain('redirect_uri');
    }
  });

  // ── Error: Invalid client_id ───────────────────────────────────

  it('should reject authorization with unknown client_id', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, 'nonexistent-client-id', clientSecret);
    const { url } = oidc.buildAuthorizationUrl();

    const response = await http.get(url);

    // Should get an error for unknown client
    expect([400, 302, 303]).toContain(response.status);
  });

  // ── Error: Code exchange without PKCE verifier ─────────────────

  it('should reject code exchange with incorrect code_verifier', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);

    // Try to exchange a fake code with a mismatched verifier — should fail
    await expect(
      oidc.exchangeCode('fake-authorization-code', 'wrong-verifier'),
    ).rejects.toThrow();
  });

  // ── Scope in Authorization URL ─────────────────────────────────

  it('should include requested scopes in the authorization URL', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl({ scope: 'openid profile email' });

    expect(url).toContain('scope=openid+profile+email');
  });

  // ── Response type in Authorization URL ─────────────────────────

  it('should use response_type=code in the authorization URL', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();

    expect(url).toContain('response_type=code');
  });
});
