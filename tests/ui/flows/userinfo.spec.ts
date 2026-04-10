/**
 * UserInfo (/me) Endpoint E2E Tests.
 *
 * Validates the OIDC userinfo endpoint after obtaining tokens through
 * the full authorization code flow with a confidential client:
 *
 *   1. Happy path — GET /me returns user profile and email claims
 *   2. Invalid token — GET /me rejects invalid bearer token (401)
 *   3. Missing auth — GET /me rejects missing Authorization header (400/401)
 *   4. Scope filtering — GET /me with openid-only scope returns sub only
 *
 * Uses the confidential client infrastructure seeded in global-setup.ts.
 * Each test that needs a valid token acquires one through the full OIDC
 * authorization code flow (login → consent → token exchange).
 */

import crypto from 'node:crypto';
import { test, expect } from '../fixtures/test-fixtures.js';
import type { TestData } from '../fixtures/test-fixtures.js';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// PKCE Helpers
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
// Token Acquisition Helper
// ---------------------------------------------------------------------------

/**
 * Acquire access and ID tokens through the full OIDC authorization code flow.
 *
 * Performs the complete flow: auth request → login → consent → code capture →
 * token exchange with client_secret_post. Returns the resulting tokens.
 *
 * @param page - Playwright page instance (needed for browser-based login)
 * @param testData - Seeded test entity data (client credentials, user creds, etc.)
 * @param scopes - Space-separated OIDC scope string (e.g., 'openid profile email')
 * @returns Object containing accessToken and idToken strings
 */
async function acquireTokens(
  page: Page,
  testData: TestData,
  scopes: string,
): Promise<{ accessToken: string; idToken: string }> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `${testData.baseUrl}/callback`;

  // Step 1: Build and navigate to authorization URL
  const authUrl = new URL(`${testData.baseUrl}/${testData.confOrgSlug}/auth`);
  authUrl.searchParams.set('client_id', testData.confClientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  await page.goto(authUrl.toString(), { waitUntil: 'networkidle' });

  // Step 2: Login — fill in credentials and submit
  await page.fill('#email', testData.confUserEmail);
  await page.fill('#password', testData.confUserPassword);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');

  // Step 3: Consent — grant access if consent page is shown
  const consentButton = page.locator('button:has-text("Allow access")');
  const hasConsent = await consentButton.count();
  if (hasConsent > 0) {
    await consentButton.click();
    await page.waitForLoadState('networkidle');
  }

  // Step 4: Capture authorization code from redirect URL
  const finalUrl = new URL(page.url());
  const authCode = finalUrl.searchParams.get('code');
  const returnedState = finalUrl.searchParams.get('state');

  // Verify the auth code and state were returned correctly
  expect(authCode).toBeTruthy();
  expect(returnedState).toBe(state);

  // Step 5: Exchange code for tokens (POST /token with client_secret_post)
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

  expect(tokenResponse.status).toBe(200);
  const tokenData = (await tokenResponse.json()) as Record<string, unknown>;
  expect(tokenData.access_token).toBeTruthy();
  expect(tokenData.id_token).toBeTruthy();

  return {
    accessToken: tokenData.access_token as string,
    idToken: tokenData.id_token as string,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('UserInfo (/me) endpoint', () => {
  /**
   * Test 1: Happy path — full scopes return user profile and email claims.
   *
   * After obtaining tokens with 'openid profile email' scopes, the /me
   * endpoint should return the user's subject, email, and profile claims.
   */
  test('GET /me returns user profile and email claims', async ({ page, testData }) => {
    const { accessToken } = await acquireTokens(page, testData, 'openid profile email');

    // Call the userinfo endpoint with the valid access token
    const userinfoUrl = `${testData.baseUrl}/${testData.confOrgSlug}/me`;
    const response = await fetch(userinfoUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Userinfo should return 200 with user claims
    expect(response.status).toBe(200);
    const claims = (await response.json()) as Record<string, unknown>;

    // Standard OIDC claims must be present
    expect(claims.sub).toBeDefined();
    expect(claims.email).toBe(testData.confUserEmail);
  });

  /**
   * Test 2: Invalid bearer token should be rejected.
   *
   * The /me endpoint must return 401 when presented with a token
   * that doesn't correspond to any valid access token.
   */
  test('GET /me rejects invalid bearer token', async ({ testData }) => {
    const userinfoUrl = `${testData.baseUrl}/${testData.confOrgSlug}/me`;
    const response = await fetch(userinfoUrl, {
      method: 'GET',
      headers: { Authorization: 'Bearer invalid-token-that-does-not-exist-12345' },
    });

    // oidc-provider should reject the invalid token with 401
    expect(response.status).toBe(401);
  });

  /**
   * Test 3: Missing Authorization header should be rejected.
   *
   * The /me endpoint requires a bearer token. Without an Authorization
   * header, it should return 400 or 401.
   */
  test('GET /me rejects missing Authorization header', async ({ testData }) => {
    const userinfoUrl = `${testData.baseUrl}/${testData.confOrgSlug}/me`;
    const response = await fetch(userinfoUrl, {
      method: 'GET',
      // No Authorization header
    });

    // oidc-provider returns 400 or 401 for missing auth
    expect([400, 401]).toContain(response.status);
  });

  /**
   * Test 4: Minimal scope — openid only returns sub claim.
   *
   * With only the 'openid' scope, the /me endpoint should return
   * only the 'sub' claim, without email or profile claims.
   */
  test('GET /me with openid-only scope returns sub only', async ({ page, testData }) => {
    const { accessToken } = await acquireTokens(page, testData, 'openid');

    // Call the userinfo endpoint with the minimal-scope token
    const userinfoUrl = `${testData.baseUrl}/${testData.confOrgSlug}/me`;
    const response = await fetch(userinfoUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Userinfo should return 200 with minimal claims
    expect(response.status).toBe(200);
    const claims = (await response.json()) as Record<string, unknown>;

    // Only sub should be present — no email or profile claims
    expect(claims.sub).toBeDefined();
    expect(claims.email).toBeUndefined();
    expect(claims.name).toBeUndefined();
  });
});
