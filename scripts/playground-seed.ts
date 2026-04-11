/**
 * Playground Seed Script
 *
 * Seeds a local Porta instance with comprehensive test data for the
 * interactive OIDC playground application. Creates 5 organizations with
 * different 2FA policies, 8 test users, RBAC roles/permissions, custom
 * claims, and public+confidential OIDC clients.
 *
 * Outputs:
 *   - playground/config.generated.js — consumed by the playground SPA
 *   - Console summary table with all credentials and IDs
 *
 * Idempotent: safe to re-run. Existing resources are reused via find-or-create.
 *
 * Prerequisites:
 *   - Docker services running (yarn docker:up)
 *   - .env file configured
 *
 * Usage:
 *   yarn tsx scripts/playground-seed.ts
 */

// Suppress pino logs BEFORE any module loads the logger.
// 'fatal' is the quietest valid level (config schema doesn't allow 'silent').
process.env.LOG_LEVEL = 'fatal';

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as OTPAuth from 'otpauth';

// ---------------------------------------------------------------------------
// Type definitions for seed data
// ---------------------------------------------------------------------------

/** Organization definition — drives org creation and 2FA policy. */
interface OrgDef {
  key: string;
  name: string;
  slug: string;
  /** Maps to TwoFactorPolicy. Default DB value is 'optional'. */
  twoFactorPolicy: 'optional' | 'required_email' | 'required_totp';
}

/** User definition — drives user creation, 2FA enrollment, and assignments. */
interface UserDef {
  orgKey: string;
  email: string;
  givenName: string;
  familyName: string;
  password: string;
  targetStatus: 'active' | 'inactive' | 'suspended';
  /** Which 2FA method to enroll during seed (skip = don't enroll). */
  twoFactorSetup: 'email' | 'totp' | 'skip';
  /** Role slugs to assign (created in Phase C). */
  assignRoles?: string[];
  /** Custom claim values keyed by claim name. */
  claims?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Seed data constants
// ---------------------------------------------------------------------------

/**
 * Five organizations covering all 2FA policy scenarios.
 * 'optional' = no 2FA required (users may enable if they want).
 */
const ORGS: OrgDef[] = [
  { key: 'no2fa', name: 'No 2FA Org', slug: 'playground-no2fa', twoFactorPolicy: 'optional' },
  { key: 'email2fa', name: 'Email 2FA Org', slug: 'playground-email2fa', twoFactorPolicy: 'required_email' },
  { key: 'totp2fa', name: 'TOTP 2FA Org', slug: 'playground-totp2fa', twoFactorPolicy: 'required_totp' },
  { key: 'optional2fa', name: 'Optional 2FA Org', slug: 'playground-optional2fa', twoFactorPolicy: 'optional' },
  { key: 'thirdparty', name: 'Third-Party Org', slug: 'playground-thirdparty', twoFactorPolicy: 'optional' },
];

/** Shared password for all playground users — easy to remember for testing. */
const SHARED_PASSWORD = 'Playground123!';

/**
 * Eight test users spanning all login flow scenarios.
 * Each user belongs to one org and may have 2FA enrollment + role/claim assignments.
 */
const USERS: UserDef[] = [
  // No 2FA org — 3 users with different statuses
  {
    orgKey: 'no2fa', email: 'user@no2fa.local', givenName: 'Active', familyName: 'User',
    password: SHARED_PASSWORD, targetStatus: 'active', twoFactorSetup: 'skip',
    assignRoles: ['admin'], claims: { department: 'Engineering', employee_id: 'EMP-001' },
  },
  {
    orgKey: 'no2fa', email: 'inactive@no2fa.local', givenName: 'Inactive', familyName: 'User',
    password: SHARED_PASSWORD, targetStatus: 'inactive', twoFactorSetup: 'skip',
  },
  {
    orgKey: 'no2fa', email: 'suspended@no2fa.local', givenName: 'Suspended', familyName: 'User',
    password: SHARED_PASSWORD, targetStatus: 'suspended', twoFactorSetup: 'skip',
  },

  // Email 2FA org — 1 user enrolled in email OTP
  {
    orgKey: 'email2fa', email: 'user@email2fa.local', givenName: 'Email', familyName: 'OTP User',
    password: SHARED_PASSWORD, targetStatus: 'active', twoFactorSetup: 'email',
    assignRoles: ['viewer'],
  },

  // TOTP 2FA org — 1 enrolled user + 1 fresh user (triggers setup flow)
  {
    orgKey: 'totp2fa', email: 'user@totp2fa.local', givenName: 'TOTP', familyName: 'User',
    password: SHARED_PASSWORD, targetStatus: 'active', twoFactorSetup: 'totp',
    assignRoles: ['admin'],
  },
  {
    orgKey: 'totp2fa', email: 'fresh@totp2fa.local', givenName: 'Fresh', familyName: 'User',
    password: SHARED_PASSWORD, targetStatus: 'active', twoFactorSetup: 'skip',
  },

  // Optional 2FA org — 1 user without 2FA (can optionally enroll at login)
  {
    orgKey: 'optional2fa', email: 'user@optional2fa.local', givenName: 'Optional', familyName: 'User',
    password: SHARED_PASSWORD, targetStatus: 'active', twoFactorSetup: 'skip',
  },

  // Third-party org — 1 user for consent-required scenario
  {
    orgKey: 'thirdparty', email: 'user@thirdparty.local', givenName: 'ThirdParty', familyName: 'User',
    password: SHARED_PASSWORD, targetStatus: 'active', twoFactorSetup: 'skip',
  },
];

/** RBAC role definitions for the shared Playground application. */
const ROLE_DEFS = [
  { slug: 'admin', name: 'Admin', description: 'Full admin access', permissions: ['manage:users', 'manage:settings'] },
  { slug: 'viewer', name: 'Viewer', description: 'Read-only access', permissions: ['read:data'] },
];

/** RBAC permission definitions — the union of all role permissions. */
const PERMISSION_DEFS = [
  { slug: 'manage:users', name: 'Manage Users', description: 'Create, update, delete users' },
  { slug: 'manage:settings', name: 'Manage Settings', description: 'Modify application settings' },
  { slug: 'read:data', name: 'Read Data', description: 'View application data' },
];

/** Custom claim definitions for the shared application. */
const CLAIM_DEFS = [
  { claimName: 'department', claimType: 'string' as const, description: 'Department name' },
  { claimName: 'employee_id', claimType: 'string' as const, description: 'Employee identifier' },
];

// ---------------------------------------------------------------------------
// Collector for TOTP secrets — logged in summary
// ---------------------------------------------------------------------------

/** Stores TOTP setup info for the summary output. */
const totpSecrets: Array<{ email: string; secret: string; recoveryCodes: string[] }> = [];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n🚀 Porta Playground Seed');
  console.log('   Setting up comprehensive test data for OIDC playground...\n');

