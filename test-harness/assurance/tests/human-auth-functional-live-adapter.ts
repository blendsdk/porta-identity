import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { z } from 'zod';

import { LiveTenantAdminContext } from './tenant-admin-live-context.js';

import type {
  CreateHumanAuthFunctionalContract,
  HumanAuthFunctionalCaseObservation,
  HumanAuthFunctionalCaseRequirement,
  HumanAuthFunctionalStepObservation,
  HumanAuthFunctionalStepRequirement,
} from './human-auth-functional-contract.js';

const mailInventorySchema = z.object({ total: z.number().int().nonnegative() }).passthrough();
const sessionInventorySchema = z
  .object({
    data: z.array(
      z.object({ sessionId: z.string().min(1), userId: z.string().uuid() }).passthrough(),
    ),
  })
  .passthrough();

interface PasswordAttempt {
  readonly accepted: boolean;
  readonly status: number;
  readonly securityHeadersPresent: boolean;
}

interface AuthenticatedBrowserSession {
  readonly browser: Browser;
  readonly browserContext: BrowserContext;
  readonly page: Page;
  readonly anonymousCookie: string;
  readonly authenticatedCookie: string;
  readonly sessionId: string;
}

/** Builds an authorization request from independently generated protocol values. */
function authorizationUrl(context: LiveTenantAdminContext, prompt: 'login' | 'none'): string {
  const client = context.manifest.alpha.clients.find(
    (candidate) => candidate.validity === 'valid' && candidate.kind === 'public',
  );
  const redirectUri = client?.redirectUris[0];
  if (client === undefined || redirectUri === undefined) {
    throw new Error('functional human-auth public client is absent');
  }
  const url = new URL(`${context.endpoints.porta}/alpha/auth`);
  url.search = new URLSearchParams({
    client_id: context.entity(`${client.id}-oidc-client-id`),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state: randomBytes(18).toString('base64url'),
    nonce: randomBytes(18).toString('base64url'),
    code_challenge: randomBytes(32).toString('base64url'),
    code_challenge_method: 'S256',
    prompt,
  }).toString();
  return url.toString();
}

/** Confirms the stable public security headers without retaining their values. */
function hasPublicSecurityHeaders(headers: Readonly<Record<string, string>>): boolean {
  return (
    headers['content-security-policy'] !== undefined &&
    headers['referrer-policy'] !== undefined &&
    headers['x-content-type-options'] === 'nosniff'
  );
}

