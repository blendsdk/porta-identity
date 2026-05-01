import { test, expect } from '@playwright/test';
import {
  startMagicLinkFlow, waitForEmail, extractMagicLink,
  clearMailHog, TEST_USER,
} from './helpers';

test.describe('BFF — Magic Link Login Flow', () => {
  test.beforeEach(async () => {
    await clearMailHog();
    // Wait to avoid rate limiting from previous magic link test
    await new Promise(r => setTimeout(r, 3_000));
  });

  test('magic link email is sent and contains valid link', async ({ page }) => {
    // 1. Navigate to BFF
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
