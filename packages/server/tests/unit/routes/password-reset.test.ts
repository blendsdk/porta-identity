/**
 * Unit tests for password reset route handlers.
 *
 * Tests the forgot-password and reset-password flows:
 *   - showForgotPassword: form rendering
 *   - processForgotPassword: CSRF, rate limiting, enumeration prevention
 *   - showResetPassword: token validation
 *   - processResetPassword: CSRF, token re-validation, password validation
 *   - router structure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../src/auth/csrf.js', () => ({
  generateCsrfToken: vi.fn().mockReturnValue('csrf-token-abc'),
  verifyCsrfToken: vi.fn().mockReturnValue(true),
  setCsrfCookie: vi.fn(),
  getCsrfFromCookie: vi.fn().mockReturnValue('csrf-token-abc'),
}));

vi.mock('../../../src/auth/rate-limiter.js', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, retryAfter: 0 }),
  buildPasswordResetRateLimitKey: vi.fn().mockReturnValue('rl:reset:org:email'),
  loadPasswordResetRateLimitConfig: vi.fn().mockResolvedValue({ maxAttempts: 5, windowSeconds: 600 }),
}));

vi.mock('../../../src/auth/tokens.js', () => ({
  generateToken: vi.fn().mockReturnValue({ plaintext: 'token-plain-123', hash: 'token-hash-abc' }),
  hashToken: vi.fn().mockReturnValue('hashed-token-abc'),
}));

vi.mock('../../../src/auth/token-repository.js', () => ({
  insertToken: vi.fn().mockResolvedValue(undefined),
  findValidToken: vi.fn(),
  markTokenUsed: vi.fn().mockResolvedValue(undefined),
  invalidateUserTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/auth/email-service.js', () => ({
  sendPasswordResetEmail: vi.fn(),
  sendPasswordChangedEmail: vi.fn(),
}));

vi.mock('../../../src/auth/i18n.js', () => ({
  resolveLocale: vi.fn().mockResolvedValue('en'),
  getTranslationFunction: vi.fn().mockReturnValue((key: string) => `t:${key}`),
}));

vi.mock('../../../src/auth/template-engine.js', () => ({
  renderPage: vi.fn().mockResolvedValue('<html>rendered</html>'),
}));

vi.mock('../../../src/users/service.js', () => ({
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  setUserPassword: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/users/password.js', () => ({
  validatePassword: vi.fn().mockReturnValue({ isValid: true }),
}));

vi.mock('../../../src/lib/system-config.js', () => ({
  getSystemConfigNumber: vi.fn().mockResolvedValue(3600),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/config/index.js', () => ({
  config: { issuerBaseUrl: 'https://auth.example.com' },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { createPasswordResetRouter } from '../../../src/routes/password-reset.js';
import * as csrf from '../../../src/auth/csrf.js';
import * as rateLimiter from '../../../src/auth/rate-limiter.js';
import * as tokenRepo from '../../../src/auth/token-repository.js';
import * as emailService from '../../../src/auth/email-service.js';
import * as userService from '../../../src/users/service.js';
import * as passwordUtils from '../../../src/users/password.js';
import * as auditLog from '../../../src/lib/audit-log.js';
import * as templateEngine from '../../../src/auth/template-engine.js';
import type { Organization } from '../../../src/organizations/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-uuid-1', name: 'Test Org', slug: 'test-org', status: 'active',
    isSuperAdmin: false, brandingLogoUrl: null, brandingFaviconUrl: null,
    brandingPrimaryColor: '#3B82F6', brandingCompanyName: 'Test Corp',
    brandingCustomCss: null, defaultLocale: 'en',
    // Default to both methods enabled so existing tests (which don't care
    // about login-method enforcement) keep their current behavior. Tests
    // that explicitly verify the magic-link-only case override this.
    defaultLoginMethods: ['password', 'magic_link'],
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function createMockCtx(overrides: {
  params?: Record<string, string>;
  body?: Record<string, string>;
} = {}) {
  let statusCode = 200;
  let responseBody: unknown = undefined;
  let contentType = '';
  const headers: Record<string, string> = {};

  return {
    params: { orgSlug: 'test-org', ...(overrides.params ?? {}) },
    query: {},
    request: { body: overrides.body ?? {} },
    req: {}, res: {},
    ip: '127.0.0.1',
    get status() { return statusCode; },
    set status(v: number) { statusCode = v; },
    get body() { return responseBody; },
    set body(v: unknown) { responseBody = v; },
    get type() { return contentType; },
    set type(v: string) { contentType = v; },
    state: { organization: createMockOrg() },
    cookies: {
      get: vi.fn().mockReturnValue('csrf-token-abc'),
      set: vi.fn(),
    },
    get: vi.fn().mockReturnValue(''),
    set: vi.fn((n: string, v: string) => { headers[n] = v; }),
    _headers: headers,
  };
}

function findLayer(router: ReturnType<typeof createPasswordResetRouter>, method: string, pathPattern: string) {
  return router.stack.find(
    (l) => l.methods.includes(method) && l.path.includes(pathPattern),
  );
}

async function exec(layer: NonNullable<ReturnType<typeof findLayer>>, ctx: ReturnType<typeof createMockCtx>) {
  return layer.stack[layer.stack.length - 1](ctx as never, vi.fn());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('password reset routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore defaults that individual tests may override
    vi.mocked(csrf.verifyCsrfToken).mockReturnValue(true);
    vi.mocked(rateLimiter.checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, retryAfter: 0 });
    vi.mocked(templateEngine.renderPage).mockResolvedValue('<html>rendered</html>');
    vi.mocked(passwordUtils.validatePassword).mockReturnValue({ isValid: true });
  });

  // =========================================================================
  // showForgotPassword
  // =========================================================================

  describe('GET /:orgSlug/auth/forgot-password — showForgotPassword', () => {
    it('should render forgot-password form with CSRF token', async () => {
      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'GET', 'forgot-password');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'forgot-password',
        expect.objectContaining({ csrfToken: 'csrf-token-abc', orgSlug: 'test-org' }),
      );
      expect(ctx.status).toBe(200);
    });
  });

  // =========================================================================
  // processForgotPassword
  // =========================================================================

  describe('POST /:orgSlug/auth/forgot-password — processForgotPassword', () => {
    it('should always show check-email page (enumeration prevention)', async () => {
      vi.mocked(userService.getUserByEmail).mockResolvedValue(null);

      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'POST', 'forgot-password');
      const ctx = createMockCtx({ body: { email: 'unknown@test.com', _csrf: 'tok' } });

      await exec(layer!, ctx);

      // Should show success page even for non-existent email
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'forgot-password',
        expect.objectContaining({ flash: { success: expect.any(String) } }),
      );
      // Should NOT send email
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should generate token and send email when user exists', async () => {
      const mockUser = { id: 'user-uuid-1', email: 'user@test.com', givenName: 'Test', familyName: 'User' };
      vi.mocked(userService.getUserByEmail).mockResolvedValue(mockUser as never);

      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'POST', 'forgot-password');
      const ctx = createMockCtx({ body: { email: 'user@test.com', _csrf: 'tok' } });

      await exec(layer!, ctx);

      // Should invalidate old tokens
      expect(tokenRepo.invalidateUserTokens).toHaveBeenCalledWith('password_reset_tokens', 'user-uuid-1');
      // Should insert new token
      expect(tokenRepo.insertToken).toHaveBeenCalledWith('password_reset_tokens', 'user-uuid-1', 'token-hash-abc', expect.any(Date));
      // Should send email
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalled();
      // Should audit log
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.password_reset.requested' }),
      );
    });

    it('should reject on CSRF mismatch', async () => {
      vi.mocked(csrf.verifyCsrfToken).mockReturnValue(false);

      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'POST', 'forgot-password');
      const ctx = createMockCtx({ body: { email: 'user@test.com', _csrf: 'bad' } });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(403);
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'forgot-password',
        expect.objectContaining({ flash: { error: expect.stringContaining('csrf') } }),
      );
    });

    it('should reject when rate limited and return 429', async () => {
      vi.mocked(rateLimiter.checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 60 });

      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'POST', 'forgot-password');
      const ctx = createMockCtx({ body: { email: 'user@test.com', _csrf: 'tok' } });

      await exec(layer!, ctx);

      expect(ctx.set).toHaveBeenCalledWith('Retry-After', '60');
      expect(ctx.status).toBe(429);
    });
  });

  // =========================================================================
  // showResetPassword
  // =========================================================================

  describe('GET /:orgSlug/auth/reset-password/:token — showResetPassword', () => {
    it('should render reset form for valid token', async () => {
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue({ id: 'tok-1', userId: 'user-1' } as never);

      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'GET', 'reset-password');
      const ctx = createMockCtx({ params: { token: 'valid-token' } });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'reset-password',
        expect.objectContaining({ token: 'valid-token', csrfToken: 'csrf-token-abc' }),
      );
      expect(ctx.status).toBe(200);
    });

    it('should show error page for expired token', async () => {
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(null);

      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'GET', 'reset-password');
      const ctx = createMockCtx({ params: { token: 'expired-token' } });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ errorMessage: expect.stringContaining('reset_link_expired') }),
      );
      expect(ctx.status).toBe(400);
    });
  });

  // =========================================================================
  // processResetPassword
  // =========================================================================

  describe('POST /:orgSlug/auth/reset-password/:token — processResetPassword', () => {
    it('should reset password and render success page', async () => {
      const tokenRecord = { id: 'tok-1', userId: 'user-uuid-1' };
      const user = { id: 'user-uuid-1', email: 'user@test.com', givenName: 'Test', familyName: 'User' };
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(tokenRecord as never);
      vi.mocked(userService.getUserById).mockResolvedValue(user as never);

      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'POST', 'reset-password');
      const ctx = createMockCtx({
        params: { token: 'valid-token' },
        body: { password: 'NewSecurePass123!', confirmPassword: 'NewSecurePass123!', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      // Should set new password
      expect(userService.setUserPassword).toHaveBeenCalledWith('user-uuid-1', 'NewSecurePass123!');
      // Should mark token used
      expect(tokenRepo.markTokenUsed).toHaveBeenCalledWith('password_reset_tokens', 'tok-1');
      // Should send confirmation email
      expect(emailService.sendPasswordChangedEmail).toHaveBeenCalled();
      // Should render success page
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'reset-success',
        expect.objectContaining({ flash: { success: expect.any(String) } }),
      );
      // Should audit log
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.password_reset.completed' }),
      );
    });

    it('should reject on CSRF mismatch', async () => {
      vi.mocked(csrf.verifyCsrfToken).mockReturnValue(false);

      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'POST', 'reset-password');
      const ctx = createMockCtx({
        params: { token: 'valid-token' },
        body: { password: 'pass', confirmPassword: 'pass', _csrf: 'bad' },
      });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(403);
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'reset-password',
        expect.objectContaining({ flash: { error: expect.stringContaining('csrf') } }),
      );
    });

    it('should show error when token expired during submission', async () => {
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(null);

      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'POST', 'reset-password');
      const ctx = createMockCtx({
        params: { token: 'expired-token' },
        body: { password: 'SecurePass123!', confirmPassword: 'SecurePass123!', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ errorMessage: expect.stringContaining('reset_link_expired') }),
      );
    });

    it('should show error when passwords do not match', async () => {
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue({ id: 'tok-1', userId: 'user-1' } as never);

      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'POST', 'reset-password');
      const ctx = createMockCtx({
        params: { token: 'valid-token' },
        body: { password: 'Password1!', confirmPassword: 'Different!', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'reset-password',
        expect.objectContaining({ flash: { error: expect.stringContaining('mismatch') } }),
      );
    });

    it('should show error when password validation fails', async () => {
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue({ id: 'tok-1', userId: 'user-1' } as never);
      vi.mocked(passwordUtils.validatePassword).mockReturnValue({ isValid: false, error: 'Password too short' });

      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'POST', 'reset-password');
      const ctx = createMockCtx({
        params: { token: 'valid-token' },
        body: { password: 'short', confirmPassword: 'short', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'reset-password',
        expect.objectContaining({ flash: { error: 'Password too short' } }),
      );
    });
  });

  // =========================================================================
  // Login-method enforcement (RD-13 Phase 5.2)
  //
  // Password-reset routes are password-only flows. When the org has disabled
  // password login entirely (`defaultLoginMethods = ['magic_link']`), all four
  // endpoints must refuse to serve — rendering an error page instead of the
  // form, bypassing CSRF/token checks, and writing a security audit event.
  // =========================================================================

  describe('login method enforcement (password disabled)', () => {
    function pwDisabledCtx(overrides: {
      params?: Record<string, string>;
      body?: Record<string, string>;
    } = {}) {
      const ctx = createMockCtx(overrides);
      ctx.state.organization = createMockOrg({ defaultLoginMethods: ['magic_link'] });
      return ctx;
    }

    it('should block GET /forgot-password with error page and audit', async () => {
      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'GET', 'forgot-password');
      const ctx = pwDisabledCtx();

      await exec(layer!, ctx);

      // Should render error page (not the forgot-password form)
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          errorMessage: expect.stringContaining('login_method_disabled'),
        }),
      );
      expect(templateEngine.renderPage).not.toHaveBeenCalledWith(
        'forgot-password',
        expect.anything(),
      );
      expect(ctx.status).toBe(400);

      // Should audit the block as a security event
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'security.login_method_disabled',
          eventCategory: 'security',
        }),
      );
    });

    it('should block POST /forgot-password before CSRF check and before any token work', async () => {
      // Make sure no user/token logic runs even if the body looks valid.
      const mockUser = { id: 'user-uuid-1', email: 'u@test.com', givenName: 'X', familyName: 'Y' };
      vi.mocked(userService.getUserByEmail).mockResolvedValue(mockUser as never);

      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'POST', 'forgot-password');
      const ctx = pwDisabledCtx({ body: { email: 'u@test.com', _csrf: 'tok' } });

      await exec(layer!, ctx);

      // Error page, not the form
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          errorMessage: expect.stringContaining('login_method_disabled'),
        }),
      );
      // Must NOT touch token generation or email sending
      expect(tokenRepo.insertToken).not.toHaveBeenCalled();
      expect(tokenRepo.invalidateUserTokens).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should block GET /reset-password/:token without validating the token', async () => {
      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'GET', 'reset-password');
      const ctx = pwDisabledCtx({ params: { token: 'any-token' } });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          errorMessage: expect.stringContaining('login_method_disabled'),
        }),
      );
      // Token lookup must be skipped — we reject at the method layer
      expect(tokenRepo.findValidToken).not.toHaveBeenCalled();
    });

    it('should block POST /reset-password/:token without setting the password', async () => {
      // Even if all other checks would pass, method enforcement must fire first.
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue({
        id: 'tok-1',
        userId: 'user-1',
      } as never);

      const router = createPasswordResetRouter();
      const layer = findLayer(router, 'POST', 'reset-password');
      const ctx = pwDisabledCtx({
        params: { token: 'valid-token' },
        body: { password: 'SecurePass123!', confirmPassword: 'SecurePass123!', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          errorMessage: expect.stringContaining('login_method_disabled'),
        }),
      );
      // The password must NOT have been set
      expect(userService.setUserPassword).not.toHaveBeenCalled();
      expect(tokenRepo.markTokenUsed).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Router structure
  // =========================================================================

  describe('router structure', () => {
    it('should register all password reset routes', () => {
      const router = createPasswordResetRouter();
      const paths = router.stack.map(
        (l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`,
      );

      expect(paths).toContain('GET /:orgSlug/auth/forgot-password');
      expect(paths).toContain('POST /:orgSlug/auth/forgot-password');
      expect(paths).toContain('GET /:orgSlug/auth/reset-password/:token');
      expect(paths).toContain('POST /:orgSlug/auth/reset-password/:token');
    });
  });
});
