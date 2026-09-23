/**
 * System config service integration tests.
 *
 * Verifies that the system config service reads and writes values
 * from a real PostgreSQL database. Tests cover: get value from DB,
 * set/update value, default fallback, load OIDC TTL config, and cache clearing.
 *
 * Each test starts with a clean slate + seed data (which includes
 * native catalog defaults).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { getPool } from '../../../src/lib/database.js';
import {
  getSystemConfigString,
  getSystemConfigNumber,
  getInternalSystemConfigString,
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
  afterEach(() => vi.useRealTimers());

  // ── Get Config Value from DB ───────────────────────────────────

  it('should read seeded config values from the database', async () => {
    const accessTokenTtl = await getSystemConfigNumber('access_token_ttl');
    expect(accessTokenTtl).toBe(3600);

    expect(await getSystemConfigString('default_locale')).toBe('en');
    const rows = await getPool().query('SELECT key, value FROM system_config ORDER BY key');
    expect(rows.rows).toHaveLength(18);
    expect(rows.rows.find((row) => row.key === 'access_token_ttl')?.value).toBe(3600);
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

    const value = await getInternalSystemConfigString('test_custom_key', 'default');
    expect(value).toBe('hello-world');
  });

  it('should update an existing config value', async () => {
    // Read the current value
    const before = await getSystemConfigNumber('access_token_ttl');
    expect(before).toBe(3600);

    // Update the value directly
    const pool = getPool();
    await pool.query(
      `UPDATE system_config SET value = '7200'::jsonb WHERE key = 'access_token_ttl'`,
    );

    // Clear cache and re-read
    clearSystemConfigCache();
    const after = await getSystemConfigNumber('access_token_ttl');
    expect(after).toBe(7200);
  });

  // ── Default Fallback ───────────────────────────────────────────

  it('should return default fallback when key does not exist', async () => {
    const missing = await getInternalSystemConfigString('nonexistent_key', 'fallback-value');
    expect(missing).toBe('fallback-value');

    await getPool().query('DELETE FROM system_config WHERE key = $1', ['magic_link_ttl']);
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(900);
  });

  // ── Load OIDC TTL Config ───────────────────────────────────────

  it('should load all OIDC TTL config values from seeded data', async () => {
    const ttl = await loadOidcTtlConfig();

    // Native catalog defaults.
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
    const first = await getSystemConfigNumber('access_token_ttl');
    expect(first).toBe(3600);

    // Update DB behind the cache's back
    const pool = getPool();
    await pool.query(
      `UPDATE system_config SET value = '1800'::jsonb WHERE key = 'access_token_ttl'`,
    );

    // Without clearing cache, we'd still get the old value.
    // Clear cache to simulate invalidation.
    clearSystemConfigCache();

    const updated = await getSystemConfigNumber('access_token_ttl');
    expect(updated).toBe(1800);
  });

  it('should reject numeric text stored in JSONB without coercion', async () => {
    await getPool().query('UPDATE system_config SET value = $1::jsonb WHERE key = $2', [
      JSON.stringify('1200'),
      'magic_link_ttl',
    ]);
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(900);
  });

  it('should expire cached policy at exactly 60 seconds while PostgreSQL timers remain real', async () => {
    // Fake only Date, leaving database sockets and timeout scheduling unchanged.
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = new Date('2026-09-16T12:00:00Z').getTime();
    vi.setSystemTime(start);
    expect(await getSystemConfigNumber('access_token_ttl')).toBe(3600);
    await getPool().query('UPDATE system_config SET value = $1::jsonb WHERE key = $2', [
      JSON.stringify(1800),
      'access_token_ttl',
    ]);
    vi.setSystemTime(start + 59999);
    expect(await getSystemConfigNumber('access_token_ttl')).toBe(3600);
    vi.setSystemTime(start + 60000);
    expect(await getSystemConfigNumber('access_token_ttl')).toBe(1800);
  });
});
