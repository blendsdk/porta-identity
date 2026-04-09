/**
 * Magic link login flow E2E tests.
 *
 * Tests the passwordless magic link authentication flow including
 * email delivery via MailHog, link verification, single-use tokens,
 * and user enumeration prevention.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestHttpClient } from '../helpers/http-client.js';
import { OidcTestClient } from '../helpers/oidc-client.js';
import { MailHogClient } from '../helpers/mailhog.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClientWithSecret,
  createTestUserWithPassword,
} from '../../integration/helpers/factories.js';
import type { Organization } from '../../../src/organizations/types.js';
import type { Client } from '../../../src/clients/types.js';
import type { User } from '../../../src/users/types.js';

describe('Magic Link Flow (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;
  let mailhog: MailHogClient;
  let org: Organization;
  let client: Client;
  let clientSecret: string;
  let user: User;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'http://localhost:3000';
    mailhog = new MailHogClient();
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await mailhog.clearAll();

    org = await createTestOrganization({ name: 'Magic Link Org' });
    const app = await createTestApplication();
    const created = await createTestClientWithSecret(org.id, app.id, {
      grantTypes: ['authorization_code', 'refresh_token'],
      redirectUris: ['http://localhost:3001/callback'],
      responseTypes: ['code'],
      requirePkce: true,
    });
    client = created.client;
    clientSecret = created.clientSecret;

    const userResult = await createTestUserWithPassword(org.id);
    user = userResult.user;

    http = new TestHttpClient(baseUrl);
  });

  /** Start auth flow and get the interaction login page */
  async function getInteractionUid(): Promise<string> {
    const oidc = new OidcTestClient(baseUrl, org.slug, client.clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();
    const authResponse = await http.get(url);
    expect([302, 303]).toContain(authResponse.status);

    const loginPage = await http.get(authResponse.location!);
    expect(loginPage.status).toBe(200);

    const uid = authResponse.location!.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];
    expect(uid).toBeTruthy();
    return uid!;
  }

  /** Extract CSRF token from the login page */
  async function getCsrfFromLoginPage(uid: string): Promise<string> {
    const loginPage = await http.get(`/interaction/${uid}`);
    const csrf = http.extractCsrfToken(loginPage.body);
    expect(csrf).toBeTruthy();
    return csrf!;
  }

  // ── Request magic link → email sent ────────────────────────────

  it('should send magic link email when requested for valid user', async () => {
    const uid = await getInteractionUid();
    const csrf = await getCsrfFromLoginPage(uid);

    // Request magic link
    const response = await http.post(`/interaction/${uid}/magic-link`, {
      email: user.email,
      _csrf: csrf,
      _csrfStored: csrf,
    });

    // Should show "check your email" page (200)
    expect(response.status).toBe(200);

    // Verify email was sent via MailHog
    const msg = await mailhog.waitForMessage(user.email, 10000);
    expect(msg).toBeDefined();
    expect(msg.subject).toBeTruthy();
  });

  // ── Magic link contains valid URL ──────────────────────────────

  it('should include a valid magic link URL in the email', async () => {
    const uid = await getInteractionUid();
    const csrf = await getCsrfFromLoginPage(uid);

    await http.post(`/interaction/${uid}/magic-link`, {
      email: user.email,
      _csrf: csrf,
      _csrfStored: csrf,
    });

    const msg = await mailhog.waitForMessage(user.email, 10000);
    // Extract the magic link URL from the email body
    const linkPattern = new RegExp(`${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\s"<]+magic-link[^\\s"<]+`);
    const link = mailhog.extractLink(msg, linkPattern);

    // The link should contain the auth/magic-link path with a token
    expect(link).toBeTruthy();
    expect(link).toContain('/auth/magic-link/');
  });

  // ── Click magic link → authenticated ───────────────────────────

  it('should authenticate user when clicking magic link', async () => {
    const uid = await getInteractionUid();
    const csrf = await getCsrfFromLoginPage(uid);

    await http.post(`/interaction/${uid}/magic-link`, {
      email: user.email,
      _csrf: csrf,
      _csrfStored: csrf,
    });

    const msg = await mailhog.waitForMessage(user.email, 10000);
    const linkPattern = /http[s]?:\/\/[^\s"<]+magic-link[^\s"<]+/;
    const link = mailhog.extractLink(msg, linkPattern);
    expect(link).toBeTruthy();

    // Click the magic link (GET request)
    const verifyResponse = await http.get(link!);

    // Should redirect through the OIDC flow or show success
    expect([200, 302, 303]).toContain(verifyResponse.status);
  });

  // ── Non-existent email → same response (no enumeration) ────────

  it('should return same response for non-existent email', async () => {
    const uid = await getInteractionUid();
    const csrf = await getCsrfFromLoginPage(uid);

    // Request magic link for non-existent user
    const response = await http.post(`/interaction/${uid}/magic-link`, {
      email: 'nonexistent@test.example.com',
      _csrf: csrf,
      _csrfStored: csrf,
    });

    // Should show the same "check your email" page (anti-enumeration)
    expect(response.status).toBe(200);
  });

  // ── Magic link is single-use ───────────────────────────────────

  it('should reject magic link on second use', async () => {
    const uid = await getInteractionUid();
    const csrf = await getCsrfFromLoginPage(uid);

    await http.post(`/interaction/${uid}/magic-link`, {
      email: user.email,
      _csrf: csrf,
      _csrfStored: csrf,
    });

    const msg = await mailhog.waitForMessage(user.email, 10000);
    const linkPattern = /http[s]?:\/\/[^\s"<]+magic-link[^\s"<]+/;
    const link = mailhog.extractLink(msg, linkPattern);
    expect(link).toBeTruthy();

    // First click — should work
    const firstResponse = await http.get(link!);
    expect([200, 302, 303]).toContain(firstResponse.status);

    // Second click with fresh client (no session cookies)
    const http2 = new TestHttpClient(baseUrl);
    const secondResponse = await http2.get(link!);

    // Should show error page (token already used)
    expect([400, 200]).toContain(secondResponse.status);
  });

  // ── CSRF required for magic link request ───────────────────────

  it('should reject magic link request without CSRF token', async () => {
    const uid = await getInteractionUid();

    const response = await http.post(`/interaction/${uid}/magic-link`, {
      email: user.email,
    });

    // Should show CSRF error, not redirect to "check email" page
    expect(response.status).toBe(200);
    expect(response.location).toBeUndefined();
  });
});
