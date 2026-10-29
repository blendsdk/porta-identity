/** Invitation copy is prepared per render without changing caller data or tenant authority. */
import type * as FileSystem from 'node:fs/promises';
import fs from 'node:fs/promises';
import { inspect } from 'node:util';
import i18next from 'i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as translations from '../../../src/auth/i18n.js';
import {
  renderInvitationEmail,
  sendInvitationEmail,
  setEmailTransport,
} from '../../../src/auth/email-service.js';
import type {
  EmailOrganization,
  EmailUser,
  InvitationEmailOptions,
} from '../../../src/auth/email-service.js';
import type { EmailTransport } from '../../../src/auth/email-transport.js';
import type * as BrandingAssets from '../../../src/lib/branding-assets.js';

/** Virtual overrides replace only filesystem boundaries; packaged defaults remain real data. */
const fixtures = vi.hoisted(() => ({
  files: new Map<string, string | (() => Promise<string>)>(),
  getSystemConfigString: vi.fn<() => Promise<string>>(),
  listAssets: vi.fn().mockResolvedValue([]),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/lib/system-config.js', () => ({
  getSystemConfigString: fixtures.getSystemConfigString,
}));
vi.mock('../../../src/lib/logger.js', () => ({ logger: fixtures.logger }));
vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../src/lib/branding-assets.js', async (importOriginal) => ({
  ...(await importOriginal<typeof BrandingAssets>()),
  listAssets: fixtures.listAssets,
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  /** No operator-owned override is accessed, even when a fixture deliberately omits a file. */
  function fixtureFor(path: unknown) {
    return Array.from(fixtures.files).find(([suffix]) => String(path).endsWith(suffix));
  }
  function isDefault(path: unknown) {
    return /\/(?:locales|templates)\/default\//.test(String(path));
  }
  const access = vi.fn((...args: Parameters<typeof actual.access>) => {
    if (fixtureFor(args[0])) return Promise.resolve();
    if (isDefault(args[0])) return Reflect.apply(actual.access, actual, args);
    return Promise.reject(Object.assign(new Error('Fixture file absent'), { code: 'ENOENT' }));
  });
  const readFile = vi.fn((...args: Parameters<typeof actual.readFile>) => {
    const entry = fixtureFor(args[0]);
    if (entry) return typeof entry[1] === 'string' ? Promise.resolve(entry[1]) : entry[1]();
    if (isDefault(args[0])) return Reflect.apply(actual.readFile, actual, args);
    return Promise.reject(Object.assign(new Error('Fixture file absent'), { code: 'ENOENT' }));
  });
  return { ...actual, access, readFile, default: { ...actual, access, readFile } };
});

const USER: EmailUser = { email: 'ada@example.test', givenName: 'Ada', familyName: 'Lovelace' };
const INVITE_URL = 'https://identity.example.test/acme/auth/accept-invite/opaque-invitation';
const OPTIONS: InvitationEmailOptions = { expiresInSeconds: 604800 };
const transport = { send: vi.fn<EmailTransport['send']>() };

/** Complete organization input keeps effective branding real while its metadata store is isolated. */
function organization(overrides: Partial<EmailOrganization> = {}): EmailOrganization {
  return {
    id: '00000000-0000-4000-8000-000000000017',
    name: 'Acme',
    slug: 'localization-acme',
    status: 'active',
    isSuperAdmin: false,
    brandingLogoUrl: null,
    brandingFaviconUrl: null,
    brandingPrimaryColor: '#123456',
    brandingCompanyName: 'Acme',
    brandingCustomCss: null,
    defaultLocale: 'en',
    twoFactorPolicy: 'optional',
    defaultLoginMethods: ['password'],
    createdAt: new Date('2026-01-05T00:00:00.000Z'),
    updatedAt: new Date('2026-01-05T00:00:00.000Z'),
    ...overrides,
  };
}

/** A per-case export check makes an absent preparation API a behavioral failure, not an import error. */
function preparationApi() {
  const candidate: unknown = Reflect.get(translations, 'prepareTranslationFunction');
  if (typeof candidate !== 'function') throw new Error('Expected an async preparation function');
  return candidate;
}

