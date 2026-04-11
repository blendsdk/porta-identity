/**
 * Cross-Browser Magic Link with Confidential Client — Playwright E2E test.
 *
 * Validates the complete cross-browser magic link pre-auth flow using a
 * confidential client with client_secret_post authentication:
 *
 *   1. Browser A: starts OIDC auth flow → login page → requests magic link
 *   2. MailHog: captures the magic link email → extract URL
 *   3. Browser B: (clean, no cookies) opens the magic link URL
 *      → pre-auth flow activates → auto-login → consent → authorization code
 *   4. Server-side: token exchange with client_secret_post + PKCE code_verifier
 *   5. Validation: ID token claims, token introspection, UserInfo
 *
 * This test proves that:
 *   - The pre-auth flow correctly stores OIDC auth context in Redis
 *   - A completely different browser (no cookies/state from Browser A) can
 *     complete the flow via the pre-auth cookie mechanism
 *   - The PKCE code_challenge is preserved across browsers (stored in Redis,
 *     replayed in the reconstructed authorization URL)
 *   - Confidential client token exchange works with the cross-browser flow
 *   - The entire OIDC chain (auth code → tokens → introspect → userinfo) is valid
 *
 * Uses two separate Playwright browser contexts to simulate two different
 * browsers with completely isolated cookie jars and storage.
 *
 * @see src/auth/magic-link-session.ts — Pre-auth flow implementation
 * @see plans/playground/99-execution-plan.md — Cross-browser magic link plan
 */

import crypto from 'node:crypto';
import { test, expect } from '../fixtures/test-fixtures.js';
import { MailHogClient } from '../../e2e/helpers/mailhog.js';
import { TEST_MAILHOG_URL } from '../../helpers/constants.js';

// ---------------------------------------------------------------------------
// MailHog client for intercepting emails sent during tests
// ---------------------------------------------------------------------------

const mailhog = new MailHogClient(TEST_MAILHOG_URL);

// ---------------------------------------------------------------------------
// Quoted-Printable decoding helper
// ---------------------------------------------------------------------------

/**
 * Decode quoted-printable soft line breaks from email body text.
 *
 * MailHog returns raw MIME bodies without decoding QP encoding. Long URLs
 * get broken by `=\r\n` or `=\n` soft line breaks, which prevents regex
 * matching across the break. This function removes those breaks to
 * reconstruct the original content.
 *
 * Also decodes `=XX` hex sequences (e.g., `=3D` → `=`).
 */
