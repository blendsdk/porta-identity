# Seed Script: Playground Infrastructure

> **Document**: 03-seed-script.md
> **Parent**: [Index](00-index.md)

## Overview

Rewrite `scripts/playground-seed.ts` to create a comprehensive dataset covering all
Porta auth flow scenarios. The script creates resources in dependency order using
existing service modules, outputs a config file for the playground app, and prints
a summary table of all credentials.

## Architecture

### Current Architecture

Single-file seed script (~218 lines) that creates 1 org, 2 clients, 1 user.
Uses `LOG_LEVEL=fatal` + dynamic imports pattern. Idempotent via find-or-create.

### Proposed Changes

Complete rewrite of the same file. Preserves the dynamic import pattern, adds:
- 5 organizations with different 2FA policies
- 8+ users with varied statuses and 2FA enrollment
- RBAC roles, permissions, user-role assignments
- Custom claim definitions and user claim values
- Config file generation (`playground/config.generated.js`)
- Formatted summary table output

### Script Organization

The script will be organized into clearly sectioned phases, each with its own
helper function. Data definitions (org configs, user configs) are declared as
typed constants at the top of the file.

**Estimated size:** ~450-500 lines. If exceeding 500, split data definitions
into a separate `scripts/playground-seed-data.ts` file.

## Implementation Details

### Data Definitions

```typescript
// Organization definitions with 2FA policies
interface OrgDef {
  key: string;       // Internal key for config output (e.g., 'no2fa')
  name: string;      // Display name
  slug: string;      // URL slug
  twoFactorPolicy: 'none' | 'optional' | 'required_email' | 'required_totp';
}

const ORGS: OrgDef[] = [
  { key: 'no2fa',       name: 'No 2FA Org',       slug: 'playground-no2fa',       twoFactorPolicy: 'none' },
  { key: 'email2fa',    name: 'Email 2FA Org',     slug: 'playground-email2fa',    twoFactorPolicy: 'required_email' },
  { key: 'totp2fa',     name: 'TOTP 2FA Org',      slug: 'playground-totp2fa',     twoFactorPolicy: 'required_totp' },
  { key: 'optional2fa', name: 'Optional 2FA Org',   slug: 'playground-optional2fa', twoFactorPolicy: 'optional' },
  { key: 'thirdparty',  name: 'Third-Party Org',    slug: 'playground-thirdparty',  twoFactorPolicy: 'none' },
];

// User definitions per organization
interface UserDef {
  orgKey: string;           // References OrgDef.key
  email: string;
  givenName: string;
  familyName: string;
  password: string;
  targetStatus: 'active' | 'inactive' | 'suspended';
  twoFactorSetup?: 'email' | 'totp' | 'none';  // Which 2FA to enroll
  assignRoles?: string[];   // Role slugs to assign
  claims?: Record<string, string>;  // Custom claim values
}

const USERS: UserDef[] = [
  // No 2FA org — 3 users with different statuses
  { orgKey: 'no2fa', email: 'user@no2fa.local', givenName: 'Active', familyName: 'User',
    password: 'Playground123!', targetStatus: 'active', twoFactorSetup: 'none',
    assignRoles: ['admin'], claims: { department: 'Engineering', employee_id: 'EMP-001' } },
  { orgKey: 'no2fa', email: 'inactive@no2fa.local', givenName: 'Inactive', familyName: 'User',
    password: 'Playground123!', targetStatus: 'inactive', twoFactorSetup: 'none' },
  { orgKey: 'no2fa', email: 'suspended@no2fa.local', givenName: 'Suspended', familyName: 'User',
    password: 'Playground123!', targetStatus: 'suspended', twoFactorSetup: 'none' },

  // Email 2FA org — 1 user with email OTP enrolled
  { orgKey: 'email2fa', email: 'user@email2fa.local', givenName: 'Email', familyName: 'OTP User',
    password: 'Playground123!', targetStatus: 'active', twoFactorSetup: 'email',
    assignRoles: ['viewer'] },

  // TOTP 2FA org — 2 users: one enrolled, one fresh (triggers setup flow)
  { orgKey: 'totp2fa', email: 'user@totp2fa.local', givenName: 'TOTP', familyName: 'User',
    password: 'Playground123!', targetStatus: 'active', twoFactorSetup: 'totp',
    assignRoles: ['admin'] },
  { orgKey: 'totp2fa', email: 'fresh@totp2fa.local', givenName: 'Fresh', familyName: 'User',
    password: 'Playground123!', targetStatus: 'active', twoFactorSetup: 'none' },

  // Optional 2FA org — 1 user without 2FA (can optionally enroll)
  { orgKey: 'optional2fa', email: 'user@optional2fa.local', givenName: 'Optional', familyName: 'User',
    password: 'Playground123!', targetStatus: 'active', twoFactorSetup: 'none' },

  // Third-Party org — 1 user for consent testing
  { orgKey: 'thirdparty', email: 'user@thirdparty.local', givenName: 'ThirdParty', familyName: 'User',
    password: 'Playground123!', targetStatus: 'active', twoFactorSetup: 'none' },
];
```

