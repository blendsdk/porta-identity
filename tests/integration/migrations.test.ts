import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const { Pool } = pg;

/**
 * Integration tests for database schema verification.
 *
 * These tests require a running PostgreSQL instance with migrations applied.
 * They verify table existence, column types, constraints, triggers, and seed data.
 *
 * Run with: yarn test:integration (requires yarn docker:up && yarn migrate)
 */

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://porta:porta_dev@localhost:5432/porta';

let pool: pg.Pool;
let dbAvailable = false;

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch {
    console.warn(
      'Skipping integration tests — PostgreSQL not available at',
      DATABASE_URL
    );
  }
});

afterAll(async () => {
  if (pool) await pool.end();
});

/** Helper: skip test if DB is not available */
function requireDb() {
  if (!dbAvailable) {
    return false;
  }
  return true;
}

/** Query information_schema for table existence */
async function tableExists(tableName: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

/** Query column info for a table */
async function getColumns(
  tableName: string
): Promise<{ column_name: string; data_type: string; is_nullable: string }[]> {
  const result = await pool.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  return result.rows;
}

// ── Schema Structure ─────────────────────────────────────────────

describe('Schema Structure', () => {
  const expectedTables = [
    'organizations',
    'applications',
    'application_modules',
    'clients',
    'client_secrets',
    'users',
    'magic_link_tokens',
    'password_reset_tokens',
    'invitation_tokens',
    'roles',
    'permissions',
    'role_permissions',
    'user_roles',
    'custom_claim_definitions',
    'custom_claim_values',
    'system_config',
    'signing_keys',
    'audit_log',
    'oidc_payloads',
  ];

  it.each(expectedTables)('table "%s" exists', async (table) => {
    if (!requireDb()) return;
    expect(await tableExists(table)).toBe(true);
  });

  it('organizations table has expected columns', async () => {
    if (!requireDb()) return;
    const columns = await getColumns('organizations');
    const names = columns.map((c) => c.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'slug',
        'status',
        'is_super_admin',
        'branding_logo_url',
        'branding_primary_color',
        'default_locale',
        'created_at',
        'updated_at',
      ])
    );
  });

  it('users table has OIDC Standard Claims columns', async () => {
    if (!requireDb()) return;
    const columns = await getColumns('users');
    const names = columns.map((c) => c.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'email',
        'given_name',
        'family_name',
        'nickname',
        'preferred_username',
        'picture_url',
        'zoneinfo',
        'locale',
        'phone_number',
        'address_street',
        'address_country',
      ])
    );
  });

  it('oidc_payloads has composite primary key (id, type)', async () => {
    if (!requireDb()) return;
    const result = await pool.query(
      `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = 'oidc_payloads'::regclass AND i.indisprimary
       ORDER BY array_position(i.indkey, a.attnum)`
    );
    const pkColumns = result.rows.map((r: { attname: string }) => r.attname);
    expect(pkColumns).toEqual(['id', 'type']);
  });
});

// ── Constraints ──────────────────────────────────────────────────

