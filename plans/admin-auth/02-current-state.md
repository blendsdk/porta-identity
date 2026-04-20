# Current State: Admin API Authentication

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The admin API routes are fully implemented with Zod validation, service-layer calls, error mapping, and proper HTTP status codes. The only problem is the authentication/authorization middleware in front of them.

The CLI is fully implemented with 18 command files, yargs builders, table + JSON output, confirmation prompts, and comprehensive error handling. It works by connecting directly to PostgreSQL and Redis and calling service functions in-process.

### Relevant Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `src/middleware/super-admin.ts` | Admin auth middleware (broken) | **Delete** — replace with `admin-auth.ts` |
| `src/server.ts` | Koa app factory, mounts all routes | Swap `requireSuperAdmin()` import to new auth middleware |
| `src/routes/organizations.ts` | Org admin routes (10 endpoints) | Replace `requireSuperAdmin()` with new auth middleware |
| `src/routes/applications.ts` | App admin routes (11 endpoints) | Same |
| `src/routes/clients.ts` | Client admin routes (10 endpoints) | Same |
| `src/routes/users.ts` | User admin routes (13 endpoints) | Same |
| `src/routes/roles.ts` | Role admin routes (9 endpoints) | Same |
| `src/routes/permissions.ts` | Permission admin routes (6 endpoints) | Same |
| `src/routes/user-roles.ts` | User-role admin routes (4 endpoints) | Same |
| `src/routes/custom-claims.ts` | Custom claims admin routes (9 endpoints) | Same |
| `src/cli/index.ts` | CLI entry point (yargs setup) | Add init, login, logout, whoami commands |
| `src/cli/bootstrap.ts` | DB+Redis lifecycle for CLI | Split into direct-DB and HTTP modes |
| `src/cli/commands/*.ts` | 18 command files | Replace service imports with HTTP calls |
| `src/cli/output.ts` | Output helpers (table, JSON, etc.) | Keep unchanged |
| `src/cli/error-handler.ts` | Error handling wrapper | Update for HTTP error responses |
| `src/cli/prompt.ts` | Confirmation prompts | Keep unchanged |

### Code Analysis

#### Broken `requireSuperAdmin()` Middleware

```typescript
// src/middleware/super-admin.ts — THE PROBLEM
export function requireSuperAdmin(): Middleware {
  return async (ctx, next) => {
    const org = ctx.state.organization;  // ← ALWAYS undefined on /api/admin/* routes
    if (!org || !org.isSuperAdmin) {
      ctx.throw(403, 'Super-admin access required');  // ← ALWAYS fires
    }
    await next();
  };
}
```

Admin routes are mounted at `/api/admin/*` (root-level routes), NOT under `/:orgSlug/*`. The tenant resolver only runs on `/:orgSlug/*` routes. Therefore `ctx.state.organization` is never set on admin routes, and `requireSuperAdmin()` always throws 403.

#### Admin Route Mounting (No Tenant Context)

```typescript
// src/server.ts — admin routes are root-level, no tenant resolver
const orgRouter = createOrganizationRouter();   // /api/admin/organizations
app.use(orgRouter.routes());                     // ← No tenantResolver() here
app.use(orgRouter.allowedMethods());

// vs OIDC routes which DO have tenant resolver:
const oidcRouter = new Router({ prefix: '/:orgSlug' });
oidcRouter.use(tenantResolver());               // ← Sets ctx.state.organization
```

#### CLI Direct-DB Pattern

Every CLI command uses dynamic imports to call service functions directly:

```typescript
// src/cli/commands/org.ts — typical CLI command pattern
handler: async (argv) => {
  await withErrorHandling(async () => {
    await withBootstrap(args, async () => {
      // Direct service import — bypasses HTTP entirely
      const { createOrganization } = await import('../../organizations/index.js');
      const org = await createOrganization({ name, slug });
      printOrg(org);
    });
  }, args.verbose);
}
```

The `withBootstrap()` wrapper connects to DB + Redis, runs the command, then disconnects:

```typescript
// src/cli/bootstrap.ts — connects directly to infrastructure
export async function withBootstrap(argv: GlobalOptions, fn: () => Promise<void>) {
  // Suppresses logs unless --verbose
  // Applies --database-url/--redis-url overrides
  // Dynamically imports connectDatabase() + connectRedis()
  // Runs the command function
  // Calls shutdown() in finally block
}
```

### Signing Keys (Already Available In-Memory)

Porta already loads ES256 signing keys at startup:

```typescript
// src/lib/signing-keys.ts — keys are loaded into memory at boot
// - generateES256KeyPair() — creates new key pairs
// - loadSigningKeys() — loads active keys from DB
// - getActiveJwks() — returns JWK Set for OIDC discovery
```

The admin auth middleware can use these same keys for JWT validation without any additional infrastructure.

### RBAC System (Already Supports Admin Roles)

The existing RBAC system has everything needed:

```
roles table          — stores role definitions per application
permissions table    — stores permission definitions per application
role_permissions     — N:M junction (role ↔ permission)
user_roles           — N:M junction (user ↔ role)
```

