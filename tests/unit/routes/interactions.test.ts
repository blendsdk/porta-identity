/**
 * Unit tests for interaction route handlers.
 *
 * Tests the OIDC login, consent, magic link, and abort flows.
 * All external dependencies (provider, user service, CSRF, rate limiter,
 * email, i18n, templates) are mocked to isolate route handler logic.
 *
 * Test groups:
 *   - showLogin: login page rendering, consent redirect, login_hint
 *   - processLogin: auth flow, CSRF, rate limiting, status checks
 *   - handleSendMagicLink: magic link flow, enumeration prevention
 *   - showConsent: auto-consent, third-party consent page
 *   - processConsent: approve/deny decisions
 *   - abortInteraction: abort flow
 *   - router structure: route registration verification
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock all dependencies before importing the module under test.
// vi.mock() factories are hoisted — they CANNOT reference top-level variables.
// ---------------------------------------------------------------------------

vi.mock('../../../src/auth/csrf.js', () => ({
  generateCsrfToken: vi.fn().mockReturnValue('csrf-token-abc'),
  verifyCsrfToken: vi.fn().mockReturnValue(true),
  setCsrfCookie: vi.fn(),
  getCsrfFromCookie: vi.fn().mockReturnValue('csrf-token-abc'),
}));

vi.mock('../../../src/auth/rate-limiter.js', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, retryAfter: 0 }),
  resetRateLimit: vi.fn().mockResolvedValue(undefined),
  buildLoginRateLimitKey: vi.fn().mockReturnValue('rl:login:org:ip:email'),
  buildMagicLinkRateLimitKey: vi.fn().mockReturnValue('rl:magic:org:email'),
  loadLoginRateLimitConfig: vi.fn().mockResolvedValue({ maxAttempts: 5, windowSeconds: 300 }),
  loadMagicLinkRateLimitConfig: vi.fn().mockResolvedValue({ maxAttempts: 3, windowSeconds: 600 }),
}));

vi.mock('../../../src/auth/tokens.js', () => ({
  generateToken: vi.fn().mockReturnValue({ plaintext: 'token-plain-123', hash: 'token-hash-abc' }),
}));

vi.mock('../../../src/auth/token-repository.js', () => ({
  insertToken: vi.fn().mockResolvedValue(undefined),
  invalidateUserTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/auth/email-service.js', () => ({
  sendMagicLinkEmail: vi.fn(),
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
  verifyUserPassword: vi.fn(),
  recordLogin: vi.fn().mockResolvedValue(undefined),
  recordFailedLogin: vi.fn().mockResolvedValue({ locked: false, failedCount: 1 }),
  checkAutoUnlock: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../src/lib/system-config.js', () => ({
  getSystemConfigNumber: vi.fn().mockResolvedValue(900),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/two-factor/service.js', () => ({
  requiresTwoFactor: vi.fn().mockReturnValue(false),
  determineTwoFactorMethod: vi.fn().mockReturnValue(null),
  sendOtpCode: vi.fn().mockResolvedValue('123456'),
}));

vi.mock('../../../src/config/index.js', () => ({
  config: {
    issuerBaseUrl: 'https://auth.example.com',
  },
}));

vi.mock('../../../src/auth/magic-link-session.js', () => ({
  hasMagicLinkSession: vi.fn().mockReturnValue(false),
  consumeMagicLinkSession: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { createInteractionRouter } from '../../../src/routes/interactions.js';
import * as csrf from '../../../src/auth/csrf.js';
import * as rateLimiter from '../../../src/auth/rate-limiter.js';
import * as emailService from '../../../src/auth/email-service.js';
import * as tokenRepo from '../../../src/auth/token-repository.js';
import * as userService from '../../../src/users/service.js';
import * as auditLog from '../../../src/lib/audit-log.js';
import * as templateEngine from '../../../src/auth/template-engine.js';
import type { Organization } from '../../../src/organizations/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a mock Organization with sensible defaults */
function createMockOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-uuid-1',
    name: 'Test Org',
    slug: 'test-org',
    status: 'active',
    isSuperAdmin: false,
    brandingLogoUrl: 'https://example.com/logo.png',
    brandingFaviconUrl: null,
    brandingPrimaryColor: '#3B82F6',
    brandingCompanyName: 'Test Corp',
    brandingCustomCss: null,
    defaultLocale: 'en',
    // Default to both methods enabled — existing tests are agnostic to
    // login-method enforcement, so keep the permissive default here.
    defaultLoginMethods: ['password', 'magic_link'],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

