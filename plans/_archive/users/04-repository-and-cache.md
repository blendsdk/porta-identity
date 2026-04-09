# Repository & Cache: User Management

> **Document**: 04-repository-and-cache.md
> **Parent**: [Index](00-index.md)

## Overview

PostgreSQL data access layer and Redis caching for user records. Follows the same patterns established by the organization module: parameterized queries, dynamic UPDATE builder, paginated listing, and graceful-degradation cache.

## Architecture

### Files

| File | Purpose | ~Lines |
| --- | --- | --- |
| `src/users/repository.ts` | PostgreSQL CRUD, pagination, search | ~350 |
| `src/users/cache.ts` | Redis get/set/invalidate by ID | ~100 |

## Implementation Details

### repository.ts — PostgreSQL Data Access

#### Insert

```typescript
export interface InsertUserData {
  organizationId: string;
  email: string;
  passwordHash?: string | null;       // Hashed by service before calling repo
  emailVerified?: boolean;
  // All OIDC Standard Claims fields (optional)
  givenName?: string | null;
  familyName?: string | null;
  middleName?: string | null;
  nickname?: string | null;
  preferredUsername?: string | null;
  profileUrl?: string | null;
  pictureUrl?: string | null;
  websiteUrl?: string | null;
  gender?: string | null;
  birthdate?: string | null;
  zoneinfo?: string | null;
  locale?: string | null;
  phoneNumber?: string | null;
  // Address
  addressStreet?: string | null;
  addressLocality?: string | null;
  addressRegion?: string | null;
  addressPostalCode?: string | null;
  addressCountry?: string | null;
}

// insertUser(data: InsertUserData): Promise<User>
// - INSERT INTO users (...) VALUES (...) RETURNING *
// - Maps result through mapRowToUser()
```

#### Find

```typescript
// findUserById(id: string): Promise<User | null>
// - SELECT * FROM users WHERE id = $1

// findUserByEmail(orgId: string, email: string): Promise<User | null>
// - SELECT * FROM users WHERE organization_id = $1 AND email = $2
// - Email comparison is case-insensitive via CITEXT column

// getPasswordHash(userId: string): Promise<string | null>
// - SELECT password_hash FROM users WHERE id = $1 AND status = 'active'
// - Returns raw hash for password verification (never exposed beyond service layer)
// - Only returns hash for active users (inactive/suspended/locked cannot authenticate)
```

#### Update

```typescript
export interface UpdateUserData {
  email?: string;
  emailVerified?: boolean;
  passwordHash?: string | null;       // Set null to clear password (convert to passwordless)
  passwordChangedAt?: Date | null;
  // All OIDC Standard Claims fields (optional, nullable for clearing)
  givenName?: string | null;
  familyName?: string | null;
  // ... all profile fields ...
  // Status fields
  status?: string;
  lockedAt?: Date | null;
  lockedReason?: string | null;
  phoneNumberVerified?: boolean;
}

// updateUser(id: string, data: UpdateUserData): Promise<User>
// - Dynamic SET clause builder (same pattern as organizations)
// - FIELD_TO_COLUMN mapping for camelCase → snake_case
// - RETURNING * with mapRowToUser()
```

**FIELD_TO_COLUMN mapping** — maps ~30 UpdateUserData keys to snake_case column names. Same pattern as `src/organizations/repository.ts`.

#### List

```typescript
// listUsers(orgId: string, options: UserListOptions): Promise<PaginatedResult<User>>
// - Mandatory org_id filter (users are always listed within an org)
// - Optional status filter
// - Optional search (ILIKE on email, given_name, family_name)
// - Whitelisted sort columns: email, given_name, family_name, created_at, last_login_at
// - COUNT query + data query with LIMIT/OFFSET
```

**Differs from organizations listing:** org listing has no mandatory org scope, user listing always requires `organization_id = $1`.

#### Utility Queries

```typescript
// emailExists(orgId: string, email: string, excludeId?: string): Promise<boolean>
// - Check if email already exists in the organization
// - Used by service layer for duplicate checking before create/update

// updateLoginStats(id: string): Promise<void>
// - UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1
// - Called by service.recordLogin()

// countByOrganization(orgId: string): Promise<number>
// - SELECT COUNT(*) FROM users WHERE organization_id = $1
// - Useful for org stats / limits
```

### cache.ts — Redis Caching

```typescript
const CACHE_TTL = 300;              // 5 minutes (matches organizations)
const USER_PREFIX = 'user:id:';     // Cache key prefix

// getCachedUserById(id: string): Promise<User | null>
// - redis.get(USER_PREFIX + id)
// - Deserialize JSON, restore Date objects
// - Return null on miss/error (graceful degradation)

// cacheUser(user: User): Promise<void>
// - redis.set(USER_PREFIX + user.id, JSON.stringify(user), 'EX', CACHE_TTL)
// - Silent failure (fire-and-forget)

// invalidateUserCache(id: string): Promise<void>
// - redis.del(USER_PREFIX + id)
// - Silent failure
```

**Design decision: Cache by ID only, not by email.** Rationale:
- Email lookups happen primarily during login (which hits the DB for password_hash anyway)
- ID lookups happen during token validation, userinfo endpoint, etc. (more frequent, cacheable)
- Simpler cache invalidation — one key per user instead of two
- Organization module caches by both slug and ID because slug lookups are on every OIDC request path

**Deserialization:** Must restore Date objects for `createdAt`, `updatedAt`, `passwordChangedAt`, `lockedAt`, `lastLoginAt` — same pattern as organization cache but with more date fields.

## Integration Points

- **Repository** is used by: service layer, account finder (indirectly via service)
- **Cache** is used by: service layer (cache-first reads)
- **Both** import from: `src/lib/database.ts`, `src/lib/redis.ts`, `src/lib/logger.ts`

## Error Handling

| Error Case | Handling Strategy |
| --- | --- |
| Unique constraint violation (duplicate email) | Service layer catches and throws `UserValidationError` |
| User not found on update | Throw generic Error (service wraps in `UserNotFoundError`) |
| No fields to update | Throw Error("No fields to update") |
| Redis connection error | Log warning, return null (graceful degradation) |
| JSON parse error from cache | Log warning, return null |

## Testing Requirements

### repository.ts
- Insert user and verify all fields returned correctly
- Find by ID (found and not found cases)
- Find by email (case-insensitive, found/not found, correct org scope)
- getPasswordHash (active user, inactive user returns null, not found returns null)
- Dynamic update with various field combinations
- List with pagination, status filter, search, sorting
- emailExists with and without excludeId
- updateLoginStats increments count and sets timestamp
- countByOrganization

### cache.ts
- getCachedUserById returns cached user with proper Date restoration
- getCachedUserById returns null on cache miss
- cacheUser stores with correct key and TTL
- invalidateUserCache deletes the correct key
- Graceful degradation on Redis errors