describe('Constraints', () => {
  it('rejects duplicate organization slugs', async () => {
    if (!requireDb()) return;
    await pool.query(
      `INSERT INTO organizations (name, slug) VALUES ('Dup Test 1', 'dup-slug-test')`
    );
    await expect(
      pool.query(
        `INSERT INTO organizations (name, slug) VALUES ('Dup Test 2', 'dup-slug-test')`
      )
    ).rejects.toThrow(/duplicate key|unique/i);
    // Cleanup
    await pool.query(`DELETE FROM organizations WHERE slug = 'dup-slug-test'`);
  });

  it('rejects invalid organization status', async () => {
    if (!requireDb()) return;
    await expect(
      pool.query(
        `INSERT INTO organizations (name, slug, status) VALUES ('Bad Status', 'bad-status', 'invalid')`
      )
    ).rejects.toThrow(/violates check constraint/i);
  });

  it('enforces only one super-admin organization (partial unique index)', async () => {
    if (!requireDb()) return;
    // Seed already created one super-admin — inserting another should fail
    await expect(
      pool.query(
        `INSERT INTO organizations (name, slug, is_super_admin) VALUES ('Second Admin', 'second-admin', TRUE)`
      )
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('enforces case-insensitive email uniqueness per org (CITEXT)', async () => {
    if (!requireDb()) return;
    // Get the super-admin org ID for FK
    const orgResult = await pool.query(
      `SELECT id FROM organizations WHERE slug = 'porta-admin'`
    );
    const orgId = orgResult.rows[0].id;

    await pool.query(
      `INSERT INTO users (organization_id, email, status) VALUES ($1, 'CaseTest@Example.com', 'active')`,
      [orgId]
    );
    await expect(
      pool.query(
        `INSERT INTO users (organization_id, email, status) VALUES ($1, 'casetest@example.com', 'active')`,
        [orgId]
      )
    ).rejects.toThrow(/duplicate key|unique/i);
    // Cleanup
    await pool.query(
      `DELETE FROM users WHERE organization_id = $1 AND email = 'CaseTest@Example.com'`,
      [orgId]
    );
  });

  it('enforces FK: clients.organization_id references organizations', async () => {
    if (!requireDb()) return;
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    await expect(
      pool.query(
        `INSERT INTO clients (organization_id, application_id, client_id, client_name, client_type)
         VALUES ($1, $1, 'fk-test-client', 'FK Test', 'public')`,
        [fakeUuid]
      )
    ).rejects.toThrow(/violates foreign key/i);
  });
});

// ── Cascade & SET NULL Behavior ──────────────────────────────────

describe('Cascade Behavior', () => {
  it('ON DELETE CASCADE: deleting org removes its users', async () => {
    if (!requireDb()) return;

    // Create test org and user
    const orgResult = await pool.query(
      `INSERT INTO organizations (name, slug) VALUES ('Cascade Test Org', 'cascade-test-org') RETURNING id`
    );
    const orgId = orgResult.rows[0].id;
    await pool.query(
      `INSERT INTO users (organization_id, email, status) VALUES ($1, 'cascade@test.com', 'active')`,
      [orgId]
    );

    // Verify user exists
    const before = await pool.query(
      `SELECT count(*) FROM users WHERE organization_id = $1`,
      [orgId]
    );
    expect(parseInt(before.rows[0].count, 10)).toBe(1);

    // Delete org — should cascade to users
    await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);

    const after = await pool.query(
      `SELECT count(*) FROM users WHERE organization_id = $1`,
      [orgId]
    );
    expect(parseInt(after.rows[0].count, 10)).toBe(0);
  });

  it('ON DELETE SET NULL: deleting user preserves audit log entries', async () => {
    if (!requireDb()) return;

    // Create test org and user
    const orgResult = await pool.query(
      `INSERT INTO organizations (name, slug) VALUES ('Audit Test Org', 'audit-test-org') RETURNING id`
    );
    const orgId = orgResult.rows[0].id;
    const userResult = await pool.query(
      `INSERT INTO users (organization_id, email, status) VALUES ($1, 'audit@test.com', 'active') RETURNING id`,
      [orgId]
    );
    const userId = userResult.rows[0].id;

    // Create audit log entry referencing the user
    await pool.query(
      `INSERT INTO audit_log (organization_id, user_id, event_type, event_category)
       VALUES ($1, $2, 'test.event', 'test')`,
      [orgId, userId]
    );

    // Delete user — audit log user_id should become NULL
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

    const audit = await pool.query(
      `SELECT user_id FROM audit_log WHERE organization_id = $1 AND event_type = 'test.event'`,
      [orgId]
    );
    expect(audit.rows[0].user_id).toBeNull();

    // Cleanup
    await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
  });
});

// ── Triggers ─────────────────────────────────────────────────────

describe('Triggers', () => {
  it('updated_at trigger auto-updates on row modification', async () => {
    if (!requireDb()) return;

    const orgResult = await pool.query(
      `INSERT INTO organizations (name, slug) VALUES ('Trigger Test', 'trigger-test') RETURNING id, updated_at`
    );
    const orgId = orgResult.rows[0].id;
    const originalUpdatedAt = orgResult.rows[0].updated_at;

    // Wait a moment and update
    await new Promise((resolve) => setTimeout(resolve, 50));
    await pool.query(`UPDATE organizations SET name = 'Trigger Test Updated' WHERE id = $1`, [
      orgId,
    ]);

    const updated = await pool.query(`SELECT updated_at FROM organizations WHERE id = $1`, [
      orgId,
    ]);
    expect(new Date(updated.rows[0].updated_at).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime()
    );

    // Cleanup
    await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
  });
});

// ── Seed Data ────────────────────────────────────────────────────

describe('Seed Data', () => {
  it('super-admin organization exists with correct values', async () => {
    if (!requireDb()) return;
    const result = await pool.query(
      `SELECT name, slug, status, is_super_admin, branding_company_name
       FROM organizations WHERE slug = 'porta-admin'`
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]).toMatchObject({
      name: 'Porta Admin',
      slug: 'porta-admin',
      status: 'active',
      is_super_admin: true,
      branding_company_name: 'Porta',
    });
  });

  it('system config defaults are present', async () => {
    if (!requireDb()) return;
    const result = await pool.query(`SELECT key, value_type FROM system_config ORDER BY key`);
    const keys = result.rows.map((r: { key: string }) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'access_token_ttl',
        'id_token_ttl',
        'refresh_token_ttl',
        'authorization_code_ttl',
        'session_ttl',
        'cookie_secure',
        'magic_link_ttl',
        'password_reset_ttl',
        'invitation_ttl',
        'login_rate_limit',
        'api_rate_limit',
        'max_failed_logins',
        'lockout_duration',
        'require_pkce',
        'cors_max_age',
      ])
    );
  });

  it('all config values have correct value_type', async () => {
    if (!requireDb()) return;
    const result = await pool.query(`SELECT key, value_type FROM system_config`);
    const validTypes = ['string', 'number', 'boolean', 'duration', 'json'];
    for (const row of result.rows) {
      expect(validTypes).toContain(row.value_type);
    }
  });
});
