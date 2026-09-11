import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Organization } from '../../../src/organizations/types.js';
import type { TwoFactorMethod, TwoFactorPolicy } from '../../../src/two-factor/types.js';

const boundaries = vi.hoisted(() => ({
  consumeMagicLinkSession: vi.fn(),
  getOrganizationById: vi.fn(),
  redisGet: vi.fn(),
  sendOtpCode: vi.fn(),
  sendOtpCodeEmail: vi.fn(),
}));

vi.mock('../../../src/auth/csrf.js', () => ({
  generateCsrfToken: vi.fn().mockReturnValue('csrf-token'),
  verifyCsrfToken: vi.fn().mockReturnValue(true),
  setCsrfCookie: vi.fn(),
  getCsrfFromCookie: vi.fn().mockReturnValue('csrf-token'),
}));

vi.mock('../../../src/auth/rate-limiter.js', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, retryAfter: 0 }),
  resetRateLimit: vi.fn().mockResolvedValue(undefined),
  buildLoginRateLimitKey: vi.fn().mockReturnValue('login-rate-key'),
  buildMagicLinkRateLimitKey: vi.fn().mockReturnValue('magic-link-rate-key'),
  loadLoginRateLimitConfig: vi.fn().mockResolvedValue({ maxAttempts: 5, windowSeconds: 300 }),
  loadMagicLinkRateLimitConfig: vi.fn().mockResolvedValue({ maxAttempts: 3, windowSeconds: 600 }),
}));

vi.mock('../../../src/auth/email-service.js', () => ({
  sendMagicLinkEmail: vi.fn(),
  sendOtpCodeEmail: boundaries.sendOtpCodeEmail,
}));

vi.mock('../../../src/auth/recovery-service.js', () => ({
  enqueueAccountRecovery: vi.fn(),
}));

vi.mock('../../../src/auth/i18n.js', () => ({
  resolveLocale: vi.fn().mockResolvedValue('en'),
  getTranslationFunction: vi.fn().mockReturnValue((key: string) => key),
}));

vi.mock('../../../src/auth/template-engine.js', () => ({
  renderPage: vi.fn().mockResolvedValue('<html></html>'),
}));

vi.mock('../../../src/users/service.js', () => ({
  prepareUserForPasswordLogin: vi.fn(),
  verifyLoginPassword: vi.fn(),
  recordLogin: vi.fn().mockResolvedValue(undefined),
  recordPasswordFailure: vi.fn().mockResolvedValue({ locked: false, failedCount: 1 }),
}));

vi.mock('../../../src/two-factor/service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/two-factor/service.js')>();
  return {
    ...actual,
    requiresTwoFactor: vi.fn(actual.requiresTwoFactor),
    determineTwoFactorMethod: vi.fn(actual.determineTwoFactorMethod),
    sendOtpCode: boundaries.sendOtpCode,
  };
});

vi.mock('../../../src/lib/audit-log.js', () => ({ writeAuditLog: vi.fn() }));
vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../../../src/clients/service.js', () => ({ getClientByClientId: vi.fn() }));
vi.mock('../../../src/organizations/service.js', () => ({
  getOrganizationById: boundaries.getOrganizationById,
}));
vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(() => ({ get: boundaries.redisGet })),
}));
vi.mock('../../../src/auth/magic-link-session.js', () => ({
  hasMagicLinkSession: vi.fn().mockReturnValue(true),
  consumeMagicLinkSession: boundaries.consumeMagicLinkSession,
}));
vi.mock('../../../src/oidc/postgres-adapter.js', () => ({ purgeExpired: vi.fn() }));
vi.mock('../../../src/oidc/protocol-security-observer.js', () => ({
  observeProtocolSecurityRejection: vi.fn(),
}));
vi.mock('../../../src/config/index.js', () => ({
  config: {
    issuerBaseUrl: 'https://identity.example.test',
    twoFactorEncryptionKey: 'a'.repeat(64),
  },
}));

