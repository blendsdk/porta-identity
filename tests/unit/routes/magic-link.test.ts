/**
 * Unit tests for magic link verification route handler.
 *
 * Tests the GET /:orgSlug/auth/magic-link/:token endpoint that verifies
 * magic link tokens and resumes the OIDC interaction flow.
 *
 * Test groups:
 *   - verifyMagicLink: token validation, user checks, OIDC flow resume
 *   - error handling: expired/invalid tokens, inactive users, provider failures
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

function createMockProvider() {
  return {
    interactionFinished: vi.fn().mockResolvedValue(undefined),
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
  });

  describe('GET /:orgSlug/auth/magic-link/:token — verifyMagicLink', () => {
    it('should verify valid token and resume OIDC flow', async () => {
      const tokenRecord = { id: 'token-id-1', userId: 'user-uuid-1' };
      const user = { id: 'user-uuid-1', email: 'user@test.com', status: 'active' };
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(tokenRecord as never);
      vi.mocked(userService.getUserById).mockResolvedValue(user as never);

      const provider = createMockProvider();
      const router = createMagicLinkRouter(provider as never);
      const layer = findLayer(router, 'GET', 'magic-link');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Should mark token as used
      expect(tokenRepo.markTokenUsed).toHaveBeenCalledWith('magic_link_tokens', 'token-id-1');
      // Should mark email verified
      expect(userService.markEmailVerified).toHaveBeenCalledWith('user-uuid-1');
      // Should record login
      expect(userService.recordLogin).toHaveBeenCalledWith('user-uuid-1');
      // Should resume OIDC flow
      expect(provider.interactionFinished).toHaveBeenCalledWith(
        ctx.req, ctx.res,
        { login: { accountId: 'user-uuid-1' } },
        { mergeWithLastSubmission: false },
      );
      // Should audit log
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.login.magic_link' }),
      );
    });

    it('should show error page for invalid/expired token', async () => {
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(null);

      const provider = createMockProvider();
      const router = createMagicLinkRouter(provider as never);
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

      const provider = createMockProvider();
      const router = createMagicLinkRouter(provider as never);
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

      const provider = createMockProvider();
      const router = createMagicLinkRouter(provider as never);
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

    it('should redirect to login when no interaction UID provided', async () => {
      const tokenRecord = { id: 'token-id-1', userId: 'user-uuid-1' };
      const user = { id: 'user-uuid-1', email: 'user@test.com', status: 'active' };
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(tokenRecord as never);
      vi.mocked(userService.getUserById).mockResolvedValue(user as never);

      const provider = createMockProvider();
      const router = createMagicLinkRouter(provider as never);
      const layer = findLayer(router, 'GET', 'magic-link');
      // No interaction query param
      const ctx = createMockCtx({ query: {} });

      await exec(layer!, ctx);

      // Without interaction UID, should redirect
      expect(ctx.redirect).toHaveBeenCalledWith(expect.stringContaining('/auth/forgot-password'));
    });

    it('should redirect when OIDC interaction has expired', async () => {
      const tokenRecord = { id: 'token-id-1', userId: 'user-uuid-1' };
      const user = { id: 'user-uuid-1', email: 'user@test.com', status: 'active' };
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(tokenRecord as never);
      vi.mocked(userService.getUserById).mockResolvedValue(user as never);

      const provider = createMockProvider();
      provider.interactionFinished.mockRejectedValue(new Error('Interaction expired'));

      const router = createMagicLinkRouter(provider as never);
      const layer = findLayer(router, 'GET', 'magic-link');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      // Token is still used and login recorded, but user is redirected
      expect(tokenRepo.markTokenUsed).toHaveBeenCalled();
      expect(userService.recordLogin).toHaveBeenCalled();
      expect(ctx.redirect).toHaveBeenCalled();
    });

    it('should render generic error on unexpected exception', async () => {
      vi.mocked(tokenRepo.findValidToken).mockRejectedValue(new Error('DB down'));

      const provider = createMockProvider();
      const router = createMagicLinkRouter(provider as never);
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
      const provider = createMockProvider();
      const router = createMagicLinkRouter(provider as never);
      const paths = router.stack.map(
        (l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`,
      );
      expect(paths).toContain('GET /:orgSlug/auth/magic-link/:token');
    });
  });
});
