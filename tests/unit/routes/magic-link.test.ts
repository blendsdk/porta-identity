/**
 * Unit tests for magic link verification route handler.
 *
 * Tests the GET /:orgSlug/auth/magic-link/:token endpoint that verifies
 * magic link tokens, creates a `_ml_session` in Redis, and redirects to
 * the interaction login page for OIDC flow completion.
 *
 * Test groups:
 *   - verifyMagicLink: token validation, user checks, session creation + redirect
 *   - error handling: expired/invalid tokens, inactive users
 *   - router structure: route registration verification
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before imports (hoisted by vitest)
// ---------------------------------------------------------------------------

vi.mock('../../../src/auth/tokens.js', () => ({
  hashToken: vi.fn().mockReturnValue('hashed-token-abc'),
}));

vi.mock('../../../src/auth/token-repository.js', () => ({
  findValidToken: vi.fn(),
  markTokenUsed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/auth/i18n.js', () => ({
  resolveLocale: vi.fn().mockResolvedValue('en'),
  getTranslationFunction: vi.fn().mockReturnValue((key: string) => `t:${key}`),
}));

vi.mock('../../../src/auth/template-engine.js', () => ({
  renderPage: vi.fn().mockResolvedValue('<html>rendered</html>'),
}));

vi.mock('../../../src/auth/csrf.js', () => ({
  generateCsrfToken: vi.fn().mockReturnValue('csrf-token-abc'),
}));

vi.mock('../../../src/users/service.js', () => ({
  getUserById: vi.fn(),
  recordLogin: vi.fn().mockResolvedValue(undefined),
  markEmailVerified: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/auth/magic-link-session.js', () => ({
  createMagicLinkSession: vi.fn().mockResolvedValue(undefined),
  createMagicLinkPreAuth: vi.fn().mockResolvedValue(undefined),
  getMagicLinkAuthContext: vi.fn().mockResolvedValue({
    clientId: 'client-id-1',
    redirectUri: 'http://localhost:4000/callback.html',
    scope: 'openid profile email',
    state: 'original-state-abc',
    nonce: 'nonce-123',
    codeChallenge: 'challenge-xyz',
    codeChallengeMethod: 'S256',
    responseType: 'code',
    orgSlug: 'test-org',
  }),
  buildAuthorizationUrl: vi.fn().mockReturnValue('http://localhost:3000/test-org/auth?client_id=client-id-1&redirect_uri=http%3A%2F%2Flocalhost%3A4000%2Fcallback.html&response_type=code&scope=openid+profile+email&state=original-state-abc'),
  renderRedirectPage: vi.fn(),
}));

vi.mock('../../../src/config/index.js', () => ({
  config: { issuerBaseUrl: 'http://localhost:3000' },
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { createMagicLinkRouter } from '../../../src/routes/magic-link.js';
import * as tokenRepo from '../../../src/auth/token-repository.js';
import * as userService from '../../../src/users/service.js';
import * as auditLog from '../../../src/lib/audit-log.js';
import * as templateEngine from '../../../src/auth/template-engine.js';
import * as mlSession from '../../../src/auth/magic-link-session.js';
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
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function createMockCtx(overrides: {
  params?: Record<string, string>;
  query?: Record<string, string>;
} = {}) {
  let statusCode = 200;
  let responseBody: unknown = undefined;
  let contentType = '';

  return {
    params: { orgSlug: 'test-org', token: 'plain-token-123', ...(overrides.params ?? {}) },
    query: overrides.query ?? { interaction: 'interaction-uid-1' },
    request: { body: {} },
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
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
    },
    get: vi.fn().mockReturnValue(''),
    redirect: vi.fn(),
  };
}

function findLayer(router: ReturnType<typeof createMagicLinkRouter>, method: string, pathPattern: string) {
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

describe('magic link routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(templateEngine.renderPage).mockResolvedValue('<html>rendered</html>');
    // Restore default mock return values that individual tests may override.
    // vi.clearAllMocks() clears call history but does NOT reset mockReturnValue.
    vi.mocked(mlSession.getMagicLinkAuthContext).mockResolvedValue({
      clientId: 'client-id-1',
      redirectUri: 'http://localhost:4000/callback.html',
      scope: 'openid profile email',
      state: 'original-state-abc',
      nonce: 'nonce-123',
      codeChallenge: 'challenge-xyz',
      codeChallengeMethod: 'S256',
      responseType: 'code',
      orgSlug: 'test-org',
    });
    vi.mocked(mlSession.createMagicLinkPreAuth).mockResolvedValue(undefined);
  });

  describe('GET /:orgSlug/auth/magic-link/:token — verifyMagicLink', () => {
    it('should verify valid token and use pre-auth flow with redirect page', async () => {
      const tokenRecord = { id: 'token-id-1', userId: 'user-uuid-1' };
      const user = { id: 'user-uuid-1', email: 'user@test.com', status: 'active' };
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(tokenRecord as never);
      vi.mocked(userService.getUserById).mockResolvedValue(user as never);

      const router = createMagicLinkRouter();
      const layer = findLayer(router, 'GET', 'magic-link');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Should mark token as used
      expect(tokenRepo.markTokenUsed).toHaveBeenCalledWith('magic_link_tokens', 'token-id-1');
      // Should mark email verified
      expect(userService.markEmailVerified).toHaveBeenCalledWith('user-uuid-1');
      // Should record login
      expect(userService.recordLogin).toHaveBeenCalledWith('user-uuid-1');
      // Should get auth context from Redis
      expect(mlSession.getMagicLinkAuthContext).toHaveBeenCalledWith('interaction-uid-1');
      // Should create pre-auth session (NOT legacy _ml_session)
      expect(mlSession.createMagicLinkPreAuth).toHaveBeenCalledWith(
        ctx,
        { userId: 'user-uuid-1', organizationId: 'org-uuid-1' },
      );
      // Should build authorization URL and render redirect page
      expect(mlSession.buildAuthorizationUrl).toHaveBeenCalledWith(
        'http://localhost:3000',
        expect.objectContaining({ clientId: 'client-id-1' }),
      );
      expect(mlSession.renderRedirectPage).toHaveBeenCalledWith(ctx, expect.any(String));
      // Should NOT use legacy _ml_session flow
      expect(mlSession.createMagicLinkSession).not.toHaveBeenCalled();
      expect(ctx.redirect).not.toHaveBeenCalled();
      // Should audit log
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.login.magic_link' }),
      );
    });

    it('should fall back to legacy _ml_session when no auth context found', async () => {
      const tokenRecord = { id: 'token-id-1', userId: 'user-uuid-1' };
      const user = { id: 'user-uuid-1', email: 'user@test.com', status: 'active' };
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(tokenRecord as never);
      vi.mocked(userService.getUserById).mockResolvedValue(user as never);
      // No auth context — simulate magic link generated before pre-auth deployment
      vi.mocked(mlSession.getMagicLinkAuthContext).mockResolvedValue(null);

      const router = createMagicLinkRouter();
      const layer = findLayer(router, 'GET', 'magic-link');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Should use legacy _ml_session flow
      expect(mlSession.createMagicLinkSession).toHaveBeenCalledWith(
        ctx,
        { userId: 'user-uuid-1', interactionUid: 'interaction-uid-1', organizationId: 'org-uuid-1' },
      );
      expect(ctx.redirect).toHaveBeenCalledWith('/interaction/interaction-uid-1');
      // Should NOT use pre-auth flow
      expect(mlSession.createMagicLinkPreAuth).not.toHaveBeenCalled();
    });

    it('should show error page for invalid/expired token', async () => {
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(null);

      const router = createMagicLinkRouter();
      const layer = findLayer(router, 'GET', 'magic-link');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Should render error page
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ errorMessage: expect.stringContaining('magic_link_expired') }),
      );
      expect(ctx.status).toBe(400);
      // Should audit log failure
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.magic_link.failed' }),
      );
    });

    it('should show error page when user not found or inactive', async () => {
      const tokenRecord = { id: 'token-id-1', userId: 'user-uuid-1' };
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(tokenRecord as never);
      vi.mocked(userService.getUserById).mockResolvedValue(null);

      const router = createMagicLinkRouter();
      const layer = findLayer(router, 'GET', 'magic-link');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ errorMessage: expect.stringContaining('magic_link_expired') }),
      );
      expect(ctx.status).toBe(400);
    });

    it('should show error page when user is inactive', async () => {
      const tokenRecord = { id: 'token-id-1', userId: 'user-uuid-1' };
      const user = { id: 'user-uuid-1', email: 'user@test.com', status: 'suspended' };
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(tokenRecord as never);
      vi.mocked(userService.getUserById).mockResolvedValue(user as never);

      const router = createMagicLinkRouter();
      const layer = findLayer(router, 'GET', 'magic-link');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Non-active user should see error
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ errorMessage: expect.any(String) }),
      );
      expect(ctx.status).toBe(400);
    });

    it('should show success page when no interaction UID provided', async () => {
      const tokenRecord = { id: 'token-id-1', userId: 'user-uuid-1' };
      const user = { id: 'user-uuid-1', email: 'user@test.com', status: 'active' };
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(tokenRecord as never);
      vi.mocked(userService.getUserById).mockResolvedValue(user as never);

      const router = createMagicLinkRouter();
      const layer = findLayer(router, 'GET', 'magic-link');
      // No interaction query param
      const ctx = createMockCtx({ query: {} });

      await exec(layer!, ctx);

      // Without interaction UID, should render magic-link-success page
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'magic-link-success',
        expect.objectContaining({ orgSlug: 'test-org' }),
      );
      expect(ctx.status).toBe(200);
      // Should NOT create _ml_session or pre-auth
      expect(mlSession.createMagicLinkSession).not.toHaveBeenCalled();
      expect(mlSession.createMagicLinkPreAuth).not.toHaveBeenCalled();
    });

    it('should show error page when pre-auth creation fails', async () => {
      const tokenRecord = { id: 'token-id-1', userId: 'user-uuid-1' };
      const user = { id: 'user-uuid-1', email: 'user@test.com', status: 'active' };
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(tokenRecord as never);
      vi.mocked(userService.getUserById).mockResolvedValue(user as never);
      vi.mocked(mlSession.createMagicLinkPreAuth).mockRejectedValue(new Error('Redis down'));

      const router = createMagicLinkRouter();
      const layer = findLayer(router, 'GET', 'magic-link');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Token is still used and login recorded
      expect(tokenRepo.markTokenUsed).toHaveBeenCalled();
      expect(userService.recordLogin).toHaveBeenCalled();
      // But error page is shown (caught by outer try/catch)
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ errorMessage: expect.stringContaining('generic') }),
      );
    });

    it('should render generic error on unexpected exception', async () => {
      vi.mocked(tokenRepo.findValidToken).mockRejectedValue(new Error('DB down'));

      const router = createMagicLinkRouter();
      const layer = findLayer(router, 'GET', 'magic-link');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ errorMessage: expect.stringContaining('generic') }),
      );
    });
  });

  describe('router structure', () => {
    it('should register the magic link route', () => {
      const router = createMagicLinkRouter();
      const paths = router.stack.map(
        (l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`,
      );
      expect(paths).toContain('GET /:orgSlug/auth/magic-link/:token');
    });
  });
});