import * as magicLinkSession from '../../../src/auth/magic-link-session.js';
import * as userService from '../../../src/users/service.js';
import { createInteractionRouter } from '../../../src/routes/interactions.js';
import * as twoFactorService from '../../../src/two-factor/service.js';

function organization(overrides: Partial<Organization> = {}): Organization {
  const timestamp = new Date('2026-01-02T03:04:05.000Z');
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Example Organization',
    slug: 'example-organization',
    status: 'active',
    isSuperAdmin: false,
    brandingLogoUrl: null,
    brandingFaviconUrl: null,
    brandingPrimaryColor: null,
    brandingCompanyName: null,
    brandingCustomCss: null,
    defaultLocale: 'en',
    twoFactorPolicy: 'optional',
    defaultLoginMethods: ['password', 'magic_link'],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function provider() {
  return {
    interactionDetails: vi.fn().mockResolvedValue({
      uid: 'interaction-uid',
      prompt: { name: 'login', reasons: [], details: {} },
      params: { client_id: 'client-id', scope: 'openid' },
      session: {},
    }),
    interactionFinished: vi.fn().mockResolvedValue(undefined),
    interactionResult: vi.fn().mockResolvedValue(undefined),
    Client: {
      find: vi.fn().mockResolvedValue({
        metadata: () => ({
          client_name: 'Example Client',
          organizationId: '00000000-0000-4000-8000-000000000001',
          'urn:porta:login_methods': ['password', 'magic_link'],
        }),
      }),
    },
  };
}

function context(org: Organization, body: Record<string, string> = {}) {
  return {
    params: { uid: 'interaction-uid' },
    query: {},
    request: { body },
    req: {},
    res: {},
    ip: '127.0.0.1',
    state: { organization: org },
    cookies: { get: vi.fn().mockReturnValue('csrf-token'), set: vi.fn() },
    get: vi.fn().mockReturnValue(''),
    set: vi.fn(),
    redirect: vi.fn(),
    status: 200,
    body: undefined,
    type: '',
  };
}

function route(router: ReturnType<typeof createInteractionRouter>, method: string, path: string) {
  return router.stack.find((layer) => layer.methods.includes(method) && layer.path === path);
}

async function execute(
  layer: NonNullable<ReturnType<typeof route>>,
  ctx: ReturnType<typeof context>,
) {
  await layer.stack[layer.stack.length - 1](ctx as never, vi.fn());
}

describe('two-factor login boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundaries.redisGet.mockResolvedValue('00000000-0000-4000-8000-000000000001');
    boundaries.getOrganizationById.mockResolvedValue(
      organization({ twoFactorPolicy: 'required_totp' }),
    );
    boundaries.consumeMagicLinkSession.mockResolvedValue({
      userId: '00000000-0000-4000-8000-000000000201',
      organizationId: '00000000-0000-4000-8000-000000000001',
      interactionUid: 'interaction-uid',
    });
    boundaries.sendOtpCode.mockResolvedValue('123456');
    vi.mocked(userService.verifyLoginPassword).mockResolvedValue(true);
  });

  // A validated, tenant-bound magic-link session is complete passwordless proof.
  it('should complete without a second-factor prompt when a valid magic-link login belongs to a TOTP-required organization', async () => {
    const oidc = provider();
    const router = createInteractionRouter(oidc as never);
    const layer = route(router, 'GET', '/interaction/:uid');
    const ctx = context(organization({ twoFactorPolicy: 'required_totp' }));

    await execute(layer!, ctx);

    expect(magicLinkSession.consumeMagicLinkSession).toHaveBeenCalledWith(ctx, {
      organizationId: '00000000-0000-4000-8000-000000000001',
      interactionUid: 'interaction-uid',
    });
    expect(oidc.interactionFinished).toHaveBeenCalledWith(
      ctx.req,
      ctx.res,
      { login: { accountId: '00000000-0000-4000-8000-000000000201' } },
      { mergeWithLastSubmission: false },
    );
    expect(oidc.interactionResult).not.toHaveBeenCalled();
    expect(twoFactorService.requiresTwoFactor).not.toHaveBeenCalled();
    expect(twoFactorService.determineTwoFactorMethod).not.toHaveBeenCalled();
    expect(boundaries.sendOtpCode).not.toHaveBeenCalled();
    expect(boundaries.sendOtpCodeEmail).not.toHaveBeenCalled();
    expect(ctx.redirect).not.toHaveBeenCalled();
  });

  const passwordScenarios: Array<{
    policy: TwoFactorPolicy;
    enabled: boolean;
    method: TwoFactorMethod | null;
    destination: 'complete' | 'setup' | 'verify';
    challengeMethod: TwoFactorMethod | null;
    sendsEmailOtp: boolean;
  }> = [
    {
      policy: 'optional',
      enabled: false,
      method: null,
      destination: 'complete',
      challengeMethod: null,
      sendsEmailOtp: false,
    },
    {
      policy: 'optional',
      enabled: true,
      method: 'email',
      destination: 'verify',
      challengeMethod: 'email',
      sendsEmailOtp: true,
    },
    {
      policy: 'required_email',
      enabled: false,
      method: null,
      destination: 'setup',
      challengeMethod: 'email',
      sendsEmailOtp: true,
    },
    {
      policy: 'required_totp',
      enabled: false,
      method: null,
      destination: 'setup',
      challengeMethod: 'totp',
      sendsEmailOtp: false,
    },
    {
      policy: 'required_any',
      enabled: false,
      method: null,
      destination: 'setup',
      challengeMethod: null,
      sendsEmailOtp: true,
    },
    {
      policy: 'required_any',
      enabled: true,
      method: 'totp',
      destination: 'verify',
      challengeMethod: 'totp',
      sendsEmailOtp: false,
    },
  ];

  // Password proof retains the established policy and enrollment-dependent challenge routing.
  it.each(passwordScenarios)(
    'should preserve the existing $destination path when password login uses $policy with enabled=$enabled and method=$method',
    async ({ policy, enabled, method, destination, challengeMethod, sendsEmailOtp }) => {
      const org = organization({ twoFactorPolicy: policy });
      const user = {
        id: '00000000-0000-4000-8000-000000000201',
        email: 'user@example.test',
        givenName: 'Example',
        familyName: 'User',
        status: 'active',
        hasPassword: true,
        twoFactorEnabled: enabled,
        twoFactorMethod: method,
      };
      vi.mocked(userService.prepareUserForPasswordLogin).mockResolvedValue(user as never);
      const oidc = provider();
      const router = createInteractionRouter(oidc as never);
      const layer = route(router, 'POST', '/interaction/:uid/login');
      const ctx = context(org, {
        email: user.email,
        password: 'valid-password',
        _csrf: 'csrf-token',
      });

      await execute(layer!, ctx);

      if (destination === 'complete') {
        expect(oidc.interactionFinished).toHaveBeenCalledWith(
          ctx.req,
          ctx.res,
          { login: { accountId: user.id } },
          { mergeWithLastSubmission: false },
        );
        expect(oidc.interactionResult).not.toHaveBeenCalled();
        expect(ctx.redirect).not.toHaveBeenCalled();
      } else {
        expect(oidc.interactionFinished).not.toHaveBeenCalled();
        expect(oidc.interactionResult).toHaveBeenCalledWith(
          ctx.req,
          ctx.res,
          {
            twoFactor: {
              pendingAccountId: user.id,
              method: challengeMethod ?? 'email',
              email: user.email,
            },
          },
          { mergeWithLastSubmission: true },
        );
        expect(ctx.redirect).toHaveBeenCalledWith(
          destination === 'verify'
            ? '/interaction/interaction-uid/two-factor'
            : '/interaction/interaction-uid/two-factor/setup',
        );
      }

      expect(boundaries.sendOtpCode).toHaveBeenCalledTimes(sendsEmailOtp ? 1 : 0);
      expect(boundaries.sendOtpCodeEmail).toHaveBeenCalledTimes(sendsEmailOtp ? 1 : 0);
    },
  );
});
