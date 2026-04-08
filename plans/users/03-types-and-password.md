# Types & Password: User Management

> **Document**: 03-types-and-password.md
> **Parent**: [Index](00-index.md)

## Overview

Defines the user data model (types, row mapping) and password management utilities (Argon2id hash/verify, validation). These are the foundational building blocks that all other user module files depend on.

## Architecture

### Files

| File | Purpose | ~Lines |
| --- | --- | --- |
| `src/users/types.ts` | User types, status, input types, row mapping | ~200 |
| `src/users/errors.ts` | Domain error classes | ~35 |
| `src/users/password.ts` | Argon2id hash/verify, password validation | ~80 |

## Implementation Details

### types.ts — User Types and Row Mapping

```typescript
// Status type — matches DB CHECK constraint
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'locked';

// Full user record (camelCase, maps from DB row)
export interface User {
  id: string;
  organizationId: string;

  // Authentication
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;           // Derived: password_hash IS NOT NULL
  passwordChangedAt: Date | null;

  // OIDC Standard Claims (§5.1)
  givenName: string | null;
  familyName: string | null;
  middleName: string | null;
  nickname: string | null;
  preferredUsername: string | null;
  profileUrl: string | null;
  pictureUrl: string | null;
  websiteUrl: string | null;
  gender: string | null;
  birthdate: string | null;       // ISO 8601 date (YYYY-MM-DD) as string
  zoneinfo: string | null;
  locale: string | null;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;

  // Address (OIDC §5.1.1)
  addressStreet: string | null;
  addressLocality: string | null;
  addressRegion: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;

  // Status & lifecycle
  status: UserStatus;
  lockedAt: Date | null;
  lockedReason: string | null;
  lastLoginAt: Date | null;
  loginCount: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// DB row (snake_case) — what comes back from pool.query
export interface UserRow {
  id: string;
  organization_id: string;
  email: string;
  email_verified: boolean;
  password_hash: string | null;      // Used to derive hasPassword
  password_changed_at: Date | null;
  given_name: string | null;
  family_name: string | null;
  middle_name: string | null;
  nickname: string | null;
  preferred_username: string | null;
  profile_url: string | null;
  picture_url: string | null;
  website_url: string | null;
  gender: string | null;
  birthdate: string | null;          // DATE column → string or Date depending on pg config
  zoneinfo: string | null;
  locale: string | null;
  phone_number: string | null;
  phone_number_verified: boolean;
  address_street: string | null;
  address_locality: string | null;
  address_region: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  status: string;
  locked_at: Date | null;
  locked_reason: string | null;
  last_login_at: Date | null;
  login_count: number;
  created_at: Date;
  updated_at: Date;
}

// mapRowToUser function — converts snake_case DB row to camelCase User
// Note: hasPassword is derived from password_hash IS NOT NULL
// Note: password_hash is NEVER exposed in the User interface

// CreateUserInput — required: organizationId, email; optional: password + all profile fields
// UpdateUserInput — all profile fields optional (nullable for clearing)
// AddressInput — all fields optional/nullable

// UserListOptions — orgId, page, pageSize, status?, search?, sortBy?, sortOrder?
```

**Key Design Decisions:**
- `hasPassword` is a derived boolean — `password_hash` is never exposed outside the repository layer
- `birthdate` is stored as `string | null` (not Date) because OIDC §5.1 specifies it as an ISO 8601 date string (YYYY-MM-DD)
- The `UserRow` includes `password_hash` for the repository to work with, but `User` replaces it with `hasPassword: boolean`
- `PaginatedResult<T>` is imported from the organizations module (already exported)

### errors.ts — Domain Errors

```typescript
// UserNotFoundError → maps to HTTP 404
export class UserNotFoundError extends Error {
  constructor(identifier: string) {
    super(`User not found: ${identifier}`);
    this.name = 'UserNotFoundError';
  }
}

// UserValidationError → maps to HTTP 400
export class UserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserValidationError';
  }
}
```

Follows identical pattern to `OrganizationNotFoundError` / `OrganizationValidationError`.

### password.ts — Password Management

```typescript
import * as argon2 from 'argon2';

// Password constraints (NIST SP 800-63B)
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// validatePassword(password) → { isValid, error? }
// - Checks min/max length
// - Returns validation result (no complexity rules per NIST)

// hashPassword(plaintext) → Argon2id hash string
// - Uses argon2.hash with type: argon2.argon2id
// - Library defaults for memory/iterations/parallelism (OWASP compliant)

// verifyPassword(hash, plaintext) → boolean
// - Uses argon2.verify
// - Returns false on any error (hash format, etc.)
```

**Follows same pattern as `src/clients/crypto.ts`** but with:
- Password-specific naming (not "secret")
- Validation function for length checking
- Exported constants for password constraints

## Error Handling

| Error Case | Handling Strategy |
| --- | --- |
| Invalid password length | Return validation result from `validatePassword()` |
| Argon2 hash failure | Propagate error (infrastructure failure) |
| Argon2 verify with invalid hash | Return `false` (catch error internally) |
| User not found | Throw `UserNotFoundError` |
| Duplicate email in org | Throw `UserValidationError` with clear message |
| Invalid status transition | Throw `UserValidationError` with current/target status |

## Testing Requirements

- **types.ts**: Test `mapRowToUser()` with complete row, null fields, all statuses
- **errors.ts**: Test error class names and messages
- **password.ts**: Test `validatePassword()` boundaries, `hashPassword()` produces valid hashes, `verifyPassword()` matches correctly, `verifyPassword()` rejects wrong password
