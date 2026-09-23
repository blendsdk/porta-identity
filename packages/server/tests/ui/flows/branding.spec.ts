/**
 * Effective organization branding in real authentication pages.
 *
 * The primary tenant owns uploaded logo and favicon assets. The confidential tenant has no
 * uploaded assets and uses the primary tenant's public logo route as its configured fallback.
 */

import { expect, test } from '../fixtures/test-fixtures.js';

test.describe('Organization Branding', () => {
  test('should render uploaded logo and favicon without changing login methods', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    const logoUrl = `${testData.baseUrl}/${testData.orgSlug}/branding/logo`;
    const faviconUrl = `${testData.baseUrl}/${testData.orgSlug}/branding/favicon`;
    const logo = page.locator('.header img');

    await expect(logo).toHaveAttribute('src', logoUrl);
    await expect
      .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBe(40);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', faviconUrl);

    const [logoResponse, faviconResponse, pageResponse] = await Promise.all([
      page.request.get(logoUrl),
      page.request.get(faviconUrl),
      page.request.get(page.url()),
    ]);
    expect(logoResponse.status()).toBe(200);
    expect(logoResponse.headers()['content-type']).toContain('image/svg+xml');
    expect(faviconResponse.status()).toBe(200);
    expect(faviconResponse.headers()['content-type']).toContain('image/png');
    expect(pageResponse.headers()['content-security-policy']).toContain("img-src 'self' data:");

    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#magic-link-btn')).toBeVisible();
  });

  test('should render a configured fallback logo when no upload exists', async ({
    page,
    testData,
  }) => {
    const fallbackLogoUrl = `${testData.baseUrl}/${testData.orgSlug}/branding/logo`;
    const response = await page.goto(
      `${testData.baseUrl}/${testData.confOrgSlug}/auth/forgot-password`,
      { waitUntil: 'networkidle' },
    );
    const logo = page.locator('.header img');

    expect(response?.status()).toBe(200);
    await expect(logo).toHaveAttribute('src', fallbackLogoUrl);
    await expect
      .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBe(40);
    expect(response?.headers()['content-security-policy']).toContain(
      `img-src 'self' data: ${new URL(testData.baseUrl).origin}`,
    );
  });
});
