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

import { setTimeout as delay } from 'node:timers/promises';
import { getPool } from '../../../src/lib/database.js';
import { SYSTEM_CONFIG_CATALOG } from '../../../src/lib/system-config-catalog.js';

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

/** PostgreSQL SQLSTATE for a detected deadlock. */
const POSTGRES_DEADLOCK = '40P01';

/** Bounded attempts for a truncate that races live test-server work. */
const TRUNCATE_ATTEMPTS = 4;

/**
 * Detect a PostgreSQL deadlock without assuming an error implementation type.
 *
 * @param error - Value thrown by the database client.
 * @returns True only when the value carries the PostgreSQL deadlock code.
 */
function isDeadlock(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === POSTGRES_DEADLOCK
  );
}

/**
 * Truncate all application tables in a single statement.
 *
 * Uses TRUNCATE ... CASCADE to handle foreign key constraints
 * automatically. Tables are listed explicitly (not dynamically
 * queried) to avoid accidentally truncating pgmigrations or
 * other infrastructure tables.
 *
 * Called in beforeEach() to ensure complete isolation between tests.
 *
 * The live test server runs a recovery worker and may still settle a
 * transaction while the next test starts. PostgreSQL can then report a
 * lock-order deadlock even though both statements are valid. Retrying the
 * complete TRUNCATE after a short bounded delay is safe and keeps that test
 * lifecycle race from being reported as a product failure.
 */
export async function truncateAllTables(): Promise<void> {
  const pool = getPool();

  for (let attempt = 1; attempt <= TRUNCATE_ATTEMPTS; attempt += 1) {
    try {
      // Truncate all application tables in one statement.
      // CASCADE handles FK dependencies automatically.
      // Order doesn't matter with CASCADE, but we list leaf tables first
      // for documentation clarity.
      await pool.query(`
        TRUNCATE TABLE
          audit_log,
          two_factor_recovery_codes, two_factor_otp_codes, user_totp,
          custom_claim_values, custom_claim_definitions,
          user_roles, role_permissions, permissions, roles,
          magic_link_tokens, password_reset_tokens, invitation_tokens,
          client_secrets, clients,
          users,
          resource_server_scopes, resource_server_namespace, resource_servers,
          application_modules, applications,
          organizations,
          oidc_payloads, signing_keys, system_config
        CASCADE
      `);
      return;
    } catch (error) {
      if (!isDeadlock(error) || attempt === TRUNCATE_ATTEMPTS) throw error;
      await delay(attempt * 50);
    }
  }
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

  // Keep runtime fixtures aligned with the immutable catalog, using native JSONB scalars.
  for (const definition of SYSTEM_CONFIG_CATALOG) {
    const storedType =
      definition.unit === 'seconds'
        ? 'duration'
        : definition.valueType === 'integer'
          ? 'number'
          : 'string';
    await pool.query(
      `INSERT INTO system_config (key, value, value_type, description, is_sensitive)
       VALUES ($1, $2::jsonb, $3, $4, FALSE)`,
      [definition.key, JSON.stringify(definition.defaultValue), storedType, definition.description],
    );
  }
}