/** Validate the future API's runtime result without casting an absent export into existence. */
async function prepare(locale: string, slug = 'localization-acme') {
  const candidate = preparationApi();
  const pending: unknown = Reflect.apply(candidate, undefined, [locale, slug]);
  expect(pending).toBeInstanceOf(Promise);
  const translator: unknown = await pending;
  if (typeof translator !== 'function') throw new Error('Expected a prepared translator');
  return (key: string, options?: Record<string, unknown>): string => {
    const result: unknown = Reflect.apply(translator, undefined, [key, options]);
    if (typeof result !== 'string') throw new Error('Expected ordinary translated text');
    return result;
  };
}

/** Runtime guards retain null/missing locale inputs without coercing them to today's string type. */
async function email(
  mode: 'send' | 'preview',
  locale: string | null | undefined,
  org = organization(),
  options = OPTIONS,
  user = USER,
) {
  const entry = mode === 'send' ? sendInvitationEmail : renderInvitationEmail;
  const result: unknown = await Reflect.apply(entry, undefined, [user, org, INVITE_URL, locale, options]);
  const message: unknown = mode === 'send' ? transport.send.mock.calls.at(-1)?.[0] : result;
  if (mode === 'send') expect(result).toBe('sent');
  if (
    typeof message !== 'object' ||
    message === null ||
    !('subject' in message) ||
    typeof message.subject !== 'string' ||
    !('html' in message) ||
    typeof message.html !== 'string' ||
    !('text' in message) ||
    typeof message.text !== 'string'
  ) {
    throw new Error('Expected a rendered invitation message');
  }
  return { subject: message.subject, html: message.html, text: message.text };
}

/** Templates expose context through real Handlebars without adding a production test seam. */
function templates(source: string, slug = 'localization-acme') {
  fixtures.files.set(`/templates/${slug}/emails/invitation.hbs`, source);
  fixtures.files.set(`/templates/${slug}/emails/invitation.txt.hbs`, source);
}

function subjectOverride(subject: string) {
  return JSON.stringify({ invitation: { subject } });
}

/** A read-start signal and explicit release keep first-read timing independent of warm-up or sleeps. */
function delayedOverride(slug: string, locale: string, subject: string) {
  // Promise constructors install both signals synchronously before any read can start.
  let signalStarted!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => { signalStarted = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  fixtures.files.set(`/locales/${slug}/${locale}/emails.json`, async () => {
    signalStarted();
    await released;
    return subjectOverride(subject);
  });
  return { started, release };
}

/** Race against completion so unwired callers fail promptly instead of waiting for a read forever. */
async function expectReadStarted<T>(operation: Promise<T>, started: Promise<void>) {
  const first = await Promise.race([
    started.then(() => 'read-started'),
    operation.then(() => 'completed'),
  ]);
  expect(first).toBe('read-started');
}

beforeAll(async () => {
  fixtures.getSystemConfigString.mockResolvedValue('en');
  await translations.initI18n();
  // Establish an explicit global baseline; individual renders must never change it.
  await i18next.changeLanguage('en');
});
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.files.clear();
  fixtures.getSystemConfigString.mockResolvedValue('en');
  fixtures.listAssets.mockResolvedValue([]);
  transport.send.mockImplementation(async (message) => ({
    messageId: '<invitation@example.test>',
    accepted: [message.to],
    rejected: [],
  }));
  setEmailTransport(transport);
});
afterEach(async () => {
  setEmailTransport(null);
  fixtures.files.clear();
  vi.restoreAllMocks();
  if (i18next.language !== 'en') await i18next.changeLanguage('en');
});

