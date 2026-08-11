import { expect, test } from '@playwright/test';

/** Returns the active Porta origin supplied by the owner-fenced harness lifecycle. */
function portaOrigin(): string {
  const value = process.env.HARNESS_PORTA_URL;
  if (value === undefined) throw new Error('HARNESS_PORTA_URL is required');
  return new URL(value).origin;
}

/** Reads one required public client URL from the owner-fenced lifecycle environment. */
function clientOrigin(): string {
  const value = process.env.HARNESS_APP_URL;
  if (value === undefined) throw new Error('HARNESS_APP_URL is required');
  return new URL(value).origin;
}

test('keeps framework identity out of the public health response', async ({ request }) => {
  const response = await request.get(`${portaOrigin()}/health`);

  expect(response.ok()).toBe(true);
  expect(response.headers()['x-powered-by']).toBeUndefined();
  expect(await response.text()).not.toMatch(/(?:koa|express|node\.js)/iu);
});

test('enforces the production HTTPS, cookie, error, and header contract', async ({
  page,
  request,
}) => {
  test.skip(process.env.HARNESS_PROFILE !== 'production-security');
  const porta = portaOrigin();
  expect(new URL(porta).protocol).toBe('https:');

  const health = await request.get(`${porta}/health`);
  expect(health.headers()).toMatchObject({
    'content-security-policy': "default-src 'none'",
    'referrer-policy': 'strict-origin-when-cross-origin',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });

  const unauthorized = await request.get(`${porta}/api/admin/organizations`);
  expect([401, 403]).toContain(unauthorized.status());
  expect(await unauthorized.text()).not.toMatch(
    /(?:at\s+\w+\s+\(|node_modules|postgres|redis|\/app\/|porta\/\d+\.\d+\.\d+)/iu,
  );

  await page.goto(clientOrigin());
  await page.locator('[data-testid="login-btn"]').click();
  await page.waitForURL((url) => url.origin === porta);
  const cookies = (await page.context().cookies(porta)).filter((cookie) => cookie.httpOnly);
  expect(cookies.length).toBeGreaterThan(0);
  for (const cookie of cookies) {
    expect(cookie.secure).toBe(true);
    expect(cookie.httpOnly).toBe(true);
    expect(['Lax', 'Strict']).toContain(cookie.sameSite);
  }
});
