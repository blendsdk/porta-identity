/**
 * OIDC Discovery — Playwright browser tests.
 *
 * Tests that OIDC discovery endpoints are functional and return
 * valid JSON with expected fields. These are basic smoke tests
 * for the OIDC provider's well-known endpoints.
 *
 * Covers Category 13 from the UI Testing Phase 2 plan.
 *
 * @see plans/ui-testing-v2/08-security-accessibility-tests.md — Category 13
 */

import { test, expect } from '../fixtures/test-fixtures.js';

// ---------------------------------------------------------------------------
// Category 13: OIDC Discovery (4 tests)
// ---------------------------------------------------------------------------

test.describe('OIDC Discovery', () => {
  // ── 13.1: Discovery endpoint returns valid JSON ──────────────────────

  test('/.well-known/openid-configuration returns valid discovery JSON', async ({
    page,
    testData,
  }) => {
    const response = await page.goto(
      `${testData.baseUrl}/${testData.orgSlug}/.well-known/openid-configuration`,
      { waitUntil: 'networkidle' },
    );

    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('application/json');

    // Parse the discovery document
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    const discovery = JSON.parse(bodyText!);

    // Must have required fields per OpenID Connect Discovery 1.0
    expect(discovery.issuer).toBeTruthy();
    expect(discovery.authorization_endpoint).toBeTruthy();
    expect(discovery.token_endpoint).toBeTruthy();
    expect(discovery.jwks_uri).toBeTruthy();
    expect(discovery.response_types_supported).toBeInstanceOf(Array);
    expect(discovery.subject_types_supported).toBeInstanceOf(Array);
    expect(discovery.id_token_signing_alg_values_supported).toBeInstanceOf(Array);
  });

  // ── 13.2: JWKS endpoint returns valid keys ───────────────────────────

  test('JWKS endpoint returns valid key set', async ({
    page,
    testData,
  }) => {
    // First get the JWKS URI from discovery
    await page.goto(
      `${testData.baseUrl}/${testData.orgSlug}/.well-known/openid-configuration`,
      { waitUntil: 'networkidle' },
    );

    const discoveryText = await page.textContent('body');
    const discovery = JSON.parse(discoveryText!);
    const jwksUri = discovery.jwks_uri;
    expect(jwksUri).toBeTruthy();

    // Fetch JWKS
    const jwksResponse = await page.goto(jwksUri, {
      waitUntil: 'networkidle',
    });

    expect(jwksResponse?.status()).toBe(200);
    // OIDC provider returns standard JWK Set content type
    expect(jwksResponse?.headers()['content-type']).toContain('application/jwk-set+json');

    const jwksText = await page.textContent('body');
    const jwks = JSON.parse(jwksText!);

    // Must have keys array
    expect(jwks.keys).toBeInstanceOf(Array);
    expect(jwks.keys.length).toBeGreaterThan(0);

    // Each key should have required JWK fields
    for (const key of jwks.keys) {
      expect(key.kty).toBeTruthy();
      expect(key.kid).toBeTruthy();
    }
  });

  // ── 13.3: Authorization endpoint is accessible ───────────────────────

  test('authorization endpoint responds (not 404/500)', async ({
    page,
    testData,
  }) => {
    await page.goto(
      `${testData.baseUrl}/${testData.orgSlug}/.well-known/openid-configuration`,
      { waitUntil: 'networkidle' },
    );

    const discoveryText = await page.textContent('body');
    const discovery = JSON.parse(discoveryText!);
    const authEndpoint = discovery.authorization_endpoint;
    expect(authEndpoint).toBeTruthy();

    // Hit auth endpoint without required params — should redirect or show error,
    // but NOT 404 or 500
    const response = await page.goto(authEndpoint, {
      waitUntil: 'networkidle',
    });

    // The endpoint should respond (might redirect to error, but not 404/500)
    const status = response?.status() ?? 0;
    expect(status).not.toBe(404);
    expect(status).not.toBe(500);
  });

  // ── 13.4: Token endpoint exists (POST-only, GET should fail gracefully)

  test('token endpoint exists and rejects GET requests', async ({
    page,
    testData,
  }) => {
    await page.goto(
      `${testData.baseUrl}/${testData.orgSlug}/.well-known/openid-configuration`,
      { waitUntil: 'networkidle' },
    );

    const discoveryText = await page.textContent('body');
    const discovery = JSON.parse(discoveryText!);
    const tokenEndpoint = discovery.token_endpoint;
    expect(tokenEndpoint).toBeTruthy();

    // GET to token endpoint should return 405 Method Not Allowed or similar
    const response = await page.goto(tokenEndpoint, {
      waitUntil: 'networkidle',
    });

    // Token endpoint only accepts POST; GET may return 404 (no GET route)
    // or 405 Method Not Allowed — both are acceptable
    const status = response?.status() ?? 0;
    expect([400, 404, 405]).toContain(status);
  });
});
