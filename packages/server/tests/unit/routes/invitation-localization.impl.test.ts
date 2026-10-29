/** Rendering failures and malformed form values must not regain invitation authority. */
import type * as FileSystem from 'node:fs/promises';
import fs from 'node:fs/promises';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import Koa from 'koa';
import type {} from 'koa-bodyparser';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../../../src/auth/i18n.js';
import { initTemplateEngine } from '../../../src/auth/template-engine.js';
import type { InvitationTokenRecord } from '../../../src/auth/token-repository.js';
import type * as BrandingAssets from '../../../src/lib/branding-assets.js';
import type {} from '../../../src/middleware/admin-auth.js';
import type { Organization } from '../../../src/organizations/types.js';
import { createInvitationRouter } from '../../../src/routes/invitation.js';
import * as passwordUtils from '../../../src/users/password.js';

/** External stores and page-file failures are controlled; rendering, translation and CSRF are real. */
const boundary = vi.hoisted(() => ({
  organizations: new Map<string, Organization>(),
  findInvitation: vi.fn<() => Promise<InvitationTokenRecord | null>>(),
  findUser: vi.fn().mockResolvedValue(null),
  accept: vi.fn(),
  failedPages: new Set<string>(),
  renderFailure: new Error('Controlled page-file failure'),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/config/index.js', () => ({
  config: { issuerBaseUrl: 'https://identity.example.test' },
}));
vi.mock('../../../src/organizations/cache.js', () => ({
  getCachedOrganizationBySlug: vi.fn(async (slug: string) => boundary.organizations.get(slug) ?? null),
  cacheOrganization: vi.fn(),
}));
vi.mock('../../../src/auth/token-repository.js', () => ({
  findValidInvitationToken: boundary.findInvitation,
}));
vi.mock('../../../src/users/service.js', () => ({ getUserByEmail: boundary.findUser }));
vi.mock('../../../src/users/invitation-service.js', () => ({ acceptInvitation: boundary.accept }));
vi.mock('../../../src/lib/system-config.js', () => ({
  getSystemConfigString: vi.fn().mockResolvedValue('en'),
}));
vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
}));
vi.mock('../../../src/lib/branding-assets.js', async (importOriginal) => ({
  ...(await importOriginal<typeof BrandingAssets>()),
  listAssets: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../../src/lib/audit-log.js', () => ({ writeAuditLog: vi.fn() }));
vi.mock('../../../src/lib/logger.js', () => ({ logger: boundary.logger }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  const isDefault = (path: unknown) => /\/(?:templates|locales)\/default(?:\/|$)/.test(String(path));
  const missing = () => Promise.reject(Object.assign(new Error('No fixture override'), { code: 'ENOENT' }));
  const readFile = vi.fn((...args: Parameters<typeof actual.readFile>) => {
    const path = String(args[0]);
    for (const page of boundary.failedPages) {
      if (path.endsWith(`/default/pages/${page}.hbs`)) return Promise.reject(boundary.renderFailure);
    }
    return isDefault(args[0]) ? Reflect.apply(actual.readFile, actual, args) : missing();
  });
  const access = vi.fn((...args: Parameters<typeof actual.access>) =>
    isDefault(args[0]) ? Reflect.apply(actual.access, actual, args) : missing());
  const readdir = vi.fn((...args: Parameters<typeof actual.readdir>) =>
    isDefault(args[0]) ? Reflect.apply(actual.readdir, actual, args) : missing());
  return { ...actual, readFile, access, readdir, default: { ...actual, readFile, access, readdir } };
});

const ORG_ID = '00000000-0000-4000-8000-000000000017';
const ORG_SLUG = 'invitation-render-boundary';
const CSRF = 'synthetic-matching-csrf';
const PASSWORD = 'SyntheticPassword123!';

/** Complete resolved organization fixture; tenant lookup remains in the actual middleware. */
function organization(): Organization {
  return {
    id: ORG_ID, name: 'Acme', slug: ORG_SLUG, status: 'active', isSuperAdmin: false,
    brandingLogoUrl: null, brandingFaviconUrl: null, brandingPrimaryColor: '#123456',
    brandingCompanyName: 'Acme', brandingCustomCss: null, defaultLocale: 'en',
    twoFactorPolicy: 'optional', defaultLoginMethods: ['password'],
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

/** The external token store grants a valid Dutch invitation, without pre-assignment side effects. */
function invitation(): InvitationTokenRecord {
  return {
    id: 'invitation-fixture', userId: null, organizationId: ORG_ID, email: 'invitee@example.test',
    tokenHash: 'stored-hash-fixture', expiresAt: new Date(Date.now() + 3_600_000), usedAt: null,
    createdAt: new Date(), invitedBy: null, givenName: null, familyName: null, locale: 'nl', details: null,
  };
}

/** Return only non-secret response facts, so failed promise assertions cannot dump a valid form. */
async function request(body: unknown) {
  const socket = new Socket();
  const incoming = new IncomingMessage(socket);
  incoming.method = 'POST';
  incoming.url = `/${ORG_SLUG}/auth/accept-invite/synthetic-token`;
  incoming.headers.cookie = `_csrf=${CSRF}`;
  incoming.headers['accept-language'] = 'fr-FR';
  const app = new Koa();
  const router = createInvitationRouter();
  const context = Object.assign(app.createContext(incoming, new ServerResponse(incoming)), {
    params: { orgSlug: ORG_SLUG, token: 'synthetic-token' }, router,
  });
  context.request.body = body;
  try {
    await router.routes()(context, async () => undefined);
    const html = typeof context.body === 'string' ? context.body : '';
    return {
      status: context.status,
      locale: html.match(/<html\b[^>]*\blang="([a-z]+)"/)?.[1],
      genericError: html.includes('Er is een onverwachte fout opgetreden. Probeer het opnieuw.'),
    };
  } finally {
    socket.destroy();
  }
}

function validBody() {
  return { password: PASSWORD, confirmPassword: PASSWORD, _csrf: CSRF };
}

/** Observe actual tenant-file reads rather than replacing the locale resolver or translator. */
function preparedLanguages(): string[] {
  return vi.mocked(fs.readFile).mock.calls
    .map(([path]) => String(path).match(new RegExp(`/locales/${ORG_SLUG}/([^/]+)/`))?.[1])
    .filter((locale): locale is string => locale !== undefined);
}

beforeAll(async () => {
  await initI18n();
  await initTemplateEngine();
});
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  boundary.organizations.clear();
  boundary.organizations.set(ORG_SLUG, organization());
  boundary.failedPages.clear();
  boundary.findInvitation.mockResolvedValue(invitation());
  boundary.findUser.mockResolvedValue(null);
  boundary.accept.mockResolvedValue({ userId: 'accepted-fixture', email: 'invitee@example.test' });
});

describe('invitation rendering authority internals', () => {
  it('should prepare only baseline copy when atomic acceptance rejects', async () => {
    boundary.accept.mockResolvedValue(null);
    expect(await request(validBody())).toMatchObject({ status: 400, locale: 'en' });
    expect(preparedLanguages().length).toBeGreaterThan(0);
    expect(new Set(preparedLanguages())).toEqual(new Set(['en']));
    expect(boundary.accept).toHaveBeenCalledOnce();
  });

  it.each(['initial rejection', 'late rejection'])(
    'should propagate an expired-page file failure without regaining invitation authority on %s',
    async (stage) => {
      if (stage === 'initial rejection') boundary.findInvitation.mockResolvedValue(null);
      else boundary.accept.mockResolvedValue(null);
      boundary.failedPages.add('invite-expired');
      await expect(request(validBody())).rejects.toBe(boundary.renderFailure);
      expect(preparedLanguages().length).toBeGreaterThan(0);
      expect(new Set(preparedLanguages())).toEqual(new Set(['en']));
      expect(boundary.accept).toHaveBeenCalledTimes(stage === 'late rejection' ? 1 : 0);
    },
  );

  it('should render a generic localized processing error without repeating a successful mutation', async () => {
    boundary.failedPages.add('invite-success');
    expect(await request(validBody())).toEqual({ status: 200, locale: 'nl', genericError: true });
    expect(boundary.accept).toHaveBeenCalledOnce();
    expect(new Set(preparedLanguages())).toEqual(new Set(['nl']));
  });

  it.each([undefined, null, [], 42, { _csrf: 42 }, Object.create({ _csrf: CSRF })].map((body) => [body]))(
    'should reject malformed or inherited CSRF fields before invitation lookup (case %#)',
    async (body) => {
      expect((await request(body)).status).toBe(403);
      expect(boundary.findInvitation).not.toHaveBeenCalled();
      expect(boundary.findUser).not.toHaveBeenCalled();
      expect(boundary.accept).not.toHaveBeenCalled();
    },
  );

  it.each([42, false, [], {}].map((value) => [value]))(
    'should treat non-string passwords as missing without coercion or acceptance (case %#)',
    async (value) => {
      const validate = vi.spyOn(passwordUtils, 'validatePassword');
      expect((await request({ password: value, confirmPassword: value, _csrf: CSRF })).status).toBe(200);
      expect(validate).toHaveBeenCalledExactlyOnceWith('');
      expect(boundary.accept).not.toHaveBeenCalled();
    },
  );
});
