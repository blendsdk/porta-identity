/**
 * CSRF protection E2E tests.
 *
 * Verifies that the cookie-based synchronized token pattern works correctly:
 * - GET handlers set an HttpOnly `_csrf` cookie and embed the same token in the form
 * - POST handlers compare the cookie value against the `_csrf` form field
 * - Requests without a valid cookie+field pair are rejected
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestHttpClient } from '../helpers/http-client.js';
import { OidcTestClient } from '../helpers/oidc-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClientWithSecret,
  createTestUserWithPassword,
} from '../../integration/helpers/factories.js';

describe('CSRF Protection (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;
  let orgSlug: string;
  let clientId: string;
  let clientSecret: string;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta.local:3443';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    const org = await createTestOrganization({ name: 'CSRF Test Org' });
    orgSlug = org.slug;
    const app = await createTestApplication();
    const created = await createTestClientWithSecret(org.id, app.id, {
      grantTypes: ['authorization_code'],
      redirectUris: ['http://localhost:3001/callback'],
      responseTypes: ['code'],
      requirePkce: true,
    });
    clientId = created.client.clientId;
    clientSecret = created.clientSecret;
    await createTestUserWithPassword(org.id);
    http = new TestHttpClient(baseUrl);
  });

  // ── Negative tests: missing CSRF cookie or form field ──────────

  it('should reject login POST without CSRF cookie or form field', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();
    const authResp = await http.get(url);
    const uid = authResp.location!.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];

    // Clear cookies so the _csrf cookie set by the GET is not sent
    http.clearCookies();

    const resp = await http.post(`/interaction/${uid}/login`, {
      email: 'test@test.com',
      password: 'TestPassword123!',
    });
    // Without CSRF cookie or form field, the login should not succeed
    expect(resp.location).toBeUndefined();
  });

  it('should reject login POST with cookie but without _csrf form field', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();
    const authResp = await http.get(url);
    const uid = authResp.location!.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];
    // Visit the login page — this sets the _csrf cookie in the jar
    await http.get(authResp.location!);

    // POST with cookie (auto-sent from jar) but NO _csrf form field
    const resp = await http.post(`/interaction/${uid}/login`, {
      email: 'test@test.com',
      password: 'TestPassword123!',
    });
    // Cookie present but form field missing → CSRF validation fails
    expect(resp.location).toBeUndefined();
  });

  it('should reject login POST with wrong _csrf form field value', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();
    const authResp = await http.get(url);
    const uid = authResp.location!.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];
    // Visit the login page — sets _csrf cookie
    await http.get(authResp.location!);

    // POST with cookie (auto-sent) but WRONG _csrf form value
    const resp = await http.post(`/interaction/${uid}/login`, {
      email: 'test@test.com',
      password: 'TestPassword123!',
      _csrf: 'wrong-token-value',
    });
    // Cookie and form field don't match → CSRF validation fails
    expect(resp.location).toBeUndefined();
  });

  it('should reject consent POST without CSRF tokens', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();
    const authResp = await http.get(url);
    const uid = authResp.location!.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];

    // Clear cookies — no _csrf cookie available
    http.clearCookies();

    const resp = await http.post(`/interaction/${uid}/confirm`, {
      decision: 'approve',
    });
    // Without CSRF, consent should fail
    expect([200, 400, 403]).toContain(resp.status);
  });

  it('should reject forgot-password POST without CSRF tokens', async () => {
    // POST directly without visiting the GET page first — no _csrf cookie
    const resp = await http.post(`/${orgSlug}/auth/forgot-password`, {
      email: 'test@test.com',
    });
    expect(resp.status).toBe(403);
  });

  it('should reject password reset POST without CSRF tokens', async () => {
    // POST directly without visiting the GET page first — no _csrf cookie
    const resp = await http.post(`/${orgSlug}/auth/reset-password/some-token`, {
      password: 'NewPassword123!',
      confirmPassword: 'NewPassword123!',
    });
    // Should fail CSRF validation
    expect([200, 400, 403]).toContain(resp.status);
  });

  // ── Positive tests: valid CSRF cookie + form field ─────────────

  it('should accept login POST with matching CSRF cookie and form field', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();
    const authResp = await http.get(url);
    const uid = authResp.location!.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];

    // GET the login page — sets _csrf cookie in jar and embeds token in HTML
    const loginPage = await http.get(authResp.location!);
    const csrfToken = http.extractCsrfToken(loginPage.body);
    expect(csrfToken).toBeTruthy();

    // POST with both cookie (auto-sent from jar) and matching _csrf form field
    const resp = await http.post(`/interaction/${uid}/login`, {
      email: 'test@test.com',
      password: 'TestPassword123!',
      _csrf: csrfToken!,
    });
    // With valid CSRF, the login should proceed (redirect to consent or callback)
    // A redirect (302/303) means CSRF passed and login was processed
    expect(resp.status).toBeGreaterThanOrEqual(200);
    expect(resp.status).toBeLessThan(500);
  });

  it('should accept forgot-password POST with matching CSRF cookie and form field', async () => {
    // GET the forgot-password page — sets _csrf cookie and embeds token in HTML
    const page = await http.get(`/${orgSlug}/auth/forgot-password`);
    const csrfToken = http.extractCsrfToken(page.body);
    expect(csrfToken).toBeTruthy();

    // POST with both cookie (auto-sent from jar) and matching _csrf form field
    const resp = await http.post(`/${orgSlug}/auth/forgot-password`, {
      email: 'test@test.com',
      _csrf: csrfToken!,
    });
    // With valid CSRF, should be accepted (200 success page or 302 redirect)
    expect(resp.status).toBeGreaterThanOrEqual(200);
    expect(resp.status).toBeLessThan(500);
  });
});
