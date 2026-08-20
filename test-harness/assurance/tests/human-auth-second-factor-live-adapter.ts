import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { z } from 'zod';

import {
  independentTotpValue,
  pollForExactHumanAuthMailValue,
} from './human-auth-live-observers.js';
import { LiveTenantAdminContext } from './tenant-admin-live-context.js';

import type {
  CreateSecondFactorContract,
  SecondFactorAttemptObservation,
  SecondFactorJourneyId,
  SecondFactorJourneyObservation,
} from './human-auth-second-factor-contract.js';

const mailSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      Content: z.object({ Body: z.string().optional() }).optional(),
      Raw: z.object({ Data: z.string().optional() }).optional(),
    }),
  ),
});

interface PendingSecondFactor {
  readonly browser: Browser;
  readonly browserContext: BrowserContext;
  readonly page: Page;
}

/** Builds a secret-free attempt result. */
function attempt(
  id: string,
  result: SecondFactorAttemptObservation['result'],
  authorizationCompleted: boolean,
  remainingRecoveryCodes: number | null = null,
): SecondFactorAttemptObservation {
  return Object.freeze({ id, result, authorizationCompleted, remainingRecoveryCodes });
}

/** Clears the owned synthetic mailbox and proves no older code remains. */
async function clearMail(context: LiveTenantAdminContext): Promise<void> {
  const response = await fetch(`${context.endpoints.mailhog}/api/v1/messages`, {
    method: 'DELETE',
  });
  if (!response.ok || (await readMail(context)).total !== 0) {
    throw new Error('second-factor mailbox clear failed');
  }
}

/** Reads the bounded synthetic mailbox. */
async function readMail(context: LiveTenantAdminContext): Promise<z.infer<typeof mailSchema>> {
  const response = await fetch(`${context.endpoints.mailhog}/api/v2/messages`);
  if (!response.ok) throw new Error('second-factor mailbox is unavailable');
  return mailSchema.parse(await response.json());
}

/** Extracts exactly one delivered six-digit code only into transient memory. */
async function waitForOtp(context: LiveTenantAdminContext): Promise<string> {
  const result = await pollForExactHumanAuthMailValue({
    timeoutMilliseconds: 10_000,
    intervalMilliseconds: 200,
    read: async () => {
      const inventory = await readMail(context);
      return {
        count: inventory.total,
        bodies: inventory.items.map((entry) => entry.Content?.Body ?? entry.Raw?.Data ?? ''),
      };
    },
    extract: (body) => [...body.matchAll(/\b(\d{6})\b/gu)].flatMap((match) => match[1] ?? []),
  });
  return result.value;
}