describe('direct preparation', () => {
  // Internal misuse must be rejected before filesystem access or unsafe diagnostics.
  it.each(['../nl', 'nl/en', 'nl\\en', '/nl', 'nl-NL', 'NL', 'nl_NL', ' nl ', 'nl..'])(
    'should reject unselected locale %s before accessing a path', async (locale) => {
      preparationApi();
      const failure: unknown = await prepare(locale).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(Error);
      expect(inspect(failure)).not.toContain(locale);
      expect(fs.readFile).not.toHaveBeenCalled();
      expect(fs.access).not.toHaveBeenCalled();
      expect(inspect(Object.values(fixtures.logger).map((log) => log.mock.calls))).not.toContain(locale);
    },
  );

  it('should await its first override read and interpolate replacement characters literally', async () => {
    const barrier = delayedOverride('localization-acme', 'nl', 'Welkom bij {{orgName}}');
    let completed = false;
    const pending = prepare('nl').then((translator) => {
      completed = true;
      return translator;
    });
    try {
      await expectReadStarted(pending, barrier.started);
      expect(completed).toBe(false);
    } finally {
      barrier.release();
      await Promise.allSettled([pending]);
    }
    const translator = await pending;
    expect(translator('emails.invitation.subject', { orgName: 'Acme' })).toBe('Welkom bij Acme');
    expect(translator('emails.invitation.subject', { orgName: '$& {{orgName}}' })).toBe(
      'Welkom bij $& {{orgName}}',
    );
  });

  it('should isolate overlapping tenant and language preparation without changing global language', async () => {
    const language = i18next.language;
    const changeLanguage = vi.spyOn(i18next, 'changeLanguage');
    const inputs = [
      ['localization-acme', 'nl', 'A Nederlands'],
      ['localization-other', 'nl', 'B Nederlands'],
      ['localization-acme', 'en', 'A English'],
    ] as const;
    const barriers = inputs.map(([slug, locale, copy]) => delayedOverride(slug, locale, copy));
    const pending = inputs.map(([slug, locale]) => prepare(locale, slug));
    try {
      await Promise.all(pending.map((operation, index) =>
        expectReadStarted(operation, barriers[index].started)));
      for (const index of [1, 2, 0]) {
        barriers[index].release();
        const translator = await pending[index];
        expect(translator('emails.invitation.subject')).toBe(inputs[index][2]);
      }
      for (const [index, translator] of (await Promise.all(pending)).entries()) {
        expect(translator('emails.invitation.subject')).toBe(inputs[index][2]);
      }
      expect(changeLanguage).not.toHaveBeenCalled();
      expect(i18next.language).toBe(language);
    } finally {
      barriers.forEach((barrier) => barrier.release());
      await Promise.allSettled(pending);
    }
  });
});

