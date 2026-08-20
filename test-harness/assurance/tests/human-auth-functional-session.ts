import assert from 'node:assert/strict';

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { z } from 'zod';

import { functionalAuthorizationUrl } from './human-auth-functional-authorization.js';
import {
  assembleFunctionalCaseObservation,
  observedFunctionalResponse as observedResponse,
  observedFunctionalState as observedState,
  observedFunctionalStep as observedStep,
} from './human-auth-functional-observations.js';

import type {
  HumanAuthFunctionalCaseObservation,
  HumanAuthFunctionalCaseRequirement,
  HumanAuthFunctionalStepObservation,
} from './human-auth-functional-contract.js';
import type { LiveTenantAdminContext } from './tenant-admin-live-context.js';

const sessionInventorySchema = z
  .object({
    data: z.array(
      z.object({ sessionId: z.string().min(1), userId: z.string().uuid() }).passthrough(),
    ),
  })
  .passthrough();

/** Browser resources and identities belonging to one authenticated synthetic session. */
interface AuthenticatedBrowserSession {
  readonly browser: Browser;
  readonly browserContext: BrowserContext;
  readonly page: Page;
  readonly anonymousCookie: string;
  readonly authenticatedCookie: string;
  readonly sessionId: string;
  readonly authenticationResponse: HumanAuthFunctionalStepObservation['response'];
}

/** Public result of attempting silent authorization with an existing browser session. */
interface SilentAuthorizationObservation {
  readonly codePresent: boolean;
  readonly errorPresent: boolean;
  readonly response: HumanAuthFunctionalStepObservation['response'];
}

/** Classifies a completed public navigation only from its observed destination and result. */
function observedRedirect(
  destination: URL,
  expectedOrigin: string,
  bodySchemaId: string,
): HumanAuthFunctionalStepObservation['response'] {
  const reachedExpectedOrigin = destination.origin === expectedOrigin;
  return observedResponse(
    reachedExpectedOrigin ? 'redirect' : null,
    reachedExpectedOrigin ? bodySchemaId : null,
    reachedExpectedOrigin ? 'redirect' : null,
  );
}

