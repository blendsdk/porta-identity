/**
 * Route specification for the deferred invitation flow (ST-5–ST-15, ST-18–ST-20, ST-24, ST-34).
 *
 * The admin invite route must store an email/organization-keyed invitation and create no account.
 * The public accept route must show a non-mutating confirmation page first and only create the
 * account through `acceptInvitation` on the POST. Every rejection renders the same generic expired
 * page and audit event.
 *
 * These expectations derive from the feature requirements and the accept-flow design; external
 * boundaries are mocked so the assertions target route behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Router from '@koa/router';

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock('../../../src/auth/csrf.js', () => ({
  generateCsrfToken: vi.fn().mockReturnValue('csrf-token-abc'),
  verifyCsrfToken: vi.fn().mockReturnValue(true),
  setCsrfCookie: vi.fn(),
  getCsrfFromCookie: vi.fn().mockReturnValue('csrf-token-abc'),
}));

vi.mock('../../../src/auth/tokens.js', () => ({
  generateToken: vi.fn().mockReturnValue({ plaintext: 'token-plaintext', hash: 'hashed-token' }),
  hashToken: vi.fn().mockReturnValue('hashed-token'),
}));

vi.mock('../../../src/auth/token-repository.js', () => ({
  replaceInvitation: vi.fn(),
  findValidInvitationToken: vi.fn(),
  markTokenUsed: vi.fn(),
  InvitationConflictError: class InvitationConflictError extends Error {
    constructor() {
      super('A live invitation already exists for this email');
      this.name = 'InvitationConflictError';
    }
  },
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(() => ({ query: poolQuery })),
  afterDatabaseCommit: (fn: () => Promise<void> | void) => fn(),
}));

vi.mock('../../../src/auth/i18n.js', () => ({
  resolveLocale: vi.fn().mockResolvedValue('en'),
  getTranslationFunction: vi.fn().mockReturnValue((key: string) => `t:${key}`),
}));

vi.mock('../../../src/auth/template-engine.js', () => ({
  renderPage: vi.fn().mockResolvedValue('<html>rendered</html>'),
}));

vi.mock('../../../src/auth/effective-branding.js', () => ({
  resolveEffectiveBranding: vi.fn().mockResolvedValue({ imageSources: {} }),
}));

vi.mock('../../../src/users/service.js', () => ({
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  setUserPassword: vi.fn(),
  markEmailVerified: vi.fn(),
}));

vi.mock('../../../src/users/invitation-service.js', () => ({
  acceptInvitation: vi.fn(),
}));

vi.mock('../../../src/users/password.js', () => ({
  validatePassword: vi.fn().mockReturnValue({ isValid: true }),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({ writeAuditLog: vi.fn() }));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/config/index.js', () => ({
  config: { issuerBaseUrl: 'https://auth.example.com' },
}));

vi.mock('../../../src/lib/system-config.js', () => ({ getSystemConfigNumber: vi.fn() }));

vi.mock('../../../src/auth/email-service.js', () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
  renderInvitationEmail: vi.fn().mockResolvedValue({ html: '', text: '', subject: '' }),
}));

vi.mock('../../../src/organizations/service.js', () => ({ getOrganizationById: vi.fn() }));

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/lib/etag.js', () => ({
  setETagHeader: vi.fn(),
  checkIfMatch: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../src/lib/entity-history.js', () => ({ getEntityHistory: vi.fn() }));

import * as csrf from '../../../src/auth/csrf.js';
import * as tokenRepo from '../../../src/auth/token-repository.js';
import * as userService from '../../../src/users/service.js';
import * as invitationService from '../../../src/users/invitation-service.js';
import * as passwordUtils from '../../../src/users/password.js';
import * as auditLog from '../../../src/lib/audit-log.js';
import * as templateEngine from '../../../src/auth/template-engine.js';
import * as systemConfig from '../../../src/lib/system-config.js';
import { getOrganizationById } from '../../../src/organizations/service.js';
import { createUserRouter } from '../../../src/routes/users.js';
import { createInvitationRouter } from '../../../src/routes/invitation.js';
import type { Organization } from '../../../src/organizations/types.js';

const ORG_ID = 'org-uuid-1';
const LIVE_ROLE_ID = 'live-role-id';

function createMockOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: ORG_ID,
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

interface MockCtxOptions {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  adminUser?: Record<string, unknown>;
  organization?: Organization;
}

function createMockCtx(options: MockCtxOptions = {}) {
  let statusCode = 200;
  let responseBody: unknown;
  let contentType = '';
  return {
    params: { orgId: ORG_ID, orgSlug: 'test-org', token: 'presented-token', ...(options.params ?? {}) },
    query: options.query ?? {},
    request: { body: options.body ?? {} },
    req: {},
    res: {},
    ip: '127.0.0.1',
    get status() {
      return statusCode;
    },
    set status(value: number) {
      statusCode = value;
    },
    get body() {
      return responseBody;
    },
    set body(value: unknown) {
      responseBody = value;
    },
    get type() {
      return contentType;
    },
    set type(value: string) {
      contentType = value;
    },
    state: {
      organization: options.organization ?? createMockOrg(),
      adminUser: options.adminUser ?? { id: 'admin-1', givenName: 'Ada', familyName: 'Admin' },
    },
    cookies: { get: vi.fn().mockReturnValue('csrf-token-abc'), set: vi.fn() },
    get: vi.fn().mockReturnValue(''),
    throw: (status: number, message: string) => {
      throw Object.assign(new Error(message), { status });
    },
  };
}

function findByPath(router: Router, method: string, pathFragment: string) {
  return router.stack.find(
    (layer) => layer.methods.includes(method) && layer.path.includes(pathFragment),
  );
}

type RouteLayer = ReturnType<typeof createInvitationRouter>['stack'][number];

async function exec(layer: RouteLayer, ctx: ReturnType<typeof createMockCtx>) {
  await layer.stack[layer.stack.length - 1](ctx as never, vi.fn());
}

const INVITATION = {
  id: 'invitation-1',
  userId: null as string | null,
  tokenHash: 'hashed-token',
  expiresAt: new Date('2026-10-03T00:00:00Z'),
  usedAt: null,
  createdAt: new Date('2026-09-26T00:00:00Z'),
  details: { inviterName: 'Ada Admin' } as Record<string, unknown> | null,
  invitedBy: 'admin-1',
  organizationId: ORG_ID,
  email: 'invitee@example.com',
  givenName: 'Bob',
  familyName: 'Jones',
  locale: 'en',
};

describe('deferred invitation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(csrf.verifyCsrfToken).mockReturnValue(true);
    vi.mocked(passwordUtils.validatePassword).mockReturnValue({ isValid: true });
    vi.mocked(templateEngine.renderPage).mockResolvedValue('<html>rendered</html>');
    vi.mocked(getOrganizationById).mockResolvedValue(createMockOrg());
    vi.mocked(tokenRepo.replaceInvitation).mockResolvedValue({ id: 'invitation-1' });
    vi.mocked(userService.getUserByEmail).mockResolvedValue(null);
    vi.mocked(systemConfig.getSystemConfigNumber).mockResolvedValue(604800);
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  // =========================================================================
  // Invite route
  // =========================================================================

  describe('POST /api/admin/organizations/:orgId/users/invite', () => {
    function inviteLayer() {
      return findByPath(createUserRouter(), 'POST', '/users/invite');
    }

    it('should store an invitation for a new email and return the new shape without creating a user', async () => {
      const ctx = createMockCtx({
        body: { email: 'invitee@example.com', givenName: 'Bob', familyName: 'Jones', locale: 'en' },
      });

      await exec(inviteLayer()!, ctx);

      expect(ctx.status).toBe(201);
      expect(ctx.body).toEqual({
        data: {
          invitationId: 'invitation-1',
          email: 'invitee@example.com',
          invitationSent: true,
          expiresAt: expect.any(String),
        },
      });
      expect((ctx.body as { data: Record<string, unknown> }).data).not.toHaveProperty('userId');
      expect((ctx.body as { data: Record<string, unknown> }).data).not.toHaveProperty('created');
      expect(userService.createUser).not.toHaveBeenCalled();
      expect(tokenRepo.replaceInvitation).toHaveBeenCalledTimes(1);
      expect(tokenRepo.replaceInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          email: 'invitee@example.com',
          tokenHash: 'hashed-token',
          givenName: 'Bob',
          familyName: 'Jones',
          locale: 'en',
        }),
      );
    });

    it('should reject an email that already has a user in the organization', async () => {
      vi.mocked(userService.getUserByEmail).mockResolvedValue({ id: 'existing' } as never);
      const ctx = createMockCtx({ body: { email: 'existing@example.com' } });

      await exec(inviteLayer()!, ctx);

      expect(ctx.status).toBe(409);
      expect(tokenRepo.replaceInvitation).not.toHaveBeenCalled();
    });

    it('should derive expiresAt from the configured invitation lifetime', async () => {
      vi.mocked(systemConfig.getSystemConfigNumber).mockResolvedValue(3600);
      const ctx = createMockCtx({ body: { email: 'invitee@example.com' } });
      const before = Date.now();

      await exec(inviteLayer()!, ctx);

      const expiresAt = new Date((ctx.body as { data: { expiresAt: string } }).data.expiresAt).getTime();
      expect(expiresAt - before).toBeGreaterThanOrEqual(3600_000 - 5_000);
      expect(expiresAt - before).toBeLessThanOrEqual(3600_000 + 5_000);
    });

    it('should reject an unknown role or claim reference without storing an invitation', async () => {
      const ctx = createMockCtx({
        body: {
          email: 'invitee@example.com',
          roles: [{ applicationId: '11111111-1111-1111-1111-111111111111', roleId: '22222222-2222-2222-2222-222222222222' }],
        },
      });

      await exec(inviteLayer()!, ctx);

      expect(ctx.status).toBe(400);
      expect(tokenRepo.replaceInvitation).not.toHaveBeenCalled();
    });

    it('should audit the invitation with a null user id and the invitation id in metadata', async () => {
      const ctx = createMockCtx({ body: { email: 'invitee@example.com' } });

      await exec(inviteLayer()!, ctx);

      const invitedCall = vi
        .mocked(auditLog.writeAuditLog)
        .mock.calls.map((call) => call[0])
        .find((entry) => entry.eventType === 'user.invited');
      expect(invitedCall).toBeDefined();
      expect(invitedCall).toMatchObject({
        organizationId: ORG_ID,
        actorId: 'admin-1',
        metadata: expect.objectContaining({ invitationId: 'invitation-1' }),
      });
      expect(invitedCall!.userId).toBeUndefined();
    });

    it('should return 409 when a concurrent invite wins the same-email race', async () => {
      vi.mocked(tokenRepo.replaceInvitation).mockRejectedValue(
        new tokenRepo.InvitationConflictError(),
      );
      const ctx = createMockCtx({ body: { email: 'invitee@example.com' } });

      await exec(inviteLayer()!, ctx);

      expect(ctx.status).toBe(409);
    });
  });

  // =========================================================================
  // Accept GET
  // =========================================================================

  describe('GET /:orgSlug/auth/accept-invite/:token', () => {
    function getLayer() {
      return findByPath(createInvitationRouter(), 'GET', 'accept-invite');
    }

    it('should render the non-mutating confirmation page for a valid token', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(INVITATION);
      const ctx = createMockCtx();

      await exec(getLayer()!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'confirm-invite',
        expect.objectContaining({ orgSlug: 'test-org' }),
      );
      expect(ctx.status).toBe(200);
      expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
    });

    it('should render the password form when step=password is requested', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(INVITATION);
      const ctx = createMockCtx({ query: { step: 'password' } });

      await exec(getLayer()!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'accept-invite',
        expect.objectContaining({ token: 'presented-token', csrfToken: 'csrf-token-abc' }),
      );
      expect(ctx.status).toBe(200);
      expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
    });

    it('should render the generic expired page for an unknown, used, or expired token', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);
      const ctx = createMockCtx();

      await exec(getLayer()!, ctx);

      expect(ctx.status).toBe(400);
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'invite-expired',
        expect.objectContaining({ orgSlug: 'test-org' }),
      );
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.invite.failed', eventCategory: 'security' }),
      );
    });

    it('should render the same expired page when a user already exists for the email', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(INVITATION);
      vi.mocked(userService.getUserByEmail).mockResolvedValue({ id: 'existing' } as never);
      const ctx = createMockCtx();

      await exec(getLayer()!, ctx);

      expect(ctx.status).toBe(400);
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'invite-expired',
        expect.objectContaining({ orgSlug: 'test-org' }),
      );
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.invite.failed' }),
      );
    });

    it('should look up the token under the resolved organization only', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);
      const ctx = createMockCtx({
        organization: createMockOrg({ id: 'org-bravo', slug: 'bravo' }),
      });

      await exec(getLayer()!, ctx);

      expect(tokenRepo.findValidInvitationToken).toHaveBeenCalledWith('hashed-token', 'org-bravo');
      expect(ctx.status).toBe(400);
    });

    it('should leave the token usable across repeated page loads', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(INVITATION);
      const layer = getLayer()!;

      await exec(layer, createMockCtx());
      await exec(layer, createMockCtx({ query: { step: 'password' } }));

      expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
      expect(tokenRepo.findValidInvitationToken).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Accept POST
  // =========================================================================

  describe('POST /:orgSlug/auth/accept-invite/:token', () => {
    function postLayer() {
      return findByPath(createInvitationRouter(), 'POST', 'accept-invite');
    }

    function validBody() {
      return { password: 'SecurePass123!', confirmPassword: 'SecurePass123!', _csrf: 'tok' };
    }

    it('should create the account through acceptInvitation and render success', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(INVITATION);
      vi.mocked(invitationService.acceptInvitation).mockResolvedValue({
        userId: 'user-1',
        email: INVITATION.email,
      });
      const ctx = createMockCtx({ body: validBody() });

      await exec(postLayer()!, ctx);

      expect(invitationService.acceptInvitation).toHaveBeenCalledWith({
        tokenHash: 'hashed-token',
        organizationId: ORG_ID,
        password: 'SecurePass123!',
      });
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'invite-success',
        expect.objectContaining({ flash: { success: expect.any(String) } }),
      );
      expect(userService.setUserPassword).not.toHaveBeenCalled();
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.invite.accepted', userId: 'user-1' }),
      );
    });

    it('should render an error when the passwords do not match and not accept', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(INVITATION);
      const ctx = createMockCtx({
        body: { password: 'Password1!', confirmPassword: 'Different!', _csrf: 'tok' },
      });

      await exec(postLayer()!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'accept-invite',
        expect.objectContaining({ flash: { error: expect.stringContaining('password_mismatch') } }),
      );
      expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
    });

    it('should render an error for a weak password and not accept', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(INVITATION);
      vi.mocked(passwordUtils.validatePassword).mockReturnValue({ isValid: false, error: 'Too short' });
      const ctx = createMockCtx({ body: { password: 'x', confirmPassword: 'x', _csrf: 'tok' } });

      await exec(postLayer()!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'accept-invite',
        expect.objectContaining({ flash: { error: 'Too short' } }),
      );
      expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
    });

    it('should reject a CSRF mismatch with 403 and not accept', async () => {
      vi.mocked(csrf.verifyCsrfToken).mockReturnValue(false);
      const ctx = createMockCtx({ body: { password: 'pass', confirmPassword: 'pass', _csrf: 'bad' } });

      await exec(postLayer()!, ctx);

      expect(ctx.status).toBe(403);
      expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
    });

    it('should render the generic expired page when acceptInvitation returns null', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(INVITATION);
      vi.mocked(invitationService.acceptInvitation).mockResolvedValue(null);
      const ctx = createMockCtx({ body: validBody() });

      await exec(postLayer()!, ctx);

      expect(ctx.status).toBe(400);
      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'invite-expired',
        expect.objectContaining({ orgSlug: 'test-org' }),
      );
      expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'user.invite.failed' }),
      );
    });

    it('should apply pre-assignments with the created user id and skip deleted references', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue({
        ...INVITATION,
        details: {
          inviterName: 'Ada Admin',
          roles: [
            { applicationId: 'app-1', roleId: LIVE_ROLE_ID },
            { applicationId: 'app-1', roleId: 'deleted-role-id' },
          ],
        },
      });
      vi.mocked(invitationService.acceptInvitation).mockResolvedValue({
        userId: 'user-1',
        email: INVITATION.email,
      });
      poolQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
        if (String(sql).includes('FROM roles')) {
          return params?.[0] === LIVE_ROLE_ID
            ? { rows: [{ id: LIVE_ROLE_ID }], rowCount: 1 }
            : { rows: [], rowCount: 0 };
        }
        if (String(sql).includes('INSERT INTO user_roles')) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      });
      const ctx = createMockCtx({ body: validBody() });

      await exec(postLayer()!, ctx);

      expect(templateEngine.renderPage).toHaveBeenCalledWith(
        'invite-success',
        expect.objectContaining({ flash: { success: expect.any(String) } }),
      );
      const roleInserts = poolQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO user_roles'));
      expect(roleInserts).toHaveLength(1);
      expect(roleInserts[0][1]).toEqual(['user-1', LIVE_ROLE_ID]);
    });
  });
});
