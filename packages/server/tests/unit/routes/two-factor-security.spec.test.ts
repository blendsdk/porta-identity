/**
 * Immutable security specifications for TOTP route outcomes.
 *
 * These tests describe externally observable security behavior. They must not be
 * weakened to accommodate an implementation that distinguishes invalid codes,
 * regenerates pending enrollment data, or exposes unsupported persisted state.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/auth/csrf.js', () => ({
  generateCsrfToken: vi.fn().mockReturnValue('csrf-token'),
  verifyCsrfToken: vi.fn().mockReturnValue(true),
  setCsrfCookie: vi.fn(),
  getCsrfFromCookie: vi.fn().mockReturnValue('csrf-token'),
}));

vi.mock('../../../src/auth/rate-limiter.js', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  buildRateLimitKey: vi.fn().mockReturnValue('scoped-2fa-key'),
}));

vi.mock('../../../src/auth/i18n.js', () => ({
  resolveLocale: vi.fn().mockResolvedValue('en'),
  getTranslationFunction: vi.fn().mockReturnValue((key: string) => {
    if (key.includes('invalid_code')) return 'The verification code is invalid.';
    if (key.includes('rate_limit')) return 'Too many attempts. Try again later.';
    if (key.startsWith('errors.')) {
      return 'Verification is temporarily unavailable. Contact your administrator.';
    }
    return key;
  }),
}));

vi.mock('../../../src/auth/template-engine.js', () => ({
  renderPage: vi.fn().mockResolvedValue('<html>safe rendered page</html>'),
}));

vi.mock('../../../src/auth/email-service.js', () => ({ sendOtpCodeEmail: vi.fn() }));

vi.mock('../../../src/users/service.js', () => ({ recordLogin: vi.fn() }));

vi.mock('../../../src/users/repository.js', () => ({
  findUserById: vi.fn().mockResolvedValue({ id: 'user-1', givenName: 'Test', familyName: 'User' }),
}));

vi.mock('../../../src/two-factor/service.js', () => ({
  verifyOtp: vi.fn().mockResolvedValue(true),
  verifyTotp: vi.fn().mockResolvedValue(true),
  verifyRecoveryCode: vi.fn().mockResolvedValue(true),
  sendOtpCode: vi.fn().mockResolvedValue('123456'),
  setupTotp: vi.fn().mockResolvedValue({
    method: 'totp',
    recoveryCodes: ['NEW-RECOVERY-CODE'],
    totpUri: 'otpauth://new-setup',
    qrCodeDataUri: 'data:image/png;base64,new-setup',
  }),
  getPendingTotpSetupInfo: vi.fn().mockResolvedValue(null),
  setupEmailOtp: vi.fn().mockResolvedValue({
    method: 'email',
    recoveryCodes: ['EMAIL-RECOVERY-CODE'],
  }),
  confirmTotpSetup: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/routes/interactions.js', () => ({
  resolveOrganizationForInteraction: vi.fn().mockResolvedValue(undefined),
}));

import type Provider from 'oidc-provider';
import { checkRateLimit, buildRateLimitKey } from '../../../src/auth/rate-limiter.js';
import { renderPage } from '../../../src/auth/template-engine.js';
import { logger } from '../../../src/lib/logger.js';
import { resolveOrganizationForInteraction } from '../../../src/routes/interactions.js';
import { createTwoFactorRouter } from '../../../src/routes/two-factor.js';
import {
  confirmTotpSetup,
  getPendingTotpSetupInfo,
  setupEmailOtp,
  setupTotp,
  verifyTotp,
} from '../../../src/two-factor/service.js';
import { UnsupportedTotpConfigurationError } from '../../../src/two-factor/index.js';

const PENDING_TOTP = {
  pendingAccountId: 'user-1',
  method: 'totp' as const,
  email: 'user@example.com',
};

const PENDING_SETUP = {
  totpUri: 'otpauth://totp/Porta:user?secret=PENDING-SECRET',
  qrCodeDataUri: 'data:image/png;base64,pending-qr',
  totpSecret: 'PENDING-SECRET',
};

/** Create an OIDC provider double containing one pending two-factor interaction. */
function createMockProvider(pendingTwoFactor: unknown = PENDING_TOTP) {
  return {
    interactionDetails: vi.fn().mockResolvedValue({
      uid: 'interaction-uid-1',
      params: { client_id: 'client-1' },
      result: { twoFactor: pendingTwoFactor },
    }),
    interactionFinished: vi.fn().mockResolvedValue(undefined),
    interactionResult: vi.fn().mockResolvedValue(undefined),
  } as unknown as Provider;
}

