/** Invitation language changes presentation, never token authority or stored account preferences. */
import { createHash } from 'node:crypto';
import type * as FileSystem from 'node:fs/promises';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { inspect } from 'node:util';
import i18next from 'i18next';
import Koa from 'koa';
import type {} from 'koa-bodyparser';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as csrf from '../../../src/auth/csrf.js';
import { initI18n } from '../../../src/auth/i18n.js';
import * as templateEngine from '../../../src/auth/template-engine.js';
import * as tokenRepo from '../../../src/auth/token-repository.js';
import type * as BrandingAssets from '../../../src/lib/branding-assets.js';
// Include the application's organization-state augmentation in isolated test compilation.
import type {} from '../../../src/middleware/admin-auth.js';
import type { Organization } from '../../../src/organizations/types.js';
import { createInvitationRouter } from '../../../src/routes/invitation.js';
import * as invitationService from '../../../src/users/invitation-service.js';
import * as passwordUtils from '../../../src/users/password.js';
import * as userService from '../../../src/users/service.js';
import type { User } from '../../../src/users/types.js';

/** An independently typed fault deliberately falls outside the closed validator reason set. */
interface UnexpectedPasswordFailure {
  /** Validation failed even though the submitted password meets the normal length bounds. */
  isValid: false;
  /** Unrecognized internal diagnostic, which must never be presented to the invitee. */
  reason: string;
  /** Raw failure text must not become a translated presentation message. */
  error: string;
}

/** Only external state and one explicit validator fault are controlled by this suite. */
const boundary = vi.hoisted(() => {
  const passwordFault: { result?: UnexpectedPasswordFailure } = {};
  return {
    passwordFault,
    organizations: new Map<string, Organization>(),
    files: new Map<string, string | (() => Promise<string>)>(),
    query: vi.fn(),
    listAssets: vi.fn().mockResolvedValue([]),
    getSystemConfigString: vi.fn<() => Promise<string>>(),
    audit: vi.fn().mockResolvedValue(undefined),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

vi.mock('../../../src/config/index.js', () => ({
  config: { issuerBaseUrl: 'https://identity.example.test' },
}));
vi.mock('../../../src/lib/database.js', () => ({ getPool: () => ({ query: boundary.query }) }));
vi.mock('../../../src/lib/system-config.js', () => ({
  getSystemConfigString: boundary.getSystemConfigString,
}));
vi.mock('../../../src/lib/logger.js', () => ({ logger: boundary.logger }));
vi.mock('../../../src/lib/audit-log.js', () => ({ writeAuditLog: boundary.audit }));
vi.mock('../../../src/organizations/cache.js', () => ({
  getCachedOrganizationBySlug: vi.fn(async (slug: string) => boundary.organizations.get(slug) ?? null),
  cacheOrganization: vi.fn(),
}));
vi.mock('../../../src/lib/branding-assets.js', async (importOriginal) => ({
  ...(await importOriginal<typeof BrandingAssets>()), listAssets: boundary.listAssets,
}));
vi.mock('../../../src/auth/token-repository.js', () => ({
  findValidInvitationToken: vi.fn(), markTokenUsed: vi.fn(), replaceInvitation: vi.fn(),
}));
vi.mock('../../../src/users/service.js', () => ({ getUserByEmail: vi.fn() }));
vi.mock('../../../src/users/invitation-service.js', () => ({ acceptInvitation: vi.fn() }));
vi.mock('../../../src/auth/csrf.js', () => ({
  generateCsrfToken: vi.fn(() => 'invitation-spec-csrf'),
  getCsrfFromCookie: vi.fn(() => 'invitation-spec-csrf'),
  verifyCsrfToken: vi.fn(() => true),
  setCsrfCookie: vi.fn(),
}));
vi.mock('../../../src/users/password.js', async (importOriginal) => {
  const actual = await importOriginal<typeof passwordUtils>();
  return {
    ...actual,
    validatePassword: vi.fn((password: string) =>
      boundary.passwordFault.result ?? actual.validatePassword(password)),
  };
});
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  /** Tenant files are virtual; only packaged defaults may reach the real filesystem. */
  function fixtureFor(path: unknown) {
    return Array.from(boundary.files).find(([suffix]) => String(path).endsWith(suffix));
  }
  function isDefault(path: unknown) {
    return /\/(?:locales|templates)\/default(?:\/|$)/.test(String(path));
  }
  function missing() {
    return Promise.reject(Object.assign(new Error('Fixture file absent'), { code: 'ENOENT' }));
  }
  const access = vi.fn((...args: Parameters<typeof actual.access>) => {
    if (fixtureFor(args[0])) return Promise.resolve();
    return isDefault(args[0]) ? Reflect.apply(actual.access, actual, args) : missing();
  });
  const readFile = vi.fn((...args: Parameters<typeof actual.readFile>) => {
    const entry = fixtureFor(args[0]);
    if (entry) return typeof entry[1] === 'string' ? Promise.resolve(entry[1]) : entry[1]();
    return isDefault(args[0]) ? Reflect.apply(actual.readFile, actual, args) : missing();
  });
  const readdir = vi.fn((...args: Parameters<typeof actual.readdir>) =>
    isDefault(args[0]) ? Reflect.apply(actual.readdir, actual, args) : missing());
  return { ...actual, access, readFile, readdir, default: { ...actual, access, readFile, readdir } };
});

const TOKEN = 'synthetic-invitation-localization-token';
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');
const PASSWORD = 'InvitationPassword123!';
const ORG_ID = '00000000-0000-4000-8000-000000000017';
const ACCEPTED = { userId: 'accepted-account', email: 'invitee@example.test' };

/** Complete public organization input keeps the real branding and page engines in use. */
function organization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: ORG_ID, name: 'Acme', slug: 'invitation-localization-acme', status: 'active',
    isSuperAdmin: false, brandingLogoUrl: null, brandingFaviconUrl: null,
    brandingPrimaryColor: '#123456', brandingCompanyName: 'Acme', brandingCustomCss: null,
    defaultLocale: 'en', twoFactorPolicy: 'optional', defaultLoginMethods: ['password'],
    createdAt: new Date('2026-01-05T00:00:00Z'), updatedAt: new Date('2026-01-05T00:00:00Z'),
    ...overrides,
  };
}

