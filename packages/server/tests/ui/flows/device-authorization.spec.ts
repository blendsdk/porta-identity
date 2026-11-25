/**
 * Device authorization browser flows.
 *
 * These tests own the branded page contract: code entry, confirmation,
 * approval, the generic invalid state, SSO/2FA/consent reuse and locale
 * fallback. The protocol oracle remains the integration and end-to-end suites.
 */

import { expect, test } from '../fixtures/test-fixtures.js';
import type { APIRequestContext, Page } from '@playwright/test';

/** Full RFC 8628 grant value. */
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** Device authorization response used by the browser flow. */
interface DeviceAuthorization {
  readonly device_code: string;
  readonly user_code: string;
  readonly verification_uri_complete: string;
}

/** Request a device code from the live provider. */
async function authorizeDevice(
  request: APIRequestContext,
  orgSlug: string,
  clientId: string,
): Promise<DeviceAuthorization> {
  const response = await request.post(`/${orgSlug}/device/auth`, {
    form: { client_id: clientId, scope: 'openid profile' },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as DeviceAuthorization;
}

/** Open the entry page, submit a code and land on the confirmation page. */
async function confirmDeviceCode(
  page: Page,
  orgSlug: string,
  userCode: string,
): Promise<void> {
  await page.goto(`/${orgSlug}/device`);
  await page.fill('#device-user-code', userCode);
  await page.click('button[type="submit"]');
  await expect(page.locator('#device-confirm-code')).toHaveText(userCode);
}

/** Complete the password login on the provider interaction page. */
async function loginWithPassword(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.waitForURL('**/interaction/**');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
}

/**
 * Complete an approval that reuses an existing session.
 *
 * A first-party client normally auto-consents, but an existing grant can still
 * route through the consent page on a new interaction. A login form here means
 * SSO was not reused.
 */
async function finishWithExistingSession(page: Page): Promise<void> {
  await expect(page.locator('h1')).toContainText('Device connected', { timeout: 25_000 });
  if ((await page.locator('#email').count()) > 0) {
    throw new Error('Existing provider session was not reused');
  }
}

/** Poll the token endpoint for one device code. */
async function pollToken(
  request: APIRequestContext,
  orgSlug: string,
  clientId: string,
  deviceCode: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await request.post(`/${orgSlug}/token`, {
    form: {
      grant_type: DEVICE_CODE_GRANT,
      device_code: deviceCode,
      client_id: clientId,
    },
  });
  return { status: response.status(), body: (await response.json()) as Record<string, unknown> };
}

test.describe('Device authorization pages', () => {
  test('renders branded entry, confirmation and success pages and approves a code', async ({
    page,
    request,
    testData,
    dbHelpers,
  }) => {
    await dbHelpers.resetRateLimits('ratelimit:device-*');
    await dbHelpers.resetRateLimits('audit:device-*');
    const client = await dbHelpers.createDeviceClient(testData.orgSlug, 'web');
    try {
      const authorization = await authorizeDevice(request, testData.orgSlug, client.clientId);

      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });

      await page.goto(`/${testData.orgSlug}/device`);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('label[for="device-user-code"]')).toBeVisible();
      await expect(page.locator('#device-user-code')).toBeVisible();
      await expect(page.locator('#device-user-code')).toBeFocused();
      await expect(page.locator('#device-user-code')).toHaveAttribute('autocomplete', 'off');
      await expect(page.locator('#device-user-code')).toHaveAttribute('autocapitalize', 'characters');
      await expect(page.locator('#device-user-code')).toHaveAttribute('spellcheck', 'false');
      await expect(page.locator('#device-user-code')).toHaveAttribute('maxlength', '64');
      expect(
        await page.locator('script[src^="http"], link[rel="stylesheet"][href^="http"]').count(),
      ).toBe(0);
      expect(
        consoleErrors.filter((error) => !error.includes('favicon') && !error.includes('404')),
      ).toEqual([]);

      await page.fill('#device-user-code', authorization.user_code);
      await page.click('button[type="submit"]');

      await expect(page.locator('#device-confirm-code')).toHaveText(authorization.user_code);
      await expect(page.locator('body')).toContainText(client.clientName);
      await expect(page.locator('#device-scopes li')).toHaveCount(2);
      await expect(page.locator('form input[name="xsrf"]').first()).toHaveValue(/.+/);

      await page.click('button[name="confirm"]');
      await loginWithPassword(page, testData.userEmail, testData.userPassword);

      await page.waitForURL('**/device/**', { timeout: 25_000 });
      await expect(page.locator('h1')).toContainText('Device connected');
      await expect(page.locator('body')).toContainText(client.clientName);
      expect(page.url()).not.toContain('/interaction/');

      const token = await pollToken(
        request,
        testData.orgSlug,
        client.clientId,
        authorization.device_code,
      );
      expect(token.status).toBe(200);
      expect(typeof token.body.access_token).toBe('string');
    } finally {
      await dbHelpers.deleteDeviceClient(client.clientId);
    }
  });

  test('opens the complete verification URL and lands on the branded confirmation', async ({
    page,
    request,
    testData,
    dbHelpers,
  }) => {
    await dbHelpers.resetRateLimits('ratelimit:device-*');
    const client = await dbHelpers.createDeviceClient(testData.orgSlug, 'web');
    try {
      const authorization = await authorizeDevice(request, testData.orgSlug, client.clientId);
      await page.goto(authorization.verification_uri_complete);
      await expect(page.locator('#device-confirm-code')).toHaveText(authorization.user_code);
      await expect(page.locator('body')).toContainText(client.clientName);
    } finally {
      await dbHelpers.deleteDeviceClient(client.clientId);
    }
  });

  test('uses one generic invalid page for unknown, expired, used and aborted codes and rejects missing XSRF', async ({
    page,
    request,
    testData,
    dbHelpers,
  }) => {
    await dbHelpers.resetRateLimits('ratelimit:device-*');
    await dbHelpers.resetRateLimits('audit:device-*');
    const client = await dbHelpers.createDeviceClient(testData.orgSlug, 'web');
    try {
      await page.goto(`/${testData.orgSlug}/device`);
      await page.fill('#device-user-code', 'ZZZZ-ZZZZ');
      await page.click('button[type="submit"]');
      await expect(page.locator('body')).toContainText('invalid or has expired');

      const expired = await authorizeDevice(request, testData.orgSlug, client.clientId);
      await dbHelpers.expireDeviceCode(expired.device_code);
      await page.goto(`/${testData.orgSlug}/device`);
      await page.fill('#device-user-code', expired.user_code);
      await page.click('button[type="submit"]');
      await expect(page.locator('body')).toContainText('invalid or has expired');

      const used = await authorizeDevice(request, testData.orgSlug, client.clientId);
      await dbHelpers.markDeviceCodeUsed(used.device_code, testData.resettableUserId);
      await page.goto(`/${testData.orgSlug}/device`);
      await page.fill('#device-user-code', used.user_code);
      await page.click('button[type="submit"]');
      await expect(page.locator('body')).toContainText('invalid or has expired');

      const aborted = await authorizeDevice(request, testData.orgSlug, client.clientId);
      await confirmDeviceCode(page, testData.orgSlug, aborted.user_code);
      await page.click('button[name="abort"]');
      await expect(page.locator('body')).toContainText('invalid or has expired');

      const missingXsrf = await request.post(`/${testData.orgSlug}/device`, {
        form: { user_code: aborted.user_code },
      });
      expect(missingXsrf.status()).toBe(400);

      const denied = await pollToken(
        request,
        testData.orgSlug,
        client.clientId,
        aborted.device_code,
      );
      expect(denied.status).toBe(400);
      expect(denied.body.error).toBe('access_denied');
    } finally {
      await dbHelpers.deleteDeviceClient(client.clientId);
    }
  });

  test('reuses an existing session without a second login', async ({
    page,
    request,
    testData,
    dbHelpers,
  }) => {
    await dbHelpers.resetRateLimits('ratelimit:device-*');
    const client = await dbHelpers.createDeviceClient(testData.orgSlug, 'web');
    try {
      const first = await authorizeDevice(request, testData.orgSlug, client.clientId);
      await confirmDeviceCode(page, testData.orgSlug, first.user_code);
      await page.click('button[name="confirm"]');
      await loginWithPassword(page, testData.userEmail, testData.userPassword);
      await page.waitForURL('**/device/**', { timeout: 25_000 });
      await expect(page.locator('h1')).toContainText('Device connected');

      const second = await authorizeDevice(request, testData.orgSlug, client.clientId);
      await confirmDeviceCode(page, testData.orgSlug, second.user_code);
      await page.click('button[name="confirm"]');
      await finishWithExistingSession(page);
      expect(page.url()).not.toContain('/interaction/');
    } finally {
      await dbHelpers.deleteDeviceClient(client.clientId);
    }
  });

  test('keeps the existing email second factor in the device flow', async ({
    page,
    request,
    testData,
    dbHelpers,
    mailCapture,
  }) => {
    await dbHelpers.resetRateLimits('ratelimit:device-*');
    await mailCapture.deleteAll();
    await page.context().clearCookies();
    const client = await dbHelpers.createDeviceClient(testData.orgSlug, 'web');
    try {
      const authorization = await authorizeDevice(request, testData.orgSlug, client.clientId);
      await confirmDeviceCode(page, testData.orgSlug, authorization.user_code);
      await page.click('button[name="confirm"]');
      await loginWithPassword(page, testData.twoFactorEmailUser, testData.userPassword);

      await expect(page.locator('#code')).toBeVisible({ timeout: 15_000 });
      const email = await mailCapture.waitForEmail(testData.twoFactorEmailUser, {
        timeout: 20_000,
      });
      const code = /\b(\d{6})\b/.exec(email.body)?.[1];
      expect(code).toBeTruthy();
      await page.fill('#code', code ?? '');
      await page.click('#verify-form button[type="submit"]');

      await page.waitForURL('**/device/**', { timeout: 25_000 });
      await expect(page.locator('h1')).toContainText('Device connected');
    } finally {
      await dbHelpers.deleteDeviceClient(client.clientId);
    }
  });

  test('shows the existing consent page and denies a device approval', async ({
    page,
    request,
    testData,
    dbHelpers,
  }) => {
    await dbHelpers.resetRateLimits('ratelimit:device-*');
    const client = await dbHelpers.createDeviceClient(testData.orgSlug, 'web', true);
    try {
      const authorization = await authorizeDevice(request, testData.orgSlug, client.clientId);
      await confirmDeviceCode(page, testData.orgSlug, authorization.user_code);
      await page.click('button[name="confirm"]');
      await loginWithPassword(page, testData.userEmail, testData.userPassword);

      await expect(
        page.locator('form:has(input[name="decision"][value="approve"]) button'),
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('ul li').first()).toBeVisible();
      await expect(page.locator('body')).toContainText(client.clientName);
      await page.locator('form:has(input[name="decision"][value="deny"]) button').click();

      await page.waitForURL('**/device/**', { timeout: 25_000 });
      await expect(page.locator('body')).toContainText('invalid or has expired');

      const denied = await pollToken(
        request,
        testData.orgSlug,
        client.clientId,
        authorization.device_code,
      );
      expect(denied.status).toBe(400);
      expect(denied.body.error).toBe('access_denied');
    } finally {
      await dbHelpers.deleteDeviceClient(client.clientId);
    }
  });

  test('renders Dutch pages and falls back to English for an unknown locale', async ({
    browser,
    request,
    testData,
    dbHelpers,
  }) => {
    await dbHelpers.resetRateLimits('ratelimit:device-*');
    const client = await dbHelpers.createDeviceClient(testData.orgSlug, 'web');
    try {
      const authorization = await authorizeDevice(request, testData.orgSlug, client.clientId);

      const dutchContext = await browser.newContext({ locale: 'nl-NL' });
      try {
        const dutchPage = await dutchContext.newPage();
        await dutchPage.goto(`/${testData.orgSlug}/device`);
        await expect(dutchPage.locator('html')).toHaveAttribute('lang', 'nl');
        await expect(dutchPage.locator('h1')).toContainText('Voer je apparaatcode in');

        await dutchPage.fill('#device-user-code', authorization.user_code);
        await dutchPage.click('button[type="submit"]');
        await expect(dutchPage.locator('#device-confirm-code')).toHaveText(
          authorization.user_code,
        );
        await expect(dutchPage.locator('h1')).toContainText('Apparaat bevestigen');
      } finally {
        await dutchContext.close();
      }

      const unknownContext = await browser.newContext({ locale: 'xx-YY' });
      try {
        const unknownPage = await unknownContext.newPage();
        await unknownPage.goto(`/${testData.orgSlug}/device`);
        await expect(unknownPage.locator('html')).toHaveAttribute('lang', 'en');
        await expect(unknownPage.locator('h1')).toContainText('Enter your device code');
      } finally {
        await unknownContext.close();
      }
    } finally {
      await dbHelpers.deleteDeviceClient(client.clientId);
    }
  });
});
