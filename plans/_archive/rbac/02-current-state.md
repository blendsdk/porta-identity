# Current State: RBAC & Custom Claims

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

#### Database Schema (RD-02 — Complete)

The RBAC and custom claims database schema was created during RD-02 (Database Schema) and is fully in place:

**Migration 006: `roles_permissions.sql`** — 4 tables:
- `roles` — Role definitions per application (id, application_id, name, slug, description, timestamps)
- `permissions` — Permission definitions per application (id, application_id, module_id, name, slug, description, created_at)
- `role_permissions` — Join table mapping roles to permissions (role_id, permission_id, created_at)
- `user_roles` — Join table mapping users to roles (user_id, role_id, assigned_by, created_at)

**Migration 007: `custom_claims.sql`** — 2 tables:
- `custom_claim_definitions` — Claim definitions per application (id, application_id, claim_name, claim_type, description, include_in_id_token, include_in_access_token, include_in_userinfo, timestamps)
- `custom_claim_values` — Per-user claim values as JSONB (id, user_id, claim_id, value, timestamps)

All tables have:
- UUID primary keys
- Foreign key constraints with CASCADE deletes
- Appropriate indexes
- Unique constraints (application_id + slug for roles/permissions, application_id + claim_name for definitions)
- `updated_at` triggers where applicable

#### Application Module (RD-05 — Complete)

The application module provides the parent entities for roles and permissions:
- `Application` type and CRUD via `src/applications/service.ts`
- `ApplicationModule` type and CRUD — modules are the namespace prefix for permission slugs
- Applications have status lifecycle (active/inactive/archived)
- `applications` and `application_modules` tables referenced by FK in roles/permissions schema

#### User Module (RD-06 — Complete)

The user module provides the user entities for role assignments and claim values:
- `User` type with full CRUD via `src/users/service.ts`
- Users belong to a single organization (`organization_id` FK)
- User status lifecycle with 6 transitions
- `findUserForOidc()` function used by account-finder — returns active users only

#### OIDC Account Finder (RD-03 — Complete)

The account finder is the integration point for RBAC claims in tokens:
- `findAccount(ctx, sub)` in `src/oidc/account-finder.ts`
- Calls `findUserForOidc(sub)` → returns null if user not found or not active
- Returns `OidcAccount` with `.claims(use, scope)` method
- Claims method delegates to `buildUserClaims(user, scopes)` in `src/users/claims.ts`
- Currently builds only OIDC Standard Claims (profile, email, phone, address scopes)
- **This is where RBAC and custom claims need to be injected**

#### Claims Builder (RD-06 — Complete)

- `buildUserClaims(user, scopes)` in `src/users/claims.ts`
- Scope-to-claims mapping per OIDC Core §5.4
- Always includes `sub`; conditionally includes profile, email, phone, address claims
- Returns `Record<string, unknown>`
- **Will need extension to add roles, permissions, and custom claims**

#### Audit Log (RD-03 — Complete)

- `writeAuditLog()` in `src/lib/audit-log.ts`
- Fire-and-forget INSERT into `audit_log` table
- Accepts event type, category, actor, target, metadata
- Used by all service modules for operation logging

#### Super Admin Middleware (RD-03 — Complete)

- `requireSuperAdmin()` in `src/middleware/super-admin.ts`
- Checks `isSuperAdmin` flag on the current user
- Applied to all admin API routes

### Relevant Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `migrations/006_roles_permissions.sql` | RBAC schema | None — already exists |
| `migrations/007_custom_claims.sql` | Custom claims schema | None — already exists |
| `src/oidc/account-finder.ts` | OIDC findAccount | Extend `.claims()` to include RBAC + custom claims |
| `src/users/claims.ts` | Standard claims builder | Extend to call RBAC + custom claim builders |
| `src/server.ts` | Koa app + route mounting | Mount new RBAC + custom claims route handlers |
| `src/applications/types.ts` | Application + Module types | Reference only — no changes |
| `src/applications/repository.ts` | App/module DB queries | Reference only — no changes |
| `src/users/types.ts` | User types | Reference only — no changes |
| `src/users/service.ts` | User service | Reference only — no changes |
| `src/lib/audit-log.ts` | Audit log writer | Reference only — no changes |
| `src/middleware/super-admin.ts` | Super-admin auth | Reference only — used by new routes |
| `src/organizations/types.ts` | PaginatedResult type | Import for user-role listing |

