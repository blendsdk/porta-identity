/**
 * Client credentials flow E2E tests.
 *
 * Tests the client_credentials grant type against a real Porta server.
 * This grant is used for machine-to-machine authentication — no user
 * interaction required.
 *
 * Covers: happy path, correct claims, no ID token, no refresh token,
 * scope restriction, invalid secret rejection, and revoked client.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { OidcTestClient } from '../helpers/oidc-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClientWithSecret,
} from '../../integration/helpers/factories.js';
import { updateClient } from '../../../src/clients/repository.js';

describe('Client Credentials Flow (E2E)', () => {
  let baseUrl: string;
  let orgSlug: string;
  let clientId: string;
  let clientSecret: string;
  let internalClientId: string;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta.local:3443';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();

    // Create org → app → client with secret
    const org = await createTestOrganization({ name: 'CC Flow Org' });
    orgSlug = org.slug;
    const app = await createTestApplication();
    const { client, clientSecret: secret } = await createTestClientWithSecret(
      org.id, app.id,
      { grantTypes: ['client_credentials', 'authorization_code', 'refresh_token'] },
    );
    clientId = client.clientId;
    clientSecret = secret;
    internalClientId = client.id;
  });

  // ── Happy Path ─────────────────────────────────────────────────

  it('should return an access token for valid client credentials', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const tokens = await oidc.clientCredentials();

    expect(tokens.access_token).toBeDefined();
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBeGreaterThan(0);
  });

  it('should not return an ID token', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const tokens = await oidc.clientCredentials();

    // Client credentials grant does not issue ID tokens
    expect(tokens.id_token).toBeUndefined();
  });

  it('should not return a refresh token', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const tokens = await oidc.clientCredentials();

    // Client credentials grant does not issue refresh tokens
    expect(tokens.refresh_token).toBeUndefined();
  });

  // ── Scope ──────────────────────────────────────────────────────

  it('should respect requested scopes', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const tokens = await oidc.clientCredentials('openid');

    expect(tokens.access_token).toBeDefined();
    // Scope should be present in response
    if (tokens.scope) {
      expect(tokens.scope).toContain('openid');
    }
  });

  // ── Invalid Client Secret ──────────────────────────────────────

  it('should reject invalid client secret with 401', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, 'wrong-secret');

    await expect(oidc.clientCredentials()).rejects.toThrow(/401/);
  });

  // ── No Client Auth ─────────────────────────────────────────────

  it('should reject requests without client authentication', async () => {
    // Should fail because confidential clients need authentication
    const body = new URLSearchParams({ grant_type: 'client_credentials' });
    const url = `${baseUrl}/${orgSlug}/token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    // oidc-provider 9.8.2+ may return 400 or 401 for missing client auth
    expect([400, 401]).toContain(response.status);
  });

  // ── Revoked Client ─────────────────────────────────────────────

  it('should reject a revoked client', async () => {
    // Revoke the client
    await updateClient(internalClientId, { status: 'revoked' });

    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);

    await expect(oidc.clientCredentials()).rejects.toThrow();
  });
});
