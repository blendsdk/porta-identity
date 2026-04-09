/**
 * Database helper functions for integration tests.
 *
 * Provides table truncation and base data seeding utilities
 * used in beforeEach() hooks to ensure test isolation.
 *
 * Every integration test suite should call truncateAllTables()
 * before each test to start with a clean slate, then optionally
 * call seedBaseData() to restore the seed data that many modules
 * depend on (super-admin org, system_config defaults).
 */

import { getPool } from '../../../src/lib/database.js';

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

/**
 * Truncate all application tables in a single statement.
 *
 * Uses TRUNCATE ... CASCADE to handle foreign key constraints
 * automatically. Tables are listed explicitly (not dynamically
 * queried) to avoid accidentally truncating pgmigrations or
 * other infrastructure tables.
 *
 * Called in beforeEach() to ensure complete isolation between tests.
 */
export async function truncateAllTables(): Promise<void> {
  const pool = getPool();

  // Truncate all application tables in one statement.
  // CASCADE handles FK dependencies automatically.
  // Order doesn't matter with CASCADE, but we list leaf tables first
  // for documentation clarity.
  await pool.query(`
    TRUNCATE TABLE
      audit_log,
      custom_claim_values, custom_claim_definitions,
      user_roles, role_permissions, permissions, roles,
      magic_link_tokens, password_reset_tokens, invitation_tokens,
      client_secrets, clients,
      users,
      application_modules, applications,
      organizations,
      oidc_payloads, signing_keys, system_config
    CASCADE
  `);
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

/**
 * Re-insert the minimum seed data that many modules depend on.
 *
 * This mirrors the content of migration 011_seed.sql:
 * 1. Super-admin organization (porta-admin) — required by middleware,
 *    some route tests, and findSuperAdminOrganization()
 * 2. System config defaults — required by system-config service,
 *    OIDC TTL loading, rate limiter, etc.
 *
 * Call this after truncateAllTables() when your tests need the
 * standard seed data. Skip it if your tests create all data from scratch.
 */
export async function seedBaseData(): Promise<void> {
  const pool = getPool();

  // Super-admin organization (matches migration 011_seed.sql)
  await pool.query(`
    INSERT INTO organizations (name, slug, status, is_super_admin, branding_company_name, default_locale)
    VALUES ('Porta Admin', 'porta-admin', 'active', TRUE, 'Porta', 'en')
  `);

  // System config defaults (matches migration 011_seed.sql)
  await pool.query(`
    INSERT INTO system_config (key, value, value_type, description, is_sensitive) VALUES
      ('access_token_ttl',       '"3600"',    'duration', 'Access token TTL in seconds',             FALSE),
      ('id_token_ttl',           '"3600"',    'duration', 'ID token TTL in seconds',                 FALSE),
      ('refresh_token_ttl',      '"2592000"', 'duration', 'Refresh token TTL in seconds',            FALSE),
      ('authorization_code_ttl', '"600"',     'duration', 'Authorization code TTL in seconds',       FALSE),
      ('session_ttl',            '"86400"',   'duration', 'Session TTL in seconds',                  FALSE),
      ('cookie_secure',          'true',      'boolean',  'Require HTTPS for cookies',               FALSE),
      ('magic_link_ttl',         '"900"',     'duration', 'Magic link token TTL in seconds',         FALSE),
      ('magic_link_length',      '48',        'number',   'Magic link token length in bytes',        FALSE),
      ('password_reset_ttl',     '"3600"',    'duration', 'Password reset token TTL in seconds',     FALSE),
      ('invitation_ttl',         '"604800"',  'duration', 'Invitation token TTL in seconds',         FALSE),
      ('login_rate_limit',       '10',        'number',   'Max login attempts per 15 min',           FALSE),
      ('api_rate_limit',         '100',       'number',   'Max API requests per client per min',     FALSE),
      ('max_failed_logins',      '5',         'number',   'Max failed logins before lockout',        FALSE),
      ('lockout_duration',       '"900"',     'duration', 'Account lockout duration in seconds',     FALSE),
      ('require_pkce',           'true',      'boolean',  'Require PKCE for auth code flows',        FALSE),
      ('cors_max_age',           '86400',     'number',   'CORS preflight cache duration in seconds', FALSE)
  `);
}
