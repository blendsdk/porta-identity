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
}

/** Public result of attempting silent authorization with an existing browser session. */
interface SilentAuthorizationObservation {
  readonly codePresent: boolean;
  readonly errorPresent: boolean;
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
    return Object.freeze({
      codePresent: result.has('code'),
      errorPresent: result.has('error'),
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
  try {
    await loggedOut.page.locator('[data-testid="logout-btn"]').click();
    await loggedOut.page.locator('button:has-text("Sign out")').click();
    await loggedOut.page.waitForURL((url) => url.origin === new URL(context.endpoints.app).origin);
    await loggedOut.page
      .locator('[data-testid="status"]')
      .filter({ hasText: 'NOT LOGGED IN' })
      .waitFor();
    loggedOutUse = await promptNone(context, loggedOut.browserContext);
    assert.equal(loggedOutUse.codePresent, false);
    assert.equal(loggedOutUse.errorPresent, true);
  } finally {
    await loggedOut.browser.close();
  }

  const revoked = await createBrowserSession(context);
  let revokedUse: SilentAuthorizationObservation;
  let revocationStatus: number;
  let revokedListed: boolean;
  try {
    const response = await context.rawRequest(
      'DELETE',
      `/api/admin/sessions/${encodeURIComponent(revoked.sessionId)}`,
      'admin-full',
    );
    revocationStatus = response.status;
    assert.equal(revocationStatus, 204);
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
        observedStep(
          'anonymous-authentication-renewal-control',
          observedResponse('redirect', 'authorization-callback', 'redirect'),
          [
            observedState('session-cookie-renewed', 'browser-cookie-identity', {
              anonymousAbsentOrAuthenticatedDiffers:
                active.anonymousCookie === '<absent-before-authentication>' ||
                active.anonymousCookie !== active.authenticatedCookie,
            }),
            observedState('authenticated-resource-allowed', 'protected-resource-response', {
              accessAllowed: activeUse.codePresent,
            }),
          ],
        ),
      ],
      [
        'active-session-control',
        observedStep(
          'active-session-control',
          observedResponse('redirect', 'authorization-callback', 'redirect'),
          [
            observedState('active-resource-allowed', 'protected-resource-response', {
              accessAllowed: activeUse.codePresent,
            }),
          ],
        ),
      ],
      [
        'public-logout-control',
        observedStep(
          'public-logout-control',
          observedResponse('redirect', 'logged-out-client', 'redirect'),
          [
            observedState('client-reports-logged-out', 'spa-authentication-status', {
              authenticated: loggedOutUse.codePresent,
            }),
          ],
        ),
      ],
      [
        'authorized-session-revoke-control',
        observedStep(
          'authorized-session-revoke-control',
          observedResponse(revocationStatus, 'empty', 'admin-public'),
          [
            observedState('revocation-confirmed', 'admin-api-resource-state', {
              sessionListed: revokedListed,
            }),
          ],
        ),
      ],
      [
        'expired-session-reuse',
        observedStep(
          'expired-session-reuse',
          observedResponse('redirect', 'authorization-error', 'redirect'),
          [
            observedState('expired-authorization-denied', 'authorization-callback', {
              codePresent: expiredUse.codePresent,
            }),
            observedState('expired-session-inactive', 'admin-api-resource-state', {
              sessionListed: expiredListed,
            }),
          ],
        ),
      ],
      [
        'logged-out-session-reuse',
        observedStep(
          'logged-out-session-reuse',
          observedResponse('redirect', 'authorization-error', 'redirect'),
          [
            observedState('logged-out-authorization-denied', 'authorization-callback', {
              codePresent: loggedOutUse.codePresent,
            }),
            observedState('logged-out-client-anonymous', 'spa-authentication-status', {
              authenticated: loggedOutUse.codePresent,
            }),
          ],
        ),
      ],
      [
        'revoked-session-reuse',
        observedStep(
          'revoked-session-reuse',
          observedResponse('redirect', 'authorization-error', 'redirect'),
          [
            observedState('revoked-authorization-denied', 'authorization-callback', {
              codePresent: revokedUse.codePresent,
            }),
            observedState('revoked-session-inactive', 'admin-api-resource-state', {
              sessionListed: revokedListed,
            }),
          ],
        ),
      ],
    ]),
  );
}
