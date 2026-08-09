import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// All mock objects are inline — vi.mock factories are hoisted and cannot
// reference top-level const variables.
// ---------------------------------------------------------------------------

// Mock i18next — controls initialization and translation lookups
vi.mock('i18next', () => ({
  default: {
    use: vi.fn().mockReturnThis(),
    init: vi.fn().mockResolvedValue(undefined),
    t: vi.fn(),
    hasResourceBundle: vi.fn(),
  },
}));

// Mock i18next-fs-backend — just needs to be importable
vi.mock('i18next-fs-backend', () => ({ default: {} }));

// Mock node:fs/promises — controls org override file loading
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

// Mock Handlebars — controls helper registration
vi.mock('handlebars', () => ({
  default: {
    registerHelper: vi.fn(),
  },
}));

// Mock system config — controls global default_locale
vi.mock('../../../src/lib/system-config.js', () => ({
  getSystemConfigString: vi.fn(),
}));

// Mock logger — suppress output during tests
vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import i18next from 'i18next';
import Handlebars from 'handlebars';
import { getSystemConfigString } from '../../../src/lib/system-config.js';
import {
  initI18n,
  resolveLocale,
  getTranslationFunction,
  registerHandlebarsI18nHelper,
} from '../../../src/auth/i18n.js';

// ---------------------------------------------------------------------------
// Typed accessors for mocked modules
// ---------------------------------------------------------------------------