/** The repository supplies only valid scoped rows; null covers all invalid-token causes. */
type Invitation = NonNullable<Awaited<ReturnType<typeof tokenRepo.findValidInvitationToken>>>;

/** Explicit locale and expiry remain input data, not fields the rendering route may rewrite. */
function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'invitation-row', userId: null, tokenHash: TOKEN_HASH,
    createdAt: new Date('2026-10-29T00:00:00Z'), expiresAt: new Date('2026-11-05T00:00:00Z'),
    usedAt: null, invitedBy: null, organizationId: ORG_ID, email: ACCEPTED.email,
    givenName: 'PrivateGivenName', familyName: 'PrivateFamilyName', locale: 'nl',
    details: { inviterName: 'PrivateInviter', personalMessage: 'Private invitation message' },
    ...overrides,
  };
}

/** A real-shaped account collision must be rejected before its invitation grants locale authority. */
function conflictingUser(): User {
  return {
    id: 'existing-account', organizationId: ORG_ID, email: ACCEPTED.email,
    emailVerified: true, hasPassword: true, passwordChangedAt: null,
    givenName: 'ExistingGivenName', familyName: 'ExistingFamilyName', middleName: null,
    nickname: null, preferredUsername: null, profileUrl: null, pictureUrl: null, websiteUrl: null,
    gender: null, birthdate: null, zoneinfo: null, locale: 'nl', phoneNumber: null,
    phoneNumberVerified: false, addressStreet: null, addressLocality: null, addressRegion: null,
    addressPostalCode: null, addressCountry: null, status: 'active', loginCount: 0,
    lastLoginAt: null, failedLoginCount: 0, lastFailedLoginAt: null,
    lockedAt: null, lockedReason: null,
    twoFactorEnabled: false, twoFactorMethod: null,
    createdAt: new Date('2026-01-05T00:00:00Z'), updatedAt: new Date('2026-01-05T00:00:00Z'),
  };
}

function validBody() {
  return { password: PASSWORD, confirmPassword: PASSWORD, _csrf: 'invitation-spec-csrf' };
}

