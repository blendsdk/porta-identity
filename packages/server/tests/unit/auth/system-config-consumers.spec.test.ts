/** Verifies policy reads at existing recovery, invitation, rate-limit, lockout, audit and locale decisions. */
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import type Router from '@koa/router';
import Koa from 'koa';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as UserServiceModule from '../../../src/users/service.js';
import type { User } from '../../../src/users/types.js';
import type { Organization } from '../../../src/organizations/types.js';
import type {
  ClaimedRecoveryJob,
  RecoveryJobType,
} from '../../../src/auth/recovery-job-repository.js';

const boundary = vi.hoisted(() => ({
  numberRead: vi.fn(),
  stringRead: vi.fn(),
  query: vi.fn(),
  increment: vi.fn(),
  reset: vi.fn(),
  invalidateCache: vi.fn(),
  findUser: vi.fn(),
  createUser: vi.fn(),
  organization: vi.fn(),
  ensureToken: vi.fn(),
  invitationToken: vi.fn(),
  sendRecovery: vi.fn(),
  sendInvitation: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  hasBundle: vi.fn(),
  init: vi.fn(),
}));
vi.mock('../../../src/lib/system-config.js', () => ({
  getSystemConfigNumber: boundary.numberRead,
  getSystemConfigString: boundary.stringRead,
}));
vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: boundary.query }),
  afterDatabaseCommit: async (effect: () => Promise<void>) => effect(),
}));
vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: () => ({ incr: boundary.incr, expire: boundary.expire, ttl: boundary.ttl }),
}));
vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
}));
vi.mock('../../../src/users/repository.js', () => ({
  incrementFailedLoginCount: boundary.increment,
  resetFailedLoginCount: boundary.reset,
  findUserByEmail: boundary.findUser,
  findUserById: vi.fn(),
  insertUser: vi.fn(),
}));
vi.mock('../../../src/users/cache.js', () => ({
  invalidateUserCache: boundary.invalidateCache,
  getCachedUserById: vi.fn(),
  cacheUser: vi.fn(),
}));
vi.mock('../../../src/users/password.js', () => ({
  validatePassword: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  getDummyPasswordHash: () => 'fixture-password-hash',
}));
vi.mock('../../../src/users/service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof UserServiceModule>()),
  getUserByEmail: boundary.findUser,
  createUser: boundary.createUser,
}));
vi.mock('../../../src/organizations/service.js', () => ({
  getOrganizationById: boundary.organization,
  getOrganizationBySlug: boundary.organization,
}));
vi.mock('../../../src/auth/token-repository.js', () => ({
  ensureRecoveryJobToken: boundary.ensureToken,
  insertInvitationToken: boundary.invitationToken,
  invalidateUserTokens: vi.fn(),
}));
vi.mock('../../../src/auth/email-service.js', () => ({
  sendRecoveryEmailStrict: boundary.sendRecovery,
  sendInvitationEmail: boundary.sendInvitation,
  renderInvitationEmail: vi.fn(),
}));
vi.mock('../../../src/config/index.js', () => ({
  config: {
    issuerBaseUrl: 'https://auth.example.com',
    cookieKeys: ['fixture-cookie-key-not-a-real-secret'],
  },
}));
vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: object, next: () => Promise<void>) => next(),
}));
vi.mock('../../../src/lib/etag.js', () => ({ setETagHeader: vi.fn(), checkIfMatch: () => true }));
vi.mock('../../../src/lib/entity-history.js', () => ({ getEntityHistory: vi.fn() }));
vi.mock('i18next', () => ({
  default: {
    use: vi.fn().mockReturnThis(),
    init: boundary.init,
    hasResourceBundle: boundary.hasBundle,
    t: vi.fn(),
  },
}));
vi.mock('i18next-fs-backend', () => ({ default: {} }));
vi.mock('handlebars', () => ({ default: { registerHelper: vi.fn() } }));

import { AccountRecoveryJobProcessor } from '../../../src/auth/recovery-job-processor.js';
import { protectRecoveryAddress } from '../../../src/auth/recovery-crypto.js';
import {
  checkRateLimit,
  loadLoginRateLimitConfig,
  loadMagicLinkRateLimitConfig,
  loadPasswordResetRateLimitConfig,
} from '../../../src/auth/rate-limiter.js';
import { checkAutoUnlock, recordFailedLogin } from '../../../src/users/service.js';
import { createUserRouter } from '../../../src/routes/users.js';
import { createAuditRouter } from '../../../src/routes/audit.js';
import { initI18n, NAMESPACES, resolveLocale } from '../../../src/auth/i18n.js';