  // Dynamic imports — ensures LOG_LEVEL=fatal is set before logger initializes
  const { connectDatabase, disconnectDatabase } = await import('../src/lib/database.js');
  const { connectRedis, disconnectRedis } = await import('../src/lib/redis.js');
  const { runMigrations } = await import('../src/lib/migrator.js');
  const { createOrganization, getOrganizationBySlug, updateOrganization } = await import('../src/organizations/index.js');
  const { createApplication, getApplicationBySlug } = await import('../src/applications/index.js');
  const { createClient, listClientsByApplication, generateSecret } = await import('../src/clients/index.js');
  const { createUser, getUserByEmail, reactivateUser, suspendUser, deactivateUser } = await import('../src/users/index.js');
  const { createRole, findRoleBySlug, createPermission, listPermissionsByApplication, assignPermissionsToRole } = await import('../src/rbac/index.js');
  const { assignRoleToUser } = await import('../src/rbac/index.js');
  const { createDefinition, listDefinitions, setValue } = await import('../src/custom-claims/index.js');
  const { setupEmailOtp, setupTotp, confirmTotpSetup, getTwoFactorStatus } = await import('../src/two-factor/index.js');

  // Connect to infrastructure
  await connectDatabase();
  await connectRedis();

  // Track IDs for config output
  const orgMap = new Map<string, { id: string; slug: string; name: string; clientId: string; twoFactorPolicy: string }>();
  let confidentialClientId = '';
  let confidentialSecret = '';
  let appId = '';

