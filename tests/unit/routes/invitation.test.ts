/**
 * Unit tests for invitation acceptance route handlers.
 *
 * Tests the accept-invite flow:
 *   - showAcceptInvite: token validation, form rendering, expired page
 *   - processAcceptInvite: CSRF, token re-validation, password validation
 *   - router structure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../src/auth/csrf.js', () => ({
  generateCsrfToken: vi.fn().mockReturnValue('csrf-token-abc'),
  verifyCsrfToken: vi.fn().mockReturnValue(true),
}));

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

vi.mock('../../../src/users/service.js', () => ({
  setUserPassword: vi.fn().mockResolvedValue(undefined),
  markEmailVerified: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/users/password.js', () => ({
  validatePassword: vi.fn().mockReturnValue({ isValid: true }),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { createInvitationRouter } from '../../../src/routes/invitation.js';
import * as csrf from '../../../src/auth/csrf.js';
import * as tokenRepo from '../../../src/auth/token-repository.js';
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

  return {
    params: { orgSlug: 'test-org', token: 'invite-token-123', ...(overrides.params ?? {}) },
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
    get: vi.fn().mockReturnValue(''),
  };
}

function findLayer(router: ReturnType<typeof createInvitationRouter>, method: string, pathPattern: string) {
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

describe('invitation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(csrf.verifyCsrfToken).mockReturnValue(true);
    vi.mocked(templateEngine.renderPage).mockResolvedValue('<html>rendered</html>');
    vi.mocked(passwordUtils.validatePassword).mockReturnValue({ isValid: true });
  });

  // =========================================================================
  // showAcceptInvite
  // =========================================================================

  describe('GET /:orgSlug/auth/accept-invite/:token — showAcceptInvite', () => {
    it('should render accept-invite form for valid token', async () => {
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue({ id: 'tok-1', userId: 'user-1' } as never);

      const router = createInvitationRouter();
      const layer = findLayer(router, 'GET', 'accept-invite');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'accept-invite',
        expect.objectContaining({ token: 'invite-token-123', csrfToken: 'csrf-token-abc' }),
      );
      expect(ctx.status).toBe(200);
    });

    it('should render invite-expired page for invalid token', async () => {
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(null);

      const router = createInvitationRouter();
      const layer = findLayer(router, 'GET', 'accept-invite');
      const ctx = createMockCtx();

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'invite-expired',
        expect.objectContaining({ orgSlug: 'test-org' }),
      );
      expect(ctx.status).toBe(400);
    });
  });

  // =========================================================================
  // processAcceptInvite
  // =========================================================================

  describe('POST /:orgSlug/auth/accept-invite/:token — processAcceptInvite', () => {
    it('should set password, verify email, and render success page', async () => {
      const tokenRecord = { id: 'tok-1', userId: 'user-uuid-1' };
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(tokenRecord as never);

      const router = createInvitationRouter();
      const layer = findLayer(router, 'POST', 'accept-invite');
      const ctx = createMockCtx({
        body: { password: 'SecurePass123!', confirmPassword: 'SecurePass123!', _csrf: 'tok', _csrfStored: 'tok' },
      });

      await exec(layer!, ctx);

      // Should set password
      expect(userService.setUserPassword).toHaveBeenCalledWith('user-uuid-1', 'SecurePass123!');
      // Should mark email verified
      expect(userService.markEmailVerified).toHaveBeenCalledWith('user-uuid-1');
      // Should mark token used
      expect(tokenRepo.markTokenUsed).toHaveBeenCalledWith('invitation_tokens', 'tok-1');
      // Should audit log
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.invite.accepted' }),
      );
      // Should render success page
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'invite-success',
        expect.objectContaining({ flash: { success: expect.any(String) } }),
      );
    });

    it('should reject on CSRF mismatch', async () => {
      vi.mocked(csrf.verifyCsrfToken).mockReturnValue(false);

      const router = createInvitationRouter();
      const layer = findLayer(router, 'POST', 'accept-invite');
      const ctx = createMockCtx({
        body: { password: 'pass', confirmPassword: 'pass', _csrf: 'bad', _csrfStored: 'good' },
      });

      await exec(layer!, ctx);

      expect(ctx.status).toBe(403);
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'accept-invite',
        expect.objectContaining({ flash: { error: expect.stringContaining('csrf') } }),
      );
    });

    it('should render invite-expired when token expired during submission', async () => {
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue(null);

      const router = createInvitationRouter();
      const layer = findLayer(router, 'POST', 'accept-invite');
      const ctx = createMockCtx({
        body: { password: 'SecurePass123!', confirmPassword: 'SecurePass123!', _csrf: 'tok', _csrfStored: 'tok' },
      });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'invite-expired',
        expect.objectContaining({ orgSlug: 'test-org' }),
      );
      expect(ctx.status).toBe(400);
    });

    it('should show error when passwords do not match', async () => {
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue({ id: 'tok-1', userId: 'user-1' } as never);

      const router = createInvitationRouter();
      const layer = findLayer(router, 'POST', 'accept-invite');
      const ctx = createMockCtx({
        body: { password: 'Password1!', confirmPassword: 'Different!', _csrf: 'tok', _csrfStored: 'tok' },
      });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'accept-invite',
        expect.objectContaining({ flash: { error: expect.stringContaining('password_mismatch') } }),
      );
    });

    it('should show error when password validation fails', async () => {
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue({ id: 'tok-1', userId: 'user-1' } as never);
      vi.mocked(passwordUtils.validatePassword).mockReturnValue({ isValid: false, error: 'Too short' });

      const router = createInvitationRouter();
      const layer = findLayer(router, 'POST', 'accept-invite');
      const ctx = createMockCtx({
        body: { password: 'x', confirmPassword: 'x', _csrf: 'tok', _csrfStored: 'tok' },
      });

      await exec(layer!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'accept-invite',
        expect.objectContaining({ flash: { error: 'Too short' } }),
      );
    });

    it('should show error when setUserPassword throws', async () => {
      vi.mocked(tokenRepo.findValidToken).mockResolvedValue({ id: 'tok-1', userId: 'user-1' } as never);
      vi.mocked(userService.setUserPassword).mockRejectedValue(new Error('DB error'));

      const router = createInvitationRouter();
      const layer = findLayer(router, 'POST', 'accept-invite');
      const ctx = createMockCtx({
        body: { password: 'SecurePass123!', confirmPassword: 'SecurePass123!', _csrf: 'tok', _csrfStored: 'tok' },
      });

      await exec(layer!, ctx);

      // Should render form with generic error
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'accept-invite',
        expect.objectContaining({ flash: { error: expect.stringContaining('generic') } }),
      );
    });
  });

  // =========================================================================
  // Router structure
  // =========================================================================

  describe('router structure', () => {
    it('should register all invitation routes', () => {
      const router = createInvitationRouter();
      const paths = router.stack.map(
        (l) => `${l.methods.filter((m) => m !== 'HEAD').join(',')} ${l.path}`,
      );

      expect(paths).toContain('GET /:orgSlug/auth/accept-invite/:token');
      expect(paths).toContain('POST /:orgSlug/auth/accept-invite/:token');
    });
  });
});