### Seed Phases

The `main()` function executes these phases in order:

#### Phase A: Infrastructure

1. Run database migrations (`runMigrations('up')`)

#### Phase B: Organizations

2. For each `OrgDef`:
   - `getOrganizationBySlug(slug)` → if exists, reuse; else `createOrganization()`
   - `updateOrganization(id, { twoFactorPolicy })` to set 2FA policy

#### Phase C: Application & RBAC

3. Create or find the shared "Playground" application
4. Create roles: `admin` (with `manage:users`, `manage:settings` permissions), `viewer` (with `read:data` permission)
5. Create custom claim definitions: `department` (string), `employee_id` (string)

#### Phase D: Clients

6. For each organization, create a public OIDC client:
   - Name: `Playground App (Public)`
   - Type: `public`, applicationType: `spa`
   - Redirect: `http://localhost:4000/callback.html`
   - Post-logout redirect: `http://localhost:4000/`
   - Grant types: `authorization_code`, `refresh_token`
   - Scope: `openid profile email`

7. For `no2fa` org, also create a confidential client:
   - Name: `Playground Confidential`
   - Type: `confidential`, applicationType: `web`
   - Auth method: `client_secret_basic`
   - Generate and log a secret

#### Phase E: Users

8. For each `UserDef`:
   - `getUserByEmail(orgId, email)` → if exists, reuse; else `createUser()`
   - Activate or set target status (active/inactive/suspended)
   - If `twoFactorSetup === 'email'`: call `setupEmailOtp(userId, orgId)`
   - If `twoFactorSetup === 'totp'`: call `beginTotpSetup()` → generate TOTP code → `verifyTotpSetup()`
   - Log TOTP secret and recovery codes

#### Phase F: Role & Claim Assignments

9. For users with `assignRoles`, call `assignRoleToUser(userId, roleId, orgId)`
10. For users with `claims`, call `setUserClaimValue(definitionId, userId, orgId, value)`

#### Phase G: Config Output

11. Build config object with all org IDs, slugs, client IDs
12. Write `playground/config.generated.js` using `fs.writeFileSync()`

#### Phase H: Summary

13. Print formatted table with all credentials, IDs, and URLs

### Config Output Format

```javascript
// @ts-nocheck — Auto-generated by scripts/playground-seed.ts
// Run: yarn tsx scripts/playground-seed.ts
// Do NOT edit manually. Do NOT commit this file.

export const PLAYGROUND_CONFIG = {
  portaUrl: 'http://localhost:3000',
  playgroundUrl: 'http://localhost:4000',
  mailhogUrl: 'http://localhost:8025',
  organizations: {
    no2fa: {
      id: 'uuid',
      slug: 'playground-no2fa',
      name: 'No 2FA Org',
      clientId: 'generated-client-id',
      twoFactorPolicy: 'none',
    },
    email2fa: { /* ... */ },
    totp2fa: { /* ... */ },
    optional2fa: { /* ... */ },
    thirdparty: { /* ... */ },
  },
  confidentialClient: {
    clientId: 'generated-client-id',
    // Secret is only printed to console, NOT stored in config
  },
  users: {
    'user@no2fa.local': { password: 'Playground123!', orgKey: 'no2fa' },
    'user@email2fa.local': { password: 'Playground123!', orgKey: 'email2fa' },
    'user@totp2fa.local': { password: 'Playground123!', orgKey: 'totp2fa' },
    'fresh@totp2fa.local': { password: 'Playground123!', orgKey: 'totp2fa' },
    'user@optional2fa.local': { password: 'Playground123!', orgKey: 'optional2fa' },
    'user@thirdparty.local': { password: 'Playground123!', orgKey: 'thirdparty' },
  },
  scenarios: {
    normalLogin: { orgKey: 'no2fa', userEmail: 'user@no2fa.local' },
    emailOtp: { orgKey: 'email2fa', userEmail: 'user@email2fa.local' },
    totpAuth: { orgKey: 'totp2fa', userEmail: 'user@totp2fa.local' },
    recoveryCode: { orgKey: 'totp2fa', userEmail: 'user@totp2fa.local' },
    magicLink: { orgKey: 'no2fa', userEmail: 'user@no2fa.local' },
    thirdPartyConsent: { orgKey: 'thirdparty', userEmail: 'user@thirdparty.local' },
    passwordReset: { orgKey: 'no2fa', userEmail: 'user@no2fa.local' },
    totpSetup: { orgKey: 'totp2fa', userEmail: 'fresh@totp2fa.local' },
  },
};
```