/** Dispatch real middleware without opening a port; dispose the unconnected HTTP socket afterward. */
async function request(method: 'GET' | 'POST', options: {
  step?: string; browser?: string; organization?: Organization; body?: Record<string, string>;
} = {}) {
  const org = options.organization ?? organization();
  // The real tenant middleware resolves this same fixture through its external cache boundary.
  boundary.organizations.set(org.slug, org);
  const socket = new Socket();
  const incoming = new IncomingMessage(socket);
  incoming.method = method;
  incoming.url = `/${org.slug}/auth/accept-invite/${TOKEN}${options.step ? '?step=password' : ''}`;
  incoming.headers['accept-language'] = options.browser ?? 'fr-FR';
  const context = new Koa().createContext(incoming, new ServerResponse(incoming));
  context.state = { organization: org };
  context.request.body = options.body ?? validBody();
  const router = createInvitationRouter();
  const routed = Object.assign(context, { params: { orgSlug: org.slug, token: TOKEN }, router });
  try {
    await router.routes()(routed, async () => undefined);
    if (typeof context.body !== 'string') throw new Error('Expected rendered invitation HTML');
    return { status: context.status, html: context.body };
  } finally {
    socket.destroy();
  }
}

/** Observe the real renderer. Only function identity is omitted; its language is checked explicitly. */
function renderedContext() {
  const call = vi.mocked(templateEngine.renderPage).mock.calls.at(-1);
  if (!call) throw new Error('Expected a real page render');
  const { t, ...context } = call[1];
  return { page: call[0], context, formTitle: t('invitation.title') };
}

/** A route must leave row data intact and delegate every token/account mutation to acceptance. */
function expectReadOnly(row: Invitation, snapshot: Invitation) {
  expect(row).toEqual(snapshot);
  expect(tokenRepo.markTokenUsed).not.toHaveBeenCalled();
  expect(tokenRepo.replaceInvitation).not.toHaveBeenCalled();
  for (const [sql] of boundary.query.mock.calls) {
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|DROP|CREATE)\b/i);
  }
}

/** Exact translated title input must reach the real document title, retaining ordinary branding. */
function expectTitle(html: string, expected: string) {
  expect(renderedContext().context.pageTitle).toBe(expected);
  expect(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]).toContain(expected);
  expect(html).not.toMatch(/\b(?:invitation|errors)\.[a-z_]+\b/);
}

/** No language or copy is normalized away when comparing a generic rejection with another cause. */
function expectGeneric(response: Awaited<ReturnType<typeof request>>) {
  expect(response.status).toBe(400);
  expect(response.html).toMatch(/<html\b[^>]*\blang="en"/);
  expect(renderedContext()).toMatchObject({ page: 'invite-expired', context: { locale: 'en' } });
  const visible = JSON.stringify([response, renderedContext()]);
  const diagnostics = inspect([boundary.audit.mock.calls,
    ...Object.values(boundary.logger).map((logger) => logger.mock.calls)], { depth: null });
  expect(visible).not.toContain(TOKEN_HASH);
  for (const value of [TOKEN, PASSWORD, ACCEPTED.email, 'existing-account',
    'PrivateGivenName', 'PrivateFamilyName', 'PrivateInviter', 'Private invitation message']) {
    expect(visible).not.toContain(value);
    expect(diagnostics).not.toContain(value);
  }
}

