/**
 * Unit tests for two-factor authentication route handlers.
 *
 * Mocks the OIDC provider, 2FA services, and Koa context to test route
 * handler logic without real HTTP or OIDC infrastructure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../src/auth/csrf.js', () => ({
  generateCsrfToken: vi.fn().mockReturnValue('csrf-token-123'),
  verifyCsrfToken: vi.fn().mockReturnValue(true),
  setCsrfCookie: vi.fn(),
  getCsrfFromCookie: vi.fn().mockReturnValue('csrf-token-123'),
}));

vi.mock('../../../src/auth/rate-limiter.js', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  buildRateLimitKey: vi.fn().mockReturnValue('rate-key'),
}));

vi.mock('../../../src/auth/i18n.js', () => ({
  resolveLocale: vi.fn().mockResolvedValue('en'),
  getTranslationFunction: vi.fn().mockReturnValue((key: string) => key),
}));

vi.mock('../../../src/auth/template-engine.js', () => ({
  renderPage: vi.fn().mockResolvedValue('<html>rendered</html>'),
}));

vi.mock('../../../src/auth/email-service.js', () => ({
  sendOtpCodeEmail: vi.fn(),
}));

vi.mock('../../../src/users/service.js', () => ({
  recordLogin: vi.fn().mockResolvedValue(undefined),
}));

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
    recoveryCodes: ['CODE-0001'],
    totpUri: 'otpauth://totp/Test?secret=ABC&issuer=Porta',
    qrCodeDataUri: 'data:image/png;base64,abc',
  }),
  setupEmailOtp: vi.fn().mockResolvedValue({ method: 'email', recoveryCodes: ['CODE-0001'] }),
  confirmTotpSetup: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { createTwoFactorRouter } from '../../../src/routes/two-factor.js';
import { verifyCsrfToken } from '../../../src/auth/csrf.js';
import { checkRateLimit } from '../../../src/auth/rate-limiter.js';
import { renderPage } from '../../../src/auth/template-engine.js';
import { verifyOtp, verifyTotp, confirmTotpSetup } from '../../../src/two-factor/service.js';
import { recordLogin } from '../../../src/users/service.js';
import type Provider from 'oidc-provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock OIDC provider */
function createMockProvider(pendingTwoFactor: unknown = null) {
  return {
    interactionDetails: vi.fn().mockResolvedValue({
      uid: 'interaction-uid-1',
      result: pendingTwoFactor ? { twoFactor: pendingTwoFactor } : {},
    }),
    interactionFinished: vi.fn().mockResolvedValue(undefined),
    interactionResult: vi.fn().mockResolvedValue(undefined),
  } as unknown as Provider;
}

/** Standard pending 2FA state */
const PENDING_EMAIL = {
  pendingAccountId: 'user-1',
  method: 'email' as const,
  email: 'user@example.com',
};

const PENDING_TOTP = {
  pendingAccountId: 'user-1',
  method: 'totp' as const,
  email: 'user@example.com',
};

/** Create a minimal mock Koa context */
function createMockCtx(bodyOverrides: Record<string, string> = {}) {
  return {
    req: {},
    res: {},
    params: { uid: 'interaction-uid-1' },
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
        codeType: 'otp',
        _csrf: 'csrf-token-123',
        ...bodyOverrides,
      },
    },
    cookies: {
      get: vi.fn().mockReturnValue('csrf-token-123'),
      set: vi.fn(),
    },
    redirect: vi.fn(),
    get: vi.fn().mockReturnValue('en'),
    set: vi.fn(),
    status: 200,
    type: '',
    body: '',
    ip: '127.0.0.1',
  };
}

