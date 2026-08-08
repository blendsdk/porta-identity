/**
 * Consent/interaction invalid parameter E2E tests.
 *
 * Tests that invalid interaction UIDs, expired interactions, and
 * missing session cookies are handled gracefully.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestHttpClient } from '../helpers/http-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import { createTestOrganization } from '../../integration/helpers/factories.js';

describe('Consent/Interaction — Invalid Params (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta.local:3443';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await createTestOrganization({ name: 'Interaction Invalid Org' });
    http = new TestHttpClient(baseUrl);
  });

  it('should handle invalid interaction UID on GET', async () => {
    const response = await http.get('/interaction/invalid-uid-12345');
    // Should show error page, not crash
    expect([200, 302, 303, 400]).toContain(response.status);
  });

  it('should handle invalid interaction UID on consent', async () => {
    const response = await http.get('/interaction/invalid-uid-12345/consent');
    expect([200, 302, 303, 400]).toContain(response.status);
  });

  it('should handle missing interaction cookie', async () => {
    // Fresh client with no cookies — no valid session
    const freshHttp = new TestHttpClient(baseUrl);
    const response = await freshHttp.get('/interaction/some-random-uid');
    expect([200, 302, 303, 400]).toContain(response.status);
  });

  it('should handle tampered consent POST with invalid UID', async () => {
    const response = await http.post('/interaction/invalid-uid/confirm', {
      decision: 'approve',
      _csrf: 'fake-csrf',
      _csrfStored: 'fake-csrf',
    });
    // Should show error or reject — not crash
    expect([200, 302, 303, 400, 403]).toContain(response.status);
  });
});