/** Create the smallest Koa context needed to submit a two-factor form. */
function createMockCtx(bodyOverrides: Record<string, string> = {}) {
  return {
    req: {},
    res: {},
    params: { uid: 'interaction-uid-1' },
    query: {},
    state: {
      organization: {
        id: 'org-1',
        name: 'Acme',
        slug: 'acme',
        defaultLocale: 'en',
        brandingLogoUrl: null,
        brandingFaviconUrl: null,
        brandingPrimaryColor: '#3B82F6',
        brandingCompanyName: 'Acme',
        brandingCustomCss: null,
        twoFactorPolicy: 'optional',
      },
    },
    request: {
      body: {
        code: '123456',
        codeType: 'totp',
        setupMethod: 'totp',
        _csrf: 'csrf-token',
        ...bodyOverrides,
      },
    },
    cookies: { get: vi.fn().mockReturnValue('csrf-token'), set: vi.fn() },
    redirect: vi.fn(),
    get: vi.fn().mockReturnValue('en'),
    set: vi.fn(),
    status: 200,
    type: '',
    body: '',
    ip: '127.0.0.1',
  };
}

/** Locate a registered POST route in the router under test. */
function findRoute(provider: Provider, path: string) {
  const router = createTwoFactorRouter(provider);
  const route = router.stack.find((candidate) => {
    return candidate.methods.includes('POST') && candidate.path === path;
  });
  expect(route).toBeDefined();
  return route!;
}

/** Submit a TOTP login verification and return the observable route state. */
async function submitVerification(code: string) {
  const provider = createMockProvider();
  const route = findRoute(provider, '/interaction/:uid/two-factor');
  const ctx = createMockCtx({ code, codeType: 'totp' });
  await route.stack[0](ctx as never, vi.fn());
  return { ctx, provider };
}

/** Submit a TOTP enrollment confirmation and return the observable route state. */
async function submitEnrollment(bodyOverrides: Record<string, string> = {}) {
  const provider = createMockProvider();
  const route = findRoute(provider, '/interaction/:uid/two-factor/setup');
  const ctx = createMockCtx(bodyOverrides);
  await route.stack[0](ctx as never, vi.fn());
  return { ctx, provider };
}

/** Return the template context from the most recent render. */
function lastRenderedData(): Record<string, unknown> {
  const calls = vi.mocked(renderPage).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls.at(-1)![1] as Record<string, unknown>;
}

/** Serialize every structured logger call for disclosure assertions. */
function allLoggerOutput(): string {
  return JSON.stringify([
    ...vi.mocked(logger.info).mock.calls,
    ...vi.mocked(logger.debug).mock.calls,
    ...vi.mocked(logger.warn).mock.calls,
    ...vi.mocked(logger.error).mock.calls,
  ]);
}

