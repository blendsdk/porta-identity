/**
 * System configuration service — reads runtime settings from the system_config table.
 *
 * Values are cached in-memory with a configurable TTL to minimize database queries.
 * The cache is shared across all requests within the process.
 *
 * The system_config table stores values as JSONB. Duration-type values are stored
 * as JSONB strings (e.g., '"3600"'), while booleans and numbers are stored as
 * native JSONB types. The typed getters handle parsing and coercion for each type.
 *
 * @example
 *   const ttl = await getSystemConfigNumber('access_token_ttl', 3600);
 *   const secure = await getSystemConfigBoolean('cookie_secure', true);
 *   const allTtls = await loadOidcTtlConfig();
 */

import { getPool } from './database.js';
import { logger } from './logger.js';

/** Cache entry with expiration timestamp */
interface CacheEntry {
  value: unknown;
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

// In-memory cache with TTL (default: 60 seconds)
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

/**
 * Fetch a raw config value from the database by key.
 * Returns undefined if the key does not exist.
 * Results are cached for CACHE_TTL_MS milliseconds.
 *
 * @param key - Config key to look up (e.g., 'access_token_ttl')
 * @returns The JSONB value from the database, or undefined if not found
 */
async function getRawConfigValue(key: string): Promise<unknown | undefined> {
  const now = Date.now();

  // Check cache first
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const pool = getPool();
    const result = await pool.query<{ value: unknown }>(
      'SELECT value FROM system_config WHERE key = $1',
      [key],
    );

    if (result.rows.length === 0) {
      // Cache the miss to avoid repeated DB queries for unknown keys
      cache.set(key, { value: undefined, expiresAt: now + CACHE_TTL_MS });
      return undefined;
    }

    const value = result.rows[0].value;
    cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  } catch (error) {
    // Log warning but don't fail — callers always provide fallback defaults
    logger.warn({ key, error }, 'Failed to read system_config value, using fallback');
    return undefined;
  }
}

/**
 * Get a string config value from the system_config table.
 *
 * @param key - Config key (e.g., 'magic_link_length')
 * @param fallback - Default value returned if key not found or value is not a string
 * @returns The config value as a string, or the fallback
 */
export async function getSystemConfigString(key: string, fallback: string): Promise<string> {
  const raw = await getRawConfigValue(key);
  if (raw === undefined || raw === null) return fallback;

  // JSONB values may be strings, numbers, or booleans — coerce to string
  return String(raw);
}

/**
 * Get a numeric config value from the system_config table.
 *
 * Handles two storage patterns:
 * - Duration-type values stored as JSONB strings (e.g., '"3600"') → parsed to number
 * - Number-type values stored as native JSONB numbers (e.g., 10) → returned directly
 *
 * @param key - Config key (e.g., 'access_token_ttl')
 * @param fallback - Default value returned if key not found or not a valid number
 * @returns The config value as a number, or the fallback
 */
export async function getSystemConfigNumber(key: string, fallback: number): Promise<number> {
  const raw = await getRawConfigValue(key);
  if (raw === undefined || raw === null) return fallback;

  // If already a number (native JSONB number), return directly
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;

  // If it's a string (duration values stored as JSONB strings like '"3600"'),
  // parse as number
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }

  logger.warn({ key, raw }, 'system_config value is not a valid number, using fallback');
  return fallback;
}

/**
 * Get a boolean config value from the system_config table.
 *
 * Handles native JSONB booleans (true/false) and string representations
 * ('true'/'false') for maximum flexibility.
 *
 * @param key - Config key (e.g., 'cookie_secure')
 * @param fallback - Default value returned if key not found or not a valid boolean
 * @returns The config value as a boolean, or the fallback
 */
export async function getSystemConfigBoolean(key: string, fallback: boolean): Promise<boolean> {
  const raw = await getRawConfigValue(key);
  if (raw === undefined || raw === null) return fallback;

  // Native JSONB boolean
  if (typeof raw === 'boolean') return raw;

  // String representation (from some JSONB encodings)
  if (typeof raw === 'string') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  }

  logger.warn({ key, raw }, 'system_config value is not a valid boolean, using fallback');
  return fallback;
}

/**
 * Load all TTL config values needed by the OIDC provider.
 *
 * Reads each TTL key from system_config with hardcoded fallback defaults.
 * Called once at provider initialization to build the TTL configuration.
 * The interaction TTL is hardcoded (not stored in system_config).
 *
 * @returns Object with all OIDC TTL settings in seconds
 */
export async function loadOidcTtlConfig(): Promise<OidcTtlConfig> {
  const [accessToken, idToken, refreshToken, authorizationCode, session] = await Promise.all([
    getSystemConfigNumber('access_token_ttl', 3600),
    getSystemConfigNumber('id_token_ttl', 3600),
    getSystemConfigNumber('refresh_token_ttl', 2592000),
    getSystemConfigNumber('authorization_code_ttl', 600),
    getSystemConfigNumber('session_ttl', 86400),
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
 * Useful for testing to ensure fresh reads from the database.
 */
export function clearSystemConfigCache(): void {
  cache.clear();
}
