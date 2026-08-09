import { test, expect } from '@playwright/test';
import { loginWithPassword, assertJsonResult, TEST_USER } from './helpers';

test.describe('SPA — Password Login Flow', () => {
  test('complete auth flow: login → tokens → introspect → userinfo', async ({ page }) => {
    // 1. Navigate to SPA
    await page.goto('/');
    await expect(page.locator('[data-testid="status"]')).toContainText('NOT LOGGED IN');

    // 2. Click LOGIN
    await page.click('[data-testid="login-btn"]');

    // 3. Authenticate on Porta's login page
    await loginWithPassword(page);

    // 4. Verify back on SPA with tokens
    await expect(page.locator('[data-testid="status"]')).toContainText('LOGGED IN');
    await expect(page.locator('[data-testid="access-token"]')).toBeVisible();
    const accessToken = await page.locator('[data-testid="access-token"]').textContent();
    expect(accessToken).toBeTruthy();
    expect(accessToken!.length).toBeGreaterThan(10);

    // 5. Click INTROSPECT
    await page.click('[data-testid="introspect-btn"]');
    const introspection = await assertJsonResult(page, 'introspection-result');
    expect(introspection.active).toBe(true);
    expect(introspection.client_id).toBeTruthy();

    // 6. Click USERINFO
    await page.click('[data-testid="userinfo-btn"]');
    const userinfo = await assertJsonResult(page, 'userinfo-result');
    expect(userinfo.sub).toBeTruthy();
    expect(userinfo.email).toBe(TEST_USER.email);
  });
});