### Code Analysis

#### Account Finder Integration Point

```typescript
// Current: src/oidc/account-finder.ts
export function findAccount(_ctx: unknown, sub: string) {
  // ...
  return {
    accountId: user.id,
    async claims(use: string, scope: string) {
      const scopes = scope.split(' ').filter(Boolean);
      return buildUserClaims(user, scopes);
      // ^^^ RBAC and custom claims need to be merged here
    }
  };
}
```

#### Current Claims Building

```typescript
// Current: src/users/claims.ts
export function buildUserClaims(user: User, scopes: string[]): Record<string, unknown> {
  const claims: Record<string, unknown> = { sub: user.id };
  // Adds profile, email, phone, address claims based on scopes
  return claims;
}
// ^^^ Need to extend this or call additional builders and merge results
```

#### Established Module Pattern

All existing modules follow this consistent pattern:
1. `types.ts` — Interfaces, DB row types, row mappers, input types
2. `errors.ts` — Custom error classes extending `Error` (NotFound, Validation)
3. `slugs.ts` — Slug generation and validation (where applicable)
4. `repository.ts` — PostgreSQL CRUD with `getPool().query()`
5. `cache.ts` — Redis get/set/invalidate with graceful degradation
6. `service.ts` — Business logic, orchestrates repo + cache + audit
7. `index.ts` — Barrel export of all public API

## Gaps Identified

### Gap 1: No RBAC Module

**Current Behavior:** No role, permission, or user-role management exists at the application layer. The database schema is ready but has no TypeScript code to interact with it.
**Required Behavior:** Full CRUD for roles and permissions, role-permission mapping, user-role assignments, and claims building.
**Fix Required:** Create `src/rbac/` module with types, errors, slugs, repositories, cache, services, and barrel export.

### Gap 2: No Custom Claims Module

**Current Behavior:** No custom claim management exists. The database schema (`custom_claim_definitions`, `custom_claim_values`) is ready.
**Required Behavior:** Claim definition CRUD, value management with type validation, and token claims building.
**Fix Required:** Create `src/custom-claims/` module with types, errors, validators, repository, cache, service, and barrel export.

### Gap 3: Token Claims Missing RBAC Data

**Current Behavior:** `findAccount.claims()` returns only OIDC standard claims (profile, email, phone, address).
**Required Behavior:** Also return `roles: [...]`, `permissions: [...]`, and custom claim key-value pairs.
**Fix Required:** Extend account-finder/claims to call RBAC and custom claim services, merge results.

### Gap 4: No Admin API Routes

**Current Behavior:** No API endpoints for managing roles, permissions, user-role assignments, or custom claims.
**Required Behavior:** RESTful admin endpoints under `/api/admin/` with super-admin auth and Zod validation.
**Fix Required:** Create route handler files and mount in server.ts.

## Dependencies

### Internal Dependencies

- `src/lib/database.ts` — `getPool()` for PostgreSQL queries
- `src/lib/redis.ts` — `getRedis()` for caching
- `src/lib/audit-log.ts` — `writeAuditLog()` for operation logging
- `src/applications/` — Application and module types (referenced by roles/permissions)
- `src/users/` — User types (referenced by user-role assignments)
- `src/organizations/types.ts` — `PaginatedResult<T>` for listing endpoints
- `src/oidc/account-finder.ts` — Integration point for token claims
- `src/users/claims.ts` — Claims builder to extend
- `src/middleware/super-admin.ts` — Route authorization

### External Dependencies

- No new external packages required
- All needed libraries (pg, ioredis, koa-router, zod) already installed

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Token size with many permissions | Medium | Low | Permissions resolved at issuance time, not cached. Future: configurable inclusion. |
| Performance on claims resolution | Medium | Medium | Redis cache for user-role mappings, TTL-based invalidation |
| Circular dependency between RBAC and user modules | Low | High | RBAC module imports from users/applications, not vice versa |
| Breaking existing claims tests | Low | Medium | Extend, don't replace. All existing claims still built. New claims are additive. |
| Permission slug format enforcement | Low | Low | Validate on creation, reject invalid formats |
