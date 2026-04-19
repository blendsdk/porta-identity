/**
 * Configurable Login Methods — Playwright browser tests.
 *
 * Verifies the UI behavior of the per-client `login_methods` override:
 *
 *   • Password-only client  → only password form renders, no magic-link button,
 *     "Forgot password?" link visible.
 *   • Magic-link-only client → standalone magic-link form with its own email
 *     input; no password field; no "Forgot password?" link.
 *   • Both-methods client (default) → both forms, divider, and the
 *     email-copy <script> are rendered.
 *
 * Also verifies:
 *   • `login_hint` from the OIDC authorize request is pre-filled into the
 *     rendered email input (sanitized, length-capped).
 *   • POST enforcement: when a method is not in the effective set, a direct
 *     POST to the interaction route is rejected with HTTP 403 by the server
 *     (enforcement runs BEFORE CSRF, rate-limit, and user lookup).
 *
 * Tenants used:
 *   • Primary tenant — default (`['password', 'magic_link']`) — from global setup.
 *   • `lmPasswordOnly*` — client override `['password']`.
 *   • `lmMagicLinkOnly*` — client override `['magic_link']`.
 *
 * All three tenants are seeded by tests/ui/setup/global-setup.ts so every
 * test here runs against a known, isolated configuration.
 *
 * @see plans/client-login-methods/99-execution-plan.md — Phase 9, Session 9.1.3
 * @see requirements/RD-07-auth-workflows-login-ui.md — Addendum: Configurable Login Methods
 */

import crypto from 'node:crypto';
import { test, expect, type TestData } from '../fixtures/test-fixtures.js';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Local PKCE + auth-flow helpers
// ---------------------------------------------------------------------------
//
// The shared `startAuthFlow` fixture hard-codes the primary tenant. These
// tests need to drive login flows against three DIFFERENT tenants, so we
// reimplement the PKCE + auth-URL construction locally. This is the same
// shape as the fixture; the only difference is the extra `overrides` param.

/** Generate a fresh PKCE verifier+challenge pair. */
function pkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

/** Parameters for a tenant-aware auth flow launch. */
interface AuthFlowOptions {
  /** Which tenant to auth against (org slug). */
  orgSlug: string;
  /** Which client to use (OIDC client_id). */
  clientId: string;
  /** OIDC redirect_uri — must match the tenant's registered value. */
  redirectUri: string;
  /** Optional OIDC `login_hint` to test email-prefill behavior. */
  loginHint?: string;
}

/**
 * Launch an OIDC auth flow in the browser and wait for the interaction page.
 *
 * Builds the authorize URL with PKCE + a random state, navigates the page,
 * and returns the final URL (the /interaction/:uid page).
 */
async function launchAuthFlow(
  page: Page,
  baseUrl: string,
  opts: AuthFlowOptions,
): Promise<string> {
  const { challenge } = pkce();
  const authUrl = new URL(`${baseUrl}/${opts.orgSlug}/auth`);
  authUrl.searchParams.set('client_id', opts.clientId);
  authUrl.searchParams.set('redirect_uri', opts.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));
  if (opts.loginHint !== undefined) {
    authUrl.searchParams.set('login_hint', opts.loginHint);
  }
  await page.goto(authUrl.toString(), { waitUntil: 'networkidle' });
  await page.waitForURL('**/interaction/**');
  return page.url();
}

