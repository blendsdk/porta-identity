# Service & Claims: User Management

> **Document**: 05-service-and-claims.md
> **Parent**: [Index](00-index.md)

## Overview

The service layer orchestrates repository, cache, password utilities, and audit logging to provide the complete user management API. The claims module builds OIDC Standard Claims from user profiles based on requested scopes. The account finder is upgraded from stub to full implementation.

## Architecture

### Files

| File | Purpose | ~Lines |
| --- | --- | --- |
| `src/users/claims.ts` | OIDC Standard Claims builder | ~120 |
| `src/users/service.ts` | Business logic orchestrator | ~450 |
| `src/users/index.ts` | Barrel export (public API) | ~50 |
| `src/oidc/account-finder.ts` | Upgraded OIDC account finder | ~70 |

## Implementation Details

### claims.ts — OIDC Standard Claims Builder

```typescript
import type { User } from './types.js';

// OidcClaims type — flexible claims object
export interface OidcClaims {
  sub: string;
  [key: string]: unknown;
}

// OidcAddress — structured address per OIDC §5.1.1
export interface OidcAddress {
  street_address?: string | null;
  locality?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

/**
 * Build OIDC Standard Claims from a user profile based on granted scopes.
 *
 * Scope-to-claims mapping follows OpenID Connect Core 1.0, §5.4:
 * - openid: sub (always included)
 * - profile: name, given_name, family_name, middle_name, nickname,
 *            preferred_username, profile, picture, website, gender,
 *            birthdate, zoneinfo, locale, updated_at
 * - email: email, email_verified
 * - phone: phone_number, phone_number_verified
 * - address: address (structured object)
 */
export function buildUserClaims(user: User, scopes: string[]): OidcClaims {
  const claims: OidcClaims = { sub: user.id };

  if (scopes.includes('profile')) {
    // Derive "name" from given_name + middle_name + family_name
    const nameParts = [user.givenName, user.middleName, user.familyName].filter(Boolean);
    if (nameParts.length > 0) claims.name = nameParts.join(' ');

    claims.given_name = user.givenName;
    claims.family_name = user.familyName;
    claims.middle_name = user.middleName;
    claims.nickname = user.nickname;
    claims.preferred_username = user.preferredUsername;
    claims.profile = user.profileUrl;
    claims.picture = user.pictureUrl;
    claims.website = user.websiteUrl;
    claims.gender = user.gender;
    claims.birthdate = user.birthdate;
    claims.zoneinfo = user.zoneinfo;
    claims.locale = user.locale;
    // updated_at must be a Unix timestamp (seconds since epoch) per OIDC spec
    claims.updated_at = Math.floor(user.updatedAt.getTime() / 1000);
  }

  if (scopes.includes('email')) {
    claims.email = user.email;
    claims.email_verified = user.emailVerified;
  }

  if (scopes.includes('phone')) {
    claims.phone_number = user.phoneNumber;
    claims.phone_number_verified = user.phoneNumberVerified;
  }

  if (scopes.includes('address') && hasAddress(user)) {
    claims.address = {
      street_address: user.addressStreet,
      locality: user.addressLocality,
      region: user.addressRegion,
      postal_code: user.addressPostalCode,
      country: user.addressCountry,
    };
  }

  return claims;
}

// hasAddress helper — returns true if any address field is non-null
function hasAddress(user: User): boolean {
  return !!(
    user.addressStreet ||
    user.addressLocality ||
    user.addressRegion ||
    user.addressPostalCode ||
    user.addressCountry
  );
}
```

### service.ts — Business Logic

The service follows the same write pattern as organizations:
1. Validate inputs
2. Perform DB operation (via repository)
3. Invalidate + re-cache (via cache)
4. Write audit log (fire-and-forget)

#### CRUD Operations

```typescript
// createUser(input: CreateUserInput, actorId?: string): Promise<User>
// 1. Validate email doesn't exist in org (emailExists check)
// 2. If password provided, validate and hash it
// 3. Insert via repository
// 4. Cache the new user
// 5. Audit log: user.created

// getUserById(id: string): Promise<User | null>
// 1. Check cache first
// 2. Fall back to DB on miss
// 3. Cache on DB hit

// getUserByEmail(orgId: string, email: string): Promise<User | null>
// 1. Direct DB lookup (not cached by email — see cache design decision)

// updateUser(id: string, input: UpdateUserInput, actorId?: string): Promise<User>
// 1. Build update data from input
// 2. Update via repository
// 3. Invalidate + re-cache
// 4. Audit log: user.updated

// listUsersByOrganization(orgId: string, options: UserListOptions): Promise<PaginatedResult<User>>
// 1. Delegate to repository
```

#### Status Lifecycle

