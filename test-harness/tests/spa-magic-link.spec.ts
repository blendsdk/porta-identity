import { test, expect } from '@playwright/test';
import {
  startMagicLinkFlow, waitForEmail, extractMagicLink,
  clearMailHog, TEST_USER,
} from './helpers';

test.describe('SPA — Magic Link Login Flow', () => {
  test.beforeEach(async () => {
    await clearMailHog();
  });

  test('magic link email is sent and contains valid link', async ({ page }) => {
    // This test verifies the magic link flow up to email delivery.
    // Full browser-based magic link completion requires the "check your email"
    // page to have polling (not yet implemented in Porta templates).

    // 1. Navigate to SPA
    await page.goto('/');
    await expect(page.locator('[data-testid="status"]')).toContainText('NOT LOGGED IN');

    // 2. Click LOGIN
    await page.click('[data-testid="login-btn"]');

    // 3. Start magic link flow on Porta
    await startMagicLinkFlow(page);

    // 4. Verify email was sent and contains a magic link
    const emailBody = await waitForEmail(TEST_USER.email);
    const magicLinkUrl = extractMagicLink(emailBody);

    // 5. Verify the magic link URL is well-formed
    expect(magicLinkUrl).toContain('/auth/magic-link/');
    expect(magicLinkUrl).toContain('porta.local:3443');
  });
});
