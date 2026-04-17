# Current State: Playground Application & Infrastructure

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

1. **Seed script** (`scripts/playground-seed.ts`, 218 lines) — Creates 1 org, 1 app,
   2 clients (public + confidential), 1 test user. Uses dynamic imports to suppress
   logger noise. Currently points redirect URIs to external OIDC tester
   (`psteniusubi.github.io`). Idempotent but limited to a single scenario.

2. **Docker Compose** (`docker/docker-compose.yml`) — Postgres 16, Redis 7, MailHog.
   All with health checks. Already supports the playground.

3. **Service modules** — All required services exist and are well-tested:
   - Organizations: `createOrganization`, `getOrganizationBySlug`, `updateOrganization`
   - Applications: `createApplication`, `getApplicationBySlug`
   - Clients: `createClient`, `listClientsByApplication`, `generateSecret`
   - Users: `createUser`, `getUserByEmail`, `reactivateUser`, `activateUser`
   - RBAC: `createRole`, `createPermission`, `assignPermissionsToRole`, `assignRoleToUser`
   - Custom Claims: `createClaimDefinition`, `setUserClaimValue`
   - 2FA: `setupEmailOtp`, `beginTotpSetup`, `verifyTotpSetup`, `getRecoveryCodes`

4. **Package.json scripts** — Has `docker:up`, `docker:down`, `dev`, `verify`.
   No `playground` scripts yet.

5. **Templates & i18n** — 15 Handlebars pages, i18next with English locale files.
   All auth flow pages exist (login, consent, magic-link, 2FA verify, 2FA setup).

6. **Playground directory** — Does NOT exist yet. Needs to be created from scratch.

### Relevant Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `scripts/playground-seed.ts` | Current simple seed | Complete rewrite for 5 orgs, 8+ users, RBAC, 2FA |
| `package.json` | Project scripts | Add `playground`, `playground:stop`, `playground:reset` |
| `.gitignore` | Ignore patterns | Add `playground/config.generated.js` |
| `docker/docker-compose.yml` | Docker services | No changes needed |
| `.env.example` | Env var documentation | No changes needed (already covers all) |

### Code Analysis — Current Seed Script

The existing seed script pattern is sound and should be preserved:

```typescript
// Pattern: Suppress logger → dotenv → dynamic imports → connect → seed → disconnect
process.env.LOG_LEVEL = 'fatal';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { connectDatabase, disconnectDatabase } = await import('../src/lib/database.js');
  // ... dynamic imports of services
  await connectDatabase();
  await connectRedis();
  try {
    // ... create resources in dependency order
  } finally {
    await disconnectRedis();
    await disconnectDatabase();
  }
}
```

### Service API Analysis — What the Seed Script Needs

#### Organization Creation

```typescript
import { createOrganization, updateOrganization } from '../src/organizations/index.js';

// Create org, then set 2FA policy via updateOrganization
const org = await createOrganization({ name: 'No 2FA Org', slug: 'playground-no2fa' });
await updateOrganization(org.id, { twoFactorPolicy: 'none' });
```

#### Client Creation

```typescript
import { createClient } from '../src/clients/index.js';

const { client } = await createClient({
  organizationId: org.id,
  applicationId: app.id,
  clientName: 'Playground App (Public)',
  clientType: 'public',
  applicationType: 'spa',
  redirectUris: ['http://localhost:4000/callback.html'],
  postLogoutRedirectUris: ['http://localhost:4000/'],
  grantTypes: ['authorization_code', 'refresh_token'],
  scope: 'openid profile email',
});
```

#### 2FA Enrollment

```typescript
import { setupEmailOtp, beginTotpSetup, verifyTotpSetup } from '../src/two-factor/index.js';

// Email OTP — single step
const emailResult = await setupEmailOtp(userId, orgId);
// Returns { method: 'email', recoveryCodes: string[] }

// TOTP — two steps (begin + verify with a real TOTP code)
const totpSetup = await beginTotpSetup(userId, orgId);
// Returns { secret (base32), uri (otpauth://), qrCode (data URL) }
// Must generate a valid TOTP code from the secret and verify it:
const { TOTP } = await import('otpauth');
const totp = new TOTP({ secret: totpSetup.secret });
const code = totp.generate();
const totpResult = await verifyTotpSetup(userId, code, orgId);
// Returns { method: 'totp', recoveryCodes: string[] }
```

#### RBAC Setup

```typescript
import { createRole, createPermission, assignPermissionsToRole, assignRoleToUser } from '../src/rbac/index.js';

const role = await createRole({ applicationId: app.id, name: 'admin' });
const perm = await createPermission({ applicationId: app.id, name: 'Manage Users', slug: 'manage:users' });
await assignPermissionsToRole(role.id, [perm.id]);
await assignRoleToUser(userId, role.id, orgId);
```

## Gaps Identified

### Gap 1: No Playground App

**Current Behavior:** No playground exists; developers use an external OIDC tester.
**Required Behavior:** Self-contained local playground with scenario selector.
**Fix Required:** Create `playground/` directory with vanilla HTML/JS SPA.

### Gap 2: Limited Seed Data

**Current Behavior:** Seed creates 1 org, 1 app, 2 clients, 1 user.
**Required Behavior:** 5 orgs with different 2FA policies, 8+ users, RBAC, custom claims.
**Fix Required:** Rewrite `scripts/playground-seed.ts`.

### Gap 3: No Startup Orchestration

**Current Behavior:** Must manually run Docker, migrations, seed, and dev server separately.
**Required Behavior:** Single `yarn playground` command does everything.
**Fix Required:** Create `scripts/run-playground.sh` and add package.json scripts.

### Gap 4: Redirect URIs Point to External Service

**Current Behavior:** Clients redirect to `psteniusubi.github.io`.
**Required Behavior:** Clients redirect to `http://localhost:4000/callback.html`.
**Fix Required:** Update redirect URIs in seed script.

## Dependencies

### Internal Dependencies

- Organization service (exists, tested)
- Application service (exists, tested)
- Client service (exists, tested)
- User service (exists, tested)
- RBAC service (exists, tested)
- Custom claims service (exists, tested)
- 2FA service (exists, tested)
- Database migrator (exists, tested)

### External Dependencies

- `sirv-cli` — Static file server for playground (new dev dependency in playground/package.json)
- `oidc-client-ts` — Vendored JS file for OIDC client (download once, commit)

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TOTP enrollment in seed requires code generation | Low | Medium | Use otpauth library (already a dependency) to generate valid TOTP code |
| oidc-client-ts browser bundle compatibility | Low | Low | Test with vendored UMD/ESM bundle; fallback to CDN if needed |
| Port conflicts on developer machines | Medium | Low | Document port requirements; use env vars for customization |
| Seed script grows too large (>500 lines) | Medium | Low | Well-organized sections with data constants; split if needed |
| MailHog image deprecated | Low | Low | MailHog still works; can migrate to mailpit later |