function decodeQuotedPrintable(text: string): string {
  // 1. Remove QP soft line breaks (=\r\n or =\n)
  let decoded = text.replace(/=\r?\n/g, '');
  // 2. Decode =XX hex-encoded characters
  decoded = decoded.replace(/=([0-9A-Fa-f]{2})/g, (_match, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return decoded;
}

/**
 * Extract a magic link URL from an email, handling QP encoding.
 *
 * Decodes quoted-printable from both plaintext and HTML bodies
 * before searching for the URL pattern.
 */
function extractMagicLinkFromEmail(
  message: { body: string; html: string },
  pattern: RegExp,
): string | null {
  // Try plaintext body first (with QP decoding)
  const textMatch = decodeQuotedPrintable(message.body).match(pattern);
  if (textMatch) return textMatch[0];

  // Fall back to HTML body (with QP decoding)
  const htmlMatch = decodeQuotedPrintable(message.html).match(pattern);
  if (htmlMatch) return htmlMatch[0];

  return null;
}

// ---------------------------------------------------------------------------
// PKCE Helpers (self-contained — no external dependency needed)
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

test.describe('Cross-Browser Magic Link with Confidential Client', () => {
  // Run tests sequentially — they share the MailHog inbox
  test.describe.configure({ mode: 'serial' });

  // Clear MailHog inbox before each test to avoid stale emails
  test.beforeEach(async () => {
    await mailhog.clearAll();
  });

  /**
   * Full cross-browser magic link flow:
   *   Browser A → request magic link
   *   MailHog → capture email
   *   Browser B → click link → pre-auth → consent → auth code
   *   Server-side → token exchange → introspect → userinfo
   */
  test('should complete cross-browser magic link flow with confidential client', async ({
    browser,
    testData,
  }) => {
    // ── PKCE + State (generated once, used across both browsers) ─────
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    const redirectUri = `${testData.baseUrl}/callback`;

    // ══════════════════════════════════════════════════════════════════
    // STEP 1: Browser A — Start auth flow and request magic link
    // ══════════════════════════════════════════════════════════════════

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    // Build OIDC authorization URL for the confidential client
    const authUrl = new URL(`${testData.baseUrl}/${testData.confOrgSlug}/auth`);
    authUrl.searchParams.set('client_id', testData.confClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);

    // Navigate to authorization endpoint → login page
    await pageA.goto(authUrl.toString(), { waitUntil: 'networkidle' });
    await pageA.waitForURL('**/interaction/**');

    // Fill in the email address (the magic link form copies it via JS)
    await pageA.fill('#email', testData.confUserEmail);

    // Click the magic link button
    await pageA.click('#magic-link-btn');

    // Wait for the "check your email" confirmation page
    await expect(pageA.locator('h1')).toBeVisible();
    const pageText = await pageA.textContent('body');
    expect(pageText?.toLowerCase()).toContain('email');

    // Done with Browser A — close it
    await contextA.close();

    // ══════════════════════════════════════════════════════════════════
    // STEP 2: Capture magic link from MailHog
    // ══════════════════════════════════════════════════════════════════

    const message = await mailhog.waitForMessage(testData.confUserEmail, 15_000);
    expect(message).toBeDefined();

    // Extract the magic link URL from the email body (with QP decoding)
    const magicLinkUrl = extractMagicLinkFromEmail(
      message!,
      /https?:\/\/[^\s"<]+magic-link[^\s"<]*/,
    );
    expect(magicLinkUrl).toBeTruthy();

    // Verify the link points to our test server and contains the org slug
    expect(magicLinkUrl).toContain('localhost');
    expect(magicLinkUrl).toContain(testData.confOrgSlug);

    // ══════════════════════════════════════════════════════════════════
    // STEP 3: Browser B — Open magic link in a clean browser
    // ══════════════════════════════════════════════════════════════════

    // New context = completely isolated cookie jar (simulates different browser)
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    // Navigate to the magic link URL — DON'T use networkidle because the
    // pre-auth flow returns a 200 HTML page with JS redirect. Playwright's
    // goto might resolve on the HTML page before the JS redirect fires.
    // Instead, use 'commit' to proceed as soon as the response arrives,
    // then wait explicitly for the redirect chain to complete.
    // Log every navigation step for debugging
    const urlLog: string[] = [];
    pageB.on('framenavigated', (frame) => {
      if (frame === pageB.mainFrame()) {
        urlLog.push(frame.url());
      }
    });

    await pageB.goto(magicLinkUrl!, { waitUntil: 'commit' });

    // Wait for the redirect chain to settle — the pre-auth flow involves
    // multiple redirects: magic-link → HTML redirect → auth endpoint →
    // interaction login (auto-complete) → consent/callback
    // Give it plenty of time and wait for networkidle on the final page
    await pageB.waitForLoadState('networkidle');

    // Handle the various possible end states
    const currentUrl = pageB.url();

    if (currentUrl.includes('/callback')) {
      // Best case: auto-approved consent, already at callback
    } else if (currentUrl.includes('/interaction/')) {
      // Check if this is a consent page or an error
      const consentButton = pageB.locator('button:has-text("Allow access")');
      if (await consentButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await consentButton.click();
        await pageB.waitForLoadState('networkidle');
      } else {
        // Error page or unexpected state
        const h1 = await pageB.locator('h1').textContent().catch(() => 'no h1');
        const bodyText = await pageB.textContent('body');
        throw new Error(
          `Pre-auth flow ended on unexpected page.\n` +
          `URL: ${currentUrl}\n` +
          `H1: ${h1}\n` +
          `Body: ${bodyText?.substring(0, 500)}\n` +
          `Navigation chain: ${urlLog.join(' → ')}`
        );
      }
    }

    // Wait for callback URL (may already be there)
    if (!pageB.url().includes('/callback')) {
      await pageB.waitForURL('**/callback**', { timeout: 15_000 });
    }

    const finalUrl = new URL(pageB.url());
    const authCode = finalUrl.searchParams.get('code');
    const returnedState = finalUrl.searchParams.get('state');

    // Verify the auth code was returned with the correct state
    expect(authCode).toBeTruthy();
    expect(returnedState).toBe(state);

    // Done with Browser B
    await contextB.close();

    // ══════════════════════════════════════════════════════════════════
    // STEP 5: Server-side token exchange (confidential client)
    // ══════════════════════════════════════════════════════════════════

    // POST to the token endpoint with client_secret_post + PKCE
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

    // Token endpoint should return 200 with tokens
    expect(tokenResponse.status).toBe(200);
    const tokenData = (await tokenResponse.json()) as Record<string, unknown>;

    // Validate token response structure
    expect(tokenData.access_token).toBeTruthy();
    expect(tokenData.id_token).toBeTruthy();
    expect(tokenData.token_type).toBe('Bearer');
    expect(tokenData.expires_in).toBeGreaterThan(0);

    const accessToken = tokenData.access_token as string;
    const idToken = tokenData.id_token as string;

    // ══════════════════════════════════════════════════════════════════
    // STEP 6: ID Token Validation
    // ══════════════════════════════════════════════════════════════════

    const idClaims = decodeJwtPayload(idToken);

    // Standard OIDC claims must be present
    expect(idClaims.sub).toBeTruthy();
    expect(idClaims.iss).toBeTruthy();
    expect(idClaims.aud).toBe(testData.confClientId);
    expect(idClaims.exp).toBeTruthy();
    expect(idClaims.iat).toBeTruthy();

    // Nonce must match what we sent in the original auth request
    // (preserved through the pre-auth flow via Redis context storage)
    expect(idClaims.nonce).toBe(nonce);

    // Issuer should contain the base URL
    expect(idClaims.iss).toContain(testData.baseUrl);

    // Store subject for later verification
    const subject = idClaims.sub as string;

    // ══════════════════════════════════════════════════════════════════
    // STEP 7: Token Introspection
    // ══════════════════════════════════════════════════════════════════

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

    // ══════════════════════════════════════════════════════════════════
    // STEP 8: UserInfo Request
    // ══════════════════════════════════════════════════════════════════

    const userinfoUrl = `${testData.baseUrl}/${testData.confOrgSlug}/me`;
    const userinfoResponse = await fetch(userinfoUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(userinfoResponse.status).toBe(200);
    const userinfoData = (await userinfoResponse.json()) as Record<string, unknown>;
    expect(userinfoData.sub).toBe(subject);
    expect(userinfoData.email).toBe(testData.confUserEmail);
  });

  /**
   * Verify that MailHog receives the magic link email with correct content
   * when using the confidential client tenant.
   */
  test('should receive magic link email for confidential client tenant', async ({
    browser,
    testData,
  }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    // Build auth URL for confidential client
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const authUrl = new URL(`${testData.baseUrl}/${testData.confOrgSlug}/auth`);
    authUrl.searchParams.set('client_id', testData.confClientId);
    authUrl.searchParams.set('redirect_uri', `${testData.baseUrl}/callback`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));

    await pageA.goto(authUrl.toString(), { waitUntil: 'networkidle' });
    await pageA.waitForURL('**/interaction/**');

    // Request magic link
    await pageA.fill('#email', testData.confUserEmail);
    await pageA.click('#magic-link-btn');

    // Wait for confirmation page
    await expect(pageA.locator('h1')).toBeVisible();

    // Capture email from MailHog
    const message = await mailhog.waitForMessage(testData.confUserEmail, 15_000);
    expect(message).toBeDefined();

    // Extract and validate the magic link URL (with QP decoding)
    const link = extractMagicLinkFromEmail(message!, /https?:\/\/[^\s"<]+magic-link[^\s"<]*/);
    expect(link).toBeTruthy();
    expect(link).toContain(testData.confOrgSlug);
    expect(link).toContain('interaction=');

    await contextA.close();
  });
});
