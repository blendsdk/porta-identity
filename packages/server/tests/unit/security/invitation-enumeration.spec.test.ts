/**
 * Security specification for invitation enumeration resistance and token secrecy
 * (ST-30–ST-32).
 *
 * An attacker must not be able to tell unknown, expired, foreign-tenant, and
 * email-conflict invitations apart: all four render the same generic expired page and
 * status. The invite response carries only the invitation outcome — never a user identity
 * or profile — and only the token hash may reach storage, logs, or audit records.
 *
 * These expectations derive from the feature requirements and the accept-flow design;
 * external boundaries are mocked so the assertions target route behavior.
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

import * as tokenRepo from '../../../src/auth/token-repository.js';
import * as userService from '../../../src/users/service.js';
import * as auditLog from '../../../src/lib/audit-log.js';
import * as logger from '../../../src/lib/logger.js';
import * as templateEngine from '../../../src/auth/template-engine.js';
import * as systemConfig from '../../../src/lib/system-config.js';
import { getOrganizationById } from '../../../src/organizations/service.js';
import { createUserRouter } from '../../../src/routes/users.js';
import { createInvitationRouter } from '../../../src/routes/invitation.js';
import type { Organization } from '../../../src/organizations/types.js';

const ORG_ID = 'org-uuid-1';

/** A single captured `renderPage` invocation for equality comparison. */
interface RenderedPage {
  readonly template: string;
  readonly context: Record<string, unknown>;
}

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
  organization?: Organization;
}