### Idempotency Strategy

Every resource creation follows find-or-create:

```typescript
async function findOrCreateOrg(def: OrgDef): Promise<Organization> {
  const existing = await getOrganizationBySlug(def.slug);
  if (existing) {
    console.log(`  ⚠️  Org "${def.name}" already exists: ${existing.id}`);
    // Still update 2FA policy in case it changed
    await updateOrganization(existing.id, { twoFactorPolicy: def.twoFactorPolicy });
    return existing;
  }
  const org = await createOrganization({ name: def.name, slug: def.slug });
  await updateOrganization(org.id, { twoFactorPolicy: def.twoFactorPolicy });
  console.log(`  ✅ Org "${def.name}" created: ${org.id}`);
  return org;
}
```

For 2FA enrollment, skip if already enrolled (check `user.twoFactorEnabled`).

### Summary Output Format

```
═══════════════════════════════════════════════════════════════════
🎉 Playground Seeded Successfully!

Organizations:
┌──────────────────┬───────────────────────┬──────────────────┬─────────────────┐
│ Name             │ Slug                  │ 2FA Policy       │ Client ID       │
├──────────────────┼───────────────────────┼──────────────────┼─────────────────┤
│ No 2FA Org       │ playground-no2fa      │ none             │ abc123...       │
│ Email 2FA Org    │ playground-email2fa   │ required_email   │ def456...       │
│ ...              │ ...                   │ ...              │ ...             │
└──────────────────┴───────────────────────┴──────────────────┴─────────────────┘

Test Users:
┌──────────────────────────┬──────────────────┬────────────┬────────┐
│ Email                    │ Password         │ Status     │ 2FA    │
├──────────────────────────┼──────────────────┼────────────┼────────┤
│ user@no2fa.local         │ Playground123!   │ active     │ none   │
│ user@email2fa.local      │ Playground123!   │ active     │ email  │
│ user@totp2fa.local       │ Playground123!   │ active     │ totp   │
│ ...                      │ ...              │ ...        │ ...    │
└──────────────────────────┴──────────────────┴────────────┴────────┘

TOTP Setup Info:
  user@totp2fa.local:
    Secret (base32): JBSWY3DPEHPK3PXP...
    Recovery Codes: XXXX-XXXX, XXXX-XXXX, ...
═══════════════════════════════════════════════════════════════════
```

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| Database not reachable | Log clear error, suggest `yarn docker:up`, exit 1 |
| Redis not reachable | Log clear error, suggest `yarn docker:up`, exit 1 |
| Organization creation fails (duplicate slug) | Catch, find existing, continue |
| User creation fails (duplicate email) | Catch, find existing, continue |
| 2FA enrollment fails (already enrolled) | Skip with warning, continue |
| Config file write fails | Log error with path, exit 1 |

## Testing Requirements

- Manual: Run seed twice, verify idempotent (no errors, same data)
- Manual: Verify all 5 orgs visible via `yarn porta org list`
- Manual: Verify users via `yarn porta user list --org-id <id>`
- Manual: Verify config file generated at `playground/config.generated.js`
- Manual: Verify TOTP secret can be used in authenticator app