  try {
    // -----------------------------------------------------------------------
    // Phase A: Migrations
    // -----------------------------------------------------------------------
    console.log('[A] Running database migrations...');
    await runMigrations('up');
    console.log('  ✅ Migrations complete\n');

    // -----------------------------------------------------------------------
    // Phase B: Organizations
    // -----------------------------------------------------------------------
    console.log('[B] Creating organizations...');
    const orgIds = new Map<string, string>(); // key → org ID

    for (const def of ORGS) {
      let org = await getOrganizationBySlug(def.slug);
      if (org) {
        console.log(`  ⚠️  Org "${def.name}" exists: ${org.id}`);
      } else {
        org = await createOrganization({ name: def.name, slug: def.slug });
        console.log(`  ✅ Org "${def.name}" created: ${org.id}`);
      }
      // Always update 2FA policy to match definition (idempotent)
      await updateOrganization(org.id, { twoFactorPolicy: def.twoFactorPolicy });
      orgIds.set(def.key, org.id);
    }
    console.log();

    // -----------------------------------------------------------------------
    // Phase C: Application, RBAC, Custom Claims
    // -----------------------------------------------------------------------
    console.log('[C] Creating application, roles, permissions, claims...');

    // Application
    let app = await getApplicationBySlug('playground-app');
    if (app) {
      console.log(`  ⚠️  Application "Playground App" exists: ${app.id}`);
    } else {
      app = await createApplication({ name: 'Playground App' });
      console.log(`  ✅ Application "Playground App" created: ${app.id}`);
    }
    appId = app.id;

    // Permissions — create if not existing
    const permissionMap = new Map<string, string>(); // slug → ID
    const existingPerms = await listPermissionsByApplication(app.id);
    for (const def of PERMISSION_DEFS) {
      const existing = existingPerms.find((p: { slug: string }) => p.slug === def.slug);
      if (existing) {
        permissionMap.set(def.slug, existing.id);
        console.log(`  ⚠️  Permission "${def.slug}" exists: ${existing.id}`);
      } else {
        const perm = await createPermission({ applicationId: app.id, name: def.name, slug: def.slug, description: def.description });
        permissionMap.set(def.slug, perm.id);
        console.log(`  ✅ Permission "${def.slug}" created: ${perm.id}`);
      }
    }

    // Roles — create if not existing, then assign permissions
    const roleMap = new Map<string, string>(); // slug → ID
    for (const def of ROLE_DEFS) {
      let role = await findRoleBySlug(app.id, def.slug);
      if (role) {
        console.log(`  ⚠️  Role "${def.slug}" exists: ${role.id}`);
      } else {
        role = await createRole({ applicationId: app.id, name: def.name, slug: def.slug, description: def.description });
        console.log(`  ✅ Role "${def.slug}" created: ${role.id}`);
      }
      roleMap.set(def.slug, role.id);

      // Assign permissions to role (idempotent — service handles duplicates)
      const permIds = def.permissions.map((slug) => permissionMap.get(slug)!);
      try {
        await assignPermissionsToRole(role.id, permIds);
      } catch {
        // Permission assignment may fail if already assigned — that's fine
      }
    }

    // Custom claim definitions
    const claimDefMap = new Map<string, string>(); // claimName → definition ID
    const existingDefs = await listDefinitions(app.id);
    for (const def of CLAIM_DEFS) {
      const existing = existingDefs.find((d: { claimName: string }) => d.claimName === def.claimName);
      if (existing) {
        claimDefMap.set(def.claimName, existing.id);
        console.log(`  ⚠️  Claim "${def.claimName}" exists: ${existing.id}`);
      } else {
        const claim = await createDefinition({
          applicationId: app.id,
          claimName: def.claimName,
          claimType: def.claimType,
          description: def.description,
          includeInIdToken: true,
          includeInAccessToken: true,
          includeInUserinfo: true,
        });
        claimDefMap.set(def.claimName, claim.id);
        console.log(`  ✅ Claim "${def.claimName}" created: ${claim.id}`);
      }
    }
    console.log();

    // -----------------------------------------------------------------------
    // Phase D: Clients (one public per org + one confidential for no2fa)
    // -----------------------------------------------------------------------
    console.log('[D] Creating OIDC clients...');

    const PLAYGROUND_REDIRECT = 'http://localhost:4000/callback.html';
    const PLAYGROUND_POST_LOGOUT = 'http://localhost:4000/';

    for (const def of ORGS) {
      const oId = orgIds.get(def.key)!;
      const clientName = `Playground SPA (${def.name})`;

      // List existing clients to find by name
      const existingClients = await listClientsByApplication(app.id, { page: 1, pageSize: 100 });
      let pubClient = existingClients.data.find((c: { clientName: string }) => c.clientName === clientName);

      if (pubClient) {
        console.log(`  ⚠️  Client "${clientName}" exists: ${pubClient.clientId}`);
      } else {
        const result = await createClient({
          organizationId: oId,
          applicationId: app.id,
          clientName,
          clientType: 'public',
          applicationType: 'spa',
          redirectUris: [PLAYGROUND_REDIRECT],
          postLogoutRedirectUris: [PLAYGROUND_POST_LOGOUT],
          grantTypes: ['authorization_code', 'refresh_token'],
          scope: 'openid profile email',
        });
        pubClient = result.client;
        console.log(`  ✅ Client "${clientName}" created: ${pubClient.clientId}`);
      }

      // Store in orgMap for config output
      orgMap.set(def.key, {
        id: oId,
        slug: def.slug,
        name: def.name,
        clientId: pubClient.clientId,
        twoFactorPolicy: def.twoFactorPolicy,
      });
    }

    // Confidential client for no2fa org (for advanced testing)
    const confClientName = 'Playground Confidential';
    const existingClients = await listClientsByApplication(app.id, { page: 1, pageSize: 100 });
    let confClient = existingClients.data.find((c: { clientName: string }) => c.clientName === confClientName);

    if (confClient) {
      console.log(`  ⚠️  Client "${confClientName}" exists: ${confClient.clientId}`);
    } else {
      const result = await createClient({
        organizationId: orgIds.get('no2fa')!,
        applicationId: app.id,
        clientName: confClientName,
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: [PLAYGROUND_REDIRECT],
        postLogoutRedirectUris: [PLAYGROUND_POST_LOGOUT],
        grantTypes: ['authorization_code', 'refresh_token'],
        scope: 'openid profile email',
      });
      confClient = result.client;
      console.log(`  ✅ Client "${confClientName}" created: ${confClient.clientId}`);
    }

    // Always generate a fresh secret for the confidential client
    const secretResult = await generateSecret(confClient.id);
    confidentialClientId = confClient.clientId;
    confidentialSecret = secretResult.plaintext;
    console.log(`  🔑 Confidential client secret: ${confidentialSecret}`);
    console.log();

    // -----------------------------------------------------------------------
    // Phase E: Users
    // -----------------------------------------------------------------------
    console.log('[E] Creating users...');
    const userIds = new Map<string, string>(); // email → user ID

    for (const def of USERS) {
      const oId = orgIds.get(def.orgKey)!;
      let user = await getUserByEmail(oId, def.email);

      if (user) {
        console.log(`  ⚠️  User "${def.email}" exists: ${user.id}`);
      } else {
        user = await createUser({
          organizationId: oId,
          email: def.email,
          givenName: def.givenName,
          familyName: def.familyName,
          password: def.password,
        });
        console.log(`  ✅ User "${def.email}" created: ${user.id}`);
      }
      userIds.set(def.email, user.id);

      // Set target status — users are created as 'inactive', activate then transition
      try {
        if (def.targetStatus === 'active') {
          await reactivateUser(user.id);
        } else if (def.targetStatus === 'suspended') {
          // Must be active first, then suspend
          await reactivateUser(user.id);
          await suspendUser(user.id);
        } else if (def.targetStatus === 'inactive') {
          // If already active, deactivate. If already inactive, no-op.
          await deactivateUser(user.id);
        }
      } catch {
        // Status transition may fail if user is already in the target state — OK
      }
    }
    console.log();

    // -----------------------------------------------------------------------
    // Phase F: 2FA Enrollment
    // -----------------------------------------------------------------------
    console.log('[F] Enrolling users in 2FA...');

    for (const def of USERS) {
      if (def.twoFactorSetup === 'skip') continue;

      const userId = userIds.get(def.email)!;
      const oId = orgIds.get(def.orgKey)!;

      // Check if already enrolled (idempotent)
      const status = await getTwoFactorStatus(userId);
      if (status.enabled) {
        console.log(`  ⚠️  "${def.email}" already has 2FA enabled (${status.method})`);
        continue;
      }

      if (def.twoFactorSetup === 'email') {
        const result = await setupEmailOtp(userId, oId);
        console.log(`  ✅ "${def.email}" enrolled in email OTP (${result.recoveryCodes.length} recovery codes)`);
      } else if (def.twoFactorSetup === 'totp') {
        // Step 1: Start TOTP setup (generates secret + QR code)
        const orgSlug = ORGS.find((o) => o.key === def.orgKey)!.slug;
        const result = await setupTotp(userId, def.email, orgSlug);

        // Step 2: Generate a valid TOTP code from the returned URI
        const totpInstance = OTPAuth.URI.parse(result.totpUri!);
        const code = totpInstance.generate();

        // Step 3: Confirm TOTP setup with the generated code
        const confirmed = await confirmTotpSetup(userId, code);
        if (!confirmed) {
          console.error(`  ❌ TOTP confirmation failed for "${def.email}"`);
          continue;
        }

        // Extract base32 secret from the URI for the summary
        const secretParam = new URL(result.totpUri!).searchParams.get('secret') ?? '';
        totpSecrets.push({ email: def.email, secret: secretParam, recoveryCodes: result.recoveryCodes });
        console.log(`  ✅ "${def.email}" enrolled in TOTP (secret: ${secretParam.slice(0, 8)}...)`);
      }
    }
    console.log();

    // -----------------------------------------------------------------------
    // Phase G: Role & Claim Assignments
    // -----------------------------------------------------------------------
    console.log('[G] Assigning roles and custom claims...');

    for (const def of USERS) {
      const userId = userIds.get(def.email)!;
      const oId = orgIds.get(def.orgKey)!;

      // Role assignments
      if (def.assignRoles) {
        for (const roleSlug of def.assignRoles) {
          const roleId = roleMap.get(roleSlug);
          if (!roleId) {
            console.warn(`  ⚠️  Role "${roleSlug}" not found, skipping for "${def.email}"`);
            continue;
          }
          try {
            await assignRoleToUser(userId, roleId, oId);
            console.log(`  ✅ Assigned role "${roleSlug}" to "${def.email}"`);
          } catch {
            // May already be assigned — that's fine
            console.log(`  ⚠️  Role "${roleSlug}" may already be assigned to "${def.email}"`);
          }
        }
      }

      // Custom claim values
      if (def.claims) {
        for (const [claimName, value] of Object.entries(def.claims)) {
          const defId = claimDefMap.get(claimName);
          if (!defId) {
            console.warn(`  ⚠️  Claim "${claimName}" not found, skipping for "${def.email}"`);
            continue;
          }
          try {
            await setValue(defId, userId, oId, value);
            console.log(`  ✅ Set claim "${claimName}" = "${value}" for "${def.email}"`);
          } catch {
            // May already have the value — that's fine
            console.log(`  ⚠️  Claim "${claimName}" may already be set for "${def.email}"`);
          }
        }
      }
    }
    console.log();

    // -----------------------------------------------------------------------
    // Phase H: Config Output
    // -----------------------------------------------------------------------
    console.log('[H] Writing playground config...');

    const configObj = {
      portaUrl: 'http://localhost:3000',
      playgroundUrl: 'http://localhost:4000',
      mailhogUrl: 'http://localhost:8025',
      organizations: Object.fromEntries(
        [...orgMap.entries()].map(([key, data]) => [key, data]),
      ),
      confidentialClient: {
        clientId: confidentialClientId,
        // Secret is printed to console only — NOT stored in config for security
      },
      users: Object.fromEntries(
        USERS.filter((u) => u.targetStatus === 'active').map((u) => [
          u.email,
          { password: u.password, orgKey: u.orgKey },
        ]),
      ),
      scenarios: {
        normalLogin: { orgKey: 'no2fa', userEmail: 'user@no2fa.local', description: 'Standard password login (no 2FA)' },
        emailOtp: { orgKey: 'email2fa', userEmail: 'user@email2fa.local', description: 'Login with email OTP verification' },
        totpAuth: { orgKey: 'totp2fa', userEmail: 'user@totp2fa.local', description: 'Login with TOTP authenticator' },
        recoveryCode: { orgKey: 'totp2fa', userEmail: 'user@totp2fa.local', description: 'Login using a recovery code' },
        magicLink: { orgKey: 'no2fa', userEmail: 'user@no2fa.local', description: 'Passwordless magic link login' },
        thirdPartyConsent: { orgKey: 'thirdparty', userEmail: 'user@thirdparty.local', description: 'Login with consent prompt' },
        passwordReset: { orgKey: 'no2fa', userEmail: 'user@no2fa.local', description: 'Reset password flow' },
        totpSetup: { orgKey: 'totp2fa', userEmail: 'fresh@totp2fa.local', description: 'New user TOTP enrollment during login' },
      },
    };

    // Write as an ES module for the playground SPA to import
    const configContent = [
      '// @ts-nocheck — Auto-generated by scripts/playground-seed.ts',
      '// Run: yarn tsx scripts/playground-seed.ts',
      '// Do NOT edit manually. Do NOT commit this file.',
      '',
      `export const PLAYGROUND_CONFIG = ${JSON.stringify(configObj, null, 2)};`,
      '',
    ].join('\n');

    const configPath = path.resolve(import.meta.dirname ?? '.', '..', 'playground', 'config.generated.js');
    // Ensure the playground directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, configContent, 'utf-8');
    console.log(`  ✅ Config written to: ${configPath}\n`);

    // -----------------------------------------------------------------------
    // Phase I: Summary
    // -----------------------------------------------------------------------
    printSummary(orgMap, confidentialClientId, confidentialSecret);
  } finally {
    await disconnectRedis();
    await disconnectDatabase();
  }
}

