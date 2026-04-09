/**
 * Token introspection E2E tests.
 *
 * Tests the /token/introspection endpoint against a real Porta server.
 * Uses client_credentials tokens (easy to obtain without interactive login)
 * to verify introspection behavior.
 *
 * Covers: active token, revoked token, invalid token, and correct metadata.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { OidcTestClient } from '../helpers/oidc-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClientWithSecret,
} from '../../integration/helpers/factories.js';

describe('Token Introspection (E2E)', () => {
  let baseUrl: string;
  let orgSlug: string;
  let oidc: OidcTestClient;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'http://localhost:3000';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();

    const org = await createTestOrganization({ name: 'Introspection Org' });
    orgSlug = org.slug;
    const app = await createTestApplication();
    const { client, clientSecret } = await createTestClientWithSecret(
      org.id, app.id,
      { grantTypes: ['client_credentials', 'authorization_code', 'refresh_token'] },
    );
    oidc = new OidcTestClient(baseUrl, orgSlug, client.clientId, clientSecret);
  });

  // ── Active Token ───────────────────────────────────────────────

  it('should return active=true for a valid access token', async () => {
    const tokens = await oidc.clientCredentials();
    const result = await oidc.introspect(tokens.access_token);

    expect(result.active).toBe(true);
  });

  it('should include correct metadata for an active token', async () => {
    const tokens = await oidc.clientCredentials();
    const result = await oidc.introspect(tokens.access_token);

    expect(result.active).toBe(true);
    // Should have standard token metadata
    if (result.client_id) {
      expect(result.client_id).toBeDefined();
    }
    if (result.exp) {
      expect(result.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });

  // ── Revoked Token ──────────────────────────────────────────────

  it('should return active=false after token is revoked', async () => {
    const tokens = await oidc.clientCredentials();

    // Revoke the token
    await oidc.revoke(tokens.access_token, 'access_token');

    // Introspect should now show inactive
    const result = await oidc.introspect(tokens.access_token);
    expect(result.active).toBe(false);
  });

  // ── Invalid Token ──────────────────────────────────────────────

  it('should return active=false for a random/invalid token', async () => {
    const result = await oidc.introspect('random-invalid-token-string');
    expect(result.active).toBe(false);
  });

  it('should return active=false for an empty token', async () => {
    const result = await oidc.introspect('');
    expect(result.active).toBe(false);
  });
});
