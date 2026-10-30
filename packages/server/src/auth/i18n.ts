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
 *   3. Valid invitation locale, when supplied by an invitation caller
 *   4. Organization defaultLocale
 *   5. Global default_locale from system_config
 *   6. Hardcoded fallback: 'en'
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
import { SUPPORTED_LOCALES, type SupportedLocale } from '../lib/system-config-catalog.js';
import { logger } from '../lib/logger.js';
import { getLocalesDirectory } from '../lib/runtime-paths.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Absolute directory containing locale files shipped with the server package. */
const LOCALES_DIR = getLocalesDirectory();

/**
 * All translation namespaces loaded by default.
 * Each maps to a JSON file: locales/{locale}/{namespace}.json
 */
export const NAMESPACES = Object.freeze([
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
] as const);

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
    // Only completely packaged, allowlisted locales are preloaded at startup.
    preload: [...SUPPORTED_LOCALES],
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
    const resource: unknown = JSON.parse(content);
    return isTranslationObject(resource) ? resource : null;
  } catch {
    // No override file — this is normal, not an error
    return null;
  }
}

/**
 * Flatten valid string overrides into a flat key-value map.
 *
 * Flattens nested objects into dot-notation keys for i18next lookup.
 * For example: { login: { title: "Custom" } } => { "login.title": "Custom" }
 *
 * @param obj - Nested object to flatten
 * @param prefix - Current key prefix (for recursion)
 * Invalid leaves are ignored so the corresponding packaged text remains the fallback.
 *
 * @returns Flat key-value map containing string translations only
 */
function flattenOverrides(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (isTranslationObject(value)) {
      Object.assign(result, flattenOverrides(value, fullKey));
    } else if (typeof value === 'string') {
      result[fullKey] = value;
    }
  }
  return result;
}

/** Only JSON objects can contain namespace keys; arrays and scalar resources are malformed. */
function isTranslationObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Locale resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the best locale for a request.
 *
 * Resolution chain (first supported, loaded match wins):
 *   1. ui_locales from OIDC authorization request (space-separated list)
 *   2. Accept-Language header (positive quality, highest preference first)
 *   3. Optional invitation locale
 *   4. Organization defaultLocale
 *   5. Global default_locale from system_config table
 *   6. Hardcoded fallback: 'en'
 *
 * Candidates must be well-formed language tags and belong to the packaged allowlist. The
 * selected language must have its common bundle loaded; unavailable candidates are skipped.
 * Callers omitting invitation context retain the existing OIDC resolution order.
 *
 * @param uiLocales - Space-separated locale list from OIDC params (e.g., 'nl en')
 * @param acceptLanguage - Accept-Language header value (e.g., 'en-US,en;q=0.9')
 * @param orgDefaultLocale - Organization's default locale setting
 * @param invitationLocale - Explicit email locale or a validated, non-conflicting invitation's locale
 * @returns Resolved locale string (e.g., 'en')
 * @example
 * await resolveLocale(undefined, 'fr-FR', 'en', 'nl'); // 'nl' when packaged and loaded
 */
export async function resolveLocale(
  uiLocales: string | undefined,
  acceptLanguage: string | undefined,
  orgDefaultLocale: string,
  invitationLocale?: string | null,
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

  // Keep invitation and organization candidates separate so an unsupported invitation
  // language cannot erase a valid organization fallback.
  if (invitationLocale) {
    const normalized = normalizeLocale(invitationLocale);
    if (isLocaleAvailable(normalized)) {
      return normalized;
    }
  }

  // Try the organization default only after browser and invitation preferences.
  if (orgDefaultLocale) {
    const normalized = normalizeLocale(orgDefaultLocale);
    if (isLocaleAvailable(normalized)) {
      return normalized;
    }
  }

  // Try global default_locale from system_config.
  const globalDefault = await getSystemConfigString('default_locale');
  const normalized = normalizeLocale(globalDefault);
  if (isLocaleAvailable(normalized)) {
    return normalized;
  }

  // English is the final fallback even when deployment resources are incomplete.
  return FALLBACK_LOCALE;
}

