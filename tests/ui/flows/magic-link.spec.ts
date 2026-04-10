/**
 * Magic Link Flow — Playwright browser tests.
 *
 * Tests the passwordless magic link authentication flow in a real browser:
 *   1. User enters email and clicks "magic link" button
 *   2. Server sends a magic link email (captured by MailHog)
 *   3. User clicks the link → completes authentication → callback with code
 *
 * Uses MailHog (SMTP test server) to intercept emails and extract the
 * magic link URL. The MailHogClient from E2E helpers handles API calls.
 *
 * Anti-enumeration: submitting a non-existent email shows the same
 * "check your email" confirmation — no indication of whether the user exists.
 *
 * @see plans/ui-testing/05-playwright-tests.md — Magic Link spec
 */

import { test, expect } from '../fixtures/test-fixtures.js';
import { MailHogClient } from '../../e2e/helpers/mailhog.js';
import { TEST_MAILHOG_URL } from '../../helpers/constants.js';

/** MailHog client for intercepting emails sent during tests */
const mailhog = new MailHogClient(TEST_MAILHOG_URL);

test.describe('Magic Link Flow', () => {
  // Clear MailHog inbox before each test to avoid stale emails
  test.beforeEach(async () => {
    await mailhog.clearAll();
  });

  test('should show check-your-email page after requesting magic link', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // 1. Navigate to login page via OIDC auth flow
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // 2. Fill in the email field (magic link form copies it via JS)
    await page.fill('#email', testData.userEmail);

    // 3. Click the magic link button — submits the magic link form
    await page.click('#magic-link-btn');

    // 4. Should navigate to "check your email" confirmation page
    //    The page shows a success message without revealing user existence
    await expect(page.locator('h1')).toBeVisible();
    const pageText = await page.textContent('body');
    expect(pageText?.toLowerCase()).toContain('email');
  });

  test('should receive magic link email in MailHog', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // 1. Request a magic link
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');
    await page.fill('#email', testData.userEmail);
    await page.click('#magic-link-btn');

    // 2. Wait for the email to arrive in MailHog (polls with timeout)
    const message = await mailhog.waitForMessage(testData.userEmail, 10_000);
    expect(message).toBeDefined();

    // 3. Extract the magic link URL from the email body
    //    Pattern matches URLs containing "magic-link" path segment
    const link = mailhog.extractLink(message!, /https?:\/\/[^\s"<]+magic-link[^\s"<]*/);
    expect(link).toBeTruthy();

    // 4. Verify the link points to our test server
    expect(link).toContain(`localhost`);
  });

  // FIXME: The OIDC authorization request expires during the async magic link
  // flow (email polling via MailHog, link extraction, navigation). The provider
  // returns "authorization request has expired" when the magic link handler tries
  // to resume the interaction. Needs a longer interaction TTL for UI tests or
  // a synchronous token injection approach.
  test.fixme('should complete authentication via magic link', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // 1. Start auth flow and request a magic link
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Capture the interaction UID for the magic link URL query param
    const _interactionUrl = page.url();

    await page.fill('#email', testData.userEmail);
    await page.click('#magic-link-btn');

    // 2. Retrieve the magic link from MailHog
    const message = await mailhog.waitForMessage(testData.userEmail, 10_000);
    expect(message).toBeDefined();

    const link = mailhog.extractLink(message!, /https?:\/\/[^\s"<]+magic-link[^\s"<]*/);
    expect(link).toBeTruthy();

    // 3. Navigate to the magic link URL in the browser
    //    This verifies the token, logs in the user, and redirects through
    //    the OIDC flow (consent → callback with authorization code)
    await page.goto(link!, { waitUntil: 'networkidle' });

    // 4. Handle consent page if displayed
    const allowBtn = page.locator('button:has-text("Allow access")');
    if ((await allowBtn.count()) > 0) {
      await allowBtn.click();
    }

    // 5. Should end up at the callback URI with an authorization code
    await page.waitForURL(`${testData.redirectUri}*`, { timeout: 15_000 });

    const url = new URL(page.url());
    expect(url.searchParams.get('code')).toBeTruthy();
  });

  test('should show same page for non-existent email (anti-enumeration)', async ({
    page,
    startAuthFlow,
  }) => {
    // 1. Navigate to login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // 2. Submit magic link request with an email that doesn't exist
    await page.fill('#email', 'nonexistent-user@example.com');
    await page.click('#magic-link-btn');

    // 3. Should show the SAME "check your email" page — no error about
    //    the user not existing (prevents email enumeration attacks)
    await expect(page.locator('h1')).toBeVisible();
    const pageText = await page.textContent('body');
    expect(pageText?.toLowerCase()).toContain('email');

    // 4. No email should actually be sent for non-existent users
    //    (but the UI doesn't reveal this — both paths look identical)
  });
});
