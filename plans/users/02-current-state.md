# Current State: User Management

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

1. **Database schema** (`migrations/005_users.sql`) — Complete users table with all OIDC Standard Claims columns, status lifecycle, and supporting tables (magic_link_tokens, password_reset_tokens, invitation_tokens). All indexes and triggers are in place.

2. **Account finder stub** (`src/oidc/account-finder.ts`) — A minimal implementation from RD-03 that queries the users table directly and returns a hardcoded subset of claims (email, name, phone). Does NOT do scope-based filtering. Has a comment: "Full claims mapping with custom claims and RBAC is implemented in RD-06/RD-08."

3. **Argon2 dependency** — `argon2` v0.44.0 is already in `package.json` and used by `src/clients/crypto.ts` for client secret hashing. The same library and pattern will be reused for user password hashing.

4. **Audit log** (`src/lib/audit-log.ts`) — Generic fire-and-forget audit log writer. Already supports `userId` field. Ready for user module.

5. **Organization module** — Complete reference pattern (types → errors → slugs → repository → cache → service → routes). The user module follows this same architecture.

6. **PaginatedResult type** — Already defined in `src/organizations/types.ts` and exported from the barrel. Can be reused for user listing.

### Relevant Files

| File | Purpose | Changes Needed |
| --- | --- | --- |
| `migrations/005_users.sql` | Users table schema | None — complete |
| `src/oidc/account-finder.ts` | OIDC account lookup stub | Replace with delegation to user service/claims |
| `src/server.ts` | Koa app factory | Add user routes import and mounting |
| `src/organizations/types.ts` | PaginatedResult type | Import and reuse (already exported) |
| `src/clients/crypto.ts` | Argon2 pattern reference | Reference only — password module follows same pattern |
| `src/lib/audit-log.ts` | Audit log writer | None — already supports userId |

### Code Analysis

**Account Finder Stub (src/oidc/account-finder.ts):**
- Queries users table directly with raw SQL
- Returns only: sub, email, email_verified, name, given_name, family_name, phone_number, phone_number_verified
- Does NOT filter by scope
- Does NOT include: middle_name, nickname, preferred_username, profile, picture, website, gender, birthdate, zoneinfo, locale, updated_at, address
- The `claims()` method ignores the `_use` and `_scope` parameters

**Argon2 Usage Pattern (src/clients/crypto.ts):**
```typescript
import * as argon2 from 'argon2';

// Hash with argon2id (library defaults follow OWASP)
export async function hashSecret(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, { type: argon2.argon2id });
}

// Verify against stored hash
export async function verifySecretHash(hash: string, plaintext: string): Promise<boolean> {
  return argon2.verify(hash, plaintext);
}
```

**Server Route Mounting Pattern (src/server.ts):**
```typescript
const orgRouter = createOrganizationRouter();
app.use(orgRouter.routes());
app.use(orgRouter.allowedMethods());
```

## Gaps Identified

### Gap 1: No User Module

**Current Behavior:** No `src/users/` directory exists. No user types, repository, service, or cache.
**Required Behavior:** Complete user module with types, errors, password utilities, repository, cache, service, claims builder, and barrel export.
**Fix Required:** Create entire `src/users/` module following organization module patterns.

### Gap 2: Account Finder Is a Stub

**Current Behavior:** `findAccount` queries the DB directly and returns a fixed set of claims regardless of scope.
**Required Behavior:** `findAccount` should delegate to the user service for lookup and use the claims builder for scope-based claims filtering.
**Fix Required:** Rewrite `account-finder.ts` to import from user module.

### Gap 3: No User API Routes

**Current Behavior:** No `/api/admin/users` endpoints.
**Required Behavior:** Full CRUD + status lifecycle + password management endpoints with Zod validation.
**Fix Required:** Create `src/routes/users.ts` and mount in `server.ts`.

### Gap 4: PaginatedResult Import

**Current Behavior:** `PaginatedResult<T>` is defined in organizations/types.ts.
**Required Behavior:** User module needs to use the same type.
**Fix Required:** Import from organizations module (already exported from barrel).

## Dependencies

### Internal Dependencies

- `src/lib/database.ts` — `getPool()` for database queries
- `src/lib/redis.ts` — `getRedis()` for cache operations
- `src/lib/audit-log.ts` — `writeAuditLog()` for audit logging
- `src/lib/logger.ts` — `logger` for error logging
- `src/organizations/types.ts` — `PaginatedResult<T>` type
- `src/middleware/super-admin.ts` — `requireSuperAdmin()` for route protection

### External Dependencies

- `argon2` — Already installed (v0.44.0) — password hashing
- `zod` — Already installed (v4.3.6) — request validation
- `@koa/router` — Already installed (v15.4.0) — route handling

No new dependencies needed.

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| User type has many fields (~30) | Certain | Medium | Use row mapping function like organizations |
| Large service file (many operations) | High | Medium | Keep functions focused; file should be ~400 lines |
| Claims builder needs thorough testing | Medium | High | Dedicated claims.ts file with focused tests |
| Account finder rewrite breaks OIDC | Low | High | Keep same function signature; add tests |