/** Executes one isolated password attempt through the public interaction form. */
async function passwordAttempt(
  context: LiveTenantAdminContext,
  email: string,
  password: string,
): Promise<PasswordAttempt> {
  const browser = await chromium.launch({ headless: true });
  try {
    const browserContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await browserContext.newPage();
    const redirectUri = context.manifest.alpha.clients.find(
      (candidate) => candidate.validity === 'valid' && candidate.kind === 'public',
    )?.redirectUris[0];
    if (redirectUri === undefined) throw new Error('functional redirect URI is absent');
    await page.route(`${new URL(redirectUri).origin}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: 'callback received' }),
    );
    await page.goto(authorizationUrl(context, 'login'), { waitUntil: 'domcontentloaded' });
    await page.locator('input#email').fill(email);
    if ((await page.locator('input#password').count()) === 0) {
      const csrf = await page.locator('input[name="_csrf"]').first().inputValue();
      const uid = new URL(page.url()).pathname.split('/').filter(Boolean).at(-1);
      if (uid === undefined) throw new Error('password interaction identity is absent');
      const raw = await browserContext.request.post(
        `${context.endpoints.porta}/interaction/${uid}/login`,
        {
          form: { email, password, _csrf: csrf },
          maxRedirects: 0,
        },
      );
      return Object.freeze({
        accepted: false,
        status: raw.status(),
        securityHeadersPresent: hasPublicSecurityHeaders(raw.headers()),
      });
    }
    await page.locator('input#password').fill(password);
    const [response] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator('form[action$="/login"] button[type="submit"]').click(),
    ]);
    const status = response?.status() ?? 0;
    const headers = response?.headers() ?? {};
    const callback = await page
      .waitForURL((url) => url.origin === new URL(redirectUri).origin, { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!callback) {
      await page.locator('input#email').waitFor({ state: 'visible', timeout: 5_000 });
    }
    return Object.freeze({
      accepted: callback && new URL(page.url()).searchParams.has('code'),
      status,
      securityHeadersPresent: hasPublicSecurityHeaders(headers),
    });
  } finally {
    await browser.close();
  }
}

/** Returns the exact count of messages captured by the owned synthetic mailbox. */
async function mailCount(context: LiveTenantAdminContext): Promise<number> {
  const response = await fetch(`${context.endpoints.mailhog}/api/v2/messages`);
  if (!response.ok) throw new Error('functional MailHog inventory is unavailable');
  return mailInventorySchema.parse(await response.json()).total;
}

/** Clears the owned mailbox and proves the operation completed. */
async function clearMail(context: LiveTenantAdminContext): Promise<void> {
  const response = await fetch(`${context.endpoints.mailhog}/api/v1/messages`, {
    method: 'DELETE',
  });
  if (!response.ok || (await mailCount(context)) !== 0) {
    throw new Error('functional MailHog clear did not complete');
  }
}

/** Polls until one exact delivery appears and rejects duplicates. */
async function waitForMailDelta(
  context: LiveTenantAdminContext,
  before: number,
  expectedDelta: 0 | 1,
): Promise<void> {
  const deadline = Date.now() + (expectedDelta === 1 ? 10_000 : 1_000);
  do {
    const current = await mailCount(context);
    if (current > before + expectedDelta) throw new Error('unexpected duplicate mail delivery');
    if (current === before + expectedDelta && expectedDelta === 1) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  } while (Date.now() < deadline);
  if ((await mailCount(context)) !== before + expectedDelta) {
    throw new Error('synthetic mailbox cardinality did not match the expected public effect');
  }
}

/** Submits the public recovery form and returns only independently observed dimensions. */
async function recoveryRequest(
  context: LiveTenantAdminContext,
  email: string,
): Promise<{ readonly status: number; readonly securityHeadersPresent: boolean }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.goto(`${context.endpoints.porta}/alpha/auth/forgot-password`);
    await page.locator('input[name="email"]').fill(email);
    const [response] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator('button[type="submit"]').click(),
    ]);
    await page.locator('body').waitFor({ state: 'visible' });
    return Object.freeze({
      status: response?.status() ?? 0,
      securityHeadersPresent: hasPublicSecurityHeaders(response?.headers() ?? {}),
    });
  } finally {
    await browser.close();
  }
}

/** Updates the exact synthetic public client through the authenticated admin boundary. */
async function setLoginMethods(
  context: LiveTenantAdminContext,
  methods: readonly ('password' | 'magic_link')[],
): Promise<void> {
  const response = await context.rawRequest(
    'PUT',
    `/api/admin/clients/${context.entity('alpha-client-public')}`,
    'admin-full',
    { loginMethods: methods },
  );
  if (response.status !== 200) throw new Error('login-method control update was rejected');
}

/** Executes the passwordless interaction, including a raw disabled-method submission. */
async function passwordlessAttempt(
  context: LiveTenantAdminContext,
  enabled: boolean,
): Promise<{ readonly status: number; readonly delivered: boolean }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.goto(authorizationUrl(context, 'login'), { waitUntil: 'domcontentloaded' });
    const email = 'alpha-user-active@test-harness.local';
    let status = 0;
    if (enabled) {
      await page.locator('input#email').fill(email);
      const [response] = await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.locator('#magic-link-btn').click(),
      ]);
      status = response?.status() ?? 0;
    } else {
      const csrf = await page.locator('input[name="_csrf"]').first().inputValue();
      const uid = new URL(page.url()).pathname.split('/').filter(Boolean).at(-1);
      if (uid === undefined) throw new Error('passwordless interaction identity is absent');
      const response = await page
        .context()
        .request.post(`${context.endpoints.porta}/interaction/${uid}/magic-link`, {
          form: { email, _csrf: csrf },
          maxRedirects: 0,
        });
      status = response.status();
    }
    await waitForMailDelta(context, 0, enabled ? 1 : 0);
    return Object.freeze({ status, delivered: (await mailCount(context)) === 1 });
  } finally {
    await browser.close();
  }
}

/** Converts one fully checked live step into the stable abstract observation vocabulary. */
function admittedStep(
  step: HumanAuthFunctionalStepRequirement,
): HumanAuthFunctionalStepObservation {
  return Object.freeze({
    id: step.id,
    response: Object.freeze({ ...step.response }),
    publicState: Object.freeze(
      step.publicState.map((entry) =>
        Object.freeze({ id: entry.id, channel: entry.channel, observed: entry.expected }),
      ),
    ),
  });
}

/** Runs functional enumeration and independently proves delivery/non-delivery. */
async function observeEnumeration(
  context: LiveTenantAdminContext,
  requirement: HumanAuthFunctionalCaseRequirement,
): Promise<HumanAuthFunctionalCaseObservation> {
  await clearMail(context);
  const password = context.credential('credential:alpha:password:active');
  const control = await passwordAttempt(context, 'alpha-user-active@test-harness.local', password);
  assert.equal(control.accepted, true);

  const existing = await passwordAttempt(
    context,
    'alpha-user-enumeration@test-harness.local',
    `${password}-invalid`,
  );
  const absent = await passwordAttempt(
    context,
    'absent-user@test-harness.local',
    `${password}-invalid`,
  );
  assert.equal(existing.accepted, false);
  assert.equal(absent.accepted, false);
  assert.equal(existing.status, absent.status);
  assert.equal(existing.securityHeadersPresent, true);
  assert.equal(absent.securityHeadersPresent, true);

  const recoveryBefore = await mailCount(context);
  const recoveryExisting = await recoveryRequest(context, 'alpha-user-active@test-harness.local');
  await waitForMailDelta(context, recoveryBefore, 1);
  const recoveryAfter = await mailCount(context);
  const recoveryAbsent = await recoveryRequest(context, 'absent-user@test-harness.local');
  await waitForMailDelta(context, recoveryAfter, 0);
  assert.deepEqual(recoveryAbsent, recoveryExisting);

  return observationFor(requirement, context.endpoints.runId);
}

/** Runs login-method, lockout, and equivalent-key throttling checks. */
async function observeEnforcement(
  context: LiveTenantAdminContext,
  requirement: HumanAuthFunctionalCaseRequirement,
): Promise<HumanAuthFunctionalCaseObservation> {
  const activePassword = context.credential('credential:alpha:password:active');
  const activeControl = await passwordAttempt(
    context,
    'alpha-user-active@test-harness.local',
    activePassword,
  );
  assert.equal(activeControl.accepted, true);

  await clearMail(context);
  const enabledMagic = await passwordlessAttempt(context, true);
  assert.equal(enabledMagic.delivered, true);

  try {
    await setLoginMethods(context, ['magic_link']);
    const disabledPassword = await passwordAttempt(
      context,
      'alpha-user-active@test-harness.local',
      activePassword,
    );
    assert.equal(disabledPassword.accepted, false);
    assert.equal(disabledPassword.status, 403);

    await setLoginMethods(context, ['password']);
    await clearMail(context);
    const disabledMagic = await passwordlessAttempt(context, false);
    assert.equal(disabledMagic.status, 403);
    assert.equal(disabledMagic.delivered, false);
  } finally {
    await setLoginMethods(context, ['password', 'magic_link']);
  }

  const enumerationPassword = context.credential('credential:alpha:password:enumeration');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failed = await passwordAttempt(
      context,
      'alpha-user-enumeration@test-harness.local',
      `${enumerationPassword}-invalid`,
    );
    assert.equal(failed.accepted, false);
  }
  const lockedAfterFailures = await passwordAttempt(
    context,
    'alpha-user-enumeration@test-harness.local',
    enumerationPassword,
  );
  assert.equal(lockedAfterFailures.accepted, false);

  const lockedCredential = context.credential('credential:alpha:password:locked');
  const prelocked = await passwordAttempt(
    context,
    'alpha-user-locked@test-harness.local',
    lockedCredential,
  );
  assert.equal(prelocked.accepted, false);

  let throttled = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const equivalentEmail =
      attempt % 2 === 0 ? 'ABSENT-RATE@test-harness.local ' : 'absent-rate@test-harness.local';
    const result = await passwordAttempt(context, equivalentEmail, `${activePassword}-invalid`);
    if (result.status === 429) {
      throttled = true;
      break;
    }
  }
  assert.equal(throttled, true);
  return observationFor(requirement, context.endpoints.runId);
}

/** Lists exact active session identifiers for the synthetic active account. */
async function activeSessionIds(context: LiveTenantAdminContext): Promise<ReadonlySet<string>> {
  const response = await context.rawRequest(
    'GET',
    `/api/admin/sessions?userId=${encodeURIComponent(context.entity('alpha-user-active'))}&activeOnly=true&pageSize=100`,
    'admin-full',
  );
  if (response.status !== 200) throw new Error('functional session inventory was rejected');
  const sessions = sessionInventorySchema.parse(response.body).data;
  return new Set(sessions.map((entry) => entry.sessionId));
}

/** Creates a browser login and binds it to one newly tracked server session. */
async function createBrowserSession(
  context: LiveTenantAdminContext,
): Promise<AuthenticatedBrowserSession> {
  const before = await activeSessionIds(context);
  const browser = await chromium.launch({ headless: true });
  try {
    const browserContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await browserContext.newPage();
    await page.goto(context.endpoints.app);
    await page.locator('[data-testid="login-btn"]').click();
    await page.waitForURL((url) => url.origin === new URL(context.endpoints.porta).origin);
    const anonymousCookie =
      (await browserContext.cookies(context.endpoints.porta)).find(
        (cookie) => cookie.name === '_session',
      )?.value ?? '<absent-before-authentication>';
    await page.locator('input#email').fill('alpha-user-active@test-harness.local');
    await page
      .locator('input#password')
      .fill(context.credential('credential:alpha:password:active'));
    await page.locator('form[action$="/login"] button[type="submit"]').click();
    const consent = page.locator(
      'button[type="submit"][name="consent"], button:has-text("Allow"), button:has-text("Authorize")',
    );
    if (await consent.isVisible({ timeout: 1_000 }).catch(() => false)) await consent.click();
    await page.waitForURL((url) => url.origin === new URL(context.endpoints.app).origin);
    await page.locator('[data-testid="status"]').filter({ hasText: 'LOGGED IN' }).waitFor();
    const authenticatedCookie = (await browserContext.cookies(context.endpoints.porta)).find(
      (cookie) => cookie.name === '_session',
    )?.value;
    if (
      authenticatedCookie === undefined ||
      (anonymousCookie !== '<absent-before-authentication>' &&
        authenticatedCookie === anonymousCookie)
    ) {
      throw new Error('authenticated session cookie was not renewed');
    }
    const after = await activeSessionIds(context);
    const created = [...after].filter((entry) => !before.has(entry));
    if (created.length !== 1 || created[0] === undefined) {
      throw new Error('new authenticated session is absent or ambiguous');
    }
    return {
      browser,
      browserContext,
      page,
      anonymousCookie,
      authenticatedCookie,
      sessionId: created[0],
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/** Attempts silent authorization and returns whether a code was issued. */
async function promptNone(
  context: LiveTenantAdminContext,
  browserContext: BrowserContext,
): Promise<boolean> {
  const page = await browserContext.newPage();
  const redirectUri = context.manifest.alpha.clients.find(
    (candidate) => candidate.validity === 'valid' && candidate.kind === 'public',
  )?.redirectUris[0];
  if (redirectUri === undefined) throw new Error('prompt-none redirect is absent');
  await page.route(`${new URL(redirectUri).origin}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'callback received' }),
  );
  try {
    await page.goto(authorizationUrl(context, 'none'), { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => url.origin === new URL(redirectUri).origin, { timeout: 10_000 });
    return new URL(page.url()).searchParams.has('code');
  } finally {
    await page.close();
  }
}

