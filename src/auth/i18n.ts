/**
 * Internationalization (i18n) system for auth workflow pages.
 *
 * Uses i18next with filesystem backend to load translations from disk.
 * Supports per-organization translation overrides:
 *   1. Default translations: locales/default/{locale}/{namespace}.json
 *   2. Org overrides: locales/{orgSlug}/{locale}/{namespace}.json
 *
 * The locale resolution chain prioritizes:
 *   1. ui_locales from OIDC authorization request
 *   2. Accept-Language header
 *   3. Organization defaultLocale
 *   4. Global default_locale from system_config
 *   5. Hardcoded fallback: 'en'
 *
 * Also registers a Handlebars {{t}} helper for template translations.
 *
 * @example
 *   await initI18n();
 *   registerHandlebarsI18nHelper();
 *   const t = getTranslationFunction('en');
 *   t('login.title'); // => "Sign in to your account"
 */

import i18next from 'i18next';
import FsBackend from 'i18next-fs-backend';
import fs from 'node:fs/promises';
import path from 'node:path';
import Handlebars from 'handlebars';
import { getSystemConfigString } from '../lib/system-config.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base directory for locale files, resolved relative to project root */
const LOCALES_DIR = path.resolve(process.cwd(), 'locales');

/**
 * All translation namespaces loaded by default.
 * Each maps to a JSON file: locales/{locale}/{namespace}.json
 */
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

/** Hardcoded fallback locale when all resolution steps fail */
const FALLBACK_LOCALE = 'en';

// ---------------------------------------------------------------------------
// i18next initialization
// ---------------------------------------------------------------------------

/**
 * Initialize i18next with the filesystem backend.
 *
 * Loads translations from locales/default/{locale}/{namespace}.json.
 * Must be called once at application startup before any translation
 * functions are used.
 *
 * @throws Error if i18next initialization fails (fatal startup error)
 */
export async function initI18n(): Promise<void> {
  await i18next.use(FsBackend).init({
    // Default fallback language
    fallbackLng: FALLBACK_LOCALE,
    // Namespaces to load
    ns: [...NAMESPACES],
    defaultNS: 'common',
    // Filesystem backend configuration
    backend: {
      loadPath: path.join(LOCALES_DIR, 'default', '{{lng}}', '{{ns}}.json'),
    },
    // Disable key-based fallback (return key as-is if missing)
    returnNull: false,
    // Interpolation uses {{variable}} by default — same as Handlebars,
    // but i18next escapes by default which is safe for HTML contexts
    interpolation: {
      escapeValue: false,
    },
    // Don't try to detect language from environment
    detection: undefined,
    // Preload English locale at startup
    preload: [FALLBACK_LOCALE],
  });

  logger.info({ localesDir: LOCALES_DIR }, 'i18n initialized');
}

// ---------------------------------------------------------------------------
// Org-specific override loading
// ---------------------------------------------------------------------------

/**
 * Load org-specific translation overrides for a namespace.
 *
 * Checks for locales/{orgSlug}/{locale}/{namespace}.json and returns
 * the parsed JSON if found, or null if no override exists.
 *
 * @param orgSlug - Organization slug for override lookup
 * @param locale - Target locale (e.g., 'en')
 * @param namespace - Translation namespace (e.g., 'login')
 * @returns Parsed override translations, or null if none exist
 */