/** Create a mock OIDC interaction details object */
function createMockInteraction(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'interaction-uid-123',
    prompt: {
      name: 'login',
      reasons: [],
      details: {
        missingOIDCScope: new Set(['openid', 'profile', 'email']),
        missingOIDCClaims: new Set<string>(),
        missingResourceScopes: {},
      },
    },
    params: {
      client_id: 'client-id-abc',
      scope: 'openid profile email',
      ui_locales: undefined,
      login_hint: undefined,
    },
    session: { accountId: 'user-uuid-1' },
    ...overrides,
  };
}

/** Create a mock OIDC provider */
function createMockProvider() {
  const mockGrant = {
    addOIDCScope: vi.fn(),
    addOIDCClaims: vi.fn(),
    addResourceScope: vi.fn(),
    save: vi.fn().mockResolvedValue('grant-id-123'),
  };

  // Grant must be a proper constructor (class or function), not an arrow fn.
  // Vitest warns if vi.fn() mock doesn't use 'function' or 'class'.
  function MockGrant() {
    return mockGrant;
  }
  const GrantSpy = vi.fn(MockGrant);

  return {
    interactionDetails: vi.fn().mockResolvedValue(createMockInteraction()),
    interactionFinished: vi.fn().mockResolvedValue(undefined),
    Client: {
      find: vi.fn().mockResolvedValue({
        metadata: () => ({
          client_name: 'Test App',
          organizationId: undefined, // third-party by default
          // Default to null (inherit from org) — enforcement tests override
          // this to ['password'] or ['magic_link'] to exercise the guards.
          'urn:porta:login_methods': null,
        }),
      }),
    },
    // Grant constructor — must be a real function for `new` to work
    Grant: GrantSpy,
    _mockGrant: mockGrant, // expose for assertions
  };
}

/**
 * Create a minimal mock Koa context for interaction route testing.
 * Includes req/res objects needed by the provider, and organization state.
 */
function createMockCtx(overrides: {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, string>;
  org?: Partial<Organization>;
} = {}) {
  let statusCode = 200;
  let responseBody: unknown = undefined;
  let contentType = '';
  const headers: Record<string, string> = {};

  return {
    params: { uid: 'interaction-uid-123', ...(overrides.params ?? {}) },
    query: overrides.query ?? {},
    request: { body: overrides.body ?? {} },
    req: {}, // raw Node.js IncomingMessage (mock)
    res: {}, // raw Node.js ServerResponse (mock)
    ip: '127.0.0.1',
    get status() { return statusCode; },
    set status(v: number) { statusCode = v; },
    get body() { return responseBody; },
    set body(v: unknown) { responseBody = v; },
    get type() { return contentType; },
    set type(v: string) { contentType = v; },
    state: {
      organization: createMockOrg(overrides.org),
    },
    cookies: {
      get: vi.fn().mockReturnValue('csrf-token-abc'),
      set: vi.fn(),
    },
    get: vi.fn().mockReturnValue(''), // ctx.get('Accept-Language')
    set: vi.fn((name: string, value: string) => { headers[name] = value; }),
    redirect: vi.fn(),
    _headers: headers,
  };
}

const PREFIX = '/interaction';

/** Find a route layer by method and path suffix */
function findLayer(
  router: ReturnType<typeof createInteractionRouter>,
  method: string,
  pathSuffix: string,
) {
  return router.stack.find(
    (l) => l.methods.includes(method) && l.path === `${PREFIX}${pathSuffix}`,
  );
}

