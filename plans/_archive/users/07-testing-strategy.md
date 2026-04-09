# Testing Strategy: User Management

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- Unit tests: 90%+ coverage on all user module files
- Integration tests: Deferred (existing migration integration tests cover schema)
- E2E tests: Deferred to RD-07 (needs auth workflows)

### Test Location

All tests in `tests/unit/users/` following project convention.

## Test Categories

### Unit Tests

| Test File | Tests | What It Covers | Priority |
| --- | --- | --- | --- |
| `types.test.ts` | ~8 | Row mapping, status types, derived fields | High |
| `errors.test.ts` | ~4 | Error class names and messages | Medium |
| `password.test.ts` | ~10 | Validate, hash, verify | High |
| `repository.test.ts` | ~20 | All DB operations (mocked pool) | High |
| `cache.test.ts` | ~10 | Redis get/set/invalidate (mocked redis) | High |
| `claims.test.ts` | ~15 | Scope-based claims building | High |
| `service.test.ts` | ~30 | CRUD, status, password, email, login | High |
| `account-finder.test.ts` | ~6 | Updated account finder (existing file, updated tests) | High |
| `routes.test.ts` | ~20 | Route handlers, Zod validation, error mapping | High |

**Estimated Total: ~123 tests**

### Test Details by File

#### types.test.ts (~8 tests)

```
describe('mapRowToUser')
  should map complete row with all fields populated
  should map row with null optional fields
  should derive hasPassword = true when password_hash is set
  should derive hasPassword = false when password_hash is null
  should handle all user statuses (active, inactive, suspended, locked)
  should convert birthdate DATE to string
  should preserve date objects for timestamps
  should not expose password_hash in User interface
```

#### errors.test.ts (~4 tests)

```
describe('UserNotFoundError')
  should have correct name
  should include identifier in message

describe('UserValidationError')
  should have correct name
  should include message
```

#### password.test.ts (~10 tests)

```
describe('validatePassword')
  should accept valid password (8 chars)
  should accept valid password (128 chars)
  should reject password shorter than 8 chars
  should reject password longer than 128 chars
  should reject empty string

describe('hashPassword')
  should return argon2id hash string
  should produce different hashes for same input (random salt)

describe('verifyPassword')
  should return true for matching password
  should return false for wrong password
  should return false for invalid hash format
```

#### repository.test.ts (~20 tests)

```
describe('insertUser')
  should insert user with all fields and return mapped User
  should insert user with minimal fields (email only)
  should insert user with password hash

describe('findUserById')
  should return user when found
  should return null when not found

describe('findUserByEmail')
  should return user when found (case-insensitive)
  should return null when not found
  should scope to organization

describe('getPasswordHash')
  should return hash for active user
  should return null for inactive user
  should return null for non-existent user

describe('updateUser')
  should update specified fields only
  should throw when no fields provided
  should throw when user not found

describe('listUsers')
  should return paginated results
  should filter by status
  should filter by search term
  should sort by specified column
  should scope to organization

describe('emailExists')
  should return true when email exists
  should return false when email does not exist
  should exclude specified user ID

describe('updateLoginStats')
  should increment login_count and set last_login_at
```

#### cache.test.ts (~10 tests)

```
describe('getCachedUserById')
  should return cached user with restored dates
  should return null on cache miss
  should return null on redis error
  should return null on invalid JSON

describe('cacheUser')
  should store user with correct key and TTL
  should not throw on redis error

describe('invalidateUserCache')
  should delete cache key
  should not throw on redis error
```

#### claims.test.ts (~15 tests)

```
describe('buildUserClaims')
  should always include sub claim
  should return only sub for empty scopes
  should return only sub for openid scope

  describe('profile scope')
    should include all profile claims
    should derive name from given + middle + family name
    should derive name from given + family (no middle)
    should not set name when all name parts are null
    should include updated_at as unix timestamp
    should include null values for unset profile fields

  describe('email scope')
    should include email and email_verified

  describe('phone scope')
    should include phone_number and phone_number_verified

  describe('address scope')
    should include structured address object
    should not include address when all fields are null

  describe('multiple scopes')
    should combine claims from multiple scopes
```

#### service.test.ts (~30 tests)

