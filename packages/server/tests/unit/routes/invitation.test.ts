/**
 * Unit tests for invitation acceptance route handlers (deferred model).
 *
 * Tests the accept-invite flow:
 *   - showAcceptInvite: non-mutating confirmation page, password step, expired/email-conflict
 *   - processAcceptInvite: CSRF, token re-validation, password validation, acceptance
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

vi.mock('../../../src/auth/tokens.js', () => ({
  hashToken: vi.fn().mockReturnValue('hashed-token-abc'),
}));

vi.mock('../../../src/auth/token-repository.js', () => ({
  findValidInvitationToken: vi.fn(),
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  }),
}));

vi.mock('../../../src/auth/i18n.js', () => ({
  resolveLocale: vi.fn().mockResolvedValue('en'),
  getTranslationFunction: vi.fn().mockReturnValue((key: string) => `t:${key}`),
}));

vi.mock('../../../src/auth/template-engine.js', () => ({
  renderPage: vi.fn().mockResolvedValue('<html>rendered</html>'),
}));

vi.mock('../../../src/users/service.js', () => ({
  getUserByEmail: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../src/users/invitation-service.js', () => ({
  acceptInvitation: vi.fn(),
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

vi.mock('../../../src/config/index.js', () => ({
  config: { issuerBaseUrl: 'https://auth.example.com' },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { createInvitationRouter } from '../../../src/routes/invitation.js';
import * as csrf from '../../../src/auth/csrf.js';
import * as tokenRepo from '../../../src/auth/token-repository.js';
import * as userService from '../../../src/users/service.js';
import * as invitationService from '../../../src/users/invitation-service.js';
import * as passwordUtils from '../../../src/users/password.js';
import * as auditLog from '../../../src/lib/audit-log.js';
import * as templateEngine from '../../../src/auth/template-engine.js';
import type { Organization } from '../../../src/organizations/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-uuid-1',
    name: 'Test Org',
    slug: 'test-org',
    status: 'active',
    isSuperAdmin: false,
    brandingLogoUrl: null,
    brandingFaviconUrl: null,
    brandingPrimaryColor: '#3B82F6',
    brandingCompanyName: 'Test Corp',
    brandingCustomCss: null,
    defaultLocale: 'en',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function createMockCtx(
  overrides: {
    params?: Record<string, string>;
    query?: Record<string, string>;
    body?: Record<string, string>;
  } = {},
) {
  let statusCode = 200;
  let responseBody: unknown = undefined;
  let contentType = '';

  return {
    params: { orgSlug: 'test-org', token: 'invite-token-123', ...(overrides.params ?? {}) },
    query: overrides.query ?? {},
    request: { body: overrides.body ?? {} },
    req: {},
    res: {},
    ip: '127.0.0.1',
    get status() {
      return statusCode;
    },
    set status(v: number) {
      statusCode = v;
    },
    get body() {
      return responseBody;
    },
    set body(v: unknown) {
      responseBody = v;
    },
    get type() {
      return contentType;
    },
    set type(v: string) {
      contentType = v;
    },
    state: { organization: createMockOrg() },
    cookies: {
      get: vi.fn().mockReturnValue('csrf-token-abc'),
      set: vi.fn(),
    },
    get: vi.fn().mockReturnValue(''),
  };
}

/** A valid deferred invitation as returned by the repository. */
function deferredInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tok-1',
    userId: null,
    tokenHash: 'hashed-token-abc',
    expiresAt: new Date('2026-10-03T00:00:00Z'),
    usedAt: null,
    createdAt: new Date('2026-09-26T00:00:00Z'),
    details: null,
    invitedBy: 'admin-1',
    organizationId: 'org-uuid-1',
    email: 'invitee@example.com',
    givenName: 'Bob',
    familyName: 'Jones',
    locale: 'en',
    ...overrides,
  };
}

function findLayer(
  router: ReturnType<typeof createInvitationRouter>,
  method: string,
  pathPattern: string,
) {
  return router.stack.find((l) => l.methods.includes(method) && l.path.includes(pathPattern));
}

