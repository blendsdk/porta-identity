/**
 * System config service integration tests.
 *
 * Verifies that the system config service reads and writes values
 * from a real PostgreSQL database. Tests cover: get value from DB,
 * set/update value, default fallback, load OIDC TTL config, and cache clearing.
 *
 * Each test starts with a clean slate + seed data (which includes
 * system_config defaults from migration 011).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { getPool } from '../../../src/lib/database.js';
import {
  getSystemConfigString,
  getSystemConfigNumber,
  getSystemConfigBoolean,
  loadOidcTtlConfig,
  clearSystemConfigCache,
} from '../../../src/lib/system-config.js';

describe('System Config Service (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    // Always clear cache between tests to avoid stale reads
    clearSystemConfigCache();
  });

  // ── Get Config Value from DB ───────────────────────────────────

  it('should read seeded config values from the database', async () => {
    // The seed data inserts access_token_ttl as '"3600"' (JSONB string)
    const accessTokenTtl = await getSystemConfigNumber('access_token_ttl', 0);
    expect(accessTokenTtl).toBe(3600);

    // cookie_secure is seeded as 'true' (JSONB string for boolean)
    const cookieSecure = await getSystemConfigBoolean('cookie_secure', false);
    expect(cookieSecure).toBe(true);

    // magic_link_length is seeded as 48 (JSONB number)
    const magicLinkLength = await getSystemConfigNumber('magic_link_length', 0);
    expect(magicLinkLength).toBe(48);
  });

  // ── Set Config Value ───────────────────────────────────────────

  it('should set a new config value and read it back', async () => {
    const pool = getPool();

    // Insert a new config key directly
    await pool.query(
      `INSERT INTO system_config (key, value, value_type, description, is_sensitive)
       VALUES ('test_custom_key', '"hello-world"', 'string', 'Test key', FALSE)`,
    );

    // Clear cache so the new value is fetched from DB
    clearSystemConfigCache();

    const value = await getSystemConfigString('test_custom_key', 'default');
    expect(value).toBe('hello-world');
  });

  it('should update an existing config value', async () => {
    // Read the current value
    const before = await getSystemConfigNumber('access_token_ttl', 0);
    expect(before).toBe(3600);

    // Update the value directly
    const pool = getPool();
    await pool.query(
      `UPDATE system_config SET value = '"7200"' WHERE key = 'access_token_ttl'`,
    );

    // Clear cache and re-read
    clearSystemConfigCache();
    const after = await getSystemConfigNumber('access_token_ttl', 0);
    expect(after).toBe(7200);
  });

  // ── Default Fallback ───────────────────────────────────────────

  it('should return default fallback when key does not exist', async () => {
    const missing = await getSystemConfigString('nonexistent_key', 'fallback-value');
    expect(missing).toBe('fallback-value');

    const missingNum = await getSystemConfigNumber('nonexistent_num', 42);
    expect(missingNum).toBe(42);

    const missingBool = await getSystemConfigBoolean('nonexistent_bool', true);
    expect(missingBool).toBe(true);
  });

  // ── Load OIDC TTL Config ───────────────────────────────────────

  it('should load all OIDC TTL config values from seeded data', async () => {
    const ttl = await loadOidcTtlConfig();

    // Values from seed data (migration 011)
    expect(ttl.accessToken).toBe(3600);
    expect(ttl.idToken).toBe(3600);
    expect(ttl.refreshToken).toBe(2592000);
    expect(ttl.authorizationCode).toBe(600);
    expect(ttl.session).toBe(86400);
    // Interaction is hardcoded, not from DB
    expect(ttl.interaction).toBe(3600);
    // Grant TTL matches refresh token TTL
    expect(ttl.grant).toBe(2592000);
  });

  // ── Cache Invalidation ─────────────────────────────────────────

  it('should return updated value after cache is cleared', async () => {
    // First read caches the value
    const first = await getSystemConfigNumber('access_token_ttl', 0);
    expect(first).toBe(3600);

    // Update DB behind the cache's back
    const pool = getPool();
    await pool.query(
      `UPDATE system_config SET value = '"1800"' WHERE key = 'access_token_ttl'`,
    );

    // Without clearing cache, we'd still get the old value.
    // Clear cache to simulate invalidation.
    clearSystemConfigCache();

    const updated = await getSystemConfigNumber('access_token_ttl', 0);
    expect(updated).toBe(1800);
  });
});
