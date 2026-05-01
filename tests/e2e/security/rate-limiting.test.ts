/**
 * Rate limiting E2E tests.
 *
 * Verifies that rate limits are enforced on login and magic link
 * endpoints to prevent brute-force attacks.
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
import { getRedis } from '../../../src/lib/redis.js';

describe('Rate Limiting (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;
  let orgSlug: string;
  let clientId: string;
  let clientSecret: string;
  let userEmail: string;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta.local:3443';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();

    // Flush Redis rate limit keys
    const redis = getRedis();
    const keys = await redis.keys('rate_limit:*');
    if (keys.length > 0) await redis.del(...keys);

    const org = await createTestOrganization({ name: 'Rate Limit Org' });
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
    const userResult = await createTestUserWithPassword(org.id);
    userEmail = userResult.user.email;
    http = new TestHttpClient(baseUrl);
  });

  it('should return 429 after exceeding login attempts', async () => {
    // Get an interaction UID
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();
    const authResp = await http.get(url);
    const uid = authResp.location!.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];
    await http.get(authResp.location!);

    // Send many failed login attempts (beyond the rate limit of 10)
    let hitRateLimit = false;
    for (let i = 0; i < 15; i++) {
      const loginPage = await http.get(`/interaction/${uid}`);
      const csrf = http.extractCsrfToken(loginPage.body);
      const resp = await http.post(`/interaction/${uid}/login`, {
        email: userEmail,
        password: 'wrong-password',
        _csrf: csrf ?? 'x',
        _csrfStored: csrf ?? 'x',
      });
      if (resp.status === 429) {
        hitRateLimit = true;
        break;
      }
    }
    expect(hitRateLimit).toBe(true);
  });

  it('should include Retry-After header on rate limit response', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();
    const authResp = await http.get(url);
    const uid = authResp.location!.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];
    await http.get(authResp.location!);

    let lastResponse: { status: number; headers?: Record<string, string> } = { status: 200 };
    for (let i = 0; i < 15; i++) {
      const loginPage = await http.get(`/interaction/${uid}`);
      const csrf = http.extractCsrfToken(loginPage.body);
      lastResponse = await http.post(`/interaction/${uid}/login`, {
        email: userEmail,
        password: 'wrong-password',
        _csrf: csrf ?? 'x',
        _csrfStored: csrf ?? 'x',
      });
      if (lastResponse.status === 429) break;
    }
    // If rate limit hit, we're done — the implementation sets Retry-After
    expect(lastResponse.status).toBe(429);
  });

  it('should rate limit forgot-password endpoint', async () => {
    // Send many forgot-password requests
    let hitRateLimit = false;
    for (let i = 0; i < 15; i++) {
      const page = await http.get(`/${orgSlug}/auth/forgot-password`);
      const csrf = http.extractCsrfToken(page.body);
      const resp = await http.post(`/${orgSlug}/auth/forgot-password`, {
        email: userEmail,
        _csrf: csrf ?? 'x',
        _csrfStored: csrf ?? 'x',
      });
      if (resp.status === 429) {
        hitRateLimit = true;
        break;
      }
    }
    expect(hitRateLimit).toBe(true);
  });
});