/** Confirms the stable public response headers without retaining their values. */
function hasPublicHeaders(headers: Readonly<Record<string, string>>): boolean {
  return (
    headers['content-security-policy'] !== undefined &&
    headers['referrer-policy'] !== undefined &&
    headers['x-content-type-options'] === 'nosniff'
  );
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
    const authenticationResponse = observedRedirect(
      new URL(page.url()),
      new URL(context.endpoints.app).origin,
      'authorization-callback',
    );
    return {
      browser,
      browserContext,
      page,
      anonymousCookie,
      authenticatedCookie,
      sessionId: created[0],
      authenticationResponse,
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/** Attempts silent authorization and returns whether a code or error was issued. */
async function promptNone(
  context: LiveTenantAdminContext,
  browserContext: BrowserContext,
): Promise<SilentAuthorizationObservation> {
  const page = await browserContext.newPage();
  const redirectUri = context.manifest.alpha.clients.find(
    (candidate) => candidate.validity === 'valid' && candidate.kind === 'public',
  )?.redirectUris[0];
  if (redirectUri === undefined) throw new Error('prompt-none redirect is absent');
  await page.route(`${new URL(redirectUri).origin}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'callback received' }),
  );
  try {
    await page.goto(functionalAuthorizationUrl(context, 'none'), {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForURL((url) => url.origin === new URL(redirectUri).origin, { timeout: 10_000 });
    const result = new URL(page.url()).searchParams;
    const bodySchemaId = result.has('code')
      ? 'authorization-callback'
      : result.has('error')
        ? 'authorization-error'
        : 'unknown-authorization-result';
    return Object.freeze({
      codePresent: result.has('code'),
      errorPresent: result.has('error'),
      response: observedRedirect(new URL(page.url()), new URL(redirectUri).origin, bodySchemaId),
    });
  } finally {
    await page.close();
  }
}

/** Runs renewal, active-use, logout, revocation, and configured expiry through public boundaries. */
export async function observeFunctionalSessions(
  context: LiveTenantAdminContext,
  requirement: HumanAuthFunctionalCaseRequirement,
): Promise<HumanAuthFunctionalCaseObservation> {
  const active = await createBrowserSession(context);
  let activeUse: SilentAuthorizationObservation;
  try {
    activeUse = await promptNone(context, active.browserContext);
    assert.equal(activeUse.codePresent, true);
  } finally {
    await active.browser.close();
  }

  const loggedOut = await createBrowserSession(context);
  let loggedOutUse: SilentAuthorizationObservation;
  let logoutResponse: HumanAuthFunctionalStepObservation['response'];
  try {
    await loggedOut.page.locator('[data-testid="logout-btn"]').click();
    await loggedOut.page.locator('button:has-text("Sign out")').click();
    await loggedOut.page.waitForURL((url) => url.origin === new URL(context.endpoints.app).origin);
    await loggedOut.page
      .locator('[data-testid="status"]')
      .filter({ hasText: 'NOT LOGGED IN' })
      .waitFor();
    logoutResponse = observedRedirect(
      new URL(loggedOut.page.url()),
      new URL(context.endpoints.app).origin,
      'logged-out-client',
    );
    loggedOutUse = await promptNone(context, loggedOut.browserContext);
    assert.equal(loggedOutUse.codePresent, false);
    assert.equal(loggedOutUse.errorPresent, true);
  } finally {
    await loggedOut.browser.close();
  }

  const revoked = await createBrowserSession(context);
  let revokedUse: SilentAuthorizationObservation;
  let revocationResponse: HumanAuthFunctionalStepObservation['response'];
  let revokedListed: boolean;
  try {
    const response = await revoked.browserContext.request.delete(
      `${context.endpoints.porta}/api/admin/sessions/${encodeURIComponent(revoked.sessionId)}`,
      { headers: context.adminHeaders('admin-full'), maxRedirects: 0 },
    );
    const body = await response.text();
    revocationResponse = observedResponse(
      response.status(),
      body.length === 0 ? 'empty' : null,
      hasPublicHeaders(response.headers()) ? 'admin-public' : null,
    );
    assert.equal(response.status(), 204);
    assert.equal(body.length, 0);
    revokedListed = (await activeSessionIds(context)).has(revoked.sessionId);
    assert.equal(revokedListed, false);
    revokedUse = await promptNone(context, revoked.browserContext);
    assert.equal(revokedUse.codePresent, false);
    assert.equal(revokedUse.errorPresent, true);
  } finally {
    await revoked.browser.close();
  }

  let expired: AuthenticatedBrowserSession | undefined;
  let expiredUse: SilentAuthorizationObservation | undefined;
  let expiredListed: boolean;
  try {
    const config = await context.rawRequest('PUT', '/api/admin/config/session_ttl', 'admin-full', {
      value: '1',
    });
    assert.equal(config.status, 200);
    await context.lifecycle('restart-porta');
    expired = await createBrowserSession(context);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_500));
    expiredUse = await promptNone(context, expired.browserContext);
    assert.equal(expiredUse.codePresent, false);
    assert.equal(expiredUse.errorPresent, true);
    expiredListed = (await activeSessionIds(context)).has(expired.sessionId);
    assert.equal(expiredListed, false);
  } finally {
    await expired?.browser.close();
    await context.lifecycle('reset');
  }

  if (expiredUse === undefined) throw new Error('expired-session observation is absent');
  return assembleFunctionalCaseObservation(
    requirement,
    context.endpoints.runId,
    new Map([
      [
        'anonymous-authentication-renewal-control',
        observedStep('anonymous-authentication-renewal-control', active.authenticationResponse, [
          observedState('session-cookie-renewed', 'browser-cookie-identity', {
            anonymousAbsentOrAuthenticatedDiffers:
              active.anonymousCookie === '<absent-before-authentication>' ||
              active.anonymousCookie !== active.authenticatedCookie,
          }),
          observedState('authenticated-resource-allowed', 'protected-resource-response', {
            accessAllowed: activeUse.codePresent,
          }),
        ]),
      ],
      [
        'active-session-control',
        observedStep('active-session-control', activeUse.response, [
          observedState('active-resource-allowed', 'protected-resource-response', {
            accessAllowed: activeUse.codePresent,
          }),
        ]),
      ],
      [
        'public-logout-control',
        observedStep('public-logout-control', logoutResponse, [
          observedState('client-reports-logged-out', 'spa-authentication-status', {
            authenticated: loggedOutUse.codePresent,
          }),
        ]),
      ],
      [
        'authorized-session-revoke-control',
        observedStep('authorized-session-revoke-control', revocationResponse, [
          observedState('revocation-confirmed', 'admin-api-resource-state', {
            sessionListed: revokedListed,
          }),
        ]),
      ],
      [
        'expired-session-reuse',
        observedStep('expired-session-reuse', expiredUse.response, [
          observedState('expired-authorization-denied', 'authorization-callback', {
            codePresent: expiredUse.codePresent,
          }),
          observedState('expired-session-inactive', 'admin-api-resource-state', {
            sessionListed: expiredListed,
          }),
        ]),
      ],
      [
        'logged-out-session-reuse',
        observedStep('logged-out-session-reuse', loggedOutUse.response, [
          observedState('logged-out-authorization-denied', 'authorization-callback', {
            codePresent: loggedOutUse.codePresent,
          }),
          observedState('logged-out-client-anonymous', 'spa-authentication-status', {
            authenticated: loggedOutUse.codePresent,
          }),
        ]),
      ],
      [
        'revoked-session-reuse',
        observedStep('revoked-session-reuse', revokedUse.response, [
          observedState('revoked-authorization-denied', 'authorization-callback', {
            codePresent: revokedUse.codePresent,
          }),
          observedState('revoked-session-inactive', 'admin-api-resource-state', {
            sessionListed: revokedListed,
          }),
        ]),
      ],
    ]),
  );
}
