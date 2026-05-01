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
 *   - playground-bff/config.generated.json — consumed by the BFF playground server
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
 * Organization definitions.
 *
 * Covers 2FA policy scenarios plus a dedicated `passwordOnly` org whose
 * `defaultLoginMethods` is `['password']` — used by the Phase 10 playground
 * demo to prove that per-org login-method defaults propagate to clients that
 * do not set a per-client override (client.loginMethods = null).
 */
const ORGS: OrgDef[] = [
  { key: 'no2fa', name: 'No 2FA Org', slug: 'playground-no2fa', twoFactorPolicy: 'optional' },
  { key: 'email2fa', name: 'Email 2FA Org', slug: 'playground-email2fa', twoFactorPolicy: 'required_email' },
  { key: 'totp2fa', name: 'TOTP 2FA Org', slug: 'playground-totp2fa', twoFactorPolicy: 'required_totp' },
  { key: 'optional2fa', name: 'Optional 2FA Org', slug: 'playground-optional2fa', twoFactorPolicy: 'optional' },
  { key: 'thirdparty', name: 'Third-Party Org', slug: 'playground-thirdparty', twoFactorPolicy: 'optional' },
  { key: 'passwordOnly', name: 'Password-Only Org', slug: 'playground-passwordonly', twoFactorPolicy: 'optional' },
];

/**
 * Per-organization default login methods. Orgs absent from this map fall
 * back to the DB default (`{password, magic_link}`), which is enforced by
 * `updateOrganization()` during the idempotent seed pass.
 *
 * The `passwordOnly` org exists explicitly to demonstrate that the resolver
 * picks up org defaults when a client's `loginMethods` is `null` (inherit).
 */
const ORG_DEFAULT_LOGIN_METHODS: Record<string, ('password' | 'magic_link')[]> = {
  passwordOnly: ['password'],
};


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
    assignRoles: ['erp-admin'],
    claims: { department: 'Engineering', employee_id: 'EMP-001', cost_center: 'CC-1000', job_title: 'Platform Engineer' },
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
    assignRoles: ['finance-manager'],
    claims: { department: 'Finance', employee_id: 'EMP-042', cost_center: 'CC-2000', job_title: 'Finance Manager' },
  },

  // TOTP 2FA org — 1 enrolled user + 1 fresh user (triggers setup flow)
  {
    orgKey: 'totp2fa', email: 'user@totp2fa.local', givenName: 'TOTP', familyName: 'User',
    password: SHARED_PASSWORD, targetStatus: 'active', twoFactorSetup: 'totp',
    assignRoles: ['warehouse-operator'],
    claims: { department: 'Logistics', employee_id: 'EMP-099', cost_center: 'CC-3000', job_title: 'Warehouse Lead' },
  },
  {
    orgKey: 'totp2fa', email: 'fresh@totp2fa.local', givenName: 'Fresh', familyName: 'User',
    password: SHARED_PASSWORD, targetStatus: 'active', twoFactorSetup: 'skip',
  },

  // Optional 2FA org — 1 user without 2FA (can optionally enroll at login)
  {
    orgKey: 'optional2fa', email: 'user@optional2fa.local', givenName: 'Optional', familyName: 'User',
    password: SHARED_PASSWORD, targetStatus: 'active', twoFactorSetup: 'skip',
    assignRoles: ['sales-rep'],
    claims: { department: 'Sales', employee_id: 'EMP-155', cost_center: 'CC-4000', job_title: 'Account Executive' },
  },

  // Third-party org — 1 user for consent-required scenario
  {
    orgKey: 'thirdparty', email: 'user@thirdparty.local', givenName: 'ThirdParty', familyName: 'User',
    password: SHARED_PASSWORD, targetStatus: 'active', twoFactorSetup: 'skip',
    assignRoles: ['hr-specialist'],
    claims: { department: 'Human Resources', employee_id: 'EMP-200', cost_center: 'CC-5000', job_title: 'HR Business Partner' },
  },
];