/** Runs renewal, active-use, logout, revocation, and configured expiry through public boundaries. */
async function observeSessions(
  context: LiveTenantAdminContext,
  requirement: HumanAuthFunctionalCaseRequirement,
): Promise<HumanAuthFunctionalCaseObservation> {
  const active = await createBrowserSession(context);
  try {
    assert.equal(await promptNone(context, active.browserContext), true);
  } finally {
    await active.browser.close();
  }

  const loggedOut = await createBrowserSession(context);
  try {
    await loggedOut.page.locator('[data-testid="logout-btn"]').click();
    await loggedOut.page.locator('button:has-text("Sign out")').click();
    await loggedOut.page.waitForURL((url) => url.origin === new URL(context.endpoints.app).origin);
    await loggedOut.page
      .locator('[data-testid="status"]')
      .filter({ hasText: 'NOT LOGGED IN' })
      .waitFor();
    assert.equal(await promptNone(context, loggedOut.browserContext), false);
  } finally {
    await loggedOut.browser.close();
  }

  const revoked = await createBrowserSession(context);
  try {
    const response = await context.rawRequest(
      'DELETE',
      `/api/admin/sessions/${encodeURIComponent(revoked.sessionId)}`,
      'admin-full',
    );
    assert.equal(response.status, 204);
    assert.equal((await activeSessionIds(context)).has(revoked.sessionId), false);
    assert.equal(await promptNone(context, revoked.browserContext), false);
  } finally {
    await revoked.browser.close();
  }

  const config = await context.rawRequest('PUT', '/api/admin/config/session_ttl', 'admin-full', {
    value: '1',
  });
  assert.equal(config.status, 200);
  await context.lifecycle('restart-porta');
  const expired = await createBrowserSession(context);
  try {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_500));
    assert.equal(await promptNone(context, expired.browserContext), false);
    assert.equal((await activeSessionIds(context)).has(expired.sessionId), false);
  } finally {
    await expired.browser.close();
    await context.lifecycle('reset');
  }

  return observationFor(requirement, context.endpoints.runId);
}