/** Starts a password login and stops at the public second-factor page. */
async function pendingLogin(
  context: LiveTenantAdminContext,
  email: string,
  password: string,
): Promise<PendingSecondFactor> {
  const browser = await chromium.launch({ headless: true });
  try {
    const browserContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await browserContext.newPage();
    await page.goto(context.endpoints.app);
    await page.locator('[data-testid="login-btn"]').click();
    await page.locator('input#email').fill(email);
    await page.locator('input#password').fill(password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator('form[action$="/login"] button[type="submit"]').click(),
    ]);
    await page.waitForURL(/\/interaction\/[^/]+\/two-factor(?:\/setup)?/u, { timeout: 10_000 });
    return Object.freeze({ browser, browserContext, page });
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/** Submits one verification value and distinguishes callback completion from public rejection. */
async function submitCode(
  pending: PendingSecondFactor,
  code: string,
  recovery: boolean,
): Promise<boolean> {
  if (recovery) await pending.page.locator('#use-recovery-btn').click();
  await pending.page.locator('#code').fill(code);
  await pending.page.locator('#verify-form button[type="submit"]').click();
  await pending.page.waitForLoadState('domcontentloaded');
  if ((await pending.page.locator('button:has-text("Allow access")').count()) > 0) {
    await pending.page.locator('button:has-text("Allow access")').click();
    await pending.page.waitForLoadState('domcontentloaded');
  }
  const url = new URL(pending.page.url());
  return url.searchParams.has('code') && !url.pathname.includes('/two-factor');
}

/** Reads remaining recovery-code count through the authenticated administration API. */
async function recoveryCount(context: LiveTenantAdminContext): Promise<number> {
  const response = await context.rawRequest(
    'GET',
    `/api/admin/organizations/${context.entity('alpha')}/users/${context.entity('alpha-user-two-factor')}/two-factor/status`,
    'admin-full',
  );
  if (response.status !== 200) throw new Error('second-factor status observer failed');
  return z
    .object({ data: z.object({ recoveryCodesRemaining: z.number().int().nonnegative() }) })
    .parse(response.body).data.recoveryCodesRemaining;
}

/** Runs the email OTP first-use and same-value rejection journey. */
async function observeEmailOtp(
  context: LiveTenantAdminContext,
): Promise<readonly SecondFactorAttemptObservation[]> {
  await context.lifecycle('reset');
  await clearMail(context);
  const policy = await context.rawRequest(
    'PUT',
    `/api/admin/organizations/${context.entity('alpha')}/two-factor/policy`,
    'admin-full',
    { twoFactorPolicy: 'required_email' },
  );
  if (policy.status !== 200) throw new Error('email second-factor policy control failed');
  const password = context.credential('credential:alpha:password:active');
  const first = await pendingLogin(context, 'alpha-user-active@test-harness.local', password);
  try {
    if (!first.page.url().endsWith('/two-factor/setup')) {
      throw new Error('email second-factor setup boundary was not reached');
    }
    await first.page.locator('input[name="setupMethod"][value="email"] + button').click();
    await first.page.waitForURL(/\/two-factor$/u);
    let firstCode = await waitForOtp(context);
    const firstAccepted = await submitCode(first, firstCode, false);
    if (!firstAccepted) throw new Error('email OTP positive control failed');

    await clearMail(context);
    const replay = await pendingLogin(context, 'alpha-user-active@test-harness.local', password);
    try {
      const freshCode = await waitForOtp(context);
      const replayAccepted = await submitCode(replay, firstCode, false);
      if (replayAccepted) throw new Error('consumed email OTP was accepted again');
      const freshAccepted = await submitCode(replay, freshCode, false);
      if (!freshAccepted) throw new Error('fresh email OTP recovery control failed');
      return Object.freeze([
        attempt('email-otp-first-use', 'accepted', true),
        attempt('email-otp-same-value-second-use', 'rejected', false),
        attempt('email-otp-fresh-value-recovery', 'accepted', true),
      ]);
    } finally {
      await replay.browser.close();
      firstCode = '';
    }
  } finally {
    await first.browser.close();
    await clearMail(context);
  }
}

/** Runs valid and invalid-window TOTP enforcement checks. */
async function observeTotp(
  context: LiveTenantAdminContext,
): Promise<readonly SecondFactorAttemptObservation[]> {
  await context.lifecycle('reset');
  const password = context.credential('credential:alpha:password:two-factor');
  const secret = context.credential('credential:alpha:totp:two-factor');
  const wrongSecret = context.credential('credential:bravo:totp:two-factor');
  const attempts: SecondFactorAttemptObservation[] = [];
  for (const [id, code, expected] of [
    ['totp-wrong-account', independentTotpValue(wrongSecret, Date.now()), false],
    ['totp-expired-window', independentTotpValue(secret, Date.now() - 120_000), false],
    ['totp-current-window', independentTotpValue(secret, Date.now()), true],
  ] as const) {
    const pending = await pendingLogin(
      context,
      'alpha-user-two-factor@test-harness.local',
      password,
    );
    try {
      const accepted = await submitCode(pending, code, false);
      if (accepted !== expected) throw new Error('TOTP enforcement result differed from contract');
      attempts.push(attempt(id, accepted ? 'accepted' : 'rejected', accepted));
    } finally {
      await pending.browser.close();
    }
  }
  return Object.freeze(attempts);
}

/** Runs recovery-code first-use, exact reuse rejection, and fresh-code recovery. */
async function observeRecoveryCode(
  context: LiveTenantAdminContext,
): Promise<readonly SecondFactorAttemptObservation[]> {
  await context.lifecycle('reset');
  const password = context.credential('credential:alpha:password:two-factor');
  const codes = context
    .credential('credential:alpha:recovery:two-factor')
    .split('\n')
    .filter(Boolean);
  const firstCode = codes[0];
  const secondCode = codes[1];
  if (firstCode === undefined || secondCode === undefined) {
    throw new Error('recovery-code fixture does not contain two values');
  }
  const before = await recoveryCount(context);
  const first = await pendingLogin(context, 'alpha-user-two-factor@test-harness.local', password);
  try {
    if (!(await submitCode(first, firstCode, true))) {
      throw new Error('recovery-code positive control failed');
    }
  } finally {
    await first.browser.close();
  }
  const afterFirst = await recoveryCount(context);
  if (afterFirst !== before - 1) throw new Error('recovery-code consumption was not observed');

  const replay = await pendingLogin(context, 'alpha-user-two-factor@test-harness.local', password);
  try {
    if (await submitCode(replay, firstCode, true)) {
      throw new Error('consumed recovery code was accepted again');
    }
    const afterReplay = await recoveryCount(context);
    if (afterReplay !== afterFirst)
      throw new Error('rejected recovery code changed protected state');
    if (!(await submitCode(replay, secondCode, true))) {
      throw new Error('unused recovery-code recovery control failed');
    }
    return Object.freeze([
      attempt('recovery-code-first-use', 'accepted', true, afterFirst),
      attempt('recovery-code-same-value-second-use', 'rejected', false, afterReplay),
      attempt('recovery-code-unused-value', 'accepted', true, afterReplay - 1),
    ]);
  } finally {
    await replay.browser.close();
    codes.fill('');
  }
}

/** Executes one public second-factor family and always restores deterministic fixtures. */
async function observeJourney(
  context: LiveTenantAdminContext,
  id: SecondFactorJourneyId,
): Promise<SecondFactorJourneyObservation> {
  try {
    const attempts =
      id === 'email-otp'
        ? await observeEmailOtp(context)
        : id === 'totp'
          ? await observeTotp(context)
          : await observeRecoveryCode(context);
    return Object.freeze({
      id,
      runId: context.endpoints.runId,
      attempts,
      secretRetained: false,
      cleanupCompleted: true,
    });
  } finally {
    await clearMail(context);
    await context.lifecycle('reset');
  }
}

/** Creates the owner-fenced public second-factor adapter. */
export const createSecondFactorContract: CreateSecondFactorContract = (input) => {
  if (!input.projectAdmitted || input.profile !== 'production-security') {
    throw new Error('second-factor evidence is not admitted');
  }
  const context = new LiveTenantAdminContext();
  if (
    input.runId !== context.endpoints.runId ||
    input.fixtureManifestPath !== context.endpoints.fixtureManifestPath ||
    input.protectedCredentialsPath !== context.endpoints.credentialManifestPath
  ) {
    throw new Error('second-factor context differs from the active owned run');
  }
  return Object.freeze({
    observeJourney: (id: SecondFactorJourneyId) => observeJourney(context, id),
  });
};
