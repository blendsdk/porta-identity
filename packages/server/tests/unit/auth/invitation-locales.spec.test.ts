/** Invitation rendering selects packaged languages without changing locale persistence. */
import { readFile, readdir } from 'node:fs/promises';
import i18next from 'i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslationFunction, initI18n, resolveLocale } from '../../../src/auth/i18n.js';
import { logger } from '../../../src/lib/logger.js';
import { getSystemConfigString } from '../../../src/lib/system-config.js';

vi.mock('../../../src/lib/system-config.js', () => ({ getSystemConfigString: vi.fn() }));
vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** Complete authentication resource contract, independent of the production allowlist. */
const NAMESPACES = [
  'common',
  'login',
  'consent',
  'forgot-password',
  'reset-password',
  'magic-link',
  'invitation',
  'logout',
  'errors',
  'emails',
  'two-factor',
] as const;

/** Declares optional invitation context while remaining compatible with three-argument callers. */
const resolveInvitationLocale: (
  uiLocales?: string,
  acceptLanguage?: string,
  orgDefaultLocale?: string,
  invitationLocale?: string | null,
) => Promise<string> = resolveLocale;

/** Rejects arrays and null when validating JSON objects and resource snapshots. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a required shipped namespace; missing files fail instead of excluding a language. */
async function readPack(locale: string, namespace: string): Promise<Record<string, unknown>> {
  const path = new URL(`../../../locales/default/${locale}/${namespace}.json`, import.meta.url);
  const resource: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isObject(resource)) throw new Error('Translation namespaces must be JSON objects');
  return resource;
}

/** Collects leaf paths while rejecting blank text, non-string leaves and empty objects. */
function translationLeaves(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') {
    expect(value.trim(), prefix).not.toBe('');
    return { [prefix]: value };
  }
  if (!isObject(value)) throw new Error(`Translation ${prefix} must be text or an object`);
  expect(Object.keys(value).length, prefix).toBeGreaterThan(0);
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(translationLeaves(child, prefix ? `${prefix}.${key}` : key)),
    ),
  );
}

/** Placeholder names and multiplicity must survive translation, regardless of word order. */
function placeholders(text: string): string[] {
  return Array.from(text.matchAll(/\{\{\s*-?\s*([^{}]+?)\s*\}\}/g), (match) =>
    match[1].trim(),
  ).sort();
}

describe('shipped invitation locale packs', () => {
  it.each(['en', 'nl'])('should ship exactly eleven namespaces for %s', async (locale) => {
    const directory = new URL(`../../../locales/default/${locale}/`, import.meta.url);
    const names = (await readdir(directory)).filter((name) => name.endsWith('.json'));
    expect(names.sort()).toEqual(NAMESPACES.map((name) => `${name}.json`).sort());
  });

  it.each(NAMESPACES)('should preserve every non-empty leaf and placeholder in %s', async (name) => {
    const english = translationLeaves(await readPack('en', name));
    const dutch = translationLeaves(await readPack('nl', name));
    expect(Object.keys(dutch).sort()).toEqual(Object.keys(english).sort());
    for (const [key, text] of Object.entries(english)) {
      expect(placeholders(dutch[key]), key).toEqual(placeholders(text));
    }
  });
});