describe('TOTP route security specifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(buildRateLimitKey).mockReturnValue('scoped-2fa-key');
    vi.mocked(verifyTotp).mockResolvedValue(true);
    vi.mocked(confirmTotpSetup).mockResolvedValue(true);
    vi.mocked(getPendingTotpSetupInfo).mockResolvedValue(null);
  });

  it.each([
    ['malformed', 'not-a-code'],
    ['mismatched', '000000'],
    ['expired or replayed', '123456'],
  ])('presents the same localized invalid-code result for %s TOTP input', async (_kind, code) => {
    vi.mocked(verifyTotp).mockResolvedValue(false);

    const { provider } = await submitVerification(code);

    expect(renderPage).toHaveBeenCalledWith(
      'two-factor-verify',
      expect.objectContaining({
        flash: expect.objectContaining({ error: 'The verification code is invalid.' }),
      }),
    );
    expect(provider.interactionFinished).not.toHaveBeenCalled();
  });

  it('does not retry a TOTP verification after an invalid or replayed consume result', async () => {
    vi.mocked(verifyTotp).mockResolvedValue(false);

    await submitVerification('123456');

    expect(verifyTotp).toHaveBeenCalledTimes(1);
    expect(verifyTotp).toHaveBeenCalledWith('user-1', '123456');
  });

  it('keeps enrollment CAS loss on the existing invalid-code path without retrying', async () => {
    vi.mocked(confirmTotpSetup).mockResolvedValue(false);

    const { ctx, provider } = await submitEnrollment({ code: '123456' });

    expect(confirmTotpSetup).toHaveBeenCalledTimes(1);
    expect(confirmTotpSetup).toHaveBeenCalledWith('user-1', '123456');
    expect(ctx.redirect).toHaveBeenCalledWith(expect.stringContaining('error=invalid_code'));
    expect(provider.interactionFinished).not.toHaveBeenCalled();
  });

  it('applies the existing organization/user verification budget to TOTP enrollment', async () => {
    await submitEnrollment();

    expect(resolveOrganizationForInteraction).toHaveBeenCalled();
    expect(buildRateLimitKey).toHaveBeenCalledWith('2fa_verify', 'org-1', 'user-1');
    expect(checkRateLimit).toHaveBeenCalledWith('scoped-2fa-key', expect.any(Object));
    expect(confirmTotpSetup).toHaveBeenCalledTimes(1);
  });

  it('returns from email enrollment before consuming the TOTP verification budget', async () => {
    await submitEnrollment({ setupMethod: 'email', code: '' });

    expect(setupEmailOtp).toHaveBeenCalledWith('user-1', 'org-1');
    expect(buildRateLimitKey).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(confirmTotpSetup).not.toHaveBeenCalled();
  });

  it('re-renders an exhausted enrollment with Retry-After and the stored pending setup', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfter: 47 });
    vi.mocked(getPendingTotpSetupInfo).mockResolvedValue(PENDING_SETUP);

    const { ctx, provider } = await submitEnrollment();

    expect(ctx.status).toBe(429);
    expect(ctx.set).toHaveBeenCalledWith('Retry-After', '47');
    expect(renderPage).toHaveBeenCalledWith('two-factor-setup', expect.any(Object));
    expect(JSON.stringify(lastRenderedData())).toContain(PENDING_SETUP.qrCodeDataUri);
    expect(JSON.stringify(lastRenderedData())).toContain(PENDING_SETUP.totpSecret);
    expect(getPendingTotpSetupInfo).toHaveBeenCalledWith('user-1', 'user@example.com', 'acme');
    expect(setupTotp).not.toHaveBeenCalled();
    expect(setupEmailOtp).not.toHaveBeenCalled();
    expect(confirmTotpSetup).not.toHaveBeenCalled();
    expect(provider.interactionFinished).not.toHaveBeenCalled();
  });

  it('maps unsupported stored parameters during login to a generic existing-page 503', async () => {
    const unsupported = new UnsupportedTotpConfigurationError();
    Object.assign(unsupported, {
      algorithm: 'SHA512-SENSITIVE',
      digits: 8,
      period: 90,
      secret: 'LOGIN-SECRET',
      code: '654321',
      timeStep: 123456,
      ciphertext: 'LOGIN-CIPHERTEXT',
      iv: 'LOGIN-IV',
      tag: 'LOGIN-TAG',
      sql: 'SELECT sensitive_login_state',
      path: '/private/login/path',
    });
    unsupported.stack = 'SENSITIVE LOGIN STACK';
    vi.mocked(verifyTotp).mockRejectedValue(unsupported);

    const { ctx, provider } = await submitVerification('654321');

    expect(ctx.status).toBe(503);
    expect(renderPage).toHaveBeenCalledWith('two-factor-verify', expect.any(Object));
    expect(JSON.stringify(lastRenderedData()).toLowerCase()).toEqual(
      expect.stringContaining('unavailable'),
    );
    expect(JSON.stringify(lastRenderedData()).toLowerCase()).toEqual(
      expect.stringContaining('administrator'),
    );
    expect(provider.interactionFinished).not.toHaveBeenCalled();
  });

  it('maps unsupported stored parameters during enrollment to the same generic 503 and pending data', async () => {
    vi.mocked(getPendingTotpSetupInfo).mockResolvedValue(PENDING_SETUP);
    vi.mocked(confirmTotpSetup).mockRejectedValue(new UnsupportedTotpConfigurationError());

    const { ctx, provider } = await submitEnrollment();

    expect(ctx.status).toBe(503);
    expect(renderPage).toHaveBeenCalledWith('two-factor-setup', expect.any(Object));
    const rendered = JSON.stringify(lastRenderedData());
    expect(rendered.toLowerCase()).toEqual(expect.stringContaining('unavailable'));
    expect(rendered.toLowerCase()).toEqual(expect.stringContaining('administrator'));
    expect(rendered).toContain(PENDING_SETUP.qrCodeDataUri);
    expect(rendered).toContain(PENDING_SETUP.totpSecret);
    expect(getPendingTotpSetupInfo).toHaveBeenCalledWith('user-1', 'user@example.com', 'acme');
    expect(setupTotp).not.toHaveBeenCalled();
    expect(setupEmailOtp).not.toHaveBeenCalled();
    expect(provider.interactionFinished).not.toHaveBeenCalled();
  });

  it('emits only the fixed unsupported-configuration event without sensitive state', async () => {
    const unsupported = new UnsupportedTotpConfigurationError();
    Object.assign(unsupported, {
      algorithm: 'SHA512-SENSITIVE',
      digits: 8,
      period: 90,
      secret: 'AUDIT-SECRET',
      code: '987654',
      timeStep: 987654321,
      ciphertext: 'AUDIT-CIPHERTEXT',
      iv: 'AUDIT-IV',
      tag: 'AUDIT-TAG',
      sql: 'UPDATE user_totp SET sensitive = true',
      path: '/private/server/path',
    });
    unsupported.stack = 'SENSITIVE AUDIT STACK';
    vi.mocked(verifyTotp).mockRejectedValue(unsupported);

    const { ctx } = await submitVerification('987654');

    const publicAndDiagnosticOutput = JSON.stringify({
      response: ctx.body,
      render: vi.mocked(renderPage).mock.calls,
      logs: allLoggerOutput(),
    });
    expect(allLoggerOutput()).toContain('totp-configuration-unsupported');
    expect(allLoggerOutput()).not.toMatch(/"(algorithm|digits|period|secret|code|timeStep)"/);
    expect(allLoggerOutput()).not.toMatch(/"(ciphertext|iv|tag|error|stack|sql|path)"/);
    for (const forbidden of [
      'SHA512-SENSITIVE',
      'AUDIT-SECRET',
      '987654',
      '987654321',
      'AUDIT-CIPHERTEXT',
      'AUDIT-IV',
      'AUDIT-TAG',
      'SENSITIVE AUDIT STACK',
      'UPDATE user_totp',
      '/private/server/path',
    ]) {
      expect(publicAndDiagnosticOutput).not.toContain(forbidden);
    }
  });
});