/** Explicit read-start/release signals prove callers await isolated tenant translation preparation. */
function delayedTitle(slug: string, locale: string, title: string) {
  let signalStarted!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => { signalStarted = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  boundary.files.set(`/locales/${slug}/${locale}/invitation.json`, async () => {
    signalStarted();
    await released;
    return JSON.stringify({ title });
  });
  return { started, release };
}

beforeAll(async () => {
  boundary.getSystemConfigString.mockResolvedValue('en');
  await initI18n();
  await templateEngine.initTemplateEngine();
  await i18next.changeLanguage('en');
});
beforeEach(() => {
  vi.clearAllMocks();
  boundary.files.clear();
  boundary.organizations.clear();
  delete boundary.passwordFault.result;
  boundary.getSystemConfigString.mockResolvedValue('en');
  boundary.query.mockResolvedValue({ rows: [], rowCount: 0 });
  boundary.listAssets.mockResolvedValue([]);
  vi.mocked(csrf.verifyCsrfToken).mockReturnValue(true);
  vi.mocked(tokenRepo.findValidInvitationToken).mockReset().mockResolvedValue(invitation());
  vi.mocked(userService.getUserByEmail).mockReset().mockResolvedValue(null);
  vi.mocked(invitationService.acceptInvitation).mockReset().mockResolvedValue(ACCEPTED);
  // A pass-through spy observes contexts without replacing translation, templates or rendering.
  vi.spyOn(templateEngine, 'renderPage');
});
afterEach(async () => {
  boundary.files.clear();
  delete boundary.passwordFault.result;
  vi.restoreAllMocks();
  if (i18next.language !== 'en') await i18next.changeLanguage('en');
});

describe('password-reason contract', () => {
  it('should export the closed internal failure reasons', () => {
    expect(Reflect.get(passwordUtils, 'PasswordValidationFailureReason')).toEqual({
      TooShort: 'too_short', TooLong: 'too_long',
    });
  });
  it.each([
    [0, 'too_short', 'Password must be at least 8 characters'],
    [7, 'too_short', 'Password must be at least 8 characters'],
    [129, 'too_long', 'Password must be at most 128 characters'],
  ] as const)('should retain the English error and add an internal reason for length %i', (length, reason, error) => {
    expect(passwordUtils.validatePassword('a'.repeat(length))).toEqual({
      isValid: false, error, reason,
    });
  });
  it.each([8, 128])('should preserve the exact success result at length %i', (length) => {
    expect(passwordUtils.validatePassword('a'.repeat(length))).toEqual({ isValid: true });
  });
});

describe('locale/account-state', () => {
  it.each([
    ['nl', 'fr-FR', 'en', 'en', 'nl'], ['nl', 'en', 'nl', 'en', 'en'],
    [null, 'fr-FR', 'nl', 'en', 'nl'], ['fr', 'fr-FR', 'nl', 'en', 'nl'],
    [null, 'fr-FR', 'fr', 'nl', 'nl'], ['fr', 'fr-FR', 'fr', 'nl', 'nl'],
  ] as const)('should render stored %s / browser %s / organization %s / global %s as %s without rewriting state',
    async (locale, browser, orgLocale, global, expected) => {
      const row = invitation({ locale });
      const snapshot = structuredClone(row);
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(row);
      boundary.getSystemConfigString.mockResolvedValue(global);
      const org = organization({ defaultLocale: orgLocale });
      const orgSnapshot = structuredClone(org);
      for (const step of [undefined, 'password']) {
        const response = await request('GET', { step, browser, organization: org });
        expect(response.status).toBe(200);
        expect(response.html).toContain(`lang="${expected}"`);
        expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
        expectReadOnly(row, snapshot);
      }
      const response = await request('POST', { browser, organization: org });
      expect(response.status).toBe(200);
      expect(response.html).toContain(`lang="${expected}"`);
      expect(invitationService.acceptInvitation).toHaveBeenCalledExactlyOnceWith({
        tokenHash: TOKEN_HASH, organizationId: ORG_ID, password: PASSWORD,
      });
      expectReadOnly(row, snapshot);
      expect(org).toEqual(orgSnapshot);
    });

  it('should keep repeated GETs read-only and honor the acceptance service replay rejection', async () => {
    const row = invitation();
    const snapshot = structuredClone(row);
    vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(row);
    for (const step of [undefined, 'password', undefined, 'password']) {
      expect((await request('GET', { step })).status).toBe(200);
      expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
      expectReadOnly(row, snapshot);
    }
    // The service owns atomic consumption; this mock proves only how the route handles its outcomes.
    vi.mocked(invitationService.acceptInvitation).mockResolvedValueOnce(ACCEPTED).mockResolvedValueOnce(null);
    expect((await request('POST')).status).toBe(200);
    expectGeneric(await request('POST'));
    expect(invitationService.acceptInvitation).toHaveBeenCalledTimes(2);
    expectReadOnly(row, snapshot);
  });
});

describe('security-authority', () => {
  describe.each([
    ['GET', undefined], ['GET', 'password'], ['POST', undefined],
  ] as const)('%s step=%s', (method, step) => {
    it.each(['unknown', 'expired', 'used', 'foreign-tenant', 'email-conflict'])(
      'should give %s the identical baseline rejection before password validation', async (cause) => {
        const options = { step, body: { ...validBody(), password: '1234567', confirmPassword: '1234567' } };
        vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);
        const baseline = await request(method, options);
        const baselineContext = renderedContext();
        expectGeneric(baseline);
        vi.clearAllMocks();
        const row = invitation();
        const snapshot = structuredClone(row);
        // Expired, consumed and foreign records are filtered by the external scoped repository.
        vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(cause === 'email-conflict' ? row : null);
        vi.mocked(userService.getUserByEmail).mockResolvedValue(cause === 'email-conflict' ? conflictingUser() : null);
        const response = await request(method, options);
        expectGeneric(response);
        expect(response).toEqual(baseline);
        expect(renderedContext()).toEqual(baselineContext);
        expect(tokenRepo.findValidInvitationToken).toHaveBeenCalledExactlyOnceWith(TOKEN_HASH, ORG_ID);
        if (cause === 'email-conflict') {
          expect(userService.getUserByEmail).toHaveBeenCalledExactlyOnceWith(ORG_ID, ACCEPTED.email);
        } else expect(userService.getUserByEmail).not.toHaveBeenCalled();
        expect(passwordUtils.validatePassword).not.toHaveBeenCalled();
        expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
        expectReadOnly(row, snapshot);
      },
    );
  });

  it('should discard validated Dutch rendering authority when atomic acceptance returns null', async () => {
    vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);
    const baseline = await request('POST');
    const baselineContext = renderedContext();
    const row = invitation();
    const snapshot = structuredClone(row);
    vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(row);
    vi.mocked(invitationService.acceptInvitation).mockResolvedValue(null);
    const response = await request('POST');
    expectGeneric(response);
    expect(response).toEqual(baseline);
    expect(renderedContext()).toEqual(baselineContext);
    expect(passwordUtils.validatePassword).toHaveBeenCalledExactlyOnceWith(PASSWORD);
    expect(invitationService.acceptInvitation).toHaveBeenCalledExactlyOnceWith({
      tokenHash: TOKEN_HASH, organizationId: ORG_ID, password: PASSWORD,
    });
    expectReadOnly(row, snapshot);
  });

  it.each([
    ['bad', 'fr-FR', 'nl', 'en'], ['missing', 'fr-FR', 'nl', 'en'],
    ['bad', 'nl', 'en', 'nl'], ['missing', 'nl', 'en', 'nl'],
  ])('should reject %s CSRF using browser %s before consulting invitation %s', async (kind, browser, locale, expected) => {
    const row = invitation({ locale });
    const snapshot = structuredClone(row);
    vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(row);
    vi.mocked(csrf.verifyCsrfToken).mockReturnValue(false);
    const body: Record<string, string> = { password: PASSWORD, confirmPassword: PASSWORD };
    if (kind === 'bad') body._csrf = 'invalid-csrf';
    const response = await request('POST', { browser, body });
    expect(response.status).toBe(403);
    expect(response.html).toContain(`lang="${expected}"`);
    expect(tokenRepo.findValidInvitationToken).not.toHaveBeenCalled();
    expect(userService.getUserByEmail).not.toHaveBeenCalled();
    expect(passwordUtils.validatePassword).not.toHaveBeenCalled();
    expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
    expect(boundary.query).not.toHaveBeenCalled();
    expectReadOnly(row, snapshot);
  });

  it.each(['GET', 'POST'] as const)('should scope %s to the presented tenant and expose no foreign invitation data', async (method) => {
    const foreign = invitation();
    const snapshot = structuredClone(foreign);
    const org = organization({ id: '00000000-0000-4000-8000-000000000018', slug: 'invitation-other' });
    vi.mocked(tokenRepo.findValidInvitationToken).mockImplementation(async (_hash, organizationId) =>
      organizationId === foreign.organizationId ? foreign : null);
    const response = await request(method, { organization: org });
    expectGeneric(response);
    expect(tokenRepo.findValidInvitationToken).toHaveBeenCalledExactlyOnceWith(TOKEN_HASH, org.id);
    expect(userService.getUserByEmail).not.toHaveBeenCalled();
    expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
    expectReadOnly(foreign, snapshot);
  });

  it('should await and isolate overlapping tenant A Dutch, tenant B Dutch and tenant A English pages', async () => {
    const language = i18next.language;
    const changeLanguage = vi.spyOn(i18next, 'changeLanguage');
    const inputs = [
      ['invitation-overlap-a', 'nl', 'A Nederlands'],
      ['invitation-overlap-b', 'nl', 'B Nederlands'],
      ['invitation-overlap-a', 'en', 'A English'],
    ] as const;
    const barriers = inputs.map(([slug, locale, copy]) => delayedTitle(slug, locale, copy));
    vi.mocked(tokenRepo.findValidInvitationToken).mockImplementation(async (_hash, organizationId) =>
      invitation({ organizationId }));
    let completed = 0;
    const pending = inputs.map(([slug, browser]) => request('GET', {
      step: 'password', browser, organization: organization({ id: slug, slug }),
    }).then((response) => { completed += 1; return response; }));
    try {
      await Promise.all(pending.map(async (operation, index) => {
        expect(await Promise.race([
          barriers[index].started.then(() => 'started'), operation.then(() => 'completed'),
        ])).toBe('started');
      }));
      expect(completed).toBe(0);
      for (const index of [1, 2, 0]) {
        barriers[index].release();
        const response = await pending[index];
        expect(response.status).toBe(200);
        expect(response.html).toContain(`lang="${inputs[index][1]}"`);
        expect(response.html).toContain(inputs[index][2]);
        for (const [other, input] of inputs.entries()) {
          if (other !== index) expect(response.html).not.toContain(input[2]);
        }
      }
      expect(changeLanguage).not.toHaveBeenCalled();
      expect(i18next.language).toBe(language);
    } finally {
      barriers.forEach((barrier) => barrier.release());
      await Promise.allSettled(pending);
    }
  });

  it.each(['organization', 'translated heading'])('should escape the actually displayed %s exactly once', async (field) => {
    const raw = '& "<script>alert(1)</script>';
    const escaped = '&amp; &quot;&lt;script&gt;alert(1)&lt;/script&gt;';
    const org = organization(field === 'organization' ? { name: raw, brandingCompanyName: raw } : {});
    if (field === 'translated heading') {
      boundary.files.set(`/locales/${org.slug}/nl/invitation.json`, JSON.stringify({ title: raw }));
    }
    const response = await request('GET', { step: 'password', organization: org });
    expect(response.status).toBe(200);
    expect(response.html).toContain(escaped);
    expect(response.html).not.toContain(raw);
    expect(response.html).not.toContain('&amp;lt;');
    expect(response.html).not.toContain('&amp;amp;');
    expect(inspect(Object.values(boundary.logger).map((log) => log.mock.calls))).not.toContain(raw);
  });
});

