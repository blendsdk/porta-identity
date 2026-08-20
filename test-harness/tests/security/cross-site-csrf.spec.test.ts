/// <reference lib="dom" />

import { expect, test, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

import { loginWithPassword, MAILHOG_API, TEST_USER } from '../helpers.js';

const mailSummarySchema = z.object({ total: z.number().int().nonnegative() }).passthrough();
const spaConfigSchema = z.object({
  spa: z.object({ clientId: z.string().min(1), redirectUri: z.string().url() }),
});

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

/** Submits a real cross-origin browser form so CORS cannot hide the CSRF decision. */
async function submitCsrfProbe(
  page: Page,
  sourceOrigin: string,
  target: string,
  csrfProof?: string,
): Promise<number> {
  const probe = await page.context().newPage();
  try {
    await probe.goto(sourceOrigin);
    const [response] = await Promise.all([
      probe.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      probe.evaluate(
        ({ email, proof, requestTarget }) => {
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = requestTarget;
          for (const [name, value] of [
            ['email', email],
            ...(proof === undefined ? [] : [['_csrf', proof]]),
          ]) {
            const input = document.createElement('input');
            input.name = name;
            input.value = value;
            form.append(input);
          }
          document.body.append(form);
          form.submit();
        },
        { email: TEST_USER.email, proof: csrfProof, requestTarget: target },
      ),
    ]);
    return response?.status() ?? 0;
  } finally {
    await probe.close();
  }
}

/** Proves the authenticated Porta session can still authorize after rejected probes. */
async function sessionCanAuthorizeSilently(
  page: Page,
  porta: string,
  app: string,
): Promise<boolean> {
  const configurationResponse = await page.request.get(`${app}/config.json`);
  if (!configurationResponse.ok()) throw new Error('SPA configuration is unavailable');
  const configuration = spaConfigSchema.parse(await configurationResponse.json());
  const verifier = randomBytes(32).toString('base64url');
  const authorization = new URL(`${porta}/alpha/auth`);
  authorization.search = new URLSearchParams({
    client_id: configuration.spa.clientId,
    redirect_uri: configuration.spa.redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state: randomBytes(18).toString('base64url'),
    nonce: randomBytes(18).toString('base64url'),
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'none',
  }).toString();
  const observer = await page.context().newPage();
  try {
    await observer.route(`${new URL(configuration.spa.redirectUri).origin}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: 'callback received' }),
    );
    await observer.goto(authorization.toString(), { waitUntil: 'domcontentloaded' });
    await observer.waitForURL(
      (url) => url.origin === new URL(configuration.spa.redirectUri).origin,
      { timeout: 10_000 },
    );
    return new URL(observer.url()).searchParams.has('code');
  } finally {
    await observer.close();
  }
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

  const sameSiteTarget = `${porta}/alpha/auth/forgot-password`;
  expect(await submitCsrfProbe(page, app, sameSiteTarget)).toBe(403);
  expect(await submitCsrfProbe(page, app, sameSiteTarget, 'wrong-csrf-proof')).toBe(403);
  expect(await mailCount()).toBe(beforeProbeMail);
  expect(await sessionCanAuthorizeSilently(page, porta, app)).toBe(true);

  expect(await submitCsrfProbe(page, attacker, sameSiteTarget)).toBe(403);
  expect(await mailCount()).toBe(beforeProbeMail);
  const sessionAfterProbe = (await page.context().cookies(porta)).find(
    (cookie) => cookie.name === '_session',
  );
  expect(sessionAfterProbe?.value).toBe(protectedSessionValue);
  expect(await sessionCanAuthorizeSilently(page, porta, app)).toBe(true);

  await page.goto(`${porta}/alpha/auth/forgot-password`);
  await page.locator('input[name="email"]').fill(TEST_USER.email);
  await page.locator('button[type="submit"]').click();
  expect(await waitForOneAdditionalMessage(beforeProbeMail)).toBe(beforeProbeMail + 1);
});
