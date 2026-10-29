/** Exercises language-parser boundaries and allowlist enforcement with real i18next resources. */
import i18next from 'i18next';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n, resolveLocale } from '../../../src/auth/i18n.js';

/** Database-backed global policy is the only stateful external dependency in these cases. */
const { readDefaultLocale } = vi.hoisted(() => ({
  readDefaultLocale: vi.fn<() => Promise<string>>(),
}));

vi.mock('../../../src/lib/system-config.js', () => ({
  getSystemConfigString: readDefaultLocale,
}));
vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('invitation language parser boundaries', () => {
  beforeAll(async () => {
    await initI18n();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    readDefaultLocale.mockResolvedValue('en');
  });

  it.each([
    ['nl;Q=1,en;q=0.9', 'nl'],
    ['nl;q=1.,en;q=0.9', 'nl'],
    ['nl;q=0.,en;q=0.1', 'en'],
    ['nl;q=.5,en;q=0.1', 'en'],
    ['nl;q=00.5,en;q=0.1', 'en'],
    ['nl;q=+0.5,en;q=0.1', 'en'],
    ['nl;q=Infinity,en;q=0.1', 'en'],
    ['nl;q=NaN,en;q=0.1', 'en'],
    ['nl;q=0.5suffix,en;q=0.1', 'en'],
    ['nl;q=1;Q=1,en;q=0.1', 'en'],
    ['nl;unsupported=1,en;q=0.1', 'en'],
    [', , nl;q=0.5, ,en;q=0.1', 'nl'],
  ])('should resolve quality boundary %s as %s', async (header, expected) => {
    expect(await resolveLocale(undefined, header, 'en')).toBe(expected);
  });

  it.each(['nl-Latn-NL', 'nl_NL', 'nl-x-private'])(
    'should reduce complete language tag %s to its packaged base',
    async (invitation) => {
      expect(await resolveLocale(undefined, undefined, 'en', invitation)).toBe('nl');
    },
  );

  it.each(['nl-x', 'nl-a', 'nl-123456789', 'nl-@', '__proto__'])(
    'should reject malformed suffix %s before reducing it to a base',
    async (invitation) => {
      expect(await resolveLocale(undefined, undefined, 'en', invitation)).toBe('en');
    },
  );

  it('should preserve organization fallback when an invitation tag is malformed', async () => {
    expect(await resolveLocale(undefined, 'fr', 'nl', '../en')).toBe('nl');
    expect(readDefaultLocale).not.toHaveBeenCalled();
  });

  it('should avoid global policy reads when a browser preference is available', async () => {
    expect(await resolveLocale(undefined, 'en', 'nl', 'nl')).toBe('en');
    expect(readDefaultLocale).not.toHaveBeenCalled();
  });

  it('should ignore unshipped locales even when a resource was loaded into i18next', async () => {
    // This isolated worker has only the shipped bundles; remove the added bundle even on failure.
    expect(i18next.hasResourceBundle('fr', 'common')).toBe(false);
    i18next.addResourceBundle('fr', 'common', { submit: 'Envoyer' });
    readDefaultLocale.mockResolvedValue('fr');
    try {
      expect(await resolveLocale('fr', 'fr', 'fr', 'fr')).toBe('en');
      expect(readDefaultLocale).toHaveBeenCalledWith('default_locale');
    } finally {
      i18next.removeResourceBundle('fr', 'common');
    }
  });
});
