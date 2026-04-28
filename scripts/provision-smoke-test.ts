/**
 * Provisioning Smoke Test
 *
 * End-to-end integration test for the provisioning import engine.
 * Connects directly to DB + Redis (no running server or auth needed)
 * and exercises all provisioning features:
 *
 *   Test 1: Simple provision (examples/provision-simple.yaml)
 *   Test 2: Enterprise provision (examples/provision-enterprise.yaml)
 *   Test 3: Full-feature provision (users, passwords, modules, branding, 2FA, assignments)
 *   Test 4: Merge idempotency (re-import same data, entities skipped)
 *   Test 5: Overwrite mode (update existing entities)
 *   Test 6: Dry-run mode (nothing created)
 *   Test 7: DB verification (SQL queries to check actual rows)
 *
 * Prerequisites:
 *   - Docker services running: yarn docker:up
 *   - .env file configured
 *
 * Usage:
 *   yarn tsx scripts/provision-smoke-test.ts
 *
 * Exit code: 0 = all passed, 1 = failures
 */

// Suppress pino logs before any module loads the logger.
process.env.LOG_LEVEL = 'fatal';

import dotenv from 'dotenv';
dotenv.config();

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

const results: TestResult[] = [];
let totalStart: number;

function log(msg: string) {
  console.log(msg);
}

function pass(name: string, detail: string, start: number) {
  const ms = Date.now() - start;
  results.push({ name, passed: true, detail, durationMs: ms });
  log(`  ✅ ${name} (${ms}ms)`);
}

