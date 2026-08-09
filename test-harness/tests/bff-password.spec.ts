import { test, expect } from '@playwright/test';
import { loginWithPassword, assertJsonResult, TEST_USER } from './helpers';

test.describe('BFF — Password Login Flow', () => {
  test('complete auth flow: login → tokens → introspect → userinfo', async ({ page }) => {
    // 1. Navigate to BFF
    await page.goto('/');
    await expect(page.locator('[data-testid="status"]')).toContainText('NOT LOGGED IN');

    // 2. Click LOGIN (BFF uses <a> links, not JS)
    await page.click('[data-testid="login-btn"]');

    // 3. Authenticate on Porta's login page
    await loginWithPassword(page);

    // 4. Verify back on BFF with tokens displayed
    await expect(page.locator('[data-testid="status"]')).toContainText('LOGGED IN');
    await expect(page.locator('[data-testid="access-token"]')).toBeVisible();

    // 5. Click INTROSPECT (navigates to /introspect page)
    await page.click('[data-testid="introspect-btn"]');
    const introspection = await assertJsonResult(page, 'introspection-result');
    expect(introspection.active).toBe(true);

    // 6. Go back to main page
    await page.click('[data-testid="back-btn"]');

    // 7. Click USERINFO (navigates to /userinfo page)
    await page.click('[data-testid="userinfo-btn"]');
    const userinfo = await assertJsonResult(page, 'userinfo-result');
    expect(userinfo.email).toBe(TEST_USER.email);
  });
});