const NOW = new Date('2026-09-16T12:00:00.000Z');
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000501';
const USER_ID = '00000000-0000-4000-8000-000000000601';

/** Complete user fixture; only automatic-lock fields change during lockout scenarios. */
function user(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    organizationId: ORGANIZATION_ID,
    email: 'fixture@example.com',
    emailVerified: true,
    hasPassword: true,
    passwordChangedAt: null,
    givenName: null,
    familyName: null,
    middleName: null,
    nickname: null,
    preferredUsername: null,
    profileUrl: null,
    pictureUrl: null,
    websiteUrl: null,
    gender: null,
    birthdate: null,
    zoneinfo: null,
    locale: null,
    phoneNumber: null,
    phoneNumberVerified: false,
    addressStreet: null,
    addressLocality: null,
    addressRegion: null,
    addressPostalCode: null,
    addressCountry: null,
    twoFactorEnabled: false,
    twoFactorMethod: null,
    status: 'active',
    lockedAt: null,
    lockedReason: null,
    lastLoginAt: null,
    loginCount: 0,
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Active tenant fixture resolves the authority required by existing recovery and invitation flows. */
const ORGANIZATION: Organization = {
  id: ORGANIZATION_ID,
  name: 'Fixture',
  slug: 'fixture',
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
  createdAt: NOW,
  updatedAt: NOW,
};

/** Create a valid queued job through public address-protection input, before changing its TTL. */
function recoveryJob(jobType: RecoveryJobType): ClaimedRecoveryJob {
  const idempotencyDigest = '0'.repeat(64);
  return {
    id: '00000000-0000-4000-8000-000000000301',
    jobType,
    organizationId: ORGANIZATION_ID,
    protectedAddress: protectRecoveryAddress('fixture@example.com', {
      organizationId: ORGANIZATION_ID,
      jobType,
      interactionUid: null,
      idempotencyDigest,
    }),
    interactionUid: null,
    idempotencyDigest,
    status: 'claimed',
    availableAt: NOW,
    claimedAt: NOW,
    claimedBy: '00000000-0000-4000-8000-000000000401',
    attemptCount: 1,
    lastFailureReason: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    claimDisposition: 'available',
  };
}

/** Invoke real route middleware with a real Koa context, without opening a network listener. */
async function request(router: Router, method: string, path: string, body: unknown) {
  const incoming = new IncomingMessage(new Socket());
  incoming.method = method;
  incoming.url = path;
  const context = new Koa().createContext(incoming, new ServerResponse(incoming));
  context.request.body = body;
  context.state = {
    organization: { id: ORGANIZATION_ID, isSuperAdmin: true },
    adminUser: {
      id: USER_ID,
      email: 'admin@example.com',
      permissions: new Set(['admin:user:invite', 'admin:config:update']),
    },
  };
  await router.routes()(context, async () => undefined);
  return context;
}

describe('system configuration consumer decisions', () => {
  const numbers = new Map<string, number>();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    numbers.clear();
    boundary.numberRead.mockImplementation((key: string) => Promise.resolve(numbers.get(key)));
    boundary.stringRead.mockResolvedValue('en');
    boundary.organization.mockResolvedValue(ORGANIZATION);
    boundary.findUser.mockResolvedValue(user());
    boundary.createUser.mockResolvedValue(user());
    boundary.ensureToken.mockResolvedValue('active');
    boundary.invitationToken.mockResolvedValue(undefined);
    boundary.sendRecovery.mockResolvedValue(undefined);
    boundary.sendInvitation.mockResolvedValue(undefined);
    boundary.query.mockResolvedValue({ rows: [{ count: '2' }], rowCount: 2 });
    boundary.ttl.mockResolvedValue(500);
    boundary.incr.mockResolvedValue(3);
    boundary.init.mockResolvedValue(undefined);
    boundary.hasBundle.mockImplementation((locale: string) => locale === 'en');
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ['magic_link', 'magic_link_ttl', 1200],
    ['password_reset', 'password_reset_ttl', 7200],
  ] as const)(
    'should use processing-time TTL for queued %s artifacts',
    async (jobType, key, ttl) => {
      const queued = recoveryJob(jobType);
      numbers.set(key, ttl);
      await new AccountRecoveryJobProcessor().process(queued);
      expect(boundary.numberRead).toHaveBeenCalledWith(key);
      expect(boundary.ensureToken).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt: new Date(NOW.getTime() + ttl * 1000) }),
      );
    },
  );

  it('should read invitation lifetime before calculating the new invitation expiry', async () => {
    numbers.set('invitation_ttl', 1209600);
    boundary.findUser.mockResolvedValue(null);
    const context = await request(
      createUserRouter(),
      'POST',
      `/api/admin/organizations/${ORGANIZATION_ID}/users/invite`,
      { email: 'fixture@example.com' },
    );
    expect(context.status).toBe(201);
    expect(boundary.numberRead).toHaveBeenCalledWith('invitation_ttl');
    expect(
      boundary.invitationToken.mock.calls.some((args) =>
        args.some(
          (value) => value instanceof Date && value.getTime() === NOW.getTime() + 1209600 * 1000,
        ),
      ),
    ).toBe(true);
  });

  it.each([
    ['rate_limit_login_max', 'rate_limit_login_window', loadLoginRateLimitConfig],
    ['rate_limit_magic_link_max', 'rate_limit_magic_link_window', loadMagicLinkRateLimitConfig],
    [
      'rate_limit_password_reset_max',
      'rate_limit_password_reset_window',
      loadPasswordResetRateLimitConfig,
    ],
  ] as const)(
    'should apply current %s and preserve an existing Redis expiry',
    async (maxKey, windowKey, load) => {
      numbers.set(maxKey, 2);
      numbers.set(windowKey, 1200);
      const policy = await load();
      expect(policy).toEqual({ max: 2, windowSeconds: 1200 });
      expect(boundary.numberRead).toHaveBeenCalledWith(maxKey);
      expect(boundary.numberRead).toHaveBeenCalledWith(windowKey);
      expect((await checkRateLimit('fixture-counter', policy)).allowed).toBe(false);
      expect(boundary.expire).not.toHaveBeenCalled();
      boundary.incr.mockResolvedValue(1);
      await checkRateLimit('fixture-new-counter', policy);
      expect(boundary.expire).toHaveBeenCalledWith('fixture-new-counter', 1200);
    },
  );

  it('should use the current failed-login threshold on the next decision', async () => {
    numbers.set('max_failed_logins', 7);
    boundary.increment.mockResolvedValue({ status: 'active', failedLoginCount: 6 });
    await recordFailedLogin(user());
    expect(boundary.numberRead).toHaveBeenCalledWith('max_failed_logins');
    expect(boundary.increment).toHaveBeenCalledWith(USER_ID, 7);
  });

  it('should apply changed lock duration to stored locked_at without rewriting that timestamp', async () => {
    const locked = user({
      status: 'locked',
      lockedReason: 'auto_lockout',
      lockedAt: new Date(NOW.getTime() - 600000),
    });
    numbers.set('lockout_duration_seconds', 900);
    expect(await checkAutoUnlock(locked)).toBe(false);
    expect(boundary.reset).not.toHaveBeenCalled();
    numbers.set('lockout_duration_seconds', 300);
    expect(await checkAutoUnlock(locked)).toBe(true);
    expect(boundary.numberRead).toHaveBeenCalledWith('lockout_duration_seconds');
    expect(locked.lockedAt?.getTime()).toBe(NOW.getTime() - 600000);
  });

  it.each([
    [undefined, 180],
    [30, 30],
  ] as const)(
    'should use catalog retention unless request supplies %s days',
    async (explicit, expected) => {
      numbers.set('audit_retention_days', 180);
      const context = await request(createAuditRouter(), 'POST', '/api/admin/audit/cleanup', {
        dryRun: true,
        ...(explicit === undefined ? {} : { retentionDays: explicit }),
      });
      expect(context.status).toBe(200);
      expect(context.body).toMatchObject({ dryRun: true, retentionDays: expected });
      const parameters: unknown = boundary.query.mock.calls[0]?.[1];
      if (!Array.isArray(parameters)) throw new Error('Cleanup cutoff is not parameterized');
      expect(parameters).toEqual([expected]);
      expect(boundary.query.mock.calls[0]?.[0]).toContain("INTERVAL '1 day' * $1");
      if (explicit === undefined)
        expect(boundary.numberRead).toHaveBeenCalledWith('audit_retention_days');
      else expect(boundary.numberRead).not.toHaveBeenCalled();
    },
  );

  it('should initialize the exported complete namespace list and use current final locale fallback', async () => {
    await initI18n();
    expect(boundary.init).toHaveBeenCalledWith(expect.objectContaining({ ns: NAMESPACES }));
    expect(await resolveLocale(undefined, undefined, 'unsupported')).toBe('en');
    expect(boundary.stringRead).toHaveBeenCalledWith('default_locale');
  });
});
