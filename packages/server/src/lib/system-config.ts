/**
 * System configuration service — reads runtime settings from the system_config table.
 *
 * Found values are cached in-memory for 60 seconds to minimize database queries.
 * The cache is shared across all requests within the process.
 *
 * Public values use native JSONB scalars and the immutable catalog's validation and defaults.
 * No coercion is performed. Missing, invalid or unavailable policy uses a bounded safe warning.
 *
 * @example
 *   const ttl = await getSystemConfigNumber('access_token_ttl');
 *   const allTtls = await loadOidcTtlConfig();
 */

import { getPool } from './database.js';
import { logger } from './logger.js';
import { findSystemConfigDefinition, validateSystemConfigValue } from './system-config-catalog.js';
import type {
  NumericSystemConfigKey,
  SupportedLocale,
  SystemConfigKey,
  SystemConfigValue,
} from './system-config-catalog.js';

/** Cache entry with expiration timestamp */
interface CacheEntry {
  /** Native database content, validated by the appropriate reader before use. */
  value: unknown;
  /** Exclusive expiry based on the start of the database read. */
  expiresAt: number;
}

/** OIDC TTL configuration loaded from system_config table */
export interface OidcTtlConfig {
  /** Access token lifetime in seconds (default: 3600 = 1 hour) */
  accessToken: number;
  /** ID token lifetime in seconds (default: 3600 = 1 hour) */
  idToken: number;
  /** Refresh token lifetime in seconds (default: 2592000 = 30 days) */
  refreshToken: number;
  /** Authorization code lifetime in seconds (default: 600 = 10 minutes) */
  authorizationCode: number;
  /** Session lifetime in seconds (default: 86400 = 24 hours) */
  session: number;
  /** Interaction lifetime in seconds — hardcoded, not in system_config (default: 3600 = 1 hour) */
  interaction: number;
  /** Grant lifetime in seconds — same as refresh token (default: 2592000 = 30 days) */
  grant: number;
}

/** Active local cache; old queries retain their original map after explicit invalidation. */
let cache = new Map<string, CacheEntry>();
/** Maximum time another healthy process may retain a previously read policy value. */
const CACHE_TTL_MS = 60_000;

/** Distinguish absent storage from a failed read without retaining or exposing database exceptions. */
type RawConfigResult = { status: 'found'; value: unknown } | { status: 'missing' | 'unavailable' };

/**
 * Fetch a raw config value from the database by key.
 * Only found rows are cached. Each query captures its cache map before awaiting PostgreSQL,
 * so a completion from before invalidation cannot refill the replacement cache with stale policy.
 *
 * @param key - Config key to look up (e.g., 'access_token_ttl')
 * @returns Found JSONB content, missing, or unavailable; raw errors never escape this boundary.
 */
async function getRawConfigValue(key: string): Promise<RawConfigResult> {
  const now = Date.now();
  const startingCache = cache;

  // Check cache first
  const cached = startingCache.get(key);
  if (cached && cached.expiresAt > now) {
    return { status: 'found', value: cached.value };
  }

  try {
    const pool = getPool();
    const result = await pool.query<{ value: unknown }>(
      'SELECT value FROM system_config WHERE key = $1',
      [key],
    );

    const row = result.rows[0];
    if (!row) return { status: 'missing' };
    startingCache.set(key, { value: row.value, expiresAt: now + CACHE_TTL_MS });
    return { status: 'found', value: row.value };
  } catch {
    return { status: 'unavailable' };
  }
}

/**
 * Read public policy through application-owned validation and defaults. Warning fields contain
 * only a catalog key and closed reason; neither stored content nor infrastructure exceptions leak.
 */
async function readCatalogValue(key: SystemConfigKey): Promise<SystemConfigValue> {
  const definition = findSystemConfigDefinition(key);
  if (!definition) throw new Error('Unsupported system configuration key');
  const result = await getRawConfigValue(key);
  const value =
    result.status === 'found' ? validateSystemConfigValue(definition, result.value) : undefined;
  if (value !== undefined) return value;
  const reason = result.status === 'found' ? 'invalid' : result.status;
  logger.warn(
    { event: 'system-config-fallback', key, reason },
    'Using default system configuration value',
  );
  return definition.defaultValue;
}

/**
 * Read a native, bounded integer or its exact catalog default, without caller-owned fallbacks.
 * @param key - Public integer policy key.
 * @returns Valid stored integer or the same catalog's safe default.
 * @throws Error when JavaScript callers supply a non-numeric or non-catalog key.
 * @example
 * await getSystemConfigNumber('magic_link_ttl'); // seconds
 */
export async function getSystemConfigNumber(key: NumericSystemConfigKey): Promise<number> {
  const value = await readCatalogValue(key);
  if (typeof value !== 'number') throw new Error('Expected numeric system configuration key');
  return value;
}

/**
 * Read the final authentication locale fallback without coercing arbitrary database content.
 * @param key - The closed public locale key.
 * @returns Completely supported stored locale or its catalog default.
 * @throws Error when JavaScript callers supply a non-locale or non-catalog key.
 * @example
 * await getSystemConfigString('default_locale'); // 'en'
 */
export async function getSystemConfigString(key: 'default_locale'): Promise<SupportedLocale> {
  const value = await readCatalogValue(key);
  if (typeof value !== 'string') throw new Error('Expected locale system configuration key');
  return value;
}

/**
 * Read trusted internal string rows independently of public operational policy. Internal rows
 * never enter administrative projections, and raw exceptions or stored content are not logged.
 * @param key - Internal name supplied by Porta code, not by an administrative request.
 * @param fallback - Safe result when storage is absent, unavailable or not a native string.
 * @returns Native internal string, or the supplied fallback.
 * @example
 * await getInternalSystemConfigString('super_admin_user_id', '');
 */
export async function getInternalSystemConfigString(
  key: string,
  fallback: string,
): Promise<string> {
  const result = await getRawConfigValue(key);
  return result.status === 'found' && typeof result.value === 'string' ? result.value : fallback;
}

/**
 * Load all TTL config values needed by the OIDC provider.
 *
 * Reads each native TTL through the same catalog used by administrative policy.
 * Called once at provider initialization to build the TTL configuration.
 * The interaction TTL is hardcoded (not stored in system_config).
 *
 * @returns Object with all OIDC TTL settings in seconds
 */
export async function loadOidcTtlConfig(): Promise<OidcTtlConfig> {
  const [accessToken, idToken, refreshToken, authorizationCode, session] = await Promise.all([
    getSystemConfigNumber('access_token_ttl'),
    getSystemConfigNumber('id_token_ttl'),
    getSystemConfigNumber('refresh_token_ttl'),
    getSystemConfigNumber('authorization_code_ttl'),
    getSystemConfigNumber('session_ttl'),
  ]);

  return {
    accessToken,
    idToken,
    refreshToken,
    authorizationCode,
    session,
    // Interaction TTL is hardcoded — not configurable via system_config
    interaction: 3600,
    // Grant TTL matches refresh token TTL by default
    grant: refreshToken,
  };
}

/**
 * Clear the in-memory config cache.
 * Successful administrative saves call this after commit. Replacing the map also isolates
 * reads already awaiting PostgreSQL, so their later completion cannot restore stale policy.
 */
export function clearSystemConfigCache(): void {
  cache = new Map<string, CacheEntry>();
}
