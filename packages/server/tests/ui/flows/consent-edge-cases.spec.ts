/**
 * Browser coverage for consent admission under tenant-bound OIDC clients.
 *
 * Porta's supported client model binds every client to exactly one organization. A first-party
 * client is auto-consented after a successful login, while a client owned by another tenant is
 * rejected before an interaction is created. The rendered third-party consent page is therefore
 * not reachable through the supported public client model.
 */

import crypto from 'node:crypto';
import { expect, test } from '../fixtures/test-fixtures.js';

/** Build an authorization URL whose client belongs to a different organization. */
function buildForeignClientAuthorizationUrl(
  baseUrl: string,
  orgSlug: string,
  clientId: string,
  redirectUri: string,
): string {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const authUrl = new URL(`${baseUrl}/${orgSlug}/auth`);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));
  return authUrl.toString();
}

test.describe('Consent admission', () => {
  test('should auto-consent a first-party client after successful login', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');
    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${testData.redirectUri}*`, { timeout: 25_000 });

    const callback = new URL(page.url());
    expect(callback.searchParams.get('code')).toBeTruthy();
    await expect(page.locator('button:has-text("Allow access")')).toHaveCount(0);
  });

  test('should reject a foreign client before creating an interaction', async ({
    page,
    testData,
  }) => {
    const authUrl = buildForeignClientAuthorizationUrl(
      testData.baseUrl,
      testData.orgSlug,
      testData.confClientId,
      testData.redirectUri,
    );

    const response = await page.goto(authUrl, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(404);
    expect(page.url()).not.toContain('/interaction/');
  });

  test('should not disclose a foreign client identifier in the rejection body', async ({
    page,
    testData,
  }) => {
    const authUrl = buildForeignClientAuthorizationUrl(
      testData.baseUrl,
      testData.orgSlug,
      testData.confClientId,
      testData.redirectUri,
    );

    await page.goto(authUrl, { waitUntil: 'networkidle' });
    const body = await page.textContent('body');
    expect(body).not.toContain(testData.confClientId);
    expect(page.url()).not.toContain('/interaction/');
  });
});