async function exec(
  layer: NonNullable<ReturnType<typeof findLayer>>,
  ctx: ReturnType<typeof createMockCtx>,
) {
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
    vi.mocked(userService.getUserByEmail).mockResolvedValue(null);
  });

  // =========================================================================
  // showAcceptInvite
  // =========================================================================

  describe('GET /:orgSlug/auth/accept-invite/:token — showAcceptInvite', () => {
    it('should render the non-mutating confirmation page for a valid token', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(
        deferredInvitation() as never,
      );

      const ctx = createMockCtx();
      await exec(findLayer(createInvitationRouter(), 'GET', 'accept-invite')!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'confirm-invite',
        expect.objectContaining({ token: 'invite-token-123', csrfToken: 'csrf-token-abc' }),
      );
      expect(ctx.status).toBe(200);
      expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
    });

    it('should render the password form when step=password is requested', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(
        deferredInvitation() as never,
      );

      const ctx = createMockCtx({ query: { step: 'password' } });
      await exec(findLayer(createInvitationRouter(), 'GET', 'accept-invite')!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'accept-invite',
        expect.objectContaining({
          token: 'invite-token-123',
          email: 'invitee@example.com',
        }),
      );
      expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
    });

    it('should render invite-expired page for an invalid token', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);

      const ctx = createMockCtx();
      await exec(findLayer(createInvitationRouter(), 'GET', 'accept-invite')!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'invite-expired',
        expect.objectContaining({ orgSlug: 'test-org' }),
      );
      expect(ctx.status).toBe(400);
    });

    it('should emit one security rejection audit event for an invalid token', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);

      const ctx = createMockCtx();
      await exec(findLayer(createInvitationRouter(), 'GET', 'accept-invite')!, ctx);

      expect(auditLog.writeAuditLog).toHaveBeenCalledTimes(1);
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.invite.failed', eventCategory: 'security' }),
      );
      expect(JSON.stringify(vi.mocked(auditLog.writeAuditLog).mock.calls)).not.toContain(
        'invite-token-123',
      );
    });

    it('should render the same expired page when a user already exists for the email', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(
        deferredInvitation() as never,
      );
      vi.mocked(userService.getUserByEmail).mockResolvedValue({ id: 'existing' } as never);

      const ctx = createMockCtx();
      await exec(findLayer(createInvitationRouter(), 'GET', 'accept-invite')!, ctx);

      expect(ctx.status).toBe(400);
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'invite-expired',
        expect.objectContaining({ orgSlug: 'test-org' }),
      );
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.invite.failed' }),
      );
    });

    it('should scope the invitation lookup to the resolved organization', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);

      const ctx = createMockCtx();
      await exec(findLayer(createInvitationRouter(), 'GET', 'accept-invite')!, ctx);

      expect(tokenRepo.findValidInvitationToken).toHaveBeenCalledWith(
        'hashed-token-abc',
        'org-uuid-1',
      );
    });

    it('should reject an invitation token issued by another organization', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);

      const ctx = createMockCtx();
      ctx.state.organization = createMockOrg({ id: 'org-uuid-bravo', slug: 'bravo' });
      await exec(findLayer(createInvitationRouter(), 'GET', 'accept-invite')!, ctx);

      expect(tokenRepo.findValidInvitationToken).toHaveBeenCalledWith(
        'hashed-token-abc',
        'org-uuid-bravo',
      );
      expect(ctx.status).toBe(400);
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'invite-expired',
        expect.objectContaining({ orgSlug: 'bravo' }),
      );
    });
  });

  // =========================================================================
  // processAcceptInvite
  // =========================================================================

  describe('POST /:orgSlug/auth/accept-invite/:token — processAcceptInvite', () => {
    function validBody() {
      return { password: 'SecurePass123!', confirmPassword: 'SecurePass123!', _csrf: 'tok' };
    }

    it('should create the account through acceptInvitation and render success', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(
        deferredInvitation() as never,
      );
      vi.mocked(invitationService.acceptInvitation).mockResolvedValue({
        userId: 'user-uuid-1',
        email: 'invitee@example.com',
      });

      const ctx = createMockCtx({ body: validBody() });
      await exec(findLayer(createInvitationRouter(), 'POST', 'accept-invite')!, ctx);

      expect(invitationService.acceptInvitation).toHaveBeenCalledWith({
        tokenHash: 'hashed-token-abc',
        organizationId: 'org-uuid-1',
        password: 'SecurePass123!',
      });
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.invite.accepted', userId: 'user-uuid-1' }),
      );
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'invite-success',
        expect.objectContaining({ flash: { success: expect.any(String) } }),
      );
    });

    it('should scope the acceptance lookup to the resolved organization', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(
        deferredInvitation() as never,
      );
      vi.mocked(invitationService.acceptInvitation).mockResolvedValue({
        userId: 'user-uuid-1',
        email: 'invitee@example.com',
      });

      const ctx = createMockCtx({ body: validBody() });
      await exec(findLayer(createInvitationRouter(), 'POST', 'accept-invite')!, ctx);

      expect(tokenRepo.findValidInvitationToken).toHaveBeenCalledWith(
        'hashed-token-abc',
        'org-uuid-1',
      );
    });

    it('should render invite-expired when the token is invalid during submission', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);

      const ctx = createMockCtx({ body: validBody() });
      await exec(findLayer(createInvitationRouter(), 'POST', 'accept-invite')!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'invite-expired',
        expect.objectContaining({ orgSlug: 'test-org' }),
      );
      expect(ctx.status).toBe(400);
      expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
    });

    it('should emit one security rejection audit event for an invalid token', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);

      const ctx = createMockCtx({ body: validBody() });
      await exec(findLayer(createInvitationRouter(), 'POST', 'accept-invite')!, ctx);

      expect(auditLog.writeAuditLog).toHaveBeenCalledTimes(1);
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.invite.failed', eventCategory: 'security' }),
      );
      expect(JSON.stringify(vi.mocked(auditLog.writeAuditLog).mock.calls)).not.toContain(
        'invite-token-123',
      );
    });

    it('should not emit a rejection audit event on successful acceptance', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(
        deferredInvitation() as never,
      );
      vi.mocked(invitationService.acceptInvitation).mockResolvedValue({
        userId: 'user-uuid-1',
        email: 'invitee@example.com',
      });

      const ctx = createMockCtx({ body: validBody() });
      await exec(findLayer(createInvitationRouter(), 'POST', 'accept-invite')!, ctx);

      const eventTypes = vi
        .mocked(auditLog.writeAuditLog)
        .mock.calls.map((call) => (call[0] as { eventType: string }).eventType);
      expect(eventTypes).toContain('user.invite.accepted');
      expect(eventTypes).not.toContain('user.invite.failed');
    });

    it('should render the expired page when acceptance is rejected as a conflict', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(
        deferredInvitation() as never,
      );
      vi.mocked(invitationService.acceptInvitation).mockResolvedValue(null);

      const ctx = createMockCtx({ body: validBody() });
      await exec(findLayer(createInvitationRouter(), 'POST', 'accept-invite')!, ctx);

      expect(ctx.status).toBe(400);
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'invite-expired',
        expect.objectContaining({ orgSlug: 'test-org' }),
      );
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.invite.failed' }),
      );
    });

    it('should reject on CSRF mismatch', async () => {
      vi.mocked(csrf.verifyCsrfToken).mockReturnValue(false);

      const ctx = createMockCtx({
        body: { password: 'pass', confirmPassword: 'pass', _csrf: 'bad' },
      });
      await exec(findLayer(createInvitationRouter(), 'POST', 'accept-invite')!, ctx);

      expect(ctx.status).toBe(403);
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'accept-invite',
        expect.objectContaining({ flash: { error: expect.stringContaining('csrf') } }),
      );
      expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
    });

    it('should show error when passwords do not match', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(
        deferredInvitation() as never,
      );

      const ctx = createMockCtx({
        body: { password: 'Password1!', confirmPassword: 'Different!', _csrf: 'tok' },
      });
      await exec(findLayer(createInvitationRouter(), 'POST', 'accept-invite')!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'accept-invite',
        expect.objectContaining({ flash: { error: expect.stringContaining('password_mismatch') } }),
      );
      expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
    });

    it('should show error when password validation fails', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(
        deferredInvitation() as never,
      );
      vi.mocked(passwordUtils.validatePassword).mockReturnValue({
        isValid: false,
        error: 'Too short',
      });

      const ctx = createMockCtx({ body: { password: 'x', confirmPassword: 'x', _csrf: 'tok' } });
      await exec(findLayer(createInvitationRouter(), 'POST', 'accept-invite')!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'accept-invite',
        expect.objectContaining({ flash: { error: 'Too short' } }),
      );
      expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
    });

    it('should show a generic error when acceptance throws', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(
        deferredInvitation() as never,
      );
      vi.mocked(invitationService.acceptInvitation).mockRejectedValue(new Error('DB error'));

      const ctx = createMockCtx({ body: validBody() });
      await exec(findLayer(createInvitationRouter(), 'POST', 'accept-invite')!, ctx);

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