function createMockCtx(options: MockCtxOptions = {}) {
  let statusCode = 200;
  let responseBody: unknown;
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
    state: {
      organization: options.organization ?? createMockOrg(),
      adminUser: { id: 'admin-1', givenName: 'Ada', familyName: 'Admin' },
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

/** The single captured `renderPage` invocation, or a failure when none was made. */
function lastRenderedPage(): RenderedPage {
  const calls = vi.mocked(templateEngine.renderPage).mock.calls;
  const call = calls[calls.length - 1];
  if (call === undefined) throw new Error('renderPage was not called');
  return { template: call[0] as string, context: call[1] as Record<string, unknown> };
}

describe('invitation enumeration resistance and token secrecy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(templateEngine.renderPage).mockResolvedValue('<html>rendered</html>');
    vi.mocked(getOrganizationById).mockResolvedValue(createMockOrg());
    vi.mocked(tokenRepo.replaceInvitation).mockResolvedValue({ id: 'invitation-1' });
    vi.mocked(userService.getUserByEmail).mockResolvedValue(null);
    vi.mocked(systemConfig.getSystemConfigNumber).mockResolvedValue(604800);
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  function acceptGetLayer() {
    return findByPath(createInvitationRouter(), 'GET', 'accept-invite');
  }

  function inviteLayer() {
    return findByPath(createUserRouter(), 'POST', '/users/invite');
  }

  describe('ST-30: rejection page is indistinguishable across causes', () => {
    it('renders the same expired page and status for unknown and expired tokens', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);
      const unknownCtx = createMockCtx();
      await exec(acceptGetLayer()!, unknownCtx);
      const unknown = lastRenderedPage();

      const expiredCtx = createMockCtx();
      await exec(acceptGetLayer()!, expiredCtx);
      const expired = lastRenderedPage();

      expect(unknownCtx.status).toBe(400);
      expect(expiredCtx.status).toBe(400);
      expect(unknown.template).toBe('invite-expired');
      expect(expired.template).toBe('invite-expired');
      expect(expired.context).toEqual(unknown.context);
    });

    it('renders the same expired page for an email that already has an account', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);
      const unknownCtx = createMockCtx();
      await exec(acceptGetLayer()!, unknownCtx);
      const unknown = lastRenderedPage();

      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(INVITATION);
      vi.mocked(userService.getUserByEmail).mockResolvedValue({ id: 'existing' } as never);
      const conflictCtx = createMockCtx();
      await exec(acceptGetLayer()!, conflictCtx);
      const conflict = lastRenderedPage();

      expect(unknownCtx.status).toBe(400);
      expect(conflictCtx.status).toBe(400);
      expect(conflict.template).toBe('invite-expired');
      expect(conflict.context).toEqual(unknown.context);
    });

    it('rejects a foreign-tenant token under the presented tenant with the same expired page', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);
      const foreignCtx = createMockCtx({
        organization: createMockOrg({ id: 'org-bravo', slug: 'bravo' }),
      });

      await exec(acceptGetLayer()!, foreignCtx);

      expect(foreignCtx.status).toBe(400);
      expect(tokenRepo.findValidInvitationToken).toHaveBeenCalledWith('hashed-token', 'org-bravo');
      expect(lastRenderedPage().template).toBe('invite-expired');
      expect(JSON.stringify(lastRenderedPage().context)).not.toContain('presented-token');
    });

    it('does not put the presented token, email, or user identity into the rejection context', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(INVITATION);
      vi.mocked(userService.getUserByEmail).mockResolvedValue({ id: 'existing' } as never);
      const ctx = createMockCtx();
      await exec(acceptGetLayer()!, ctx);

      const serialized = JSON.stringify(lastRenderedPage().context);
      expect(serialized).not.toContain('presented-token');
      expect(serialized).not.toContain(INVITATION.email);
      expect(serialized).not.toContain('existing');
    });

    it('audits every rejection as the same security event', async () => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);
      await exec(acceptGetLayer()!, createMockCtx());

      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(INVITATION);
      vi.mocked(userService.getUserByEmail).mockResolvedValue({ id: 'existing' } as never);
      await exec(acceptGetLayer()!, createMockCtx());

      const failures = vi
        .mocked(auditLog.writeAuditLog)
        .mock.calls.map((call) => call[0])
        .filter((entry) => entry.eventType === 'user.invite.failed');
      expect(failures).toHaveLength(2);
      expect(failures[0]).toMatchObject({ eventCategory: 'security', organizationId: ORG_ID });
      expect(failures[1]).toMatchObject({ eventCategory: 'security', organizationId: ORG_ID });
    });
  });

  describe('ST-31: invite response carries no user identity or profile', () => {
    it('returns exactly the invitation outcome fields', async () => {
      const ctx = createMockCtx({ body: { email: 'invitee@example.com', givenName: 'Bob' } });

      await exec(inviteLayer()!, ctx);

      expect(ctx.status).toBe(201);
      const data = (ctx.body as { data: Record<string, unknown> }).data;
      expect(Object.keys(data).sort()).toEqual([
        'email',
        'expiresAt',
        'invitationId',
        'invitationSent',
      ]);
      for (const forbidden of ['userId', 'created', 'givenName', 'familyName', 'nickname', 'status']) {
        expect(data).not.toHaveProperty(forbidden);
      }
    });
  });

  describe('ST-32: only the token hash is stored or logged', () => {
    it('stores the hash and never the plaintext token', async () => {
      const ctx = createMockCtx({ body: { email: 'invitee@example.com' } });

      await exec(inviteLayer()!, ctx);

      expect(tokenRepo.replaceInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: 'hashed-token' }),
      );
      const storageArgs = JSON.stringify(vi.mocked(tokenRepo.replaceInvitation).mock.calls);
      expect(storageArgs).not.toContain('token-plaintext');
    });

    it('never writes the plaintext token to the audit log or logger', async () => {
      const ctx = createMockCtx({ body: { email: 'invitee@example.com' } });

      await exec(inviteLayer()!, ctx);

      expect(JSON.stringify(vi.mocked(auditLog.writeAuditLog).mock.calls)).not.toContain(
        'token-plaintext',
      );
      const loggerCalls = [
        ...vi.mocked(logger.logger.debug).mock.calls,
        ...vi.mocked(logger.logger.info).mock.calls,
        ...vi.mocked(logger.logger.warn).mock.calls,
        ...vi.mocked(logger.logger.error).mock.calls,
      ];
      expect(JSON.stringify(loggerCalls)).not.toContain('token-plaintext');
    });

    it('does not return the plaintext token in the invite response', async () => {
      const ctx = createMockCtx({ body: { email: 'invitee@example.com' } });

      await exec(inviteLayer()!, ctx);

      expect(JSON.stringify(ctx.body)).not.toContain('token-plaintext');
      expect(JSON.stringify(ctx.body)).not.toContain('hashed-token');
    });
  });
});