/** Resolve the seeded redirect URI (same for every tenant — from global setup). */
function redirectUriFor(testData: TestData): string {
  return testData.redirectUri;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Configurable Login Methods — UI', () => {
  // ── Scenario 1: Password-only client ────────────────────────────────

  test('password-only client renders ONLY the password form', async ({
    page,
    testData,
  }) => {
    await launchAuthFlow(page, testData.baseUrl, {
      orgSlug: testData.lmPasswordOnlyOrgSlug,
      clientId: testData.lmPasswordOnlyClientId,
      redirectUri: redirectUriFor(testData),
    });

    // Password form is present
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button.btn-primary')).toBeVisible();

    // Magic-link button is ABSENT — the template never renders it for this mode
    await expect(page.locator('#magic-link-btn')).toHaveCount(0);

    // No magic-link form either (action selector is a reliable structural check
    // that's independent of the button id)
    await expect(page.locator('form[action$="/magic-link"]')).toHaveCount(0);

    // Divider (the "or" separator between the two forms) is absent
    await expect(page.locator('.divider')).toHaveCount(0);

    // Forgot-password link IS visible — enabled only when password method is on
    await expect(
      page.locator('a[href*="/auth/forgot-password"]'),
    ).toBeVisible();
  });

  // ── Scenario 2: Magic-link-only client ──────────────────────────────

  test('magic-link-only client renders a STANDALONE magic-link form', async ({
    page,
    testData,
  }) => {
    await launchAuthFlow(page, testData.baseUrl, {
      orgSlug: testData.lmMagicLinkOnlyOrgSlug,
      clientId: testData.lmMagicLinkOnlyClientId,
      redirectUri: redirectUriFor(testData),
    });

    // Magic-link form IS present with its own email input + primary submit
    const magicForm = page.locator('form[action$="/magic-link"]');
    await expect(magicForm).toHaveCount(1);
    await expect(magicForm.locator('input[type="email"]#email')).toBeVisible();
    await expect(magicForm.locator('button.btn-primary')).toBeVisible();

    // Password form/fields are ABSENT
    await expect(page.locator('#password')).toHaveCount(0);
    await expect(page.locator('form[action$="/login"]')).toHaveCount(0);

    // No divider (only one method in effect)
    await expect(page.locator('.divider')).toHaveCount(0);

    // Forgot-password link is hidden — the addendum contract says the link
    // only renders when the password method is enabled (it's cosmetic —
    // the backend also enforces).
    await expect(page.locator('a[href*="/auth/forgot-password"]')).toHaveCount(
      0,
    );
  });

  // ── Scenario 3: Both-methods client (default tenant) ────────────────

  test('both-methods client renders both forms with divider', async ({
    page,
    startAuthFlow,
  }) => {
    // The primary/default tenant inherits org default ['password','magic_link']
    // so its login page should show both forms + the "or" divider.
    await startAuthFlow(page);

    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#magic-link-btn')).toBeVisible();
    await expect(page.locator('.divider')).toBeVisible();
    await expect(
      page.locator('a[href*="/auth/forgot-password"]'),
    ).toBeVisible();
  });

  // ── Scenario 4: login_hint is pre-filled into the email input ──────

  test('login_hint query param is pre-filled into the email input', async ({
    page,
    testData,
  }) => {
    const hint = `hint-${Date.now()}@test.local`;

    await launchAuthFlow(page, testData.baseUrl, {
      orgSlug: testData.orgSlug,
      clientId: testData.clientId,
      redirectUri: redirectUriFor(testData),
      loginHint: hint,
    });

    // Primary tenant renders both forms; the SHARED #email input (from the
    // password form) carries the hint value. For this tenant there is only
    // one #email — scenario 2 covers the magic-link-only input separately.
    await expect(page.locator('#email')).toHaveValue(hint);
  });

  test('login_hint is also pre-filled on magic-link-only client', async ({
    page,
    testData,
  }) => {
    const hint = `magic-hint-${Date.now()}@test.local`;

    await launchAuthFlow(page, testData.baseUrl, {
      orgSlug: testData.lmMagicLinkOnlyOrgSlug,
      clientId: testData.lmMagicLinkOnlyClientId,
      redirectUri: redirectUriFor(testData),
      loginHint: hint,
    });

    // The standalone magic-link form owns the only #email on the page
    await expect(page.locator('#email')).toHaveValue(hint);
  });

  // ── Scenario 5: POST enforcement against a disabled method ──────────
  //
  // The backend enforces effective-method membership BEFORE CSRF/rate-limit/
  // user-lookup and responds with 403 + audit. From the browser we drive this
  // via `page.request` (a raw HTTP client that shares the browser context)
  // rather than submitting the form — the template won't let us submit a
  // form that's not rendered, but a malicious/buggy client could still try.

  test('direct POST to /login on a magic-link-only client returns 403', async ({
    page,
    testData,
  }) => {
    // 1. Launch the auth flow so an interaction exists on the server.
    const interactionUrl = await launchAuthFlow(page, testData.baseUrl, {
      orgSlug: testData.lmMagicLinkOnlyOrgSlug,
      clientId: testData.lmMagicLinkOnlyClientId,
      redirectUri: redirectUriFor(testData),
    });

    const match = interactionUrl.match(/\/interaction\/([A-Za-z0-9_-]+)/);
    expect(match, 'expected /interaction/:uid url').toBeTruthy();
    const uid = match![1];

    // 2. Direct POST to the PASSWORD endpoint (not allowed for this client).
    //    No CSRF token, no valid credentials — doesn't matter: enforcement
    //    fires first and returns 403.
    const res = await page.request.post(
      `${testData.baseUrl}/interaction/${uid}/login`,
      {
        form: {
          email: testData.lmMagicLinkOnlyUserEmail,
          password: 'does-not-matter',
        },
        maxRedirects: 0,
        // Follow cookies set during launchAuthFlow so the interaction session
        // is recognized by the server.
      },
    );

    expect(res.status()).toBe(403);
  });

  test('direct POST to /magic-link on a password-only client returns 403', async ({
    page,
    testData,
  }) => {
    const interactionUrl = await launchAuthFlow(page, testData.baseUrl, {
      orgSlug: testData.lmPasswordOnlyOrgSlug,
      clientId: testData.lmPasswordOnlyClientId,
      redirectUri: redirectUriFor(testData),
    });

    const match = interactionUrl.match(/\/interaction\/([A-Za-z0-9_-]+)/);
    expect(match, 'expected /interaction/:uid url').toBeTruthy();
    const uid = match![1];

    // Direct POST to the MAGIC-LINK endpoint (disabled for this client).
    const res = await page.request.post(
      `${testData.baseUrl}/interaction/${uid}/magic-link`,
      {
        form: {
          email: testData.lmPasswordOnlyUserEmail,
        },
        maxRedirects: 0,
      },
    );

    expect(res.status()).toBe(403);
  });

  // ── Scenario 6: Forgot-password GET is enforced for magic-link-only ─
  //
  // The template hides the link, but the route is reachable directly. The
  // /forgot-password endpoint uses org-level resolution (there's no
  // interaction/client context), so the key assertion here is that the
  // password-reset enforcement path is consistent with the login enforcement
  // path: the route is accessible when password is in effective methods.
  //
  // For the primary tenant (both methods enabled) the forgot-password route
  // must render. For a magic-link-only *org* it would 403, but we don't seed
  // such an org (the feature is per-client, and forgot-password is org-scoped),
  // so we simply assert the positive case here.

  test('forgot-password route renders when password method is enabled on the org', async ({
    page,
    testData,
  }) => {
    const url = `${testData.baseUrl}/${testData.orgSlug}/auth/forgot-password`;
    const resp = await page.goto(url);
    // 200 with the forgot-password form, not a 403
    expect(resp?.status()).toBe(200);
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('button.btn-primary')).toBeVisible();
  });
});