describe('translated presentation', () => {
  it('should keep the entire valid flow English when the browser overrides stored Dutch', async () => {
    const org = organization({ defaultLocale: 'nl' });
    for (const [method, step] of [['GET', undefined], ['GET', 'password'], ['POST', undefined]] as const) {
      const response = await request(method, { step, browser: 'en', organization: org });
      expect(response.status).toBe(200);
      expect(response.html).toContain('lang="en"');
      expect(renderedContext().formTitle).toBe('Accept your invitation');
      for (const dutch of ['U bent uitgenodigd', 'Accepteer uw uitnodiging',
        'Uw account is aangemaakt!', 'Uw uitnodiging is geaccepteerd.']) {
        expect(response.html).not.toContain(dutch);
      }
      if (step === 'password') expectTitle(response.html, 'Accept your invitation');
    }
  });

  it.each([[null, 'nl', 'en'], ['fr', 'nl', 'en'], [null, 'fr', 'nl'], ['fr', 'fr', 'nl']] as const)(
    'should use Dutch copy for stored %s / organization %s / global %s fallback', async (locale, orgLocale, global) => {
      vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(invitation({ locale }));
      boundary.getSystemConfigString.mockResolvedValue(global);
      const org = organization({ defaultLocale: orgLocale });
      for (const [method, step, title] of [
        ['GET', undefined, 'U bent uitgenodigd'], ['GET', 'password', 'Accepteer uw uitnodiging'],
        ['POST', undefined, 'Uw account is aangemaakt!'],
      ] as const) {
        const response = await request(method, { step, organization: org });
        expect(response.status).toBe(200);
        expect(response.html).toContain('lang="nl"');
        expectTitle(response.html, title);
        if (method === 'POST') expect(response.html).toContain('Uw uitnodiging is geaccepteerd.');
      }
    },
  );

  it.each([
    [undefined, 'U bent uitgenodigd'], ['password', 'Accepteer uw uitnodiging'],
  ] as const)('should render the exact Dutch title for GET step=%s', async (step, title) => {
    const response = await request('GET', { step });
    expect(response.status).toBe(200);
    expect(response.html).toContain('lang="nl"');
    expectTitle(response.html, title);
    expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
  });

  it('should render the Dutch success heading, title and flash after acceptance', async () => {
    const response = await request('POST');
    expect(response.status).toBe(200);
    expect(response.html).toContain('lang="nl"');
    expectTitle(response.html, 'Uw account is aangemaakt!');
    expect(response.html).toMatch(/<h[1-6]\b[^>]*>\s*Uw account is aangemaakt!\s*<\/h[1-6]>/);
    expect(response.html).toContain('Uw uitnodiging is geaccepteerd.');
    expect(renderedContext().context.flash).toEqual({ success: 'Uw uitnodiging is geaccepteerd.' });
    expect(boundary.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'user.invite.accepted', userId: ACCEPTED.userId,
    }));
  });

  it.each([
    [PASSWORD, 'DifferentPassword123!', 'De wachtwoorden komen niet overeen'],
    ['1234567', '1234567', 'Het wachtwoord moet minimaal 8 tekens bevatten'],
    ['a'.repeat(129), 'a'.repeat(129), 'Het wachtwoord mag maximaal 128 tekens bevatten'],
  ])('should render the exact Dutch validation error for %s', async (password, confirmPassword, expected) => {
    const response = await request('POST', { body: { ...validBody(), password, confirmPassword } });
    expect(response.html).toContain('lang="nl"');
    expectTitle(response.html, 'Accepteer uw uitnodiging');
    expect(response.html).toContain(expected);
    expect(renderedContext().context.flash).toEqual({ error: expected });
    expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
  });

  it('should render a baseline Dutch security error with the existing CSRF status', async () => {
    vi.mocked(csrf.verifyCsrfToken).mockReturnValue(false);
    const response = await request('POST', { browser: 'nl', body: { ...validBody(), _csrf: 'bad' } });
    expect(response.status).toBe(403);
    expect(response.html).toContain('lang="nl"');
    const expected = 'De beveiligingscontrole is mislukt. Vernieuw de pagina en probeer het opnieuw.';
    expect(response.html).toContain(expected);
    expect(renderedContext().context.flash).toEqual({ error: expected });
    expect(tokenRepo.findValidInvitationToken).not.toHaveBeenCalled();
  });

  it.each(['unexpected password reason', 'acceptance exception'])('should hide raw %s behind a generic Dutch error', async (fault) => {
    const raw = 'INTERNAL_FAILURE_DO_NOT_DISPLAY';
    if (fault === 'unexpected password reason') {
      boundary.passwordFault.result = { isValid: false, reason: 'unrecognized_reason', error: raw };
    } else vi.mocked(invitationService.acceptInvitation).mockRejectedValue(new Error(raw));
    const response = await request('POST');
    const expected = 'Er is een onverwachte fout opgetreden. Probeer het opnieuw.';
    expect(response.html).toContain('lang="nl"');
    expectTitle(response.html, 'Accepteer uw uitnodiging');
    expect(response.html).toContain(expected);
    expect(renderedContext().context.flash).toEqual({ error: expected });
    expect(response.html).not.toContain(raw);
    expect(response.html).not.toContain('unrecognized_reason');
    if (fault === 'unexpected password reason') expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
    else expect(invitationService.acceptInvitation).toHaveBeenCalledTimes(1);
  });

  it.each(['unknown', 'email-conflict', 'late-null'])('should retain the baseline English expired title for %s', async (cause) => {
    if (cause === 'unknown') vi.mocked(tokenRepo.findValidInvitationToken).mockResolvedValue(null);
    if (cause === 'email-conflict') vi.mocked(userService.getUserByEmail).mockResolvedValue(conflictingUser());
    if (cause === 'late-null') vi.mocked(invitationService.acceptInvitation).mockResolvedValue(null);
    const response = await request('POST');
    expectGeneric(response);
    expectTitle(response.html, 'Invitation expired');
  });
});