/**
 * Validate a complete language tag before selecting its lowercase base language.
 * Underscores retain the accepted regional-input convention. Validation happens before
 * stripping suffixes so malformed or path-shaped input cannot become a valid locale.
 *
 * @param locale - Raw locale string
 * @returns Lowercase base language code, or undefined for malformed input
 */
function normalizeLocale(locale: string): string | undefined {
  try {
    const canonical = Intl.getCanonicalLocales(locale.replaceAll('_', '-'))[0];
    return canonical?.split('-')[0].toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Check that a canonical locale is packaged and has its common translations loaded.
 *
 * @param locale - Locale to check
 * @returns true only for an available member of the closed language catalog
 */
function isLocaleAvailable(locale: string | undefined): locale is SupportedLocale {
  return (
    locale !== undefined &&
    SUPPORTED_LOCALES.some((supported) => supported === locale) &&
    i18next.hasResourceBundle(locale, 'common')
  );
}

/**
 * Parse an Accept-Language header into ordered language codes.
 *
 * Only an optional single quality parameter is accepted. Zero, malformed, duplicate and
 * out-of-range qualities exclude that candidate. Stable sorting preserves header order
 * for equal weights; locale validation and wildcard rejection happen during selection.
 * Example: 'en-US,en;q=0.9,nl;q=0.8' → ['en-US', 'en', 'nl']
 *
 * @param header - Accept-Language header value
 * @returns Array of language codes, highest quality first
 */
function parseAcceptLanguage(header: string): string[] {
  const preferences: { locale: string; quality: number }[] = [];
  for (const part of header.split(',')) {
    const [language, ...parameters] = part.trim().split(';');
    if (parameters.length > 1) continue;

    let quality = 1;
    if (parameters.length === 1) {
      const weight = /^q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i.exec(parameters[0].trim());
      if (!weight) continue;
      quality = Number(weight[1]);
    }
    if (quality > 0) preferences.push({ locale: language.trim(), quality });
  }
  return preferences
    .sort((left, right) => right.quality - left.quality)
    .map(({ locale }) => locale);
}

// ---------------------------------------------------------------------------
// Translation function
// ---------------------------------------------------------------------------

/** Synchronous lookup bound to one render's language and optional tenant overrides. */
type TranslationFunction = (key: string, options?: Record<string, unknown>) => string;

/** One translator and the completion signal for its private override reads. */
interface TranslationContext {
  /** Lookup closure whose override map is never shared with another render. */
  translate: TranslationFunction;
  /** Resolves after every existing namespace override read has settled. */
  ready: Promise<void>;
}

/**
 * Get a translation function for a specific locale with optional org overrides.
 *
 * Returns a function that looks up translation keys across all namespaces.
 * If an orgSlug is provided, org-specific translations are merged on top
 * of the defaults (overriding matching keys).
 *
 * The returned function uses namespace:key syntax internally but accepts
 * plain keys that auto-resolve by checking each namespace.
 * Synchronous callers can see defaults while overrides load; use the prepared companion when
 * the first lookup must include tenant overrides.
 *
 * @param locale - Target locale (e.g., 'en')
 * @param orgSlug - Optional org slug for translation overrides
 * @returns Translation function: (key, options?) => translated string
 * @example
 * const translate = getTranslationFunction('en');
 * translate('invitation.title');
 */
export function getTranslationFunction(
  locale: string,
  orgSlug?: string,
): TranslationFunction {
  const context = createTranslationContext(locale, orgSlug);
  void context.ready.catch(() => {
    logger.warn({ event: 'translation-overrides-unavailable' }, 'Translation overrides unavailable');
  });
  return context.translate;
}

/**
 * Prepare a render-local translator before any invitation copy is evaluated.
 *
 * The locale must already be canonical, packaged and loaded. Rejecting misuse before creating
 * the context prevents unselected language strings from reaching filesystem path construction.
 * Missing, unreadable or malformed tenant overrides retain the packaged-resource fallback.
 *
 * @param locale - Canonical language selected by resolveLocale.
 * @param orgSlug - Resolved organization slug, or undefined for packaged translations only.
 * @returns Synchronous translator after its private override reads finish.
 * @throws Error if the language is not available or preparation unexpectedly fails.
 * @example
 * const translate = await prepareTranslationFunction('nl', 'acme');
 * translate('emails.invitation.subject', { orgName: 'Acme' });
 */
export async function prepareTranslationFunction(
  locale: string,
  orgSlug?: string,
): Promise<TranslationFunction> {
  if (!isLocaleAvailable(locale)) throw new Error('Translation locale is not available');
  const context = createTranslationContext(locale, orgSlug);
  await context.ready;
  return context.translate;
}

/**
 * Share the existing lookup engine between synchronous and awaited callers without sharing
 * mutable state. Starting the reads here keeps readiness tied to this exact translator.
 */
function createTranslationContext(locale: string, orgSlug?: string): TranslationContext {
  // Cache for org overrides loaded during this function's lifetime
  const orgOverrideCache = new Map<string, Record<string, string>>();

  /**
    * Load each namespace once for this translation context.
   */
  async function ensureOrgOverrides(): Promise<void> {
    if (!orgSlug) return;

    for (const ns of NAMESPACES) {
      const overrides = await loadOrgOverrides(orgSlug, locale, ns);
      if (overrides) {
        orgOverrideCache.set(ns, flattenOverrides(overrides));
      }
    }
  }

  const ready = ensureOrgOverrides();

  /**
   * Translation function that resolves keys across namespaces.
   *
   * Key resolution:
   *   1. Check org overrides (if loaded)
   *   2. Use i18next standard lookup with namespace detection
   *   3. Fall back to key itself if no translation found
   */
  const translate: TranslationFunction = (key, options) => {
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
    const overrides = ns ? orgOverrideCache.get(ns) : undefined;
    if (overrides && Object.hasOwn(overrides, lookupKey)) {
      return interpolateOverride(overrides[lookupKey], options);
    }

    // Use i18next for standard lookup
    const i18nKey = ns ? `${ns}:${lookupKey}` : lookupKey;
    const translated = i18next.t(i18nKey, {
      lng: locale,
      ...(options ?? {}),
    });

    // i18next already interpolates packaged resources. A second pass would interpret braces
    // introduced by a user's name or message as another template rather than literal data.
    return typeof translated === 'string' ? translated : key;
  };
  return { translate, ready };
}

/**
 * Interpolate only placeholders in the original override text. A replacement callback keeps
 * dollar signs literal and never recursively interprets placeholders contained in user data.
 */
function interpolateOverride(text: string, options?: Record<string, unknown>): string {
  if (!options) return text;
  return text.replace(/\{\{([^{}]+)\}\}/g, (placeholder, key: string) => {
    const value = Object.hasOwn(options, key) ? options[key] : undefined;
    return value === undefined ? placeholder : String(value);
  });
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

    // Resolve undefined hash values from the root context.
    // Handlebars may pass `undefined` for hash values like `maskedEmail=maskedEmail`
    // if the identifier resolution fails in certain scope contexts. Fall back to
    // the root data context to ensure interpolation variables are available.
    const root = (options?.data?.root ?? this) as Record<string, unknown>;
    for (const [hashKey, hashValue] of Object.entries(hashOptions)) {
      if (hashValue === undefined && root[hashKey] !== undefined) {
        hashOptions[hashKey] = root[hashKey];
      }
    }

    return t(key, hashOptions);
  });

  logger.debug('Handlebars {{t}} i18n helper registered');
}