const mockedI18next = vi.mocked(i18next);
const mockedHandlebars = vi.mocked(Handlebars);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('i18n', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // initI18n
  // -------------------------------------------------------------------------

  describe('initI18n', () => {
    it('should initialize i18next with the filesystem backend', async () => {
      await initI18n();

      expect(mockedI18next.use).toHaveBeenCalled();
      expect(mockedI18next.init).toHaveBeenCalledWith(
        expect.objectContaining({
          fallbackLng: 'en',
          defaultNS: 'common',
          preload: ['en'],
        }),
      );
    });

    it('should load all expected namespaces', async () => {
      await initI18n();

      const initConfig = (mockedI18next.init as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(initConfig.ns).toContain('common');
      expect(initConfig.ns).toContain('login');
      expect(initConfig.ns).toContain('consent');
      expect(initConfig.ns).toContain('forgot-password');
      expect(initConfig.ns).toContain('reset-password');
      expect(initConfig.ns).toContain('magic-link');
      expect(initConfig.ns).toContain('invitation');
      expect(initConfig.ns).toContain('logout');
      expect(initConfig.ns).toContain('errors');
      expect(initConfig.ns).toContain('emails');
    });

    it('should configure backend with correct load path', async () => {
      await initI18n();

      const initConfig = (mockedI18next.init as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Backend loadPath should include the locales/default/{lng}/{ns}.json pattern
      expect(initConfig.backend.loadPath).toContain('locales');
      expect(initConfig.backend.loadPath).toContain('default');
      expect(initConfig.backend.loadPath).toContain('{{lng}}');
      expect(initConfig.backend.loadPath).toContain('{{ns}}.json');
    });

    it('should disable HTML escaping in interpolation', async () => {
      await initI18n();

      const initConfig = (mockedI18next.init as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(initConfig.interpolation.escapeValue).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // resolveLocale
  // -------------------------------------------------------------------------

  describe('resolveLocale', () => {
    it('should prefer ui_locales when available and loaded', async () => {
      // Mark 'nl' as having loaded translations
      (mockedI18next.hasResourceBundle as ReturnType<typeof vi.fn>).mockImplementation(
        (locale: string, ns: string) => locale === 'nl' && ns === 'common',
      );

      const result = await resolveLocale('nl en', undefined, 'en');

      expect(result).toBe('nl');
    });

    it('should skip ui_locales when not loaded and try Accept-Language', async () => {
      // Only 'en' is loaded
      (mockedI18next.hasResourceBundle as ReturnType<typeof vi.fn>).mockImplementation(
        (locale: string, ns: string) => locale === 'en' && ns === 'common',
      );

      const result = await resolveLocale('fr de', 'en-US,en;q=0.9', 'en');

      expect(result).toBe('en');
    });

    it('should normalize locale codes by stripping region suffixes', async () => {
      // 'en' is loaded but 'en-US' is passed
      (mockedI18next.hasResourceBundle as ReturnType<typeof vi.fn>).mockImplementation(
        (locale: string, ns: string) => locale === 'en' && ns === 'common',
      );

      const result = await resolveLocale('en-US', undefined, 'de');

      // Should normalize 'en-US' to 'en'
      expect(result).toBe('en');
    });

    it('should parse Accept-Language with quality values', async () => {
      // Both 'de' and 'en' are loaded, but 'de' has higher quality
      (mockedI18next.hasResourceBundle as ReturnType<typeof vi.fn>).mockImplementation(
        (locale: string, ns: string) =>
          (locale === 'de' || locale === 'en') && ns === 'common',
      );

      const result = await resolveLocale(undefined, 'en;q=0.5,de;q=0.9', 'fr');

      // 'de' should win because it has higher quality value
      expect(result).toBe('de');
    });

    it('should fall back to org default locale', async () => {
      (mockedI18next.hasResourceBundle as ReturnType<typeof vi.fn>).mockImplementation(
        (locale: string, ns: string) => locale === 'nl' && ns === 'common',
      );

      const result = await resolveLocale(undefined, undefined, 'nl');

      expect(result).toBe('nl');
    });

    it('should fall back to system config default_locale', async () => {
      // Nothing loaded except 'es'
      (mockedI18next.hasResourceBundle as ReturnType<typeof vi.fn>).mockImplementation(
        (locale: string, ns: string) => locale === 'es' && ns === 'common',
      );
      (getSystemConfigString as ReturnType<typeof vi.fn>).mockResolvedValue('es');

      const result = await resolveLocale(undefined, undefined, 'fr');

      expect(result).toBe('es');
    });

    it('should fall back to hardcoded en when nothing else matches', async () => {
      // Only 'en' is loaded
      (mockedI18next.hasResourceBundle as ReturnType<typeof vi.fn>).mockImplementation(
        (locale: string, ns: string) => locale === 'en' && ns === 'common',
      );
      (getSystemConfigString as ReturnType<typeof vi.fn>).mockResolvedValue('en');

      const result = await resolveLocale(undefined, undefined, 'zz');

      expect(result).toBe('en');
    });

    it('should handle empty ui_locales gracefully', async () => {
      (mockedI18next.hasResourceBundle as ReturnType<typeof vi.fn>).mockImplementation(
        (locale: string, ns: string) => locale === 'en' && ns === 'common',
      );
      (getSystemConfigString as ReturnType<typeof vi.fn>).mockResolvedValue('en');

      const result = await resolveLocale('', undefined, 'en');

      expect(result).toBe('en');
    });

    it('should handle multiple ui_locales and pick first available', async () => {
      // Only 'de' is loaded
      (mockedI18next.hasResourceBundle as ReturnType<typeof vi.fn>).mockImplementation(
        (locale: string, ns: string) => locale === 'de' && ns === 'common',
      );

      const result = await resolveLocale('fr de en', undefined, 'en');

      // 'fr' not available, 'de' is → should pick 'de'
      expect(result).toBe('de');
    });
  });

  // -------------------------------------------------------------------------
  // getTranslationFunction
  // -------------------------------------------------------------------------

  describe('getTranslationFunction', () => {
    it('should return a function', () => {
      const t = getTranslationFunction('en');

      expect(typeof t).toBe('function');
    });

    it('should delegate to i18next.t for standard lookups', () => {
      (mockedI18next.t as ReturnType<typeof vi.fn>).mockReturnValue('Sign In');

      const t = getTranslationFunction('en');
      const result = t('login:title');

      expect(mockedI18next.t).toHaveBeenCalledWith(
        'login:title',
        expect.objectContaining({ lng: 'en' }),
      );
      expect(result).toBe('Sign In');
    });

    it('should detect namespace from dot-notation keys', () => {
      (mockedI18next.t as ReturnType<typeof vi.fn>).mockReturnValue('Welcome');

      const t = getTranslationFunction('en');
      t('login.title');

      // Should convert 'login.title' to 'login:title' for i18next
      expect(mockedI18next.t).toHaveBeenCalledWith(
        'login:title',
        expect.objectContaining({ lng: 'en' }),
      );
    });

    it('should return the key when translation is not found', () => {
      // i18next returns undefined/null for missing translations
      (mockedI18next.t as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const t = getTranslationFunction('en');
      const result = t('nonexistent.key');

      expect(result).toBe('nonexistent.key');
    });

    it('should pass interpolation options through to i18next', () => {
      (mockedI18next.t as ReturnType<typeof vi.fn>).mockReturnValue('Hello Alice');

      const t = getTranslationFunction('en');
      t('common:greeting', { name: 'Alice' });

      expect(mockedI18next.t).toHaveBeenCalledWith(
        'common:greeting',
        expect.objectContaining({ lng: 'en', name: 'Alice' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // registerHandlebarsI18nHelper
  // -------------------------------------------------------------------------

  describe('registerHandlebarsI18nHelper', () => {
    it('should register a "t" helper with Handlebars', () => {
      registerHandlebarsI18nHelper();

      expect(mockedHandlebars.registerHelper).toHaveBeenCalledWith(
        't',
        expect.any(Function),
      );
    });

    it('should return the key when no translation function exists in context', () => {
      registerHandlebarsI18nHelper();

      // Get the registered helper function
      const helperFn = (mockedHandlebars.registerHelper as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) => call[0] === 't',
      )?.[1];

      expect(helperFn).toBeDefined();

      // Call the helper with no t function in context
      const result = helperFn.call({}, 'login.title', { hash: {} });

      expect(result).toBe('login.title');
    });

    it('should call the context t function with key and hash options', () => {
      registerHandlebarsI18nHelper();

      const helperFn = (mockedHandlebars.registerHelper as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) => call[0] === 't',
      )?.[1];

      const mockT = vi.fn().mockReturnValue('Translated');
      const context = { t: mockT };

      const result = helperFn.call(context, 'common.welcome', {
        hash: { name: 'Bob' },
      });

      expect(mockT).toHaveBeenCalledWith('common.welcome', { name: 'Bob' });
      expect(result).toBe('Translated');
    });
  });
});
