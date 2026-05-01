import { test, expect } from '@playwright/test';
import { loginWithPassword } from './helpers';

test.describe('SPA — Logout Flow', () => {
  test('login then logout', async ({ page }) => {
    // 1. Login first (via password)
    await page.goto('/');
    await page.click('[data-testid="login-btn"]');
    await loginWithPassword(page);
    await expect(page.locator('[data-testid="status"]')).toContainText('LOGGED IN');

    // 2. Verify we have an access token
    await expect(page.locator('[data-testid="access-token"]')).toBeVisible();

    // 3. Click LOGOUT — triggers signoutRedirect() which navigates to Porta
    await page.click('[data-testid="logout-btn"]');

    // 4. Porta shows a "Sign out" confirmation page — click the confirm button
    await page.waitForSelector('button:has-text("Sign out")', { timeout: 10_000 });
    await page.click('button:has-text("Sign out")');

    // 5. After signing out, Porta redirects back to the SPA
    await page.waitForURL('**app.test:4100**', { timeout: 15_000 });

    // 6. Verify logged out
    await expect(page.locator('[data-testid="status"]')).toContainText('NOT LOGGED IN', { timeout: 10_000 });
  });
});