/** RBAC role definitions for the shared Playground ERP application. */
const ROLE_DEFS = [
  { slug: 'erp-admin', name: 'ERP Administrator', description: 'Full system access',
    permissions: ['erp:invoices:read', 'erp:invoices:write', 'erp:orders:read', 'erp:orders:write',
                  'erp:inventory:read', 'erp:inventory:write', 'erp:employees:read', 'erp:employees:write',
                  'erp:reports:read', 'erp:settings:manage'] },
  { slug: 'finance-manager', name: 'Finance Manager', description: 'Financial operations and reporting',
    permissions: ['erp:invoices:read', 'erp:invoices:write', 'erp:reports:read'] },
  { slug: 'warehouse-operator', name: 'Warehouse Operator', description: 'Inventory and order fulfillment',
    permissions: ['erp:inventory:read', 'erp:inventory:write', 'erp:orders:read'] },
  { slug: 'sales-rep', name: 'Sales Representative', description: 'Customer orders and invoice viewing',
    permissions: ['erp:orders:read', 'erp:orders:write', 'erp:invoices:read'] },
  { slug: 'hr-specialist', name: 'HR Specialist', description: 'Employee record management',
    permissions: ['erp:employees:read', 'erp:employees:write'] },
];

/** RBAC permission definitions — the union of all role permissions. */
const PERMISSION_DEFS = [
  { slug: 'erp:invoices:read', name: 'View Invoices', description: 'Access to view invoice records' },
  { slug: 'erp:invoices:write', name: 'Manage Invoices', description: 'Create, edit, and approve invoices' },
  { slug: 'erp:orders:read', name: 'View Orders', description: 'Access to view sales/purchase orders' },
  { slug: 'erp:orders:write', name: 'Manage Orders', description: 'Create and edit orders' },
  { slug: 'erp:inventory:read', name: 'View Inventory', description: 'Access to view stock levels' },
  { slug: 'erp:inventory:write', name: 'Manage Inventory', description: 'Adjust stock, manage warehouses' },
  { slug: 'erp:employees:read', name: 'View Employees', description: 'Access to view employee records' },
  { slug: 'erp:employees:write', name: 'Manage Employees', description: 'Create, edit employee records' },
  { slug: 'erp:reports:read', name: 'View Reports', description: 'Access to financial and operational reports' },
  { slug: 'erp:settings:manage', name: 'System Settings', description: 'Manage ERP system configuration' },
];