```
describe('createUser')
  should create user with email only
  should create user with password (hashed)
  should reject duplicate email in same org
  should reject invalid password length
  should cache new user
  should write audit log

describe('getUserById')
  should return cached user on cache hit
  should return DB user on cache miss and cache it
  should return null when not found

describe('getUserByEmail')
  should return user from DB

describe('updateUser')
  should update fields and invalidate/re-cache
  should throw UserNotFoundError when not found
  should write audit log

describe('listUsersByOrganization')
  should delegate to repository

describe('deactivateUser')
  should deactivate active user
  should reject already inactive user

describe('reactivateUser')
  should reactivate inactive user
  should reject non-inactive user

describe('suspendUser')
  should suspend active user
  should reject non-active user

describe('unsuspendUser')
  should unsuspend suspended user
  should reject non-suspended user

describe('lockUser')
  should lock active user with reason
  should reject non-active user

describe('unlockUser')
  should unlock locked user and clear lock fields
  should reject non-locked user

describe('setUserPassword')
  should hash and store password
  should reject invalid password length

describe('verifyUserPassword')
  should return true for correct password
  should return false for wrong password
  should return false for passwordless user

describe('clearUserPassword')
  should set password_hash to null

describe('markEmailVerified')
  should set email_verified to true and audit log

describe('recordLogin')
  should call updateLoginStats and invalidate cache

describe('findUserForOidc')
  should return active user
  should return null for non-active user
  should return null for non-existent user
```

#### account-finder.test.ts (~6 tests) — Updated

```
describe('findAccount')
  should return account for active user
  should return undefined for non-existent user
  should return undefined for non-active user
  should return claims based on scopes
  should parse space-separated scope string
  should handle empty scope string
```

#### routes.test.ts (~20 tests)

```
describe('user routes')
  describe('POST /')
    should create user and return 201
    should return 400 for invalid email
    should return 400 for duplicate email

  describe('GET /')
    should list users with pagination
    should filter by status
    should search by name/email

  describe('GET /:userId')
    should return user
    should return 404 for not found

  describe('PUT /:userId')
    should update user profile
    should return 404 for not found

  describe('POST /:userId/deactivate')
    should deactivate user and return 204

  describe('POST /:userId/suspend')
    should suspend user with reason

  describe('POST /:userId/lock')
    should lock user with reason
    should return 400 without reason

  describe('POST /:userId/unlock')
    should unlock user and return 204

  describe('POST /:userId/password')
    should set password and return 204
    should return 400 for invalid password

  describe('DELETE /:userId/password')
    should clear password and return 204

  describe('POST /:userId/verify-email')
    should verify email and return 204
```

## Test Data

### Fixtures Needed

```typescript
// Standard test user factory (similar to createTestOrg in org tests)
function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid-1',
    organizationId: 'org-uuid-1',
    email: 'john@example.com',
    emailVerified: false,
    hasPassword: true,
    passwordChangedAt: null,
    givenName: 'John',
    familyName: 'Doe',
    middleName: null,
    nickname: null,
    preferredUsername: null,
    profileUrl: null,
    pictureUrl: null,
    websiteUrl: null,
    gender: null,
    birthdate: null,
    zoneinfo: null,
    locale: null,
    phoneNumber: null,
    phoneNumberVerified: false,
    addressStreet: null,
    addressLocality: null,
    addressRegion: null,
    addressPostalCode: null,
    addressCountry: null,
    status: 'active',
    lockedAt: null,
    lockedReason: null,
    lastLoginAt: null,
    loginCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
```

### Mock Requirements

Following the project's existing test patterns (same as organization tests):
- Mock `src/users/repository.js` for service tests
- Mock `src/users/cache.js` for service tests
- Mock `src/lib/audit-log.js` for service tests
- Mock `src/lib/database.js` (getPool) for repository tests
- Mock `src/lib/redis.js` (getRedis) for cache tests
- Mock `src/users/service.js` for route tests
- Mock `argon2` for password tests (to avoid slow hashing in tests)

## Verification Checklist

- [ ] All unit tests pass
- [ ] No regressions in existing tests (organizations, clients, OIDC)
- [ ] Test coverage meets 90%+ goal for user module
- [ ] `yarn verify` passes (lint + build + test)