describe('invitation locale resolution with real resources', () => {
  beforeAll(async () => {
    vi.mocked(getSystemConfigString).mockResolvedValue('en');
    await initI18n();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSystemConfigString).mockResolvedValue('en');
  });

  // Browser preference outranks the invitation, with stable ordering for equal qualities.
  it.each([
    ['nl-NL;q=0.9,en;q=0.8', 'en', 'nl'],
    ['en-US,nl;q=0.8', 'nl', 'en'],
    ['nl;q=0.7,en;q=0.7', 'en', 'nl'],
    ['en;q=0.7,nl;q=0.7', 'nl', 'en'],
    ['en;q=0.5,nl;q=0.9', 'en', 'nl'],
    ['nl,en;q=0.999', 'en', 'nl'],
    ['nl;q=1.000,en;q=0.999', 'en', 'nl'],
    ['nl;q=0.001,en;q=0', 'en', 'nl'],
  ])('should select %s ahead of invitation %s as %s', async (browser, invitation, expected) => {
    expect(await resolveInvitationLocale(undefined, browser, 'en', invitation)).toBe(expected);
  });

  it.each([
    'nl;q=0,en;q=0.5',
    'nl;q=abc,en;q=0.5',
    'nl;q=2,en;q=0.5',
    'nl;q=-1,en;q=0.5',
    'nl;q=1.001,en;q=0.5',
    'nl;q=0.1234,en;q=0.5',
    'nl;q=0.9;q=0.8,en;q=0.5',
    'nl;q=0.9;q=0.9,en;q=0.5',
    'nl;q=,en;q=0.5',
  ])('should discard invalid or excluded Dutch quality in %s', async (browser) => {
    expect(await resolveInvitationLocale(undefined, browser, 'nl', 'nl')).toBe('en');
  });

  it.each([undefined, '', 'fr-FR', '*', 'fr-FR;q=1,*;q=0.8'])(
    'should fall back to the invitation when browser preference is %s',
    async (browser) => {
      expect(await resolveInvitationLocale(undefined, browser, 'en', 'nl')).toBe('nl');
    },
  );

  it.each([
    [null, 'nl', 'en', 'nl'],
    ['fr', 'nl', 'en', 'nl'],
    ['fr', 'de', 'nl', 'nl'],
    [null, undefined, 'nl', 'nl'],
    ['fr', 'de', 'en', 'en'],
    ['fr', 'de', 'fr', 'en'],
  ] as const)(
    'should continue from invitation %s through organization %s and global %s to %s',
    async (invitation, organization, global, expected) => {
      vi.mocked(getSystemConfigString).mockResolvedValue(global);
      expect(await resolveInvitationLocale(undefined, 'fr-FR', organization, invitation)).toBe(
        expected,
      );
    },
  );

  // Existing OIDC callers retain their three-argument priority, including global fallback.
  it.each([
    ['nl en', 'en', 'en', 'en', 'nl'],
    ['en nl', 'nl', 'nl', 'nl', 'en'],
    ['fr de', 'nl', 'en', 'en', 'nl'],
    [undefined, 'fr', 'nl', 'en', 'nl'],
    [undefined, undefined, 'fr', 'nl', 'nl'],
    [undefined, undefined, undefined, 'en', 'en'],
  ] as const)(
    'should preserve OIDC order for %s / %s / %s / %s as %s',
    async (ui, browser, organization, global, expected) => {
      vi.mocked(getSystemConfigString).mockResolvedValue(global);
      expect(await resolveLocale(ui, browser, organization)).toBe(expected);
    },
  );

  describe('email resolver without OIDC or browser inputs', () => {
    it.each([
      ['nl-NL', 'en', 'en', 'nl'],
      ['fr', 'nl', 'en', 'nl'],
      [null, 'fr', 'en', 'en'],
      [undefined, 'fr', 'nl', 'nl'],
    ] as const)(
      'should resolve explicit %s with organization %s and global %s to %s',
      async (invitation, organization, global, expected) => {
        vi.mocked(getSystemConfigString).mockResolvedValue(global);
        expect(await resolveInvitationLocale(undefined, undefined, organization, invitation)).toBe(
          expected,
        );
      },
    );
  });

  it.each([
    ['NL', 'nl'],
    ['NL-nl', 'nl'],
    ['nl_NL', 'nl'],
    ['eN-US', 'en'],
    ['EN_us', 'en'],
  ])('should normalize well-formed invitation tag %s to %s', async (invitation, expected) => {
    const organization = expected === 'nl' ? 'en' : 'nl';
    expect(await resolveInvitationLocale(undefined, undefined, organization, invitation)).toBe(
      expected,
    );
  });

  it.each(['NL-nl', 'nl_NL'])(
    'should normalize regional organization fallback %s',
    async (organization) => {
      expect(await resolveInvitationLocale(undefined, undefined, organization, 'fr')).toBe('nl');
    },
  );

  // Invalid identifiers must neither gain locale authority nor leak into diagnostics.
  it.each([
    '../nl',
    '..\\nl',
    'nl/../../en',
    'nl\\..\\en',
    '/nl',
    'nl/en',
    'nl\\en',
    'nl--NL',
    'nl__NL',
    'nl NL',
    'nl\tNL',
    'nl\nNL',
    'nl-..',
    'nl_%2f',
  ])('should skip unsafe invitation and browser candidate %j', async (candidate) => {
    expect(await resolveInvitationLocale(undefined, undefined, 'en', candidate)).toBe('en');
    expect(await resolveInvitationLocale(undefined, candidate, 'en', 'en')).toBe('en');
    const escapedCandidate = JSON.stringify(candidate).slice(1, -1);
    for (const method of [logger.debug, logger.info, logger.warn, logger.error]) {
      expect(JSON.stringify(vi.mocked(method).mock.calls)).not.toContain(escapedCandidate);
    }
  });

  it.each(['', ' ', ' nl ', 'nl ', ' nl'])(
    'should skip empty or whitespace-padded invitation %j',
    async (invitation) => {
      expect(await resolveInvitationLocale(undefined, undefined, 'en', invitation)).toBe('en');
    },
  );

  describe('isolated resource loss', () => {
    const snapshots = new Map<string, unknown>();

    // Mutate only this test worker's resources, restoring even after an assertion fails.
    beforeEach(() => {
      snapshots.clear();
      for (const namespace of ['common', 'invitation']) {
        snapshots.set(namespace, structuredClone(i18next.getResourceBundle('nl', namespace)));
      }
    });
    afterEach(() => {
      for (const [namespace, snapshot] of snapshots) {
        i18next.removeResourceBundle('nl', namespace);
        if (isObject(snapshot)) i18next.addResourceBundle('nl', namespace, snapshot);
      }
    });

    it('should skip Dutch selection when its common bundle is unavailable', async () => {
      i18next.removeResourceBundle('nl', 'common');
      expect(await resolveInvitationLocale(undefined, 'nl', 'en', 'nl')).toBe('en');
    });

    it('should retain Dutch selection but use English when its invitation namespace is absent', async () => {
      expect(i18next.hasResourceBundle('nl', 'common')).toBe(true);
      i18next.removeResourceBundle('nl', 'invitation');
      expect(await resolveInvitationLocale(undefined, undefined, 'en', 'nl')).toBe('nl');
      expect(getTranslationFunction('nl')('invitation.title')).toBe('Accept your invitation');
    });

    it('should retain Dutch selection but use English when only its invitation title is absent', async () => {
      expect(i18next.hasResourceBundle('nl', 'common')).toBe(true);
      const invitation: unknown = structuredClone(i18next.getResourceBundle('nl', 'invitation'));
      if (!isObject(invitation)) throw new Error('Dutch invitation namespace must be loaded');
      expect(invitation).toHaveProperty('title');
      delete invitation.title;
      i18next.removeResourceBundle('nl', 'invitation');
      i18next.addResourceBundle('nl', 'invitation', invitation);
      expect(await resolveInvitationLocale(undefined, undefined, 'en', 'nl')).toBe('nl');
      expect(getTranslationFunction('nl')('invitation.title')).toBe('Accept your invitation');
    });
  });
});