describe('actual send/preview awaiting selection and custom context', () => {
  describe.each(['send', 'preview'] as const)('%s', (mode) => {
    it.each([
      ['nl-NL', 'en', 'en', 'nl'], ['fr', 'nl', 'en', 'nl'],
      [null, 'fr', 'en', 'en'], [undefined, 'fr', 'en', 'en'],
      ['fr', 'de', 'nl', 'nl'], ['fr', 'de', 'fr', 'en'],
    ] as const)('should select %s / %s / %s as %s without rewriting caller data', async (locale, orgLocale, global, expected) => {
      templates('{{locale}}');
      fixtures.getSystemConfigString.mockResolvedValue(global);
      const org = organization({ defaultLocale: orgLocale });
      const snapshot = structuredClone(org);
      const options = { ...OPTIONS };
      const message = await email(mode, locale, org, options);
      expect(message.html).toBe(expected);
      expect(message.text).toBe(expected);
      expect(org).toEqual(snapshot);
      expect(options).toEqual(OPTIONS);
      for (const [path] of vi.mocked(fs.readFile).mock.calls) {
        if (String(path).includes('/locales/localization-acme/')) {
          expect(String(path)).toMatch(/\/locales\/localization-acme\/(?:en|nl)\/[^/]+\.json$/);
        }
      }
    });

    it('should await the first Dutch subject override before finalizing copy', async () => {
      templates('{{locale}}');
      const barrier = delayedOverride('localization-acme', 'nl', 'Welkom bij {{orgName}}');
      let completed = false;
      const pending = email(mode, 'nl').then((message) => {
        completed = true;
        return message;
      });
      try {
        await expectReadStarted(pending, barrier.started);
        expect(completed).toBe(false);
        expect(transport.send).not.toHaveBeenCalled();
      } finally {
        barrier.release();
        await Promise.allSettled([pending]);
      }
      expect((await pending).subject).toBe('Welkom bij Acme');
    });

    it.each(['missing', 'malformed', 'unreadable'])('should retain default copy for a %s tenant override', async (state) => {
      templates('{{locale}}');
      if (state === 'malformed') {
        fixtures.files.set('/locales/localization-acme/nl/emails.json', '{');
      }
      if (state === 'unreadable') {
        fixtures.files.set('/locales/localization-acme/nl/emails.json', () =>
          Promise.reject(new Error('Fixture unavailable')));
      }
      expect((await email(mode, 'nl')).subject).toBe('U bent uitgenodigd voor Acme');
    });

    it.each([
      ['nl', 'Beheerder', 'Beheerder heeft u uitgenodigd voor Acme'],
      ['nl', undefined, 'U bent uitgenodigd voor Acme'],
      ['en', 'Admin', 'Admin has invited you to Acme'],
      ['en', undefined, "You've been invited to Acme"],
    ] as const)('should preserve the %s subject variant for inviter %s', async (locale, inviterName, subject) => {
      templates('{{locale}}');
      const message = await email(mode, locale, organization(), { ...OPTIONS, inviterName });
      expect(message.subject).toBe(subject);
    });

    it('should provide complete Dutch sentences as ordinary context strings', async () => {
      templates([
        '{{invitationCopy.heading}}', '{{invitationCopy.greeting}}',
        '{{invitationCopy.htmlInstructions}}', '{{invitationCopy.textInstructions}}',
        '{{invitationCopy.expiry}}', '{{invitationCopy.acceptLabel}}',
      ].join('|'));
      const expected = [
        'U bent uitgenodigd!', 'Beste Ada Lovelace,',
        'Klik op de onderstaande knop om uw account in te stellen.',
        'Klik op de onderstaande link om uw account in te stellen.',
        'Deze uitnodiging verloopt over 7 dagen.', 'Uitnodiging accepteren',
      ].join('|');
      const message = await email(mode, 'nl');
      expect(message.html).toBe(expected);
      expect(message.text).toBe(expected);
    });

    it('should keep replacement and template-shaped dynamic values literal in subject and context', async () => {
      templates('{{orgName}}|{{userName}}|{{personalMessage}}|{{inviterName}}');
      fixtures.files.set(
        '/templates/localization-acme/emails/invitation.txt.hbs',
        '{{{orgName}}}|{{{userName}}}|{{{personalMessage}}}|{{{inviterName}}}',
      );
      fixtures.files.set(
        '/locales/localization-acme/nl/emails.json',
        JSON.stringify({ invitation: { subject_inviter: 'Welkom bij {{orgName}}' } }),
      );
      const brand = '$& {{userName}}';
      const message = await email(
        mode, 'nl', organization({ brandingCompanyName: brand }),
        { ...OPTIONS, personalMessage: 'emails.invitation.subject {{orgName}}', inviterName: '{{locale}}' },
        { ...USER, givenName: '{{orgName}}', familyName: null },
      );
      expect(message.subject).toBe('Welkom bij $& {{userName}}');
      expect(message.text).toBe('$& {{userName}}|{{orgName}}|emails.invitation.subject {{orgName}}|{{locale}}');
    });

    it('should supply description, copy-link and personal-message labels to custom templates', async () => {
      templates([
        '{{invitationCopy.description}}', '{{invitationCopy.copyLinkLabel}}',
        '{{invitationCopy.personalMessageLabel}}',
      ].join('|'));
      const message = await email(mode, 'nl', organization(), {
        ...OPTIONS, personalMessage: 'Welcome', inviterName: 'Beheerder',
      });
      for (const copy of message.text.split('|')) {
        expect(copy.trim()).not.toBe('');
        expect(copy).not.toMatch(/^emails[.:]/);
      }
    });

    it.each([
      [604800, '7 dagen', '7 days'], [86400, '1 dag', '1 day'],
      [43200, '12 uur', '12 hours'], [3600, '1 uur', '1 hour'],
      [300, '5 minuten', '5 minutes'], [60, '1 minuut', '1 minute'],
      [61, '2 minuten', '2 minutes'], [86401, '1441 minuten', '1441 minutes'],
    ] as const)('should expose the unchanged %i-second lifetime in Dutch and English', async (seconds, dutch, english) => {
      templates('{{expiresIn}}');
      const options = { expiresInSeconds: seconds };
      for (const [locale, expected] of [['nl', dutch], ['en', english]]) {
        const message = await email(mode, locale, organization(), options);
        expect(message.html).toBe(expected);
        expect(message.text).toBe(expected);
        expect(options.expiresInSeconds).toBe(seconds);
      }
    });

    it('should isolate overlapping tenant A Dutch, tenant B Dutch and tenant A English emails', async () => {
      const language = i18next.language;
      const changeLanguage = vi.spyOn(i18next, 'changeLanguage');
      const inputs = [
        ['localization-acme', 'nl', 'A Nederlands'],
        ['localization-other', 'nl', 'B Nederlands'],
        ['localization-acme', 'en', 'A English'],
      ] as const;
      const barriers = inputs.map(([slug, locale, copy]) => {
        templates('{{locale}}', slug);
        return delayedOverride(slug, locale, copy);
      });
      const pending = inputs.map(([slug, locale]) => email(mode, locale, organization({ slug })));
      try {
        await Promise.all(pending.map((operation, index) =>
          expectReadStarted(operation, barriers[index].started)));
        for (const index of [1, 2, 0]) {
          barriers[index].release();
          expect(await pending[index]).toEqual({
            subject: inputs[index][2], html: inputs[index][1], text: inputs[index][1],
          });
        }
        expect(changeLanguage).not.toHaveBeenCalled();
        expect(i18next.language).toBe(language);
      } finally {
        barriers.forEach((barrier) => barrier.release());
        await Promise.allSettled(pending);
      }
    });
  });
});