function fail(name: string, detail: string, start: number) {
  const ms = Date.now() - start;
  results.push({ name, passed: false, detail, durationMs: ms });
  log(`  ❌ ${name}: ${detail} (${ms}ms)`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadYamlFile(filePath: string): unknown {
  const abs = path.resolve(import.meta.dirname ?? '.', '..', filePath);
  const content = fs.readFileSync(abs, 'utf-8');
  return parseYaml(content);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  totalStart = Date.now();
  log('\n🧪 Provisioning Smoke Test');
  log('   Testing the import engine end-to-end against a real DB\n');

  // Dynamic imports (ensures LOG_LEVEL=fatal is set first)
  const { connectDatabase, disconnectDatabase, getPool } = await import('../src/lib/database.js');
  const { connectRedis, disconnectRedis } = await import('../src/lib/redis.js');
  const { runMigrations } = await import('../src/lib/migrator.js');
  const { importData } = await import('../src/lib/data-import.js');
  const { transformToManifest, provisioningSchema } = await import('../src/cli/commands/provision.js');

  await connectDatabase();
  await connectRedis();

  const pool = getPool();

  try {
    // ------------------------------------------------------------------
    // Setup: Run migrations
    // ------------------------------------------------------------------
    log('[Setup] Running migrations...');
    await runMigrations('up');
    log('  ✅ Migrations complete\n');

    // ------------------------------------------------------------------
    // Clean slate: Remove test-specific data from previous runs
    // (We use unique slugs prefixed with 'smoke-' to avoid conflicts)
    // ------------------------------------------------------------------
    log('[Setup] Cleaning previous smoke-test data...');
    await pool.query(`DELETE FROM organizations WHERE slug LIKE 'smoke-%'`);
    await pool.query(`DELETE FROM organizations WHERE slug IN ('acme', 'enterprise')`);
    // Applications are global (no org FK) — clean those too
    await pool.query(`DELETE FROM applications WHERE slug IN ('web-portal', 'erp', 'customer-portal', 'smoke-app', 'smoke-dryapp')`);
    log('  ✅ Clean slate\n');

    // ==================================================================
    // Test 1: Simple provision (provision-simple.yaml)
    // ==================================================================
    {
      const t = Date.now();
      const name = 'Test 1: Simple provision (provision-simple.yaml)';
      log(`[${name}]`);
      try {
        const raw = loadYamlFile('examples/provision-simple.yaml');
        const parsed = provisioningSchema.parse(raw);
        const { manifest } = await transformToManifest(parsed);
        const result = await importData(manifest, 'merge');

        const createdTypes = result.created.map((e) => e.type);
        const hasOrg = createdTypes.includes('organization');
        const hasApp = createdTypes.includes('application');
        const hasClient = createdTypes.includes('client');

        if (result.errors.length > 0) {
          fail(name, `Import errors: ${JSON.stringify(result.errors)}`, t);
        } else if (!hasOrg || !hasApp || !hasClient) {
          fail(name, `Missing expected entities. Created types: ${createdTypes.join(', ')}`, t);
        } else {
          const creds = result.credentials.filter((c) => c.clientType === 'confidential' && c.secretPlaintext);
          pass(name, `Created: ${result.created.length}, Credentials: ${creds.length} confidential secrets`, t);
        }
      } catch (err) {
        fail(name, String(err), t);
      }
    }

    // ==================================================================
    // Test 2: Enterprise provision (provision-enterprise.yaml)
    // ==================================================================
    {
      const t = Date.now();
      const name = 'Test 2: Enterprise provision (provision-enterprise.yaml)';
      log(`[${name}]`);
      try {
        const raw = loadYamlFile('examples/provision-enterprise.yaml');
        const parsed = provisioningSchema.parse(raw);
        const { manifest, mappingCount, hasConfig } = await transformToManifest(parsed);
        const result = await importData(manifest, 'merge');

        if (result.errors.length > 0) {
          fail(name, `Import errors: ${JSON.stringify(result.errors)}`, t);
        } else {
          const roleCount = result.created.filter((e) => e.type === 'role').length;
          const permCount = result.created.filter((e) => e.type === 'permission').length;
          const claimCount = result.created.filter((e) => e.type === 'claim_definition').length;
          pass(
            name,
            `Created: ${result.created.length} (${roleCount} roles, ${permCount} perms, ${claimCount} claims), ` +
            `Mappings: ${mappingCount}, Config: ${hasConfig}`,
            t,
          );
        }
      } catch (err) {
        fail(name, String(err), t);
      }
    }

    // ==================================================================
    // Test 3: Full-feature provision (users, passwords, modules, branding, 2FA)
    // ==================================================================
    {
      const t = Date.now();
      const name = 'Test 3: Full-feature provision (users, modules, branding, 2FA, assignments)';
      log(`[${name}]`);
      try {
        const fullFeatureYaml = `
version: "1.0"
allow_passwords: true

organizations:
  - name: Smoke Test Corp
    slug: smoke-full
    default_locale: en
    default_login_methods:
      - password
      - magic_link
    two_factor_policy: optional
    branding:
      primary_color: "#ff6600"
      company_name: "Smoke Test Corp"
      custom_css: "body { font-family: sans-serif; }"

    applications:
      - name: Smoke App
        slug: smoke-app
        description: Smoke test application

        modules:
          - name: Dashboard Module
            slug: dashboard
            description: Main dashboard
            status: active
          - name: Reports Module
            slug: reports
            description: Reporting module
            status: active

        permissions:
          - name: Read Data
            slug: read-data
          - name: Write Data
            slug: write-data

        roles:
          - name: Admin Role
            slug: admin
            description: Full access
            permissions:
              - read-data
              - write-data
          - name: Viewer Role
            slug: viewer
            description: Read-only
            permissions:
              - read-data

        claim_definitions:
          - name: Department
            slug: department
            claim_type: string
            description: User department

        clients:
          - client_name: Smoke SPA
            client_type: public
            grant_types:
              - authorization_code
              - refresh_token
            redirect_uris:
              - http://localhost:3000/callback
            response_types:
              - code
            scope: openid profile email

          - client_name: Smoke Backend
            client_type: confidential
            grant_types:
              - authorization_code
              - client_credentials
            redirect_uris:
              - http://localhost:4000/callback
            response_types:
              - code
            scope: openid profile email
            token_endpoint_auth_method: client_secret_post
            secret:
              label: smoke-test-secret
              expires_in: 90d

    users:
      - email: alice@smoke-test.local
        given_name: Alice
        family_name: Tester
        password: "SmokeTest123!"
        email_verified: true
        status: active
        roles:
          - app: smoke-app
            role: admin
        claims:
          - app: smoke-app
            claim: department
            value: Engineering

      - email: bob@smoke-test.local
        given_name: Bob
        family_name: Viewer
        password: "SmokeTest456!"
        email_verified: true
        status: active
        roles:
          - app: smoke-app
            role: viewer
`;

        const raw = parseYaml(fullFeatureYaml);
        const parsed = provisioningSchema.parse(raw);
        const { manifest, mappingCount } = await transformToManifest(parsed);

        // Verify the manifest was built correctly before importing
        const manifestChecks = [
          manifest.organizations.length === 1,
          manifest.applications.length === 1,
          manifest.clients.length === 2,
          manifest.roles.length === 2,
          manifest.permissions.length === 2,
          manifest.claim_definitions.length === 1,
          (manifest.users?.length ?? 0) === 2,
          (manifest.application_modules?.length ?? 0) === 2,
          (manifest.user_role_assignments?.length ?? 0) === 2,
          (manifest.user_claim_values?.length ?? 0) === 1,
          mappingCount === 2,
        ];

        if (!manifestChecks.every(Boolean)) {
          fail(name, `Manifest shape incorrect: orgs=${manifest.organizations.length}, apps=${manifest.applications.length}, clients=${manifest.clients.length}, users=${manifest.users?.length}, modules=${manifest.application_modules?.length}, role_assignments=${manifest.user_role_assignments?.length}, claim_values=${manifest.user_claim_values?.length}`, t);
        } else {
          // Check password hashing happened (should be Argon2id hash, not plaintext)
          const aliceUser = manifest.users!.find((u) => u.email === 'alice@smoke-test.local');
          if (!aliceUser?.password_hash || !aliceUser.password_hash.startsWith('$argon2id$')) {
            fail(name, `Password not hashed correctly: ${aliceUser?.password_hash?.substring(0, 20)}...`, t);
          } else {
            // Now import
            const result = await importData(manifest, 'merge');

            if (result.errors.length > 0) {
              fail(name, `Import errors: ${JSON.stringify(result.errors)}`, t);
            } else {
              const userCount = result.created.filter((e) => e.type === 'user').length;
              const modCount = result.created.filter((e) => e.type === 'application_module').length;
              const creds = result.credentials.filter((c) => c.secretPlaintext);
              pass(
                name,
                `Created: ${result.created.length} entities, ${userCount} users, ${modCount} modules, ` +
                `${creds.length} secrets, passwords hashed with Argon2id`,
                t,
              );
            }
          }
        }
      } catch (err) {
        fail(name, String(err), t);
      }
    }

    // ==================================================================
    // Test 4: Merge idempotency (re-import, entities should be skipped)
    // ==================================================================
    {
      const t = Date.now();
      const name = 'Test 4: Merge idempotency (re-run simple.yaml)';
      log(`[${name}]`);
      try {
        const raw = loadYamlFile('examples/provision-simple.yaml');
        const parsed = provisioningSchema.parse(raw);
        const { manifest } = await transformToManifest(parsed);
        const result = await importData(manifest, 'merge');

        if (result.errors.length > 0) {
          fail(name, `Import errors: ${JSON.stringify(result.errors)}`, t);
        } else if (result.skipped.length === 0) {
          fail(name, 'Expected entities to be skipped, got 0', t);
        } else {
          // Role-permission mappings use ON CONFLICT DO NOTHING and always report as 'created'
          // even on re-run — this is expected behavior (idempotent INSERT, not a real creation)
          const nonMappingCreated = result.created.filter((e) => e.type !== 'role_permission_mapping');
          if (nonMappingCreated.length > 0) {
            fail(name, `Unexpected non-mapping created: ${nonMappingCreated.map((e) => `${e.type}:${e.slug}`).join(', ')}`, t);
          } else {
            pass(name, `Skipped: ${result.skipped.length}, Mapping re-inserts: ${result.created.length} (idempotent ✓)`, t);
          }
        }
      } catch (err) {
        fail(name, String(err), t);
      }
    }

    // ==================================================================
    // Test 5: Overwrite mode (update existing)
    // ==================================================================
    {
      const t = Date.now();
      const name = 'Test 5: Overwrite mode (re-run simple.yaml)';
      log(`[${name}]`);
      try {
        const raw = loadYamlFile('examples/provision-simple.yaml');
        const parsed = provisioningSchema.parse(raw);
        const { manifest } = await transformToManifest(parsed);
        const result = await importData(manifest, 'overwrite');

        if (result.errors.length > 0) {
          fail(name, `Import errors: ${JSON.stringify(result.errors)}`, t);
        } else if (result.updated.length === 0) {
          fail(name, `Expected entities to be updated in overwrite mode, got 0 updates. Created: ${result.created.length}, Skipped: ${result.skipped.length}`, t);
        } else {
          pass(name, `Updated: ${result.updated.length}, Created: ${result.created.length}`, t);
        }
      } catch (err) {
        fail(name, String(err), t);
      }
    }

    // ==================================================================
    // Test 6: Dry-run mode (nothing should be created)
    // ==================================================================
    {
      const t = Date.now();
      const name = 'Test 6: Dry-run mode';
      log(`[${name}]`);
      try {
        // Use a new org slug so we can verify nothing was created
        const dryRunYaml = `
version: "1.0"
organizations:
  - name: Dry Run Corp
    slug: smoke-dryrun
    applications:
      - name: Dry App
        slug: smoke-dryapp
`;
        const raw = parseYaml(dryRunYaml);
        const parsed = provisioningSchema.parse(raw);
        const { manifest } = await transformToManifest(parsed);
        const result = await importData(manifest, 'dry-run');

        // Verify the org was NOT actually created in the DB
        const { rows } = await pool.query(
          `SELECT id FROM organizations WHERE slug = 'smoke-dryrun'`,
        );

        if (rows.length > 0) {
          fail(name, 'Dry-run created entities in the database!', t);
        } else {
          pass(name, `Dry-run result — would create: ${result.created.length}, DB rows: 0 (correct)`, t);
        }
      } catch (err) {
        fail(name, String(err), t);
      }
    }

    // ==================================================================
    // Test 7: DB verification — check actual rows from Test 1-3
    // ==================================================================
    {
      const t = Date.now();
      const name = 'Test 7: DB verification (SQL queries)';
      log(`[${name}]`);
      try {
        const checks: string[] = [];
        let allGood = true;

        // Check orgs exist
        const { rows: orgs } = await pool.query(
          `SELECT slug FROM organizations WHERE slug IN ('acme', 'enterprise', 'smoke-full') ORDER BY slug`,
        );
        checks.push(`Orgs(${orgs.length}): ${orgs.map((r: { slug: string }) => r.slug).join(', ')}`);
        if (orgs.length < 3) allGood = false;

        // Check smoke-full org has branding (columns are branding_primary_color, branding_company_name)
        const { rows: brandingRows } = await pool.query(
          `SELECT branding_primary_color, branding_company_name FROM organizations WHERE slug = 'smoke-full'`,
        );
        const branding = brandingRows[0];
        const brandingOk = branding?.branding_primary_color === '#ff6600' && branding?.branding_company_name === 'Smoke Test Corp';
        checks.push(`Branding: ${brandingOk ? '✓' : `primary_color=${branding?.branding_primary_color}, company_name=${branding?.branding_company_name}`}`);
        if (!brandingOk) allGood = false;

        // Check apps exist
        const { rows: apps } = await pool.query(
          `SELECT slug FROM applications WHERE slug IN ('web-portal', 'erp', 'customer-portal', 'smoke-app') ORDER BY slug`,
        );
        checks.push(`Apps(${apps.length}): ${apps.map((r: { slug: string }) => r.slug).join(', ')}`);
        if (apps.length < 3) allGood = false;

        // Check clients exist
        const { rows: clients } = await pool.query(
          `SELECT client_name, client_type FROM clients WHERE client_name LIKE 'Smoke%' OR client_name LIKE 'Web Portal%' ORDER BY client_name`,
        );
        checks.push(`Clients: ${clients.length}`);
        if (clients.length < 2) allGood = false;

        // Check users from Test 3
        const { rows: users } = await pool.query(
          `SELECT email, status FROM users WHERE email LIKE '%@smoke-test.local' ORDER BY email`,
        );
        checks.push(`Users(${users.length}): ${users.map((r: { email: string; status: string }) => `${r.email}(${r.status})`).join(', ')}`);
        if (users.length < 2) allGood = false;

        // Check roles
        const { rows: roles } = await pool.query(
          `SELECT r.slug FROM roles r
           JOIN applications a ON r.application_id = a.id
           WHERE a.slug = 'smoke-app' ORDER BY r.slug`,
        );
        checks.push(`Roles(${roles.length}): ${roles.map((r: { slug: string }) => r.slug).join(', ')}`);
        if (roles.length < 2) allGood = false;

        // Check application modules from Test 3
        const { rows: modules } = await pool.query(
          `SELECT am.slug FROM application_modules am
           JOIN applications a ON am.application_id = a.id
           WHERE a.slug = 'smoke-app' ORDER BY am.slug`,
        );
        checks.push(`Modules(${modules.length}): ${modules.map((r: { slug: string }) => r.slug).join(', ')}`);
        if (modules.length < 2) allGood = false;

        // Check user-role assignments from Test 3
        const { rows: roleAssignments } = await pool.query(
          `SELECT u.email, r.slug as role_slug
           FROM user_roles ur
           JOIN users u ON ur.user_id = u.id
           JOIN roles r ON ur.role_id = r.id
           WHERE u.email LIKE '%@smoke-test.local' ORDER BY u.email`,
        );
        checks.push(`Assignments(${roleAssignments.length}): ${roleAssignments.map((r: { email: string; role_slug: string }) => `${r.email}→${r.role_slug}`).join(', ')}`);
        if (roleAssignments.length < 2) allGood = false;

        if (allGood) {
          pass(name, checks.join('; '), t);
        } else {
          fail(name, checks.join('; '), t);
        }
      } catch (err) {
        fail(name, String(err), t);
      }
    }

  } finally {
    // ------------------------------------------------------------------
    // Cleanup: Remove smoke-test data
    // ------------------------------------------------------------------
    log('\n[Cleanup] Removing smoke-test data...');
    try {
      await pool.query(`DELETE FROM organizations WHERE slug LIKE 'smoke-%'`);
      await pool.query(`DELETE FROM organizations WHERE slug IN ('acme', 'enterprise')`);
      log('  ✅ Cleaned up\n');
    } catch {
      log('  ⚠️  Cleanup failed (non-critical)\n');
    }

    await disconnectRedis();
    await disconnectDatabase();
  }

  // Print summary
  const totalMs = Date.now() - totalStart;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  log('═'.repeat(72));
  log(`\n📊 Results: ${passed} passed, ${failed} failed (${totalMs}ms)\n`);

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    log(`  ${icon} ${r.name}`);
    log(`     ${r.detail}`);
  }

  log('');

  if (failed > 0) {
    log('❌ Some tests failed!\n');
    process.exit(1);
  } else {
    log('✅ All provisioning smoke tests passed!\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