/** Custom claim definitions for the shared application. */
const CLAIM_DEFS = [
  { claimName: 'department', claimType: 'string' as const, description: 'Department name' },
  { claimName: 'employee_id', claimType: 'string' as const, description: 'Employee identifier' },
  { claimName: 'cost_center', claimType: 'string' as const, description: 'Cost center code' },
  { claimName: 'job_title', claimType: 'string' as const, description: 'Job title / position' },
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
  const { assignRolesToUser } = await import('../src/rbac/index.js');
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

  // BFF + M2M client tracking — populated in Phase D
  const bffClients = new Map<string, { clientId: string; secret: string }>();
  let m2mClientId = '';
  let m2mSecret = '';

  // Login-method demo clients — populated in Phase D. See
  // plans/client-login-methods/08-playground-integration.md for the matrix.
  const loginMethodClients = new Map<string, { clientId: string; orgSlug: string; label: string; loginMethods: ('password' | 'magic_link')[] | null }>();
  const loginMethodBffClients = new Map<string, { clientId: string; secret: string; orgKey: string; label: string; loginMethods: ('password' | 'magic_link')[] | null }>();


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
      // Always update 2FA policy and optional default login methods to match
      // the definition (idempotent — service layer no-ops unchanged values).
      const updateInput: {
        twoFactorPolicy: OrgDef['twoFactorPolicy'];
        defaultLoginMethods?: ('password' | 'magic_link')[];
      } = { twoFactorPolicy: def.twoFactorPolicy };
      const orgDefaultMethods = ORG_DEFAULT_LOGIN_METHODS[def.key];
      if (orgDefaultMethods) {
        updateInput.defaultLoginMethods = orgDefaultMethods;
      }
      await updateOrganization(org.id, updateInput);
      if (orgDefaultMethods) {
        console.log(`  🔐 Org "${def.name}" defaultLoginMethods → [${orgDefaultMethods.join(', ')}]`);
      }
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
          applicationType: 'web',
          redirectUris: [PLAYGROUND_REDIRECT],
          postLogoutRedirectUris: [PLAYGROUND_POST_LOGOUT],
          grantTypes: ['authorization_code', 'refresh_token'],
          scope: 'openid profile email offline_access',
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
        scope: 'openid profile email offline_access',
      });
      confClient = result.client;
      console.log(`  ✅ Client "${confClientName}" created: ${confClient.clientId}`);
    }

    // Always generate a fresh secret for the confidential client
    const secretResult = await generateSecret(confClient.id);
    confidentialClientId = confClient.clientId;
    confidentialSecret = secretResult.plaintext;
    console.log(`  🔑 Confidential client secret: ${confidentialSecret}`);

    // BFF confidential clients — one per org for multi-org scenario support.
    // These redirect to the BFF server (port 4001) instead of the SPA (port 4000).
    const BFF_REDIRECT = 'http://localhost:4001/auth/callback';
    const BFF_POST_LOGOUT = 'http://localhost:4001';

    for (const def of ORGS) {
      const oId = orgIds.get(def.key)!;
      const bffClientName = `BFF Playground (${def.name})`;

      const allClients = await listClientsByApplication(app.id, { page: 1, pageSize: 200 });
      let bffClient = allClients.data.find((c: { clientName: string }) => c.clientName === bffClientName);

      if (bffClient) {
        console.log(`  ⚠️  Client "${bffClientName}" exists: ${bffClient.clientId}`);
      } else {
        const result = await createClient({
          organizationId: oId,
          applicationId: app.id,
          clientName: bffClientName,
          clientType: 'confidential',
          applicationType: 'web',
          redirectUris: [BFF_REDIRECT],
          postLogoutRedirectUris: [BFF_POST_LOGOUT],
          grantTypes: ['authorization_code', 'refresh_token'],
          tokenEndpointAuthMethod: 'client_secret_post',
          scope: 'openid profile email offline_access',
        });
        bffClient = result.client;
        console.log(`  ✅ Client "${bffClientName}" created: ${bffClient.clientId}`);
      }

      // Always generate a fresh secret for the BFF client
      const bffSecretResult = await generateSecret(bffClient.id);
      bffClients.set(def.key, {
        clientId: bffClient.clientId,
        secret: bffSecretResult.plaintext,
      });
    }
    console.log('  🔑 BFF clients created (one per org)');

    // M2M service client — single client for client_credentials grant demo.
    // No redirect URIs needed since M2M flow has no user interaction.
    const m2mClientName = 'M2M Service Client';
    const allClientsForM2m = await listClientsByApplication(app.id, { page: 1, pageSize: 200 });
    let m2mClient = allClientsForM2m.data.find((c: { clientName: string }) => c.clientName === m2mClientName);

    if (m2mClient) {
      console.log(`  ⚠️  Client "${m2mClientName}" exists: ${m2mClient.clientId}`);
    } else {
      const result = await createClient({
        organizationId: orgIds.get('no2fa')!,
        applicationId: app.id,
        clientName: m2mClientName,
        clientType: 'confidential',
        applicationType: 'web',
        // Placeholder URI — client_credentials grant never redirects, but the
        // validator requires at least one URI. This is never actually used.
        redirectUris: ['http://localhost:4001/m2m/callback'],
        grantTypes: ['client_credentials'],
        tokenEndpointAuthMethod: 'client_secret_post',
        scope: 'openid',
      });
      m2mClient = result.client;
      console.log(`  ✅ Client "${m2mClientName}" created: ${m2mClient.clientId}`);
    }

    // Always generate a fresh secret for the M2M client
    const m2mSecretResult = await generateSecret(m2mClient.id);
    m2mClientId = m2mClient.clientId;
    m2mSecret = m2mSecretResult.plaintext;
    console.log(`  🔑 M2M client secret: ${m2mSecret}`);

    // -----------------------------------------------------------------------
    // Phase D.1: Login-method demo clients
    //
    // Two SPA clients with explicit login-method overrides plus one BFF
    // client with a password-only override. The `both` profile reuses the
    // existing `Playground SPA (No 2FA Org)` client (null override → inherit
    // org default `{password, magic_link}`) and the `orgForced` profile
    // reuses the `Playground SPA (Password-Only Org)` client (null override
    // → inherits org's `['password']` default).
    //
    // See plans/client-login-methods/08-playground-integration.md.
    // -----------------------------------------------------------------------
    console.log();
    console.log('  🎯 Login-method demo clients...');

    /** SPA demo-client definitions — all live under the `no2fa` org. */
    const loginMethodSpaDefs: Array<{
      key: 'password' | 'magic';
      clientName: string;
      label: string;
      loginMethods: ('password' | 'magic_link')[];
    }> = [
      { key: 'password', clientName: 'Playground SPA (Password Only)', label: 'Password only', loginMethods: ['password'] },
      { key: 'magic', clientName: 'Playground SPA (Magic Link Only)', label: 'Magic link only', loginMethods: ['magic_link'] },
    ];

    for (const demo of loginMethodSpaDefs) {
      const orgId = orgIds.get('no2fa')!;
      const existing = await listClientsByApplication(app.id, { page: 1, pageSize: 200 });
      let client = existing.data.find((c: { clientName: string }) => c.clientName === demo.clientName);
      if (client) {
        console.log(`    ⚠️  Client "${demo.clientName}" exists: ${client.clientId}`);
      } else {
        const result = await createClient({
          organizationId: orgId,
          applicationId: app.id,
          clientName: demo.clientName,
          clientType: 'public',
          applicationType: 'web',
          redirectUris: [PLAYGROUND_REDIRECT],
          postLogoutRedirectUris: [PLAYGROUND_POST_LOGOUT],
          grantTypes: ['authorization_code', 'refresh_token'],
          scope: 'openid profile email offline_access',
          loginMethods: demo.loginMethods,
        });
        client = result.client;
        console.log(`    ✅ Client "${demo.clientName}" created: ${client.clientId}`);
      }
      loginMethodClients.set(demo.key, {
        clientId: client.clientId,
        orgSlug: 'playground-no2fa',
        label: demo.label,
        loginMethods: demo.loginMethods,
      });
    }

    // "both" profile → reuse the existing `Playground SPA (No 2FA Org)` client;
    // it inherits the org default which is `{password, magic_link}`.
    loginMethodClients.set('both', {
      clientId: orgMap.get('no2fa')!.clientId,
      orgSlug: 'playground-no2fa',
      label: 'Both (password + magic link)',
      loginMethods: null,
    });

    // "orgForced" profile → reuse the `Playground SPA (Password-Only Org)`
    // client; client.loginMethods is null so it inherits the org's
    // `['password']` default.
    loginMethodClients.set('orgForced', {
      clientId: orgMap.get('passwordOnly')!.clientId,
      orgSlug: 'playground-passwordonly',
      label: 'Password-only (via org default)',
      loginMethods: null,
    });

    // Password-only BFF demo client — separate from the default `BFF
    // Playground (No 2FA Org)` which inherits org defaults.
    const bffPasswordClientName = 'BFF Playground (Password Only)';
    const bffPasswordLookup = await listClientsByApplication(app.id, { page: 1, pageSize: 200 });
    let bffPasswordClient = bffPasswordLookup.data.find((c: { clientName: string }) => c.clientName === bffPasswordClientName);
    if (bffPasswordClient) {
      console.log(`    ⚠️  Client "${bffPasswordClientName}" exists: ${bffPasswordClient.clientId}`);
    } else {
      const result = await createClient({
        organizationId: orgIds.get('no2fa')!,
        applicationId: app.id,
        clientName: bffPasswordClientName,
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: [BFF_REDIRECT],
        postLogoutRedirectUris: [BFF_POST_LOGOUT],
        grantTypes: ['authorization_code', 'refresh_token'],
        tokenEndpointAuthMethod: 'client_secret_post',
        scope: 'openid profile email offline_access',
        loginMethods: ['password'],
      });
      bffPasswordClient = result.client;
      console.log(`    ✅ Client "${bffPasswordClientName}" created: ${bffPasswordClient.clientId}`);
    }
    const bffPasswordSecret = await generateSecret(bffPasswordClient.id);
    loginMethodBffClients.set('password', {
      clientId: bffPasswordClient.clientId,
      secret: bffPasswordSecret.plaintext,
      orgKey: 'no2fa',
      label: 'Password only',
      loginMethods: ['password'],
    });

    // Magic-link-only BFF demo client — mirrors the SPA `magic` profile so a
    // confidential-client flow can demonstrate a passwordless login. The
    // upstream Porta login page renders the email + "Send magic link" form
    // only; after the user clicks the MailHog-delivered link they land on
    // `/auth/callback` with a fresh authorization code like any other flow.
    const bffMagicClientName = 'BFF Playground (Magic Link Only)';
    const bffMagicLookup = await listClientsByApplication(app.id, { page: 1, pageSize: 200 });
    let bffMagicClient = bffMagicLookup.data.find((c: { clientName: string }) => c.clientName === bffMagicClientName);
    if (bffMagicClient) {
      console.log(`    ⚠️  Client "${bffMagicClientName}" exists: ${bffMagicClient.clientId}`);
    } else {
      const result = await createClient({
        organizationId: orgIds.get('no2fa')!,
        applicationId: app.id,
        clientName: bffMagicClientName,
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: [BFF_REDIRECT],
        postLogoutRedirectUris: [BFF_POST_LOGOUT],
        grantTypes: ['authorization_code', 'refresh_token'],
        tokenEndpointAuthMethod: 'client_secret_post',
        scope: 'openid profile email offline_access',
        loginMethods: ['magic_link'],
      });
      bffMagicClient = result.client;
      console.log(`    ✅ Client "${bffMagicClientName}" created: ${bffMagicClient.clientId}`);
    }
    // Always rotate the secret on each seed run, mirroring the `password`
    // profile — confidential-client demos need a known secret in the
    // generated config, and the previous secret is invalidated on rotation.
    const bffMagicSecret = await generateSecret(bffMagicClient.id);
    loginMethodBffClients.set('magic', {
      clientId: bffMagicClient.clientId,
      secret: bffMagicSecret.plaintext,
      orgKey: 'no2fa',
      label: 'Magic link only',
      loginMethods: ['magic_link'],
    });

    // "default" BFF profile → reuse the existing `BFF Playground (No 2FA Org)`
    // client, which inherits org defaults (`{password, magic_link}`).
    const defaultBff = bffClients.get('no2fa')!;
    loginMethodBffClients.set('default', {
      clientId: defaultBff.clientId,
      secret: defaultBff.secret,
      orgKey: 'no2fa',
      label: 'Both (password + magic link)',
      loginMethods: null,
    });

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
            await assignRolesToUser(userId, [roleId]);
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
      portaUrl: 'https://porta.local:3443',
      playgroundUrl: 'http://localhost:4000',
      mailhogUrl: 'http://localhost:8025',
      organizations: Object.fromEntries(
        [...orgMap.entries()].map(([key, data]) => [key, data]),
      ),
      confidentialClient: {
        clientId: confidentialClientId,
        // Secret is printed to console only — NOT stored in config for security
      },
      // Login-method demo profiles — consumed by playground/js/config.js.
      // Each entry is a `{ clientId, orgSlug, label, loginMethods }` tuple
      // where `loginMethods` is the per-client override (or null = inherit).
      loginMethodClients: Object.fromEntries(
        [...loginMethodClients.entries()].map(([key, value]) => [key, value]),
      ),
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
    console.log(`  ✅ SPA config written to: ${configPath}`);

    // BFF config — JSON format consumed by the BFF playground server.
    // Includes client secrets (needed for confidential client auth).
    const bffConfigObj = {
      portaUrl: 'https://porta.local:3443',
      bffUrl: 'http://localhost:4001',
      mailhogUrl: 'http://localhost:8025',
      redis: { host: 'localhost', port: 6379 },
      organizations: Object.fromEntries(
        [...orgMap.entries()].map(([key, data]) => [
          key,
          {
            id: data.id,
            slug: data.slug,
            name: data.name,
            clientId: bffClients.get(key)!.clientId,
            clientSecret: bffClients.get(key)!.secret,
            twoFactorPolicy: data.twoFactorPolicy,
          },
        ]),
      ),
      m2m: {
        clientId: m2mClientId,
        clientSecret: m2mSecret,
        orgSlug: 'playground-no2fa',
      },
      // Login-method client profiles for BFF — selected via `BFF_CLIENT_PROFILE`
      // at runtime. Keys must include `default` (fallback profile) to preserve
      // the out-of-the-box behaviour; additional profiles expose per-client
      // overrides (e.g., `password` → password-only client).
      loginMethodClients: Object.fromEntries(
        [...loginMethodBffClients.entries()].map(([key, value]) => [key, {
          clientId: value.clientId,
          clientSecret: value.secret,
          orgKey: value.orgKey,
          label: value.label,
          loginMethods: value.loginMethods,
        }]),
      ),
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

    const bffConfigPath = path.resolve(import.meta.dirname ?? '.', '..', 'playground-bff', 'config.generated.json');

    const bffConfigDir = path.dirname(bffConfigPath);
    if (!fs.existsSync(bffConfigDir)) {
      fs.mkdirSync(bffConfigDir, { recursive: true });
    }
    fs.writeFileSync(bffConfigPath, JSON.stringify(bffConfigObj, null, 2), 'utf-8');
    console.log(`  ✅ BFF config written to: ${bffConfigPath}\n`);

    // -----------------------------------------------------------------------
    // Phase I: Summary
    // -----------------------------------------------------------------------
    printSummary(
      orgMap,
      confidentialClientId,
      confidentialSecret,
      bffClients,
      m2mClientId,
      m2mSecret,
      loginMethodClients,
      loginMethodBffClients,
    );

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
 * Includes SPA clients, BFF clients, M2M client, users, and TOTP secrets.
 */
function printSummary(
  orgMap: Map<string, { id: string; slug: string; name: string; clientId: string; twoFactorPolicy: string }>,
  confClientId: string,
  confSecret: string,
  bffClients: Map<string, { clientId: string; secret: string }>,
  m2mClientId: string,
  m2mSecret: string,
  loginMethodClients: Map<string, { clientId: string; orgSlug: string; label: string; loginMethods: ('password' | 'magic_link')[] | null }>,
  loginMethodBffClients: Map<string, { clientId: string; secret: string; orgKey: string; label: string; loginMethods: ('password' | 'magic_link')[] | null }>,
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

  // Confidential client (SPA)
  console.log('Confidential Client (SPA):');
  console.log(`  Client ID:     ${confClientId}`);
  console.log(`  Client Secret: ${confSecret}`);
  console.log(`  Auth Method:   client_secret_basic`);
  console.log();

  // BFF playground clients
  console.log('BFF Playground:');
  console.log(`  URL:           http://localhost:4001`);
  console.log(`  Clients:       ${bffClients.size} (one per org)`);
  console.log(`  Auth Method:   client_secret_post`);
  console.log();

  // M2M client
  console.log('M2M Client:');
  console.log(`  Client ID:     ${m2mClientId}`);
  console.log(`  Client Secret: ${m2mSecret}`);
  console.log(`  Auth Method:   client_secret_post`);
  console.log(`  Grant:         client_credentials`);
  console.log();

  // Login-method demo profiles — rendered as side-by-side SPA + BFF tables
  // so contributors can inspect which client/org combination each scenario
  // exercises and whether it uses the client override or inherits from org.
  if (loginMethodClients.size > 0 || loginMethodBffClients.size > 0) {
    console.log('Login-Method Demo (SPA):');
    console.log(`  ${'Profile'.padEnd(12)} ${'Label'.padEnd(32)} ${'Org Slug'.padEnd(26)} Client ID`);
    console.log(`  ${LINE}`);
    for (const [key, v] of loginMethodClients) {
      const shortId = v.clientId.length > 16 ? v.clientId.slice(0, 16) + '…' : v.clientId;
      console.log(`  ${key.padEnd(12)} ${v.label.padEnd(32)} ${v.orgSlug.padEnd(26)} ${shortId}`);
    }
    console.log();
    console.log('Login-Method Demo (BFF):');
    console.log(`  ${'Profile'.padEnd(12)} ${'Label'.padEnd(32)} ${'Org Key'.padEnd(16)} Client ID`);
    console.log(`  ${LINE}`);
    for (const [key, v] of loginMethodBffClients) {
      const shortId = v.clientId.length > 16 ? v.clientId.slice(0, 16) + '…' : v.clientId;
      console.log(`  ${key.padEnd(12)} ${v.label.padEnd(32)} ${v.orgKey.padEnd(16)} ${shortId}`);
    }
    console.log('  (Use BFF_CLIENT_PROFILE=<profile> to switch BFF client)');
    console.log();
  }

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
  console.log('  Porta:        https://porta.local:3443');
  console.log('  SPA:          http://localhost:4000');
  console.log('  BFF:          http://localhost:4001');
  console.log('  MailHog:      http://localhost:8025');
  console.log(`  Discovery:    https://porta.local:3443/playground-no2fa/.well-known/openid-configuration`);
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