/** Execute the last middleware in the layer's stack (the actual handler) */
async function exec(
  layer: NonNullable<ReturnType<typeof findLayer>>,
  ctx: ReturnType<typeof createMockCtx>,
) {
  return layer.stack[layer.stack.length - 1](ctx as never, vi.fn());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('interaction routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Restore default mock return values that individual tests may override.
    // vi.clearAllMocks() clears call history but does NOT reset mockReturnValue.
    vi.mocked(csrf.verifyCsrfToken).mockReturnValue(true);
    vi.mocked(csrf.generateCsrfToken).mockReturnValue('csrf-token-abc');
    vi.mocked(rateLimiter.checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, retryAfter: 0 });
    vi.mocked(rateLimiter.loadLoginRateLimitConfig).mockResolvedValue({ maxAttempts: 5, windowSeconds: 300 });
    vi.mocked(rateLimiter.loadMagicLinkRateLimitConfig).mockResolvedValue({ maxAttempts: 3, windowSeconds: 600 });
    vi.mocked(templateEngine.renderPage).mockResolvedValue('<html>rendered</html>');
  });

  // =========================================================================
  // showLogin — GET /interaction/:uid
  // =========================================================================

  describe('GET /:uid — showLogin', () => {
    it('should render login page with branding and CSRF token', async () => {
      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Should call provider.interactionDetails with raw req/res
      expect(provider.interactionDetails).toHaveBeenCalledWith(ctx.req, ctx.res);

      // Should render the login page
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          locale: 'en',
          csrfToken: 'csrf-token-abc',
          orgSlug: 'test-org',
        }),
      );

      expect(ctx.status).toBe(200);
      expect(ctx.type).toBe('text/html');
      expect(ctx.body).toBe('<html>rendered</html>');
    });

    it('should handle consent prompt by calling showConsent directly', async () => {
      const provider = createMockProvider();
      provider.interactionDetails.mockResolvedValue(
        createMockInteraction({
          prompt: {
            name: 'consent',
            reasons: [],
            details: {
              missingOIDCScope: new Set(['openid', 'profile', 'email']),
              missingOIDCClaims: new Set<string>(),
              missingResourceScopes: {},
            },
          },
        }),
      );

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // showLogin detects consent and calls showConsent() directly (no redirect).
      // Since the mock client has organizationId: undefined (third-party),
      // the consent template is rendered instead of auto-consent.
      expect(ctx.redirect).not.toHaveBeenCalled();
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'consent',
        expect.objectContaining({ orgSlug: 'test-org' }),
      );
    });

    it('should pre-fill email from login_hint parameter', async () => {
      const provider = createMockProvider();
      provider.interactionDetails.mockResolvedValue(
        createMockInteraction({
          params: { client_id: 'client-1', scope: 'openid', login_hint: 'user@example.com' },
        }),
      );

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({ email: 'user@example.com' }),
      );
    });

    it('should resolve human-readable clientName from provider metadata', async () => {
      const provider = createMockProvider();
      // Provider returns client with client_name metadata
      provider.Client.find.mockResolvedValue({
        metadata: () => ({
          client_name: 'My Cool App',
          organizationId: undefined,
        }),
      });

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Should call provider.Client.find to look up the client name
      expect(provider.Client.find).toHaveBeenCalledWith('client-id-abc');

      // The rendered context should include the human-readable name, NOT the UUID
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          interaction: expect.objectContaining({
            client: { clientName: 'My Cool App' },
          }),
        }),
      );
    });

    it('should fall back to client_id when client has no client_name', async () => {
      const provider = createMockProvider();
      // Provider returns client without client_name in metadata
      provider.Client.find.mockResolvedValue({
        metadata: () => ({
          organizationId: undefined,
          // No client_name field
        }),
      });

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Should fall back to the raw client_id
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          interaction: expect.objectContaining({
            client: { clientName: 'client-id-abc' },
          }),
        }),
      );
    });

    it('should fall back to client_id when provider.Client.find returns null', async () => {
      const provider = createMockProvider();
      // Client not found in provider
      provider.Client.find.mockResolvedValue(null);

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Should fall back to the raw client_id
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          interaction: expect.objectContaining({
            client: { clientName: 'client-id-abc' },
          }),
        }),
      );
    });

    it('should render error page when provider interaction fails', async () => {
      const provider = createMockProvider();
      provider.interactionDetails.mockRejectedValue(new Error('Interaction expired'));

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Should render the error page (second renderPage call from renderErrorPage)
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ errorMessage: expect.any(String) }),
      );
      expect(ctx.status).toBe(400);
    });
  });

  // =========================================================================
  // processLogin — POST /interaction/:uid/login
  // =========================================================================

  describe('POST /:uid/login — processLogin', () => {
    it('should authenticate user with valid credentials and finish interaction', async () => {
      const mockUser = { id: 'user-uuid-1', email: 'user@test.com', status: 'active' };
      vi.mocked(userService.getUserByEmail).mockResolvedValue(mockUser as never);
      vi.mocked(userService.verifyUserPassword).mockResolvedValue(true);

      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/login');
      const ctx = createMockCtx({
        body: { email: 'user@test.com', password: 'correct-password', _csrf: 'csrf-token-abc' },
      });

      await exec(layer!, ctx);

      // Should verify password
      expect(userService.verifyUserPassword).toHaveBeenCalledWith('user-uuid-1', 'correct-password');

      // Should record login
      expect(userService.recordLogin).toHaveBeenCalledWith('user-uuid-1');

      // Should reset rate limit
      expect(rateLimiter.resetRateLimit).toHaveBeenCalled();

      // Should finish interaction with account ID
      expect(provider.interactionFinished).toHaveBeenCalledWith(
        ctx.req, ctx.res,
        { login: { accountId: 'user-uuid-1' } },
        { mergeWithLastSubmission: false },
      );

      // Should audit log successful login
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'user.login.password',
          eventCategory: 'authentication',
        }),
      );
    });

    it('should reject on CSRF token mismatch', async () => {
      vi.mocked(csrf.verifyCsrfToken).mockReturnValue(false);

      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/login');
      const ctx = createMockCtx({
        body: { email: 'user@test.com', password: 'pass', _csrf: 'bad' },
      });

      await exec(layer!, ctx);

      // Should render login page with CSRF error (not throw)
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          flash: { error: expect.stringContaining('csrf') },
        }),
      );

      // Should NOT attempt authentication
      expect(userService.getUserByEmail).not.toHaveBeenCalled();
    });

    it('should reject when rate limited and return 429', async () => {
      vi.mocked(rateLimiter.checkRateLimit).mockResolvedValue({
        allowed: false,
        remaining: 0,
        retryAfter: 120,
      });

      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/login');
      const ctx = createMockCtx({
        body: { email: 'user@test.com', password: 'pass', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      // Should set Retry-After header
      expect(ctx.set).toHaveBeenCalledWith('Retry-After', '120');

      // Should render login with rate limit error
      expect(ctx.status).toBe(429);

      // Should audit log rate limit
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'rate_limit.login' }),
      );

      // Should NOT attempt user lookup
      expect(userService.getUserByEmail).not.toHaveBeenCalled();
    });

    it('should show generic error when user not found (enumeration prevention)', async () => {
      vi.mocked(userService.getUserByEmail).mockResolvedValue(null);

      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/login');
      const ctx = createMockCtx({
        body: { email: 'unknown@test.com', password: 'pass', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      // Should render login with generic "invalid credentials" error
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          flash: { error: expect.stringContaining('error_invalid') },
        }),
      );

      // Should audit log the failed attempt
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.login.password.failed' }),
      );
    });

    it('should show error when user is inactive', async () => {
      const mockUser = { id: 'user-uuid-1', email: 'user@test.com', status: 'inactive' };
      vi.mocked(userService.getUserByEmail).mockResolvedValue(mockUser as never);

      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/login');
      const ctx = createMockCtx({
        body: { email: 'user@test.com', password: 'pass', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          flash: { error: expect.stringContaining('account_inactive') },
        }),
      );
    });

    it('should show error when user is suspended', async () => {
      const mockUser = { id: 'user-uuid-1', email: 'user@test.com', status: 'suspended' };
      vi.mocked(userService.getUserByEmail).mockResolvedValue(mockUser as never);

      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/login');
      const ctx = createMockCtx({
        body: { email: 'user@test.com', password: 'pass', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          flash: { error: expect.stringContaining('account_suspended') },
        }),
      );
    });

    it('should show error when user is locked', async () => {
      const mockUser = { id: 'user-uuid-1', email: 'user@test.com', status: 'locked' };
      vi.mocked(userService.getUserByEmail).mockResolvedValue(mockUser as never);

      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/login');
      const ctx = createMockCtx({
        body: { email: 'user@test.com', password: 'pass', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          flash: { error: expect.stringContaining('account_locked') },
        }),
      );
    });

    it('should show error on wrong password', async () => {
      const mockUser = { id: 'user-uuid-1', email: 'user@test.com', status: 'active' };
      vi.mocked(userService.getUserByEmail).mockResolvedValue(mockUser as never);
      vi.mocked(userService.verifyUserPassword).mockResolvedValue(false);

      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/login');
      const ctx = createMockCtx({
        body: { email: 'user@test.com', password: 'wrong', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          flash: { error: expect.stringContaining('error_invalid') },
        }),
      );

      // Should audit log failed password
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'user.login.password.failed',
          userId: 'user-uuid-1',
        }),
      );
    });

    it('should resolve human-readable clientName on error pages', async () => {
      // Verify that login error pages also show the resolved client name
      // (not the raw client_id UUID) — this tests the renderLoginWithError path
      vi.mocked(userService.getUserByEmail).mockResolvedValue(null);

      const provider = createMockProvider();
      // Provider returns a client with a human-readable name
      provider.Client.find.mockResolvedValue({
        metadata: () => ({
          client_name: 'My Portal App',
          organizationId: undefined,
        }),
      });

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/login');
      const ctx = createMockCtx({
        body: { email: 'unknown@test.com', password: 'pass', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      // The error page should still show the human-readable client name
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          interaction: expect.objectContaining({
            client: { clientName: 'My Portal App' },
          }),
        }),
      );
    });

    it('should render error page when provider throws', async () => {
      const provider = createMockProvider();
      provider.interactionDetails.mockRejectedValue(new Error('Session gone'));

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/login');
      const ctx = createMockCtx({
        body: { email: 'user@test.com', password: 'pass', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ errorMessage: expect.any(String) }),
      );
      expect(ctx.status).toBe(400);
    });
  });

  // =========================================================================
  // handleSendMagicLink — POST /interaction/:uid/magic-link
  // =========================================================================

  describe('POST /:uid/magic-link — handleSendMagicLink', () => {
    it('should send magic link and show check-email page for active user', async () => {
      const mockUser = {
        id: 'user-uuid-1',
        email: 'user@test.com',
        givenName: 'Test',
        familyName: 'User',
        status: 'active',
      };
      vi.mocked(userService.getUserByEmail).mockResolvedValue(mockUser as never);

      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/magic-link');
      const ctx = createMockCtx({
        body: { email: 'user@test.com', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      // Should invalidate existing tokens
      expect(tokenRepo.invalidateUserTokens).toHaveBeenCalledWith('magic_link_tokens', 'user-uuid-1');

      // Should insert new token
      expect(tokenRepo.insertToken).toHaveBeenCalledWith(
        'magic_link_tokens',
        'user-uuid-1',
        'token-hash-abc',
        expect.any(Date),
      );

      // Should send magic link email
      expect(emailService.sendMagicLinkEmail).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-uuid-1', email: 'user@test.com' }),
        expect.objectContaining({ id: 'org-uuid-1', slug: 'test-org' }),
        expect.stringContaining('auth/magic-link/token-plain-123'),
        'en',
      );

      // Should render the magic-link-sent page
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'magic-link-sent',
        expect.objectContaining({ email: 'user@test.com' }),
      );

      // Should audit log
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.magic_link.sent' }),
      );
    });

    it('should show check-email page even when user not found (enumeration prevention)', async () => {
      vi.mocked(userService.getUserByEmail).mockResolvedValue(null);

      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/magic-link');
      const ctx = createMockCtx({
        body: { email: 'unknown@test.com', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      // Should NOT send email or insert token
      expect(emailService.sendMagicLinkEmail).not.toHaveBeenCalled();
      expect(tokenRepo.insertToken).not.toHaveBeenCalled();

      // But SHOULD render the magic-link-sent page (same as success)
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'magic-link-sent',
        expect.objectContaining({ email: 'unknown@test.com' }),
      );
    });

    it('should not send email for non-active user (enumeration prevention)', async () => {
      const mockUser = { id: 'user-uuid-1', email: 'user@test.com', status: 'suspended' };
      vi.mocked(userService.getUserByEmail).mockResolvedValue(mockUser as never);

      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/magic-link');
      const ctx = createMockCtx({
        body: { email: 'user@test.com', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      // Should NOT send email (user is not active)
      expect(emailService.sendMagicLinkEmail).not.toHaveBeenCalled();

      // But SHOULD still render magic-link-sent page
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'magic-link-sent',
        expect.any(Object),
      );
    });

    it('should reject on CSRF mismatch', async () => {
      vi.mocked(csrf.verifyCsrfToken).mockReturnValue(false);

      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/magic-link');
      const ctx = createMockCtx({
        body: { email: 'user@test.com', _csrf: 'bad' },
      });

      await exec(layer!, ctx);

      // Should render login with CSRF error
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          flash: { error: expect.stringContaining('csrf') },
        }),
      );

      // Should NOT send email
      expect(emailService.sendMagicLinkEmail).not.toHaveBeenCalled();
    });

    it('should reject when rate limited and return 429', async () => {
      vi.mocked(rateLimiter.checkRateLimit).mockResolvedValue({
        allowed: false,
        remaining: 0,
        retryAfter: 300,
      });

      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/magic-link');
      const ctx = createMockCtx({
        body: { email: 'user@test.com', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      expect(ctx.set).toHaveBeenCalledWith('Retry-After', '300');
      expect(ctx.status).toBe(429);

      // Should audit log rate limit
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'rate_limit.magic_link' }),
      );

      // Should NOT send email
      expect(emailService.sendMagicLinkEmail).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Login-method enforcement (RD-13 Phase 5.2)
  //
  // These tests verify that the handlers consult `urn:porta:login_methods`
  // from the OIDC client metadata and reject attempts that don't match the
  // allowed methods. The UI guard in login.hbs is cosmetic; these checks are
  // the authoritative enforcement layer.
  // =========================================================================

  describe('login method enforcement', () => {
    it('should block password login when client allows only magic_link', async () => {
      const mockUser = { id: 'user-uuid-1', email: 'user@test.com', status: 'active' };
      vi.mocked(userService.getUserByEmail).mockResolvedValue(mockUser as never);
      vi.mocked(userService.verifyUserPassword).mockResolvedValue(true);

      const provider = createMockProvider();
      // Client restricted to magic_link only
      provider.Client.find.mockResolvedValue({
        metadata: () => ({
          client_name: 'ML-Only App',
          'urn:porta:login_methods': ['magic_link'],
        }),
      });

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/login');
      const ctx = createMockCtx({
        body: { email: 'user@test.com', password: 'pass', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      // Handler should render login page with the "method disabled" flash
      // error, NOT finish the interaction, and NOT even call getUserByEmail.
      expect(ctx.status).toBe(403);
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          flash: { error: expect.stringContaining('login_method_disabled') },
        }),
      );
      expect(provider.interactionFinished).not.toHaveBeenCalled();
      expect(userService.getUserByEmail).not.toHaveBeenCalled();

      // And it should audit the attempt as a security event (not a login failure)
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'security.login_method_disabled',
          eventCategory: 'security',
        }),
      );
    });

    it('should block magic_link when client allows only password', async () => {
      const provider = createMockProvider();
      provider.Client.find.mockResolvedValue({
        metadata: () => ({
          client_name: 'PW-Only App',
          'urn:porta:login_methods': ['password'],
        }),
      });

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/magic-link');
      const ctx = createMockCtx({ body: { email: 'user@test.com', _csrf: 'tok' } });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(403);
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          flash: { error: expect.stringContaining('login_method_disabled') },
        }),
      );
      // Must not even touch the magic-link machinery
      expect(emailService.sendMagicLinkEmail).not.toHaveBeenCalled();
      expect(tokenRepo.insertToken).not.toHaveBeenCalled();
      expect(userService.getUserByEmail).not.toHaveBeenCalled();

      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'security.login_method_disabled' }),
      );
    });

    it('should inherit org default when client metadata is null', async () => {
      const mockUser = { id: 'user-uuid-1', email: 'user@test.com', status: 'active' };
      vi.mocked(userService.getUserByEmail).mockResolvedValue(mockUser as never);
      vi.mocked(userService.verifyUserPassword).mockResolvedValue(true);

      const provider = createMockProvider();
      // Client metadata is null → should inherit from org.defaultLoginMethods.
      // Override org to magic-link only — password login should then be blocked.
      provider.Client.find.mockResolvedValue({
        metadata: () => ({
          client_name: 'Inheriting App',
          'urn:porta:login_methods': null,
        }),
      });

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/login');
      const ctx = createMockCtx({
        body: { email: 'user@test.com', password: 'pass', _csrf: 'tok' },
        org: { defaultLoginMethods: ['magic_link'] },
      });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(403);
      expect(provider.interactionFinished).not.toHaveBeenCalled();
    });

    it('should render login with both-method flags when methods include both', async () => {
      const provider = createMockProvider();
      provider.Client.find.mockResolvedValue({
        metadata: () => ({
          client_name: 'Full App',
          'urn:porta:login_methods': ['password', 'magic_link'],
        }),
      });

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          showPassword: true,
          showMagicLink: true,
          showDivider: true,
          loginMethods: ['password', 'magic_link'],
        }),
      );
    });

    it('should render login with only password flag when client is password-only', async () => {
      const provider = createMockProvider();
      provider.Client.find.mockResolvedValue({
        metadata: () => ({
          client_name: 'PW-Only App',
          'urn:porta:login_methods': ['password'],
        }),
      });

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          showPassword: true,
          showMagicLink: false,
          showDivider: false,
        }),
      );
    });

    it('should propagate login_hint as emailHint on the login page', async () => {
      const provider = createMockProvider();
      provider.interactionDetails.mockResolvedValue(
        createMockInteraction({
          params: {
            client_id: 'client-id-abc',
            scope: 'openid',
            login_hint: '  Alice@Example.com  ', // with surrounding whitespace
          },
        }),
      );

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // trimmed + propagated as-is (no lowercase — may be a non-email hint)
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({
          email: 'Alice@Example.com',
          emailHint: 'Alice@Example.com',
        }),
      );
    });
  });

  // =========================================================================
  // showConsent — GET /interaction/:uid/consent
  // =========================================================================

  describe('GET /:uid/consent — showConsent', () => {
    it('should auto-consent for first-party client (same org)', async () => {
      const provider = createMockProvider();
      // First-party: client's organizationId matches the current org
      provider.Client.find.mockResolvedValue({
        metadata: () => ({
          client_name: 'First-Party App',
          organizationId: 'org-uuid-1', // same as current org
        }),
      });

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid/consent');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Should create a Grant and finish the interaction
      expect(provider.Grant).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: 'client-id-abc' }),
      );
      expect(provider._mockGrant.addOIDCScope).toHaveBeenCalled();
      expect(provider._mockGrant.save).toHaveBeenCalled();
      expect(provider.interactionFinished).toHaveBeenCalledWith(
        ctx.req, ctx.res,
        { consent: { grantId: 'grant-id-123' } },
        { mergeWithLastSubmission: true },
      );

      // Should NOT render a consent page
      expect(templateEngine.renderPage).not.toHaveBeenCalled();

      // Should audit log auto-consent
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.consent.granted' }),
      );
    });

    it('should render consent page for third-party client', async () => {
      const provider = createMockProvider();
      // Third-party: no organizationId or different one
      provider.Client.find.mockResolvedValue({
        metadata: () => ({
          client_name: 'Third-Party App',
          organizationId: undefined,
        }),
      });

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid/consent');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Should render the consent page
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'consent',
        expect.objectContaining({
          clientName: 'Third-Party App',
          scopes: expect.arrayContaining(['openid', 'profile', 'email']),
        }),
      );

      // Should NOT finish the interaction automatically
      expect(provider.interactionFinished).not.toHaveBeenCalled();
    });

    it('should render error page when provider fails', async () => {
      const provider = createMockProvider();
      provider.interactionDetails.mockRejectedValue(new Error('Expired'));

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid/consent');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ errorMessage: expect.any(String) }),
      );
      expect(ctx.status).toBe(400);
    });
  });

  // =========================================================================
  // processConsent — POST /interaction/:uid/confirm
  // =========================================================================

  describe('POST /:uid/confirm — processConsent', () => {
    it('should approve consent and create grant', async () => {
      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/confirm');
      const ctx = createMockCtx({
        body: { decision: 'approve', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      // Should create a Grant with requested scopes
      expect(provider.Grant).toHaveBeenCalled();
      expect(provider._mockGrant.addOIDCScope).toHaveBeenCalled();
      expect(provider._mockGrant.save).toHaveBeenCalled();

      // Should finish interaction with consent grant
      expect(provider.interactionFinished).toHaveBeenCalledWith(
        ctx.req, ctx.res,
        { consent: { grantId: 'grant-id-123' } },
        { mergeWithLastSubmission: true },
      );

      // Should audit log consent granted
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.consent.granted' }),
      );
    });

    it('should deny consent with access_denied error', async () => {
      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/confirm');
      const ctx = createMockCtx({
        body: { decision: 'deny', _csrf: 'tok' },
      });

      await exec(layer!, ctx);

      // Should finish interaction with access_denied
      expect(provider.interactionFinished).toHaveBeenCalledWith(
        ctx.req, ctx.res,
        { error: 'access_denied', error_description: 'User denied consent' },
        { mergeWithLastSubmission: false },
      );

      // Should audit log consent denied
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.consent.denied' }),
      );
    });

    it('should reject on CSRF mismatch and return 403', async () => {
      vi.mocked(csrf.verifyCsrfToken).mockReturnValue(false);

      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'POST', '/:uid/confirm');
      const ctx = createMockCtx({
        body: { decision: 'approve', _csrf: 'bad' },
      });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(403);
      expect(ctx.body).toBe('Invalid CSRF token');

      // Should NOT finish the interaction
      expect(provider.interactionFinished).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // abortInteraction — GET /interaction/:uid/abort
  // =========================================================================

  describe('GET /:uid/abort — abortInteraction', () => {
    it('should abort interaction with access_denied', async () => {
      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid/abort');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Should finish interaction with access_denied
      expect(provider.interactionFinished).toHaveBeenCalledWith(
        ctx.req, ctx.res,
        { error: 'access_denied', error_description: 'User aborted the interaction' },
        { mergeWithLastSubmission: false },
      );

      // Should audit log the abort
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.consent.denied' }),
      );
    });

    it('should render error page when provider fails', async () => {
      const provider = createMockProvider();
      provider.interactionDetails.mockRejectedValue(new Error('Expired'));

      const router = createInteractionRouter(provider as never);
      const layer = findLayer(router, 'GET', '/:uid/abort');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ errorMessage: expect.any(String) }),
      );
      expect(ctx.status).toBe(400);
    });
  });

  // =========================================================================
  // Router structure
  // =========================================================================

  describe('router structure', () => {
    it('should have the correct prefix', () => {
      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      expect(router.opts.prefix).toBe(PREFIX);
    });

    it('should register all expected routes', () => {
      const provider = createMockProvider();
      const router = createInteractionRouter(provider as never);
      const paths = router.stack.map(
        (l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`,
      );

      expect(paths).toContain(`GET ${PREFIX}/:uid`);
      expect(paths).toContain(`POST ${PREFIX}/:uid/login`);
      expect(paths).toContain(`POST ${PREFIX}/:uid/magic-link`);
      expect(paths).toContain(`GET ${PREFIX}/:uid/consent`);
      expect(paths).toContain(`POST ${PREFIX}/:uid/confirm`);
      expect(paths).toContain(`GET ${PREFIX}/:uid/abort`);
    });
  });
});
