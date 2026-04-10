/**
 * Confidential Client E2E Test — full OIDC workflow.
 *
 * Exercises the complete OIDC authorization code flow with a confidential
 * client using client_secret_post authentication:
 *
 *   1. Authorization request → login → consent → capture auth code
 *   2. Token exchange (POST /token with client_secret_post + PKCE)
 *   3. ID token validation (decode JWT, verify claims)
 *   4. Token introspection (POST /introspect — active, client_id, sub)
 *   5. UserInfo request (GET /userinfo — sub, email, profile claims)
 *
 * This test validates that:
 *   - The selective body parser fix allows oidc-provider to parse its own
 *     request bodies at the /token endpoint
 *   - The SHA-256 client secret middleware correctly hashes the presented
 *     secret before oidc-provider's compareClientSecret comparison
 *   - The adapter pattern correctly routes Client model lookups to findForOidc()
 *   - The complete end-to-end OIDC flow works for confidential clients
 *
 * Uses a dedicated confidential test tenant seeded in global-setup.ts.
 */

import crypto from 'node:crypto';
import { test, expect } from '../fixtures/test-fixtures.js';

// ---------------------------------------------------------------------------
// PKCE Helpers (duplicated here for clarity — the flow is self-contained)
// ---------------------------------------------------------------------------

/** Generate a PKCE code verifier — 43-char URL-safe random string */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Generate a PKCE S256 code challenge from a verifier */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ---------------------------------------------------------------------------
// JWT Decoder (minimal — no signature verification needed for E2E)
// ---------------------------------------------------------------------------

/**
 * Decode a JWT payload without signature verification.
 * Sufficient for E2E testing where we trust the issuer (our own server).
 *
 * @param jwt - The raw JWT string (header.payload.signature)
 * @returns Decoded payload as a Record
 */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error(`Invalid JWT: expected 3 parts, got ${parts.length}`);
  const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
  return JSON.parse(payload);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Confidential Client OIDC Flow', () => {
  /**
   * Complete OIDC flow: auth → login → consent → token → id_token → introspect → userinfo.
   *
   * This single test exercises the entire confidential client workflow
   * end-to-end, validating each step of the OIDC protocol.
   */
  test('should complete the full authorization code flow with client_secret_post', async ({
    page,
    testData,
  }) => {
    // ── Step 1: Authorization Request ──────────────────────────────────
    // Build the OIDC authorization URL for the confidential client
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = `${testData.baseUrl}/callback`;

    const authUrl = new URL(`${testData.baseUrl}/${testData.confOrgSlug}/auth`);
    authUrl.searchParams.set('client_id', testData.confClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    // Navigate to authorization endpoint — should redirect to login page
    await page.goto(authUrl.toString(), { waitUntil: 'networkidle' });

    // Verify we landed on the interaction/login page
    await page.waitForURL('**/interaction/**');
    const loginPageUrl = page.url();
    expect(loginPageUrl).toContain('/interaction/');

    // ── Step 2: Login ──────────────────────────────────────────────────
    // Fill in the login form with confidential tenant user credentials
    await page.fill('#email', testData.confUserEmail);
    await page.fill('#password', testData.confUserPassword);
    await page.click('button[type="submit"]');

    // Wait for the redirect chain to complete
    await page.waitForLoadState('networkidle');

    // ── Step 3: Consent ────────────────────────────────────────────────
    // Check if consent page is shown (first-time authorization)
    const consentButton = page.locator('button:has-text("Allow access")');
    const hasConsent = await consentButton.count();
    if (hasConsent > 0) {
      await consentButton.click();
      await page.waitForLoadState('networkidle');
    }

    // ── Step 4: Capture Authorization Code ─────────────────────────────
    // After consent, the provider redirects to redirect_uri with ?code=...&state=...
    // Since there's no real callback handler, the page will show an error page
    // or a connection refused — but the URL contains the auth code.
    const finalUrl = page.url();
    const finalUrlParsed = new URL(finalUrl);
    const authCode = finalUrlParsed.searchParams.get('code');
    const returnedState = finalUrlParsed.searchParams.get('state');

    // Verify the auth code was returned with correct state
    expect(authCode).toBeTruthy();
    expect(returnedState).toBe(state);

    // ── Step 5: Token Exchange (client_secret_post + PKCE) ─────────────
    // POST to the token endpoint with client_id, client_secret in body
    const tokenUrl = `${testData.baseUrl}/${testData.confOrgSlug}/token`;
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode!,
        redirect_uri: redirectUri,
        client_id: testData.confClientId,
        client_secret: testData.confClientSecret,
        code_verifier: codeVerifier,
      }).toString(),
    });

    // Token endpoint should return 200 with access_token, id_token, etc.
    expect(tokenResponse.status).toBe(200);
    const tokenData = (await tokenResponse.json()) as Record<string, unknown>;

    // Validate token response structure
    expect(tokenData.access_token).toBeTruthy();
    expect(tokenData.id_token).toBeTruthy();
    expect(tokenData.token_type).toBe('Bearer');
    expect(tokenData.expires_in).toBeGreaterThan(0);

    const accessToken = tokenData.access_token as string;
    const idToken = tokenData.id_token as string;

    // ── Step 6: ID Token Validation ────────────────────────────────────
    // Decode the JWT ID token and verify claims
    const idClaims = decodeJwtPayload(idToken);

    // Standard OIDC claims must be present
    expect(idClaims.sub).toBeTruthy();
    expect(idClaims.iss).toBeTruthy();
    expect(idClaims.aud).toBe(testData.confClientId);
    expect(idClaims.exp).toBeTruthy();
    expect(idClaims.iat).toBeTruthy();

    // The issuer should be the base URL (oidc-provider uses the configured issuer)
    expect(idClaims.iss).toContain(testData.baseUrl);

    // Store the subject for later verification
    const subject = idClaims.sub as string;

    // ── Step 7: Token Introspection ────────────────────────────────────
    // POST to the introspection endpoint to check if the token is active
    const introspectUrl = `${testData.baseUrl}/${testData.confOrgSlug}/token/introspection`;
    const introspectResponse = await fetch(introspectUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: accessToken,
        client_id: testData.confClientId,
        client_secret: testData.confClientSecret,
      }).toString(),
    });

    expect(introspectResponse.status).toBe(200);
    const introspectData = (await introspectResponse.json()) as Record<string, unknown>;

    // Introspection response must indicate active token
    expect(introspectData.active).toBe(true);
    expect(introspectData.client_id).toBe(testData.confClientId);
    expect(introspectData.sub).toBe(subject);
    expect(introspectData.token_type).toBe('Bearer');

    // ── Step 8: UserInfo Request ───────────────────────────────────────
    // GET the userinfo endpoint with the access token.
    // With the resourceIndicators fix (defaultResource returns undefined when
    // no resource is requested), tokens are no longer unconditionally audience-
    // restricted. The /me endpoint should now return 200 with user claims.
    const userinfoUrl = `${testData.baseUrl}/${testData.confOrgSlug}/me`;
    const userinfoResponse = await fetch(userinfoUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Strict assertion — /me must return 200 with correct user claims
    expect(userinfoResponse.status).toBe(200);
    const userinfoData = (await userinfoResponse.json()) as Record<string, unknown>;
    expect(userinfoData.sub).toBe(subject);
    expect(userinfoData.email).toBe(testData.confUserEmail);
  });
});