describe('shipped HTML/text escaping and custom fallback', () => {
  it('should render formal Dutch heading, greeting, action, instructions and expiry in both formats', async () => {
    const message = await email('preview', 'nl');
    expect(message.html).toContain('lang="nl"');
    for (const body of [message.html, message.text]) {
      for (const copy of [
        'U bent uitgenodigd!', 'Beste Ada Lovelace,',
        'Uitnodiging accepteren', 'Deze uitnodiging verloopt over 7 dagen.',
      ]) expect(body).toContain(copy);
    }
    expect(message.html).toContain('Klik op de onderstaande knop om uw account in te stellen.');
    expect(message.text).toContain('Klik op de onderstaande link om uw account in te stellen.');
    expect(message.text).not.toContain('onderstaande knop');
  });

  it('should preserve English subject, action and duration in the shipped templates', async () => {
    const message = await email('preview', 'en');
    expect(message.subject).toBe("You've been invited to Acme");
    for (const body of [message.html, message.text]) {
      expect(body).toContain('Accept Invitation');
      expect(body).toContain('7 days');
    }
  });

  it('should escape untrusted HTML once while preserving literal plaintext and the trusted destination', async () => {
    const raw = '& "<script>alert(1)</script> {{locale}}';
    const escaped = '&amp; &quot;&lt;script&gt;alert(1)&lt;/script&gt; {{locale}}';
    const message = await email(
      'preview', 'nl', organization({ name: raw, brandingCompanyName: raw }),
      { ...OPTIONS, personalMessage: `Message ${raw}`, inviterName: `Inviter ${raw}` },
      { ...USER, givenName: `Name ${raw}`, familyName: null },
    );
    expect(message.subject).toBe(`Inviter ${raw} heeft u uitgenodigd voor ${raw}`);
    for (const prefix of ['Name ', 'Message ', 'Inviter ', '']) {
      expect(message.html).toContain(`${prefix}${escaped}`);
      expect(message.text).toContain(`${prefix}${raw}`);
    }
    expect(message.html).not.toContain('<script>');
    expect(message.html).not.toContain('&amp;amp;');
    expect(message.html).not.toContain('&amp;lt;');
    expect(message.text).not.toContain('&lt;script&gt;');
    expect(message.html).toContain(`href="${INVITE_URL}"`);
    expect(message.text).toContain(INVITE_URL);
  });

  it.each(['html', 'text'] as const)('should independently override %s while retaining every legacy context value', async (format) => {
    const extension = format === 'html' ? 'hbs' : 'txt.hbs';
    fixtures.files.set(`/templates/localization-acme/emails/invitation.${extension}`, [
      'Custom English', '{{userName}}', '{{inviteUrl}}', '{{orgName}}', '{{expiresIn}}',
      '{{branding.companyName}}', '{{branding.primaryColor}}', '{{locale}}',
      '{{personalMessage}}', '{{inviterName}}', '{{year}}',
    ].join('|'));
    const year = new Date().getFullYear();
    const message = await email('preview', 'nl-NL', organization(), {
      ...OPTIONS, personalMessage: 'Private welcome', inviterName: 'Beheerder',
    });
    expect(message[format]).toBe([
      'Custom English', 'Ada Lovelace', INVITE_URL, 'Acme', '7 dagen', 'Acme',
      '#123456', 'nl', 'Private welcome', 'Beheerder', year,
    ].join('|'));
    const fallback = format === 'html' ? message.text : message.html;
    expect(fallback).toContain('U bent uitgenodigd!');
    expect(fallback).toContain('Uitnodiging accepteren');
    expect(fallback).not.toContain('Custom English');
  });
});
