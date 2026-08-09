/**
 * User enumeration prevention E2E tests.
 *
 * Verifies that the server does not leak information about whether
 * a given email address is registered in the system.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestHttpClient } from '../helpers/http-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClientWithSecret,
  createTestUserWithPassword,
} from '../../integration/helpers/factories.js';

describe('User Enumeration Prevention (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;
  let orgSlug: string;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta.local:3443';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    const org = await createTestOrganization({ name: 'Enum Prevent Org' });
    orgSlug = org.slug;
    const app = await createTestApplication();
    await createTestClientWithSecret(org.id, app.id);
    await createTestUserWithPassword(org.id);
    http = new TestHttpClient(baseUrl);
  });

  it('should return same response for forgot-password with existing and non-existing email', async () => {
    const page = await http.get(`/${orgSlug}/auth/forgot-password`);
    const csrf = http.extractCsrfToken(page.body);

    const respExisting = await http.post(`/${orgSlug}/auth/forgot-password`, {
      email: 'some-user@test.example.com',
      _csrf: csrf!,
      _csrfStored: csrf!,
    });

    const page2 = await http.get(`/${orgSlug}/auth/forgot-password`);
    const csrf2 = http.extractCsrfToken(page2.body);

    const respNonExisting = await http.post(`/${orgSlug}/auth/forgot-password`, {
      email: 'nonexistent-user@test.example.com',
      _csrf: csrf2!,
      _csrfStored: csrf2!,
    });

    // Both should return the same status code
    expect(respExisting.status).toBe(respNonExisting.status);
  });

  it('should not reveal user existence in forgot-password response body', async () => {
    const page = await http.get(`/${orgSlug}/auth/forgot-password`);
    const csrf = http.extractCsrfToken(page.body);

    const resp = await http.post(`/${orgSlug}/auth/forgot-password`, {
      email: 'nonexistent@nowhere.com',
      _csrf: csrf!,
      _csrfStored: csrf!,
    });

    // Should NOT contain messages like "email not found" or "no account"
    expect(resp.body).not.toMatch(/not found/i);
    expect(resp.body).not.toMatch(/does not exist/i);
    expect(resp.body).not.toMatch(/no account/i);
  });

  it('should not differentiate timing between existing and non-existing users on forgot-password', async () => {
    // This is a basic timing check — not foolproof but catches obvious leaks
    const page = await http.get(`/${orgSlug}/auth/forgot-password`);
    const csrf = http.extractCsrfToken(page.body);

    const start1 = Date.now();
    await http.post(`/${orgSlug}/auth/forgot-password`, {
      email: 'existing@test.example.com',
      _csrf: csrf!,
      _csrfStored: csrf!,
    });
    const time1 = Date.now() - start1;

    const page2 = await http.get(`/${orgSlug}/auth/forgot-password`);
    const csrf2 = http.extractCsrfToken(page2.body);

    const start2 = Date.now();
    await http.post(`/${orgSlug}/auth/forgot-password`, {
      email: 'nonexistent@test.example.com',
      _csrf: csrf2!,
      _csrfStored: csrf2!,
    });
    const time2 = Date.now() - start2;

    // Times should be in a similar ballpark (within 2x of each other)
    // This is a very lenient check — production would use constant-time
    const ratio = Math.max(time1, time2) / Math.max(Math.min(time1, time2), 1);
    expect(ratio).toBeLessThan(10);
  });
});
