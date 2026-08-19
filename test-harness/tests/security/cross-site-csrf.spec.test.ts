import { expect, test } from '@playwright/test';
import { z } from 'zod';

import { loginWithPassword, MAILHOG_API, TEST_USER } from '../helpers.js';

const mailSummarySchema = z.object({ total: z.number().int().nonnegative() }).passthrough();

/** Returns one required owner-fenced lifecycle URL. */
function requiredOrigin(name: 'HARNESS_APP_URL' | 'HARNESS_ATTACKER_URL' | 'HARNESS_PORTA_URL') {
  const value = process.env[name];
  if (value === undefined) throw new Error(`${name} is required`);
  return new URL(value).origin;
}

/** Reads the current MailHog cardinality as an independent mutation fingerprint. */
async function mailCount(): Promise<number> {
  const response = await fetch(`${MAILHOG_API}/v2/messages`);
  if (!response.ok) throw new Error('MailHog message inventory is unavailable');
  return mailSummarySchema.parse(await response.json()).total;
}

/** Waits for exactly one password-reset delivery after the allowed control. */
async function waitForOneAdditionalMessage(before: number): Promise<number> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const observed = await mailCount();
    if (observed === before + 1) return observed;
    if (observed > before + 1) throw new Error('password-reset control emitted multiple messages');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error('password-reset control did not emit one message');
}

test('enforces host-only production session cookies and cross-site CSRF nonmutation', async ({
  page,
}) => {
  const profile = process.env.HARNESS_PROFILE;
  expect(['operational', 'production-security']).toContain(profile);
  const porta = requiredOrigin('HARNESS_PORTA_URL');
  const app = requiredOrigin('HARNESS_APP_URL');
  const attacker = requiredOrigin('HARNESS_ATTACKER_URL');
  expect(new URL(attacker).hostname).toBe('127.0.0.1');
  expect(new URL(attacker).port).toBe(new URL(app).port);

  const sessionHeaders: string[] = [];
  page.on('response', async (response) => {
    if (new URL(response.url()).origin !== porta) return;
    for (const value of await response.headerValues('set-cookie')) {
      if (value.startsWith('_session=')) sessionHeaders.push(value);
    }
  });

  await page.goto(app);
  await page.locator('[data-testid="login-btn"]').click();
  await page.waitForURL((url) => url.origin === porta);
  await loginWithPassword(page);
  await page.waitForURL((url) => url.origin === app);

  const session = (await page.context().cookies(porta)).find(
    (cookie) => cookie.name === '_session',
  );
  expect(session, 'authenticated _session cookie is missing').toBeDefined();
  expect(session?.domain).toBe('porta-harness.ci.portaidentity.com');
  expect(session?.path).toBe('/');
  expect(session?.secure).toBe(true);
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
  expect(sessionHeaders.length).toBeGreaterThan(0);
  for (const value of sessionHeaders) expect(value).not.toMatch(/(?:^|;)\s*domain=/iu);

  const beforeProbeMail = await mailCount();
  const protectedSessionValue = session?.value;
  await page.goto(attacker);
  const probeOutcome = await page.evaluate(
    async ({ email, target }) => {
      try {
        const response = await fetch(target, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ email }).toString(),
        });
        return `status:${response.status}`;
      } catch {
        return 'browser-blocked';
      }
    },
    { email: TEST_USER.email, target: `${porta}/alpha/auth/forgot-password` },
  );
  expect(['browser-blocked', 'status:403']).toContain(probeOutcome);
  expect(await mailCount()).toBe(beforeProbeMail);
  const sessionAfterProbe = (await page.context().cookies(porta)).find(
    (cookie) => cookie.name === '_session',
  );
  expect(sessionAfterProbe?.value).toBe(protectedSessionValue);

  await page.goto(`${porta}/alpha/auth/forgot-password`);
  await page.locator('input[name="email"]').fill(TEST_USER.email);
  await page.locator('button[type="submit"]').click();
  expect(await waitForOneAdditionalMessage(beforeProbeMail)).toBe(beforeProbeMail + 1);
});