We just need to create:
- An "Admin" application in the super-admin org
- A `porta-admin` role in that application
- Admin permissions (e.g., `admin:organizations:manage`, `admin:users:manage`, etc.)
- Assign the role to admin users via `user_roles`

### Audit Log (Already Supports User Identity)

The existing audit log accepts actor information:

```sql
-- audit_log table columns relevant to admin auth:
actor_type  VARCHAR(100)  -- 'user' | 'system' | 'admin'
actor_id    VARCHAR(255)  -- user UUID from JWT sub claim
org_id      UUID          -- FK to organizations (nullable)
metadata    JSONB         -- additional context
```

Currently, admin API calls log with `actor_type: 'system'` because there's no user identity. After RD-13, they'll log with `actor_type: 'admin'` and `actor_id: <sub from JWT>`.

---

## Gaps Identified

### Gap 1: No Authentication on Admin Routes

**Current Behavior:** All admin API requests get 403 (broken middleware)
**Required Behavior:** Bearer token validation → 401 (no token), 403 (wrong role), 200 (admin user)
**Fix Required:** Replace `requireSuperAdmin()` with JWT validation + RBAC middleware

### Gap 2: No User Identity in Admin API

**Current Behavior:** No `ctx.state.adminUser` — no identity for audit logging
**Required Behavior:** Admin middleware sets `ctx.state.adminUser` with `{ id, email, orgId, roles }`
**Fix Required:** JWT payload extraction + user lookup in new middleware

### Gap 3: CLI Requires Direct DB Access

**Current Behavior:** CLI connects to PostgreSQL + Redis, calls service functions directly
**Required Behavior:** CLI makes HTTP requests to admin API with Bearer token
**Fix Required:** HTTP client, token storage, command rewrites

### Gap 4: No Bootstrap Command

**Current Behavior:** Super-admin org is created by SQL seed (`migrations/011_seed.sql`), but no admin user, application, or client exists
**Required Behavior:** `porta init` creates everything needed for OIDC-based admin authentication
**Fix Required:** New `porta init` command

### Gap 5: No CLI Authentication Flow

**Current Behavior:** CLI has no concept of user identity — anyone with DB access can do anything
**Required Behavior:** `porta login` → OIDC Auth Code + PKCE → stored tokens → Bearer on all requests
**Fix Required:** New `porta login`, `porta logout`, `porta whoami` commands + token management

---

## Dependencies

### Internal Dependencies

- **Signing keys** (`src/lib/signing-keys.ts`) — ES256 keys for JWT validation (already exists)
- **RBAC system** (`src/rbac/`) — Role lookup for admin authorization (already exists)
- **User service** (`src/users/`) — User lookup for identity verification (already exists)
- **Organization service** (`src/organizations/`) — Super-admin org check (already exists)
- **Audit log** (`src/lib/audit-log.ts`) — Admin action logging (already exists)
- **OIDC provider** (`src/oidc/`) — Issues tokens that the admin middleware validates (already exists)

### External Dependencies

- **jose** — JWT validation library (need to add as dependency)
- **open** — Opens browser for `porta login` (need to add as dependency)
- Node.js `http` module — Localhost callback server for PKCE flow (built-in)
- Node.js `crypto` module — PKCE code verifier/challenge generation (built-in)

---

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| JWT validation rejects valid tokens | Medium | High | Comprehensive unit tests with real token generation |
| PKCE flow fails on certain OS/browsers | Low | Medium | `--no-browser` fallback for manual URL copy |
| Token refresh race conditions | Low | Medium | Mutex/lock on token refresh, retry logic |
| CLI HTTP migration breaks command behavior | Medium | High | Keep yargs builders unchanged, only swap execution layer |
| Integration tests need complete rewrite | High (certainty) | Medium | Plan dedicated testing phase with admin auth helpers |
| `porta init` doesn't create all needed entities | Low | High | Comprehensive init validation + integration tests |

---

## Data Model (No Changes Needed)

The existing database schema supports everything. For reference, the key entities for admin auth:

```
organizations (is_super_admin = true)    ← "Porta Admin" org (already exists from seed)
  └── applications                        ← "Porta Admin" app (created by porta init)
       ├── clients                        ← "porta-admin-cli" public client (created by porta init)
       ├── roles                          ← "porta-admin" role (created by porta init)
       │    └── role_permissions          ← admin permissions
       └── permissions                    ← admin permission definitions
  └── users                              ← admin user (created by porta init)
       └── user_roles                    ← links user to porta-admin role
```

### Test Infrastructure

| Area | Current State | Impact |
|------|--------------|--------|
| Unit tests (services) | ~2000 tests, direct service calls | **No impact** — service layer unchanged |
| Unit tests (CLI) | ~220 tests, mock service imports | **Full rewrite** — must mock HTTP instead |
| Integration tests (admin routes) | ~8 test files, HTTP calls without auth | **Update** — add Bearer token helper |
| Integration tests (other) | OIDC, auth flows | **No impact** |
| E2E tests | Complete OIDC flows | **No impact** |
| Playwright UI tests | Login/2FA UI flows | **No impact** |
| Pentest tests (admin) | Admin security tests | **Update** — test new auth mechanism |
| Playground seed | Direct service calls | **No impact** — kept as direct-DB |
