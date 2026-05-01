import { test, expect } from '@playwright/test';
import { loginWithPassword, assertJsonResult, handleSignOutConfirmation } from './helpers';

test.describe('BFF — Token Refresh & Logout', () => {
  test('refresh token and then logout', async ({ page }) => {
    // 1. Login first
    await page.goto('/');
    await page.click('[data-testid="login-btn"]');
    await loginWithPassword(page);
    await expect(page.locator('[data-testid="status"]')).toContainText('LOGGED IN');

    // 2. Click REFRESH (navigates to /refresh page)
    await page.click('[data-testid="refresh-btn"]');
    const refreshResult = await assertJsonResult(page, 'refresh-result');
    expect(refreshResult.tokens_are_different).toBe(true);

    // 3. Go back
    await page.click('[data-testid="back-btn"]');

    // 4. Click LOGOUT
    await page.click('[data-testid="logout-btn"]');

    // 5. Handle Porta's sign-out confirmation page
    await handleSignOutConfirmation(page);

    // 6. Verify back on BFF, logged out
    await page.waitForURL('**/app.test:4101/**', { timeout: 15_000 });
    await expect(page.locator('[data-testid="status"]')).toContainText('NOT LOGGED IN');
    await expect(page.locator('[data-testid="login-btn"]')).toBeVisible();
  });
});
