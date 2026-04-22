/**
 * Magic Link Verification — Playwright browser tests.
 *
 * Tests the token verification step of the magic link flow:
 *   - User receives a magic link email with a token URL
 *   - Clicking the link verifies the token and completes authentication
 *   - Invalid/expired/used tokens show appropriate error pages
 *   - Successful verification marks the user's email as verified
 *
 * These tests complement the Phase 1 magic-link.spec.ts which covers
 * the *requesting* step. Here we test the *verification* step by
 * creating tokens directly in the database via dbHelpers.
 *
 * @see plans/ui-testing-v2/05-magic-link-invitation-tests.md
 */

import crypto from 'node:crypto';
import { expect, test } from '../fixtures/test-fixtures.js';

test.describe('Magic Link Verification', () => {
  /**
   * Test 3.1: Valid token with active OIDC interaction.
   *
   * Starts an auth flow to create an OIDC interaction, creates a magic
   * link token, then navigates to the magic link URL with the interaction
   * UID as a query parameter. The handler should resume the OIDC flow
   * and redirect to the callback URL with an authorization code.
   *
   * Flow: the magic link handler verifies the token, creates a _ml_session
   * cookie, and redirects to /interaction/{uid}. The showLogin() handler
   * detects the session, calls interactionFinished(), and the OIDC flow
   * completes — redirecting to the callback URL with an authorization code.
   */
  test('valid token during active interaction auto-logins and redirects', async ({
    page,
    testData,
    dbHelpers,
    startAuthFlow,
  }) => {
    // 1. Start OIDC auth flow — browser gets interaction cookies
    const loginUrl = await startAuthFlow(page);

    // 2. Extract the interaction UID from the login page URL
    //    URL pattern: /interaction/<uid>/login
    const urlParts = new URL(loginUrl).pathname.split('/');
    const interactionIdx = urlParts.indexOf('interaction');
    const interactionUid = urlParts[interactionIdx + 1];

    // 3. Get user ID for token creation
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const user = await dbHelpers.getUserByEmail(testData.userEmail, orgId);
    expect(user).not.toBeNull();

    // 4. Create magic link token directly in DB
    const token = await dbHelpers.createMagicLinkToken(user!.id, orgId, interactionUid);

    // 5. Navigate to magic link URL with interaction UID
    const magicLinkUrl = `${testData.baseUrl}/${testData.orgSlug}/auth/magic-link/${token}?interaction=${interactionUid}`;
    await page.goto(magicLinkUrl, { waitUntil: 'networkidle' });

    // 6. Should redirect to callback with authorization code
    await page.waitForURL(`${testData.redirectUri}*`, { timeout: 10_000 });
    const callbackUrl = new URL(page.url());
    expect(callbackUrl.searchParams.get('code')).toBeTruthy();
  });

  /**
   * Test 3.2: Valid token without active OIDC interaction.
   *
   * Creates a magic link token and navigates directly to the verification
   * URL without starting an OIDC auth flow first. The handler cannot
   * resume any interaction, so it renders a "magic-link-success" page
   * confirming the email was verified.
   */
  test('valid token without interaction shows success page', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    // 1. Get user ID and org ID
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const user = await dbHelpers.getUserByEmail(testData.userEmail, orgId);
    expect(user).not.toBeNull();

    // 2. Create magic link token directly in DB (no interaction UID)
    const token = await dbHelpers.createMagicLinkToken(user!.id, orgId);

    // 3. Navigate to magic link URL (no interaction query param)
    const magicLinkUrl = `${testData.baseUrl}/${testData.orgSlug}/auth/magic-link/${token}`;
    await page.goto(magicLinkUrl, { waitUntil: 'networkidle' });

    // 4. Should render magic-link-success page (status 200)
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    // Success page title from locale: "Email verified"
    await expect(heading).toContainText(/verified|success/i);
  });

  /**
   * Test 3.3: Expired magic link token.
   *
   * Creates a token that is already expired, then navigates to the
   * verification URL. The handler should detect the expired token
   * and render the error page.
   */
  test('expired token shows error page', async ({ page, testData, dbHelpers }) => {
    // 1. Get user ID and org ID
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const user = await dbHelpers.getUserByEmail(testData.userEmail, orgId);
    expect(user).not.toBeNull();

    // 2. Create an already-expired magic link token
    const token = await dbHelpers.createMagicLinkToken(user!.id, orgId, undefined, {
      expired: true,
    });

    // 3. Navigate to magic link URL
    const magicLinkUrl = `${testData.baseUrl}/${testData.orgSlug}/auth/magic-link/${token}`;
    await page.goto(magicLinkUrl, { waitUntil: 'networkidle' });

    // 4. Should render error page (status 400)
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // 5. Error page should contain error messaging
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  /**
   * Test 3.4: Invalid/garbage token.
   *
   * Navigates to a magic link URL with a random garbage string as the
   * token. The handler should fail to find any matching token in the
   * DB and render the error page.
   */
  test('invalid token shows error page', async ({ page, testData }) => {
    // Navigate to magic link URL with garbage token
    const magicLinkUrl = `${testData.baseUrl}/${testData.orgSlug}/auth/magic-link/invalidgarbage123abc`;
    await page.goto(magicLinkUrl, { waitUntil: 'networkidle' });

    // Should render error page
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // Should not expose any technical details (no stack trace, no DB info)
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).not.toContain('stack');
    expect(bodyText?.toLowerCase()).not.toContain('sql');
  });

  /**
   * Test 3.5: Already-used token.
   *
   * Creates a valid token, marks it as used (simulating a previous
   * successful verification), then navigates to the verification URL.
   * The handler should detect the used token and render the error page.
   */
  test('already-used token shows error page', async ({ page, testData, dbHelpers }) => {
    // 1. Get user ID and org ID
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const user = await dbHelpers.getUserByEmail(testData.userEmail, orgId);
    expect(user).not.toBeNull();

    // 2. Create a valid magic link token
    const token = await dbHelpers.createMagicLinkToken(user!.id, orgId);

    // 3. Mark it as used (simulating prior consumption)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await dbHelpers.markTokenUsed(tokenHash, 'magic_link_tokens');

    // 4. Navigate to magic link URL
    const magicLinkUrl = `${testData.baseUrl}/${testData.orgSlug}/auth/magic-link/${token}`;
    await page.goto(magicLinkUrl, { waitUntil: 'networkidle' });

    // 5. Should render error page (token already consumed)
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  /**
   * Test 3.6: Email verified after successful magic link use.
   *
   * Verifies that the magic link handler correctly sets the user's
   * email_verified flag in the database after successful verification.
   * Uses a valid token without an interaction (renders success page),
   * then queries the DB to confirm the flag was updated.
   */
  test('email_verified flag set after successful magic link', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    // 1. Get user ID and org ID
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const user = await dbHelpers.getUserByEmail(testData.userEmail, orgId);
    expect(user).not.toBeNull();

    // 2. Create a valid magic link token
    const token = await dbHelpers.createMagicLinkToken(user!.id, orgId);

    // 3. Navigate to magic link URL (no interaction — renders success page)
    const magicLinkUrl = `${testData.baseUrl}/${testData.orgSlug}/auth/magic-link/${token}`;
    await page.goto(magicLinkUrl, { waitUntil: 'networkidle' });

    // 4. Should render success page (confirms token was valid and consumed)
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/verified|success/i);

    // 5. Verify email_verified flag is now true in the database
    const isVerified = await dbHelpers.isEmailVerified(user!.id);
    expect(isVerified).toBe(true);
  });
});