// ---------------------------------------------------------------------------
// Summary printer
// ---------------------------------------------------------------------------

/**
 * Print a formatted summary of all seeded resources with credentials and URLs.
 */
function printSummary(
  orgMap: Map<string, { id: string; slug: string; name: string; clientId: string; twoFactorPolicy: string }>,
  confClientId: string,
  confSecret: string,
): void {
  const SEP = '═'.repeat(72);
  const LINE = '─'.repeat(72);

  console.log(SEP);
  console.log('🎉 Playground Seeded Successfully!\n');

  // Organizations table
  console.log('Organizations:');
  console.log(`  ${'Name'.padEnd(22)} ${'Slug'.padEnd(26)} ${'2FA Policy'.padEnd(16)} Client ID`);
  console.log(`  ${LINE}`);
  for (const [, data] of orgMap) {
    const shortId = data.clientId.length > 16 ? data.clientId.slice(0, 16) + '…' : data.clientId;
    console.log(`  ${data.name.padEnd(22)} ${data.slug.padEnd(26)} ${data.twoFactorPolicy.padEnd(16)} ${shortId}`);
  }
  console.log();

  // Users table
  console.log('Test Users:');
  console.log(`  ${'Email'.padEnd(30)} ${'Password'.padEnd(18)} ${'Status'.padEnd(12)} 2FA`);
  console.log(`  ${LINE}`);
  for (const u of USERS) {
    const twoFa = u.twoFactorSetup === 'skip' ? 'none' : u.twoFactorSetup;
    console.log(`  ${u.email.padEnd(30)} ${u.password.padEnd(18)} ${u.targetStatus.padEnd(12)} ${twoFa}`);
  }
  console.log();

  // Confidential client
  console.log('Confidential Client:');
  console.log(`  Client ID:     ${confClientId}`);
  console.log(`  Client Secret: ${confSecret}`);
  console.log(`  Auth Method:   client_secret_basic`);
  console.log();

  // TOTP secrets (if any)
  if (totpSecrets.length > 0) {
    console.log('TOTP Setup Info:');
    for (const info of totpSecrets) {
      console.log(`  ${info.email}:`);
      console.log(`    Secret (base32): ${info.secret}`);
      console.log(`    Recovery Codes:  ${info.recoveryCodes.join(', ')}`);
    }
    console.log();
  }

  // Quick reference
  console.log('Quick Reference:');
  console.log('  Porta:       http://localhost:3000');
  console.log('  Playground:  http://localhost:4000');
  console.log('  MailHog:     http://localhost:8025');
  console.log(`  Discovery:   http://localhost:3000/playground-no2fa/.well-known/openid-configuration`);
  console.log();
  console.log(SEP);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
