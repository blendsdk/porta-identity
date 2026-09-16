/** Verifies real upgrade behavior over pre-existing policy values in an isolated PostgreSQL schema. */
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';

/** Native defaults are independent of the runtime catalog so SQL/catalog drift remains observable. */
const EXPECTED_DEFAULTS: ReadonlyArray<readonly [string, number | string]> = [
  ['access_token_ttl', 3600],
  ['id_token_ttl', 3600],
  ['refresh_token_ttl', 2592000],
  ['authorization_code_ttl', 600],
  ['session_ttl', 86400],
  ['magic_link_ttl', 900],
  ['password_reset_ttl', 3600],
  ['invitation_ttl', 604800],
  ['rate_limit_login_max', 10],
  ['rate_limit_login_window', 900],
  ['rate_limit_magic_link_max', 5],
  ['rate_limit_magic_link_window', 900],
  ['rate_limit_password_reset_max', 5],
  ['rate_limit_password_reset_window', 900],
  ['max_failed_logins', 5],
  ['lockout_duration_seconds', 900],
  ['audit_retention_days', 90],
  ['default_locale', 'en'],
];

/** Only these retired public keys are deleted; unknown internal rows remain untouched. */
const OBSOLETE_KEYS = [
  'login_rate_limit',
  'lockout_duration',
  'api_rate_limit',
  'cookie_secure',
  'magic_link_length',
  'require_pkce',
  'cors_max_age',
];

describe('global configuration migration native storage', () => {
  // Custom and incorrectly typed earlier values are intentionally replaced, not converted or retained.
  it('should reset every canonical value, delete exactly obsolete public keys and preserve internal rows', async () => {
    const sql = await readFile(
      new URL('../../../migrations/030_global_configuration_catalog.sql', import.meta.url),
      'utf8',
    );
    const up = sql.split('-- Down Migration')[0];
    if (up === undefined) throw new Error('Up migration is missing');
    const connection = await getPool().connect();
    const schema = `global_config_${randomBytes(8).toString('hex')}`;
    try {
      await connection.query('BEGIN');
      await connection.query(`CREATE SCHEMA ${schema}`);
      await connection.query(`SET LOCAL search_path TO ${schema}, public`);
      await connection.query(`
        CREATE TABLE system_config (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          key VARCHAR(255) NOT NULL UNIQUE,
          value JSONB NOT NULL,
          value_type VARCHAR(20) NOT NULL DEFAULT 'string'
            CHECK (value_type IN ('string','number','boolean','duration','json')),
          description TEXT,
          is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      for (const [index, [key, defaultValue]] of EXPECTED_DEFAULTS.entries()) {
        const priorValue =
          typeof defaultValue === 'string'
            ? 'nl'
            : index % 2 === 0
              ? String(defaultValue)
              : defaultValue + 1;
        await connection.query('INSERT INTO system_config (key,value) VALUES ($1,$2::jsonb)', [
          key,
          JSON.stringify(priorValue),
        ]);
      }
      for (const key of OBSOLETE_KEYS) {
        await connection.query('INSERT INTO system_config (key,value) VALUES ($1,$2::jsonb)', [
          key,
          'true',
        ]);
      }
      await connection.query(`INSERT INTO system_config (key,value,is_sensitive)
        VALUES ('super_admin_user_id','"internal-user"'::jsonb,true),
               ('internal_fixture','{"preserved":true}'::jsonb,true)`);

      await connection.query(up);
      const result = await connection.query<{
        key: string;
        value: unknown;
        value_type: string;
        is_sensitive: boolean;
      }>('SELECT key,value,value_type,is_sensitive FROM system_config ORDER BY key');
      expect(result.rows).toHaveLength(20);
      for (const [key, defaultValue] of EXPECTED_DEFAULTS) {
        const row = result.rows.find((entry) => entry.key === key);
        expect(row, key).toBeDefined();
        expect(row?.value, key).toEqual(defaultValue);
        expect(typeof row?.value, key).toBe(typeof defaultValue);
        expect(row?.is_sensitive, key).toBe(false);
        if (typeof defaultValue === 'number')
          expect(['number', 'duration']).toContain(row?.value_type);
        else expect(row?.value_type).toBe('string');
      }
      for (const key of OBSOLETE_KEYS)
        expect(result.rows.some((row) => row.key === key)).toBe(false);
      expect(result.rows.find((row) => row.key === 'super_admin_user_id')).toMatchObject({
        value: 'internal-user',
        is_sensitive: true,
      });
      expect(result.rows.find((row) => row.key === 'internal_fixture')).toMatchObject({
        value: { preserved: true },
        is_sensitive: true,
      });
    } finally {
      await connection.query('ROLLBACK');
      connection.release();
    }
  });
});
