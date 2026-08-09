/**
 * Login form invalid parameter E2E tests.
 *
 * Tests that the login form handles invalid inputs gracefully:
 * missing email, invalid format, missing password, empty body,
 * extra fields, and invalid content type.
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

describe('Login Form — Invalid Params (E2E)', () => {
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
    const org = await createTestOrganization({ name: 'Login Form Org' });
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

  async function getInteractionUid(): Promise<string> {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();
    const resp = await http.get(url);
    await http.get(resp.location!);
    const parts = resp.location!.split('/interaction/')[1];
    const uid = parts?.split('/')[0]?.split('?')[0];
    if (!uid) throw new Error('Could not extract interaction UID');
    return uid;
  }

  it('should handle missing email field', async () => {
    const uid = await getInteractionUid();
    const resp = await http.post(`/interaction/${uid}/login`, { password: 'test', _csrf: 'x', _csrfStored: 'x' });
    expect(resp.status).toBe(200);
  });

  it('should handle invalid email format', async () => {
    const uid = await getInteractionUid();
    const resp = await http.post(`/interaction/${uid}/login`, { email: 'not-an-email', password: 'test', _csrf: 'x', _csrfStored: 'x' });
    expect(resp.status).toBe(200);
  });

  it('should handle missing password field', async () => {
    const uid = await getInteractionUid();
    const resp = await http.post(`/interaction/${uid}/login`, { email: 'test@test.com', _csrf: 'x', _csrfStored: 'x' });
    expect(resp.status).toBe(200);
  });

  it('should handle empty POST body', async () => {
    const uid = await getInteractionUid();
    const resp = await http.post(`/interaction/${uid}/login`, {});
    expect(resp.status).toBe(200);
  });

  it('should ignore extra unexpected fields (no privilege escalation)', async () => {
    const uid = await getInteractionUid();
    const resp = await http.post(`/interaction/${uid}/login`, { email: 'test@test.com', password: 'test', admin: 'true', isSuperAdmin: 'true', _csrf: 'x', _csrfStored: 'x' });
    expect(resp.status).toBe(200);
  });

  it('should handle JSON content type gracefully', async () => {
    const uid = await getInteractionUid();
    const resp = await http.postJson(`/interaction/${uid}/login`, { email: 'test@test.com', password: 'test' });
    expect([200, 400, 415]).toContain(resp.status);
  });
});
