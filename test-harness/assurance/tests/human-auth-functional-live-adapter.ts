import assert from 'node:assert/strict';

import { chromium } from '@playwright/test';
import { z } from 'zod';

import { LiveTenantAdminContext } from './tenant-admin-live-context.js';
import { functionalAuthorizationUrl } from './human-auth-functional-authorization.js';
import {
  assembleFunctionalCaseObservation,
  observedFunctionalResponse as observedResponse,
  observedFunctionalState as observedState,
  observedFunctionalStep as observedStep,
} from './human-auth-functional-observations.js';
import { observeFunctionalSessions } from './human-auth-functional-session.js';

import type {
  CreateHumanAuthFunctionalContract,
  HumanAuthFunctionalCaseObservation,
  HumanAuthFunctionalCaseRequirement,
  HumanAuthFunctionalStepObservation,
} from './human-auth-functional-contract.js';

const mailInventorySchema = z.object({ total: z.number().int().nonnegative() }).passthrough();

interface PasswordAttempt {
  readonly accepted: boolean;
  readonly response: HumanAuthFunctionalStepObservation['response'];
}

interface PasswordlessAttempt {
  readonly response: HumanAuthFunctionalStepObservation['response'];
  readonly delivered: boolean;
}

interface RecoveryAttempt {
  readonly response: HumanAuthFunctionalStepObservation['response'];
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
    await page.goto(functionalAuthorizationUrl(context, 'login'), {
      waitUntil: 'domcontentloaded',
    });
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
      const headers = raw.headers();
      return Object.freeze({
        accepted: false,
        response: observedResponse(
          raw.status(),
          raw.status() === 403 ? 'method-disabled' : null,
          hasPublicSecurityHeaders(headers) ? 'login-public' : null,
        ),
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
    const accepted = callback && new URL(page.url()).searchParams.has('code');
    const rejectedFormVisible = await page
      .locator('input#email')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    const bodySchemaId = accepted
      ? 'authorization-callback'
      : status === 403
        ? 'method-disabled'
        : status === 429
          ? 'public-throttled'
          : rejectedFormVisible
            ? 'generic-login-rejection'
            : null;
    const headerSetId = accepted
      ? 'redirect'
      : status === 429
        ? headers['retry-after'] === undefined || !hasPublicSecurityHeaders(headers)
          ? null
          : 'retry-after'
        : hasPublicSecurityHeaders(headers)
          ? 'login-public'
          : null;
    return Object.freeze({
      accepted,
      response: observedResponse(accepted ? 'redirect' : status, bodySchemaId, headerSetId),
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
): Promise<RecoveryAttempt> {
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
    const successVisible = await page
      .locator('.flash-success')
      .isVisible({ timeout: 1_000 })
      .catch(() => false);
    const headers = response?.headers() ?? {};
    return Object.freeze({
      response: observedResponse(
        response?.status() ?? 0,
        successVisible ? 'generic-recovery' : null,
        hasPublicSecurityHeaders(headers) ? 'recovery-public' : null,
      ),
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
): Promise<PasswordlessAttempt> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.goto(functionalAuthorizationUrl(context, 'login'), {
      waitUntil: 'domcontentloaded',
    });
    const email = 'alpha-user-active@test-harness.local';
    let status = 0;
    let headers: Readonly<Record<string, string>> = {};
    let responseBodySchemaObserved = false;
    if (enabled) {
      await page.locator('input#email').fill(email);
      const [response] = await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.locator('#magic-link-btn').click(),
      ]);
      status = response?.status() ?? 0;
      headers = response?.headers() ?? {};
      responseBodySchemaObserved = await page
        .locator('a[href^="/interaction/"]')
        .isVisible({ timeout: 1_000 })
        .catch(() => false);
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
      headers = response.headers();
      responseBodySchemaObserved = /class=["']flash-error["']/u.test(await response.text());
    }
    await waitForMailDelta(context, 0, enabled ? 1 : 0);
    const delivered = (await mailCount(context)) === 1;
    return Object.freeze({
      response: observedResponse(
        status,
        responseBodySchemaObserved ? (enabled ? 'generic-delivery' : 'method-disabled') : null,
        hasPublicSecurityHeaders(headers) ? 'passwordless-public' : null,
      ),
      delivered,
    });
  } finally {
    await browser.close();
  }
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
  assert.deepEqual(existing.response, absent.response);

  const recoveryBefore = await mailCount(context);
  const recoveryExisting = await recoveryRequest(context, 'alpha-user-active@test-harness.local');
  await waitForMailDelta(context, recoveryBefore, 1);
  const recoveryAfter = await mailCount(context);
  const recoveryAbsent = await recoveryRequest(context, 'absent-user@test-harness.local');
  await waitForMailDelta(context, recoveryAfter, 0);
  assert.deepEqual(recoveryAbsent, recoveryExisting);

  return assembleFunctionalCaseObservation(
    requirement,
    context.endpoints.runId,
    new Map([
      [
        'existing-valid-login-control',
        observedStep('existing-valid-login-control', control.response, [
          observedState('callback-code-issued', 'authorization-callback', {
            codePresent: control.accepted,
          }),
          observedState('spa-authenticated', 'spa-authentication-status', {
            authenticated: control.accepted,
          }),
        ]),
      ],
      [
        'existing-recovery-control',
        observedStep('existing-recovery-control', recoveryExisting.response, [
          observedState('intended-mailbox-delivery', 'synthetic-mailbox-cardinality', {
            deliveryDelta: recoveryAfter - recoveryBefore,
          }),
        ]),
      ],
      [
        'existing-invalid-login',
        observedStep('existing-invalid-login', existing.response, [
          observedState('callback-code-absent', 'authorization-callback', {
            codePresent: existing.accepted,
          }),
          observedState('spa-remains-anonymous', 'spa-authentication-status', {
            authenticated: existing.accepted,
          }),
        ]),
      ],
      [
        'absent-invalid-login',
        observedStep('absent-invalid-login', absent.response, [
          observedState('callback-code-absent', 'authorization-callback', {
            codePresent: absent.accepted,
          }),
          observedState('spa-remains-anonymous', 'spa-authentication-status', {
            authenticated: absent.accepted,
          }),
        ]),
      ],
      [
        'absent-recovery-request',
        observedStep('absent-recovery-request', recoveryAbsent.response, [
          observedState('absent-mailbox-nondelivery', 'synthetic-mailbox-cardinality', {
            deliveryDelta: (await mailCount(context)) - recoveryAfter,
          }),
        ]),
      ],
    ]),
  );
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
    assert.equal(disabledPassword.response.status, 403);

    await setLoginMethods(context, ['password']);
    await clearMail(context);
    const disabledMagic = await passwordlessAttempt(context, false);
    assert.equal(disabledMagic.response.status, 403);
    assert.equal(disabledMagic.delivered, false);

    let finalFailed: PasswordAttempt | undefined;
    const enumerationPassword = context.credential('credential:alpha:password:enumeration');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      finalFailed = await passwordAttempt(
        context,
        'alpha-user-enumeration@test-harness.local',
        `${enumerationPassword}-invalid`,
      );
      assert.equal(finalFailed.accepted, false);
    }
    if (finalFailed === undefined) throw new Error('failed-login observation is absent');
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

    let throttledAttempt: PasswordAttempt | undefined;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const equivalentEmail =
        attempt % 2 === 0 ? 'ABSENT-RATE@test-harness.local ' : 'absent-rate@test-harness.local';
      const result = await passwordAttempt(context, equivalentEmail, `${activePassword}-invalid`);
      if (result.response.status === 429) {
        throttledAttempt = result;
        break;
      }
    }
    if (throttledAttempt === undefined) throw new Error('equivalent-key throttle was not observed');

    return assembleFunctionalCaseObservation(
      requirement,
      context.endpoints.runId,
      new Map([
        [
          'enabled-password-control',
          observedStep('enabled-password-control', activeControl.response, [
            observedState('callback-code-issued', 'authorization-callback', {
              codePresent: activeControl.accepted,
            }),
            observedState('spa-authenticated', 'spa-authentication-status', {
              authenticated: activeControl.accepted,
            }),
          ]),
        ],
        [
          'enabled-passwordless-control',
          observedStep('enabled-passwordless-control', enabledMagic.response, [
            observedState('enabled-method-delivery', 'synthetic-mailbox-cardinality', {
              deliveryDelta: enabledMagic.delivered ? 1 : 0,
            }),
          ]),
        ],
        [
          'disabled-password-login',
          observedStep('disabled-password-login', disabledPassword.response, [
            observedState('callback-code-absent', 'authorization-callback', {
              codePresent: disabledPassword.accepted,
            }),
            observedState('spa-remains-anonymous', 'spa-authentication-status', {
              authenticated: disabledPassword.accepted,
            }),
          ]),
        ],
        [
          'disabled-passwordless-login',
          observedStep('disabled-passwordless-login', disabledMagic.response, [
            observedState('disabled-method-nondelivery', 'synthetic-mailbox-cardinality', {
              deliveryDelta: disabledMagic.delivered ? 1 : 0,
            }),
          ]),
        ],
        [
          'failed-login-tracking',
          observedStep('failed-login-tracking', finalFailed.response, [
            observedState('subsequent-valid-login-locked', 'authorization-callback', {
              codePresent: lockedAfterFailures.accepted,
              submittedCredential: 'valid',
            }),
          ]),
        ],
        [
          'prelocked-account-login',
          observedStep('prelocked-account-login', prelocked.response, [
            observedState('callback-code-absent', 'authorization-callback', {
              codePresent: prelocked.accepted,
            }),
            observedState('spa-remains-anonymous', 'spa-authentication-status', {
              authenticated: prelocked.accepted,
            }),
          ]),
        ],
        [
          'equivalent-key-rate-limit',
          observedStep('equivalent-key-rate-limit', throttledAttempt.response, [
            observedState('callback-code-absent', 'authorization-callback', {
              codePresent: throttledAttempt.accepted,
            }),
            observedState('spa-remains-anonymous', 'spa-authentication-status', {
              authenticated: throttledAttempt.accepted,
            }),
          ]),
        ],
      ]),
    );
  } finally {
    await setLoginMethods(context, ['password', 'magic_link']);
  }
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
      if (requirement.sentinelId === 'ST-44') {
        return observeFunctionalSessions(context, requirement);
      }
      throw new Error('unsupported functional human-auth sentinel');
    },
  });
};