describe('two-factor routes', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('createTwoFactorRouter', () => {
    it('should create a router with routes', () => {
      const provider = createMockProvider();
      const router = createTwoFactorRouter(provider);
      expect(router).toBeDefined();
      // Should have routes registered (5 route handlers)
      expect(router.stack.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('showTwoFactor (GET)', () => {
    it('should render two-factor-verify page when pending 2FA exists', async () => {
      const provider = createMockProvider(PENDING_EMAIL);
      const router = createTwoFactorRouter(provider);

      // Find the GET /:uid/two-factor route
      const route = router.stack.find(
        (r) => r.methods.includes('GET') && r.path === '/interaction/:uid/two-factor',
      );
      expect(route).toBeDefined();

      const ctx = createMockCtx();
      await route!.stack[0](ctx as any, vi.fn());

      expect(renderPage).toHaveBeenCalledWith('two-factor-verify', expect.any(Object));
      expect(ctx.status).toBe(200);
    });

    it('should redirect when no pending 2FA exists', async () => {
      const provider = createMockProvider(null);
      const router = createTwoFactorRouter(provider);

      const route = router.stack.find(
        (r) => r.methods.includes('GET') && r.path === '/interaction/:uid/two-factor',
      );

      const ctx = createMockCtx();
      await route!.stack[0](ctx as any, vi.fn());

      expect(ctx.redirect).toHaveBeenCalled();
    });
  });

  describe('verifyTwoFactor (POST)', () => {
    it('should verify code and finish interaction on success', async () => {
      const provider = createMockProvider(PENDING_EMAIL);
      const router = createTwoFactorRouter(provider);

      const route = router.stack.find(
        (r) => r.methods.includes('POST') && r.path === '/interaction/:uid/two-factor',
      );

      const ctx = createMockCtx();
      await route!.stack[0](ctx as any, vi.fn());

      expect(verifyOtp).toHaveBeenCalledWith('user-1', '123456');
      expect(recordLogin).toHaveBeenCalledWith('user-1');
      expect((provider as any).interactionFinished).toHaveBeenCalled();
    });

    it('should render error when CSRF token is invalid', async () => {
      (verifyCsrfToken as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
      const provider = createMockProvider(PENDING_EMAIL);
      const router = createTwoFactorRouter(provider);

      const route = router.stack.find(
        (r) => r.methods.includes('POST') && r.path === '/interaction/:uid/two-factor',
      );

      const ctx = createMockCtx();
      await route!.stack[0](ctx as any, vi.fn());

      // Should render error page, not finish interaction
      expect(renderPage).toHaveBeenCalledWith('two-factor-verify', expect.objectContaining({
        flash: expect.objectContaining({ error: expect.any(String) }),
      }));
      expect((provider as any).interactionFinished).not.toHaveBeenCalled();
    });

    it('should render error when rate limited', async () => {
      (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
      const provider = createMockProvider(PENDING_EMAIL);
      const router = createTwoFactorRouter(provider);

      const route = router.stack.find(
        (r) => r.methods.includes('POST') && r.path === '/interaction/:uid/two-factor',
      );

      const ctx = createMockCtx();
      await route!.stack[0](ctx as any, vi.fn());

      expect(ctx.set).toHaveBeenCalledWith('Retry-After', '60');
    });

    it('should render error when code is empty', async () => {
      const provider = createMockProvider(PENDING_EMAIL);
      const router = createTwoFactorRouter(provider);

      const route = router.stack.find(
        (r) => r.methods.includes('POST') && r.path === '/interaction/:uid/two-factor',
      );

      const ctx = createMockCtx({ code: '' });
      await route!.stack[0](ctx as any, vi.fn());

      expect((provider as any).interactionFinished).not.toHaveBeenCalled();
    });

    it('should use verifyTotp for TOTP method', async () => {
      const provider = createMockProvider(PENDING_TOTP);
      const router = createTwoFactorRouter(provider);

      const route = router.stack.find(
        (r) => r.methods.includes('POST') && r.path === '/interaction/:uid/two-factor',
      );

      const ctx = createMockCtx({ codeType: 'totp' });
      await route!.stack[0](ctx as any, vi.fn());

      expect(verifyTotp).toHaveBeenCalledWith('user-1', '123456');
    });
  });

  describe('resendOtpCode (POST)', () => {
    it('should redirect back to two-factor page after resend', async () => {
      const provider = createMockProvider(PENDING_EMAIL);
      const router = createTwoFactorRouter(provider);

      const route = router.stack.find(
        (r) => r.methods.includes('POST') && r.path === '/interaction/:uid/two-factor/resend',
      );
      expect(route).toBeDefined();

      const ctx = createMockCtx();
      await route!.stack[0](ctx as any, vi.fn());

      expect(ctx.redirect).toHaveBeenCalledWith('/interaction/interaction-uid-1/two-factor');
    });
  });

  describe('showTwoFactorSetup (GET)', () => {
    it('should render two-factor-setup page', async () => {
      const provider = createMockProvider(PENDING_TOTP);
      const router = createTwoFactorRouter(provider);

      const route = router.stack.find(
        (r) => r.methods.includes('GET') && r.path === '/interaction/:uid/two-factor/setup',
      );
      expect(route).toBeDefined();

      const ctx = createMockCtx();
      await route!.stack[0](ctx as any, vi.fn());

      expect(renderPage).toHaveBeenCalledWith('two-factor-setup', expect.any(Object));
    });
  });

  describe('processTwoFactorSetup (POST)', () => {
    it('should confirm TOTP and finish interaction on success', async () => {
      const provider = createMockProvider(PENDING_TOTP);
      const router = createTwoFactorRouter(provider);

      const route = router.stack.find(
        (r) => r.methods.includes('POST') && r.path === '/interaction/:uid/two-factor/setup',
      );

      const ctx = createMockCtx({ setupMethod: 'totp', code: '123456' });
      await route!.stack[0](ctx as any, vi.fn());

      expect(confirmTotpSetup).toHaveBeenCalledWith('user-1', '123456');
      expect((provider as any).interactionFinished).toHaveBeenCalled();
    });

    it('should redirect with error when TOTP code is invalid', async () => {
      (confirmTotpSetup as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      const provider = createMockProvider(PENDING_TOTP);
      const router = createTwoFactorRouter(provider);

      const route = router.stack.find(
        (r) => r.methods.includes('POST') && r.path === '/interaction/:uid/two-factor/setup',
      );

      const ctx = createMockCtx({ setupMethod: 'totp', code: '000000' });
      await route!.stack[0](ctx as any, vi.fn());

      expect(ctx.redirect).toHaveBeenCalledWith(expect.stringContaining('error=invalid_code'));
    });
  });
});