async function loadOrgOverrides(
  orgSlug: string,
  locale: string,
  namespace: string,
): Promise<Record<string, unknown> | null> {
  const overridePath = path.join(LOCALES_DIR, orgSlug, locale, `${namespace}.json`);
  try {
    const content = await fs.readFile(overridePath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    // No override file — this is normal, not an error
    return null;
  }
}

/**
 * Deep-merge org overrides into a flat key-value map.
 *
 * Flattens nested objects into dot-notation keys for i18next lookup.
 * For example: { login: { title: "Custom" } } => { "login.title": "Custom" }
 *
 * @param obj - Nested object to flatten
 * @param prefix - Current key prefix (for recursion)
 * @returns Flat key-value map
 */
function flattenOverrides(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenOverrides(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = String(value);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Locale resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the best locale for a request.
 *
 * Resolution chain (first non-empty match wins):
 *   1. ui_locales from OIDC authorization request (space-separated list)
 *   2. Accept-Language header (first language tag)
 *   3. Organization defaultLocale
 *   4. Global default_locale from system_config table
 *   5. Hardcoded fallback: 'en'
 *
 * Only returns locales that i18next has loaded (verified via hasResourceBundle).
 *
 * @param uiLocales - Space-separated locale list from OIDC params (e.g., 'nl en')
 * @param acceptLanguage - Accept-Language header value (e.g., 'en-US,en;q=0.9')
 * @param orgDefaultLocale - Organization's default locale setting
 * @returns Resolved locale string (e.g., 'en')
 */
export async function resolveLocale(
  uiLocales: string | undefined,
  acceptLanguage: string | undefined,
  orgDefaultLocale: string,
): Promise<string> {
  // Step 1: Try ui_locales from OIDC authorization request
  if (uiLocales) {
    const candidates = uiLocales.split(/\s+/).filter(Boolean);
    for (const candidate of candidates) {
      const normalized = normalizeLocale(candidate);
      if (isLocaleAvailable(normalized)) {
        return normalized;
      }
    }
  }

  // Step 2: Try Accept-Language header
  if (acceptLanguage) {
    const parsed = parseAcceptLanguage(acceptLanguage);
    for (const candidate of parsed) {
      const normalized = normalizeLocale(candidate);
      if (isLocaleAvailable(normalized)) {
        return normalized;
      }
    }
  }

  // Step 3: Try organization default locale
  if (orgDefaultLocale) {
    const normalized = normalizeLocale(orgDefaultLocale);
    if (isLocaleAvailable(normalized)) {
      return normalized;
    }
  }

  // Step 4: Try global default_locale from system_config
  const globalDefault = await getSystemConfigString('default_locale', FALLBACK_LOCALE);
  const normalized = normalizeLocale(globalDefault);
  if (isLocaleAvailable(normalized)) {
    return normalized;
  }

  // Step 5: Hardcoded fallback
  return FALLBACK_LOCALE;
}

/**
 * Normalize a locale string to its base language code.
 * Strips region/variant suffixes: 'en-US' → 'en', 'nl-NL' → 'nl'.
 *
 * @param locale - Raw locale string
 * @returns Lowercase base language code
 */
function normalizeLocale(locale: string): string {
  return locale.toLowerCase().split(/[-_]/)[0];
}

/**
 * Check if a locale has loaded translations in i18next.
 *
 * @param locale - Locale to check
 * @returns true if translations exist for this locale
 */
function isLocaleAvailable(locale: string): boolean {
  // Check if at least the 'common' namespace has been loaded
  return i18next.hasResourceBundle(locale, 'common');
}

/**
 * Parse an Accept-Language header into ordered language codes.
 *
 * Handles quality values (q=) and returns languages sorted by preference.
 * Example: 'en-US,en;q=0.9,nl;q=0.8' → ['en-US', 'en', 'nl']
 *
 * @param header - Accept-Language header value
 * @returns Array of language codes, highest quality first
 */
function parseAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((part) => {
      const [lang, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1.0;
      return { lang: lang.trim(), q };
    })
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.lang)
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Translation function
// ---------------------------------------------------------------------------

/**
 * Get a translation function for a specific locale with optional org overrides.
 *
 * Returns a function that looks up translation keys across all namespaces.
 * If an orgSlug is provided, org-specific translations are merged on top
 * of the defaults (overriding matching keys).
 *
 * The returned function uses namespace:key syntax internally but accepts
 * plain keys that auto-resolve by checking each namespace.
 *
 * @param locale - Target locale (e.g., 'en')
 * @param orgSlug - Optional org slug for translation overrides
 * @returns Translation function: (key, options?) => translated string
 */
export function getTranslationFunction(
  locale: string,
  orgSlug?: string,
): (key: string, options?: Record<string, unknown>) => string {
  // Cache for org overrides loaded during this function's lifetime
  const orgOverrideCache = new Map<string, Record<string, string>>();
  let orgOverridesLoaded = false;

  /**
   * Lazily load all org overrides for the given locale.
   * Only runs once per translation function instance.
   */
  async function ensureOrgOverrides(): Promise<void> {
    if (orgOverridesLoaded || !orgSlug) return;
    orgOverridesLoaded = true;

    for (const ns of NAMESPACES) {
      const overrides = await loadOrgOverrides(orgSlug, locale, ns);
      if (overrides) {
        orgOverrideCache.set(ns, flattenOverrides(overrides));
      }
    }
  }

  // Pre-load org overrides eagerly (fire-and-forget — they'll be ready by first use)
  if (orgSlug) {
    ensureOrgOverrides().catch((error) => {
      logger.warn({ error, orgSlug, locale }, 'Failed to load org translation overrides');
    });
  }

  /**
   * Translation function that resolves keys across namespaces.
   *
   * Key resolution:
   *   1. Check org overrides (if loaded)
   *   2. Use i18next standard lookup with namespace detection
   *   3. Fall back to key itself if no translation found
   */
  return (key: string, options?: Record<string, unknown>): string => {
    // Determine namespace and key parts
    const colonIndex = key.indexOf(':');
    let ns: string | undefined;
    let lookupKey: string;

    if (colonIndex > -1) {
      // Explicit namespace: "login:title"
      ns = key.substring(0, colonIndex);
      lookupKey = key.substring(colonIndex + 1);
    } else {
      // Dot-notation: "login.title" — first segment is the namespace
      const dotIndex = key.indexOf('.');
      if (dotIndex > -1) {
        const possibleNs = key.substring(0, dotIndex);
        if ((NAMESPACES as readonly string[]).includes(possibleNs)) {
          ns = possibleNs;
          lookupKey = key.substring(dotIndex + 1);
        } else {
          lookupKey = key;
        }
      } else {
        lookupKey = key;
      }
    }

    // Check org overrides first
    if (ns && orgOverrideCache.has(ns)) {
      const overrides = orgOverrideCache.get(ns)!;
      if (lookupKey in overrides) {
        let result = overrides[lookupKey];
        // Apply simple interpolation for org overrides
        if (options) {
          for (const [varKey, varValue] of Object.entries(options)) {
            result = result.replace(new RegExp(`\\{\\{${varKey}\\}\\}`, 'g'), String(varValue));
          }
        }
        return result;
      }
    }

    // Use i18next for standard lookup
    const i18nKey = ns ? `${ns}:${lookupKey}` : lookupKey;
    const translated = i18next.t(i18nKey, {
      lng: locale,
      ...(options ?? {}),
    });

    return typeof translated === 'string' ? translated : key;
  };
}

// ---------------------------------------------------------------------------
// Handlebars i18n helper
// ---------------------------------------------------------------------------

/**
 * Register the {{t}} Handlebars helper for template translations.
 *
 * Must be called after i18next is initialized. The helper reads the
 * translation function from the template context's `t` property.
 *
 * Usage in templates:
 *   {{t "login.title"}}
 *   {{t "common.welcome" name="Alice"}}
 *
 * The helper extracts the `t` function from the current Handlebars context
 * and passes hash arguments as interpolation options.
 */
export function registerHandlebarsI18nHelper(): void {
  Handlebars.registerHelper('t', function (this: Record<string, unknown>, key: string, options: Handlebars.HelperOptions) {
    // The translation function is passed in the template context.
    // Inside {{#each}} blocks, `this` is the current item (e.g., a string),
    // so we fall back to the root context to find the `t` function.
    const t = (this.t ?? (options?.data?.root as Record<string, unknown> | undefined)?.t) as ((k: string, opts?: Record<string, unknown>) => string) | undefined;
    if (!t) {
      // No translation function available — return the key as fallback
      logger.warn({ key }, 'Handlebars {{t}} helper called without translation function in context');
      return key;
    }

    // Pass Handlebars hash arguments as interpolation options
    // e.g., {{t "common.welcome" name="Alice"}} → t("common.welcome", { name: "Alice" })
    const hashOptions = options?.hash ?? {};
    return t(key, hashOptions);
  });

  logger.debug('Handlebars {{t}} i18n helper registered');
}