```typescript
// deactivateUser(id: string, actorId?: string): Promise<void>
// - Load user, verify status is not already 'inactive'
// - Update status to 'inactive'
// - Invalidate cache
// - Audit: user.deactivated

// reactivateUser(id: string, actorId?: string): Promise<void>
// - Load user, verify status is 'inactive'
// - Update status to 'active'
// - Invalidate cache
// - Audit: user.reactivated

// suspendUser(id: string, reason?: string, actorId?: string): Promise<void>
// - Load user, verify status is 'active'
// - Update status to 'suspended'
// - Invalidate cache
// - Audit: user.suspended (with reason)

// unsuspendUser(id: string, actorId?: string): Promise<void>
// - Load user, verify status is 'suspended'
// - Update status to 'active'
// - Invalidate cache
// - Audit: user.activated (from suspended)

// lockUser(id: string, reason: string, actorId?: string): Promise<void>
// - Load user, verify status is 'active'
// - Update status to 'locked', set lockedAt + lockedReason
// - Invalidate cache
// - Audit: user.locked

// unlockUser(id: string, actorId?: string): Promise<void>
// - Load user, verify status is 'locked'
// - Update status to 'active', clear lockedAt + lockedReason
// - Invalidate cache
// - Audit: user.unlocked
```

#### Password Management

```typescript
// setUserPassword(id: string, password: string, actorId?: string): Promise<void>
// 1. Validate password length
// 2. Hash with Argon2id
// 3. Update password_hash + password_changed_at via repository
// 4. Invalidate cache
// 5. Audit: user.password.set

// verifyUserPassword(id: string, password: string): Promise<boolean>
// 1. Get password hash from repository (getPasswordHash)
// 2. If no hash (passwordless user), return false
// 3. Verify with Argon2id
// 4. Return result (no audit — login tracking is separate)

// clearUserPassword(id: string, actorId?: string): Promise<void>
// 1. Update password_hash to NULL, clear password_changed_at
// 2. Invalidate cache
// 3. Audit: user.password.cleared
```

#### Email Verification

```typescript
// markEmailVerified(id: string, actorId?: string): Promise<void>
// - Update email_verified = true
// - Invalidate cache
// - Audit: user.email.verified

// markEmailUnverified(id: string): Promise<void>
// - Update email_verified = false
// - Invalidate cache
```

#### Login Tracking

```typescript
// recordLogin(id: string): Promise<void>
// - Call repository.updateLoginStats(id)
// - Invalidate cache (last_login_at changed)
```

#### OIDC Integration

```typescript
// findUserForOidc(sub: string): Promise<User | null>
// - Find by ID, only return if status is 'active'
// - Used by the upgraded account-finder.ts
```

### index.ts — Barrel Export

```typescript
// Types (type-only exports)
export type { User, UserRow, UserStatus, CreateUserInput, UpdateUserInput,
             AddressInput, UserListOptions } from './types.js';

// Service functions
export { createUser, getUserById, getUserByEmail, updateUser,
         listUsersByOrganization, deactivateUser, reactivateUser,
         suspendUser, unsuspendUser, lockUser, unlockUser,
         setUserPassword, verifyUserPassword, clearUserPassword,
         markEmailVerified, markEmailUnverified, recordLogin,
         findUserForOidc } from './service.js';

// Claims
export { buildUserClaims } from './claims.js';
export type { OidcClaims, OidcAddress } from './claims.js';

// Errors
export { UserNotFoundError, UserValidationError } from './errors.js';

// Password (for external consumers like CLI)
export { validatePassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from './password.js';
```

### account-finder.ts — Upgraded

```typescript
import { findUserForOidc } from '../users/service.js';
import { buildUserClaims } from '../users/claims.js';

export async function findAccount(_ctx: unknown, sub: string): Promise<OidcAccount | undefined> {
  const user = await findUserForOidc(sub);
  if (!user) return undefined;

  return {
    accountId: user.id,
    async claims(_use: string, scope: string) {
      // Parse scope string into array and build claims
      const scopes = scope ? scope.split(' ') : [];
      return buildUserClaims(user, scopes);
    },
  };
}
```

**Key change:** No more direct SQL queries. Delegates to user service for lookup and claims builder for scope-based claims mapping.

## Error Handling

| Error Case | Handling Strategy |
| --- | --- |
| User not found for status change | Throw `UserNotFoundError` |
| Invalid status transition | Throw `UserValidationError` with clear message |
| Duplicate email on create | Throw `UserValidationError("Email already exists in this organization")` |
| Invalid password length | Throw `UserValidationError` with min/max info |
| Password verify on passwordless user | Return `false` (no error) |
| Account finder lookup failure | Return `undefined`, log error |

## Testing Requirements

### claims.ts
- Returns sub for openid scope only
- Returns profile claims for profile scope
- Derives name from given_name + middle_name + family_name
- Returns email claims for email scope
- Returns phone claims for phone scope
- Returns address object for address scope (only when address fields exist)
- Returns empty address nothing when all address fields null
- updated_at is Unix timestamp
- Multiple scopes combine correctly
- Null profile fields are included as null (not omitted)

### service.ts
- CRUD: create, read by ID (cache hit/miss), read by email, update, list
- Status lifecycle: all valid transitions + all invalid transitions rejected
- Password: set, verify (correct/wrong/no-hash), clear
- Email verification: mark verified, mark unverified
- Login tracking: recordLogin calls updateLoginStats + invalidates cache
- Audit logging: every write operation logs correctly
- Duplicate email: rejected on create

### account-finder.ts (updated)
- Returns undefined for non-existent user
- Returns undefined for non-active user
- Returns account with claims() method
- Claims are scope-filtered correctly