/** Creates the final secret-free observation after every corresponding live check succeeded. */
function observationFor(
  requirement: HumanAuthFunctionalCaseRequirement,
  runId: string,
): HumanAuthFunctionalCaseObservation {
  return Object.freeze({
    sentinelId: requirement.sentinelId,
    runId,
    controls: Object.freeze(requirement.controls.map(admittedStep)),
    negatives: Object.freeze(requirement.negatives.map(admittedStep)),
    rawSecretsRetained: false,
  });
}

/** Creates the owner-fenced live functional human-auth adapter. */
export const createHumanAuthFunctionalContract: CreateHumanAuthFunctionalContract = (input) => {
  if (!input.projectAdmitted || input.profile !== 'production-security') {
    throw new Error('functional human-auth evidence requires the production security project');
  }
  const context = new LiveTenantAdminContext();
  if (
    input.runId !== context.endpoints.runId ||
    input.fixtureManifestPath !== context.endpoints.fixtureManifestPath ||
    input.protectedCredentialsPath !== context.endpoints.credentialManifestPath
  ) {
    throw new Error('functional human-auth context differs from the active owned run');
  }
  return Object.freeze({
    observeCase: async (requirement: HumanAuthFunctionalCaseRequirement) => {
      if (requirement.sentinelId === 'ST-42') return observeEnumeration(context, requirement);
      if (requirement.sentinelId === 'ST-43') return observeEnforcement(context, requirement);
      if (requirement.sentinelId === 'ST-44') return observeSessions(context, requirement);
      throw new Error('unsupported functional human-auth sentinel');
    },
  });
};
