/**
 * Token revocation E2E tests.
 *
 * Tests the /token/revocation endpoint (RFC 7009) against a real Porta server.
 * Uses client_credentials tokens for simplicity.
 *
 * Covers: revoke access token, verify revoked via introspection,
 * revoke invalid token (idempotent), and revoke with token_type_hint.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { OidcTestClient } from '../helpers/oidc-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClientWithSecret,
} from '../../integration/helpers/factories.js';

describe('Token Revocation (E2E)', () => {
  let baseUrl: string;
  let orgSlug: string;
  let oidc: OidcTestClient;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'http://localhost:3000';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();

    const org = await createTestOrganization({ name: 'Revocation Org' });
    orgSlug = org.slug;
    const app = await createTestApplication();
    const { client, clientSecret } = await createTestClientWithSecret(
      org.id, app.id,
      { grantTypes: ['client_credentials', 'authorization_code', 'refresh_token'] },
    );
    oidc = new OidcTestClient(baseUrl, orgSlug, client.clientId, clientSecret);
  });

  // ── Revoke Access Token ────────────────────────────────────────

  it('should revoke an access token and confirm via introspection', async () => {
    const tokens = await oidc.clientCredentials();

    // Token should be active before revocation
    const before = await oidc.introspect(tokens.access_token);
    expect(before.active).toBe(true);

    // Revoke the token
    await oidc.revoke(tokens.access_token, 'access_token');

    // Token should be inactive after revocation
    const after = await oidc.introspect(tokens.access_token);
    expect(after.active).toBe(false);
  });

  // ── Idempotent Revocation ──────────────────────────────────────

  it('should accept revocation of an invalid/random token without error', async () => {
    // RFC 7009: revocation endpoint always returns 200
    // This should not throw even for random tokens
    await oidc.revoke('totally-random-invalid-token');
    // If we reach here, the endpoint accepted it gracefully
  });

  it('should accept revoking the same token twice', async () => {
    const tokens = await oidc.clientCredentials();

    await oidc.revoke(tokens.access_token, 'access_token');
    // Second revocation should also succeed
    await oidc.revoke(tokens.access_token, 'access_token');

    // Token should still be inactive
    const result = await oidc.introspect(tokens.access_token);
    expect(result.active).toBe(false);
  });

  // ── Token Type Hint ────────────────────────────────────────────

  it('should accept revocation with token_type_hint', async () => {
    const tokens = await oidc.clientCredentials();

    // Revoke with explicit hint
    await oidc.revoke(tokens.access_token, 'access_token');

    const result = await oidc.introspect(tokens.access_token);
    expect(result.active).toBe(false);
  });
});
