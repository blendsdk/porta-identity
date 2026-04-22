/**
 * Refresh token E2E tests.
 *
 * Tests refresh token behavior against a real Porta server.
 * Since obtaining refresh tokens via authorization code flow requires
 * interactive login, these tests verify refresh token error cases
 * and structural behavior using client_credentials context.
 *
 * Covers: invalid refresh token, missing grant type, and refresh with
 * wrong client credentials. Full refresh token rotation testing requires
 * the complete auth code flow (deferred to interactive E2E tests).
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { OidcTestClient } from '../helpers/oidc-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClientWithSecret,
} from '../../integration/helpers/factories.js';

describe('Refresh Token (E2E)', () => {
  let baseUrl: string;
  let orgSlug: string;
  let clientId: string;
  let clientSecret: string;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'http://localhost:3000';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();

    const org = await createTestOrganization({ name: 'Refresh Org' });
    orgSlug = org.slug;
    const app = await createTestApplication();
    const { client, clientSecret: secret } = await createTestClientWithSecret(
      org.id, app.id,
      { grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'] },
    );
    clientId = client.clientId;
    clientSecret = secret;
  });

  // ── Invalid Refresh Token ──────────────────────────────────────

  it('should reject an invalid/random refresh token', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);

    await expect(
      oidc.refreshToken('invalid-random-refresh-token'),
    ).rejects.toThrow();
  });

  // ── Wrong Client Credentials ───────────────────────────────────

  it('should reject refresh with wrong client secret', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, 'wrong-secret');

    await expect(
      oidc.refreshToken('some-refresh-token'),
    ).rejects.toThrow(/401/);
  });

  // ── Missing Client Auth ────────────────────────────────────────

  it('should reject refresh without client authentication', async () => {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: 'some-refresh-token',
    });

    const url = `${baseUrl}/${orgSlug}/token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    // Should fail — confidential client needs authentication
    // oidc-provider 9.8.2+ may return 400 or 401 for missing client auth
    expect([400, 401]).toContain(response.status);
  });

  // ── Client Credentials Grant Does Not Issue Refresh Token ──────

  it('should not receive a refresh token from client_credentials grant', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const tokens = await oidc.clientCredentials();

    // Client credentials grant should NOT issue refresh tokens
    expect(tokens.refresh_token).toBeUndefined();
  });

  // ── Token Endpoint Accepts refresh_token Grant Type ────────────

  it('should accept refresh_token as a valid grant_type parameter', async () => {
    // Even though we can't get a real refresh token without auth code flow,
    // the token endpoint should recognize the grant_type (not return unsupported_grant_type)
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: 'fake-but-validating-grant-type',
    });

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const url = `${baseUrl}/${orgSlug}/token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: body.toString(),
    });

    // Should NOT be unsupported_grant_type (that would be 400 with specific error)
    // Instead it should be 400 invalid_grant (bad refresh token) — not 501 or unsupported
    const json = (await response.json()) as Record<string, unknown>;
    expect(json.error).not.toBe('unsupported_grant_type');
  });
});
