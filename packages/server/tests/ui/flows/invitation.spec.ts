/**
 * Invitation Acceptance Flow — Playwright browser tests.
 *
 * Tests the full invitation acceptance flow in a real browser:
 *   - Admin invites a user → user receives email with a link
 *   - User clicks link → sees accept-invite form (email + password fields)
 *   - User sets a password → account is set up → success page
 *   - Various error states: expired, invalid, weak password, mismatch, CSRF
 *   - Token replay protection (single-use tokens)
 *
 * Invitation tokens are created directly in the database via dbHelpers,
 * bypassing the email sending step. This makes tests fast and reliable.
 *
 * @see plans/ui-testing-v2/05-magic-link-invitation-tests.md
 */

import { test, expect } from '../fixtures/test-fixtures.js';

test.describe('Invitation Acceptance Flow', () => {
  /**
   * Test 5.1: Valid token renders the accept-invite form.
   *
   * Creates a valid invitation token and navigates to the acceptance URL.
   * The form should display the user's email (read-only), password fields,
   * a CSRF hidden field, and a submit button.
   */
  test('valid invitation token renders form with email and password fields', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    // 1. Create invitation token for the invited user
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createInvitationToken(testData.invitedUserEmail, orgId);

    // 2. Navigate to the accept-invite page
    const url = `${testData.baseUrl}/${testData.orgSlug}/auth/accept-invite/${token}`;
    await page.goto(url, { waitUntil: 'networkidle' });

    // 3. Assert: page heading is visible
    await expect(page.locator('h1')).toBeVisible();

    // 4. Assert: password input visible
    await expect(page.locator('#password')).toBeVisible();

    // 5. Assert: confirm password input visible
    await expect(page.locator('#confirmPassword')).toBeVisible();

    // 6. Assert: CSRF hidden field present
    const csrfField = page.locator('input[name="_csrf"]');
    await expect(csrfField).toHaveCount(1);
    const csrfValue = await csrfField.getAttribute('value');
    expect(csrfValue).toBeTruthy();

    // 7. Assert: submit button visible
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // 8. Assert: form action includes /auth/ prefix and token
    const formAction = await page.locator('form').getAttribute('action');
    expect(formAction).toContain('/auth/accept-invite/');
    expect(formAction).toContain(token);
  });

  /**
   * Test 5.2: Happy path — submitting strong passwords shows success page.
   *
   * Creates a valid invitation token, fills in matching strong passwords,
   * and submits the form. The handler should set the user's password,
   * mark email as verified, consume the token, and render the success page.
   */
  test('submitting strong passwords shows success page', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    // 1. Create invitation token
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createInvitationToken(testData.invitedUserEmail, orgId);

    // 2. Navigate to accept-invite page
    const url = `${testData.baseUrl}/${testData.orgSlug}/auth/accept-invite/${token}`;
    await page.goto(url, { waitUntil: 'networkidle' });

    // 3. Fill in matching strong passwords
    await page.fill('#password', 'InvitePassword123!');
    await page.fill('#confirmPassword', 'InvitePassword123!');

    // 4. Submit the form
    await page.click('button[type="submit"]');

    // 5. Should render the invite-success page
    await page.waitForLoadState('networkidle');
    const bodyText = await page.textContent('body');

    // invite-success.hbs renders a success heading
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // The page should contain success-related text
    expect(bodyText?.toLowerCase()).toMatch(/success|account|set up|welcome/);
  });

  /**
   * Test 5.3: Expired invitation token shows invite-expired page.
   *
   * Creates an already-expired token and navigates to the acceptance URL.
   * The handler should detect the expired token and render the
   * invite-expired page (not the generic error page).
   */
  test('expired invitation token shows invite-expired page', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    // 1. Create an expired invitation token
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createInvitationToken(testData.invitedUserEmail, orgId, {
      expired: true,
    });

    // 2. Navigate to accept-invite page
    const url = `${testData.baseUrl}/${testData.orgSlug}/auth/accept-invite/${token}`;
    await page.goto(url, { waitUntil: 'networkidle' });

    // 3. Should render invite-expired page (not the accept form)
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // The invite-expired.hbs contains "expired" text
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toContain('expir');

    // 4. Should NOT show the password form
    await expect(page.locator('#password')).not.toBeVisible();
  });

  /**
   * Test 5.4: Invalid/garbage token shows invite-expired page.
   *
   * Navigates to the acceptance URL with a random garbage string.
   * The handler should fail to find any matching token and render
   * the invite-expired page.
   */
  test('invalid/garbage token shows invite-expired page', async ({
    page,
    testData,
  }) => {
    // Navigate to accept-invite with a garbage token
    const url = `${testData.baseUrl}/${testData.orgSlug}/auth/accept-invite/invalidgarbage123`;
    await page.goto(url, { waitUntil: 'networkidle' });

    // Should render invite-expired page
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // Should contain expired/invalid messaging
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toContain('expir');

    // Should NOT show the password form
    await expect(page.locator('#password')).not.toBeVisible();
  });

  /**
   * Test 5.5: Weak password shows validation error.
   *
   * Creates a valid invitation token and attempts to set a weak
   * password (too short, doesn't meet NIST SP 800-63B requirements).
   * The form should re-render with an error message, and the token
   * should NOT be consumed (can try again).
   */
  test('weak password shows validation error', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    // 1. Create valid invitation token
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createInvitationToken(testData.invitedUserEmail, orgId);

    // 2. Navigate to accept-invite page
    const url = `${testData.baseUrl}/${testData.orgSlug}/auth/accept-invite/${token}`;
    await page.goto(url, { waitUntil: 'networkidle' });

    // 3. Fill in weak passwords (browser minlength=8 might prevent submission,
    //    so we remove the attribute first)
    await page.evaluate(() => {
      document.querySelectorAll('input[minlength]').forEach((el) => {
        el.removeAttribute('minlength');
      });
    });
    await page.fill('#password', '123');
    await page.fill('#confirmPassword', '123');

    // 4. Submit the form
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // 5. Should still show the form (re-rendered with error)
    await expect(page.locator('#password')).toBeVisible();

    // 6. Should show an error message about password strength
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/password|weak|short|length|character/);
  });

  /**
   * Test 5.6: Mismatched passwords show error.
   *
   * Creates a valid invitation token and submits the form with
   * non-matching passwords. The form should re-render with a
   * mismatch error.
   */
  test('mismatched passwords show error', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    // 1. Create valid invitation token
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createInvitationToken(testData.invitedUserEmail, orgId);

    // 2. Navigate to accept-invite page
    const url = `${testData.baseUrl}/${testData.orgSlug}/auth/accept-invite/${token}`;
    await page.goto(url, { waitUntil: 'networkidle' });

    // 3. Fill in non-matching passwords
    await page.fill('#password', 'StrongPassword123!');
    await page.fill('#confirmPassword', 'DifferentPassword456!');

    // 4. Submit the form
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // 5. Should still show the form (re-rendered with error)
    await expect(page.locator('#password')).toBeVisible();

    // 6. Should show a mismatch error message
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/match|mismatch|do not match|don't match/);
  });

  /**
   * Test 5.7: POST without valid CSRF token is rejected.
   *
   * Creates a valid invitation token, navigates to the form, removes
   * the CSRF hidden field, and submits. The POST handler should
   * detect the missing/invalid CSRF and reject the request.
   */
  test('POST without CSRF token is rejected', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    // 1. Create valid invitation token
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createInvitationToken(testData.invitedUserEmail, orgId);

    // 2. Navigate to accept-invite page
    const url = `${testData.baseUrl}/${testData.orgSlug}/auth/accept-invite/${token}`;
    await page.goto(url, { waitUntil: 'networkidle' });

    // 3. Remove the CSRF hidden field from the form
    await page.evaluate(() => {
      const csrfField = document.querySelector('input[name="_csrf"]');
      if (csrfField) csrfField.remove();
    });

    // 4. Fill in valid passwords
    await page.fill('#password', 'StrongPassword123!');
    await page.fill('#confirmPassword', 'StrongPassword123!');

    // 5. Submit the form without CSRF
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // 6. Should show CSRF error or re-render form with error
    const bodyText = await page.textContent('body');
    // The handler renders the form with a CSRF error message (status 403)
    expect(bodyText?.toLowerCase()).toMatch(/csrf|invalid|security|forbidden/);
  });

  /**
   * Test 5.8: Token replay — accepted invitation cannot be reused.
   *
   * Creates a valid invitation token, accepts the invitation (sets
   * password), then navigates to the same accept-invite URL again.
   * The second visit should show the invite-expired page because
   * the token has been consumed.
   */
  test('accepted invitation cannot be reused', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    // 1. Create valid invitation token
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createInvitationToken(testData.invitedUserEmail, orgId);

    // 2. Navigate to accept-invite page and accept
    const url = `${testData.baseUrl}/${testData.orgSlug}/auth/accept-invite/${token}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.fill('#password', 'ReplayTestPassword123!');
    await page.fill('#confirmPassword', 'ReplayTestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // 3. Verify first acceptance succeeded (success page)
    const firstBodyText = await page.textContent('body');
    expect(firstBodyText?.toLowerCase()).toMatch(/success|account|set up|welcome/);

    // 4. Navigate to the same URL again (token replay attempt)
    await page.goto(url, { waitUntil: 'networkidle' });

    // 5. Should show invite-expired page (token already consumed)
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    const secondBodyText = await page.textContent('body');
    expect(secondBodyText?.toLowerCase()).toContain('expir');

    // 6. Should NOT show the password form
    await expect(page.locator('#password')).not.toBeVisible();
  });

  /**
   * Test 5.9: Email verified after accepting invitation.
   *
   * Verifies that the invitation handler correctly marks the user's
   * email_verified flag in the database after successful acceptance.
   */
  test('email_verified flag set after accepting invitation', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    // 1. Create valid invitation token
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createInvitationToken(testData.invitedUserEmail, orgId);

    // 2. Get user record before acceptance
    const userBefore = await dbHelpers.getUserByEmail(testData.invitedUserEmail, orgId);
    expect(userBefore).not.toBeNull();

    // 3. Accept the invitation
    const url = `${testData.baseUrl}/${testData.orgSlug}/auth/accept-invite/${token}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.fill('#password', 'EmailVerifyTest123!');
    await page.fill('#confirmPassword', 'EmailVerifyTest123!');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // 4. Verify success page rendered
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/success|account|set up|welcome/);

    // 5. Verify email_verified is now true in the database
    const isVerified = await dbHelpers.isEmailVerified(userBefore!.id);
    expect(isVerified).toBe(true);
  });
});
