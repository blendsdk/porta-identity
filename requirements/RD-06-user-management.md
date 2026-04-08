# RD-06: User Management

> **Document**: RD-06-user-management.md
> **Status**: Draft
> **Created**: 2026-04-08
> **Project**: Porta v5 — OIDC Provider
> **Depends On**: RD-02 (Database Schema), RD-04 (Organization Management)

---

## Feature Overview

Implement the user management system for Porta v5. Users are global entities that belong to exactly one organization. The user profile follows the OpenID Connect Standard Claims specification (§5.1). Users can authenticate via password or passwordless (magic link) methods, and their accounts have a defined status lifecycle.

---

## Functional Requirements

### Must Have

- [ ] User CRUD operations (create, read, update, deactivate)
- [ ] Users scoped to exactly one organization (enforced by `organization_id` FK)
- [ ] Email uniqueness per organization (same email can exist in different orgs)
- [ ] Case-insensitive email handling (CITEXT column)
- [ ] Full OIDC Standard Claims profile (OpenID Connect Core 1.0, §5.1)
- [ ] Password storage using Argon2id hashing
- [ ] Support for passwordless-only users (`password_hash` = NULL)
- [ ] User status lifecycle: `active` → `inactive` / `suspended` / `locked`
- [ ] Email verification tracking (`email_verified` boolean)
- [ ] Login tracking (`last_login_at`, `login_count`)
- [ ] Account locking with reason (`locked_at`, `locked_reason`)
- [ ] User soft-delete (set status to `inactive`, don't hard-delete)

### Should Have

- [ ] User search by email, name (within org scope)
- [ ] Pagination for user listing
- [ ] Bulk user import (CSV or JSON, via CLI)
- [ ] User profile completeness indicator
- [ ] Phone number format validation (E.164)
- [ ] Locale validation (BCP 47)
- [ ] Timezone validation (IANA timezone database)

### Must Have — User Invitation (Onboarding)

- [ ] User creation via CLI sends invitation email by default
- [ ] Invitation email contains a "Set up your account" link (token-based, 7-day expiry)
- [ ] Invitation token stored as SHA-256 hash in `invitation_tokens` table
- [ ] Invitation token is single-use and expires per `system_config.invitation_token_ttl` (default 7 days)
- [ ] Accept invite page: user sets their own password (no random passwords generated)
- [ ] On invite acceptance: password is hashed, email is verified, token is consumed
- [ ] `--no-notify` flag on `porta user create` to skip sending invitation email
- [ ] `--passwordless` flag on `porta user create` to send welcome email instead of invite
- [ ] `porta user invite <id>` command to re-send invitation (generates new token, invalidates old)
- [ ] Users created without password (`password_hash = NULL`) can still log in via magic link

### Should Have — User Invitation

- [ ] Bulk user import via CLI with optional `--send-invites` flag
- [ ] Invitation status tracking (pending, accepted, expired)
- [ ] Invitation expiry notification (reminder email before expiry)

### Won't Have (Out of Scope)

- Multi-org membership (user belongs to exactly one org)
- User self-registration (admin-created or invite-based only)
- Social login / external identity providers
- Multi-factor authentication (MFA) — may add later
- User profile picture upload (URL-based only)
- Random password generation (users always set their own password)

---

## Technical Requirements

### User Service

```typescript
interface UserService {
  // CRUD
  create(data: CreateUserInput): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(orgId: string, email: string): Promise<User | null>;
  update(id: string, data: UpdateUserInput): Promise<User>;
  deactivate(id: string): Promise<void>;
  reactivate(id: string): Promise<void>;

  // Listing
  listByOrganization(orgId: string, options: UserListOptions): Promise<PaginatedResult<User>>;

  // Status management
  suspend(id: string, reason?: string): Promise<void>;
  lock(id: string, reason: string): Promise<void>;
  unlock(id: string): Promise<void>;

  // Password management
  setPassword(id: string, password: string): Promise<void>;
  verifyPassword(id: string, password: string): Promise<boolean>;
  clearPassword(id: string): Promise<void>;  // Convert to passwordless-only

  // Email verification
  markEmailVerified(id: string): Promise<void>;
  markEmailUnverified(id: string): Promise<void>;

  // Login tracking
  recordLogin(id: string): Promise<void>;

  // OIDC integration
  findAccount(sub: string): Promise<OidcAccount | null>;
  buildClaims(user: User, scopes: string[]): OidcClaims;
}
```

### User Repository

```typescript
interface UserRepository {
  insert(user: InsertUser): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(orgId: string, email: string): Promise<User | null>;
  update(id: string, data: Partial<User>): Promise<User>;
  list(orgId: string, options: UserListOptions): Promise<PaginatedResult<User>>;
  countByOrganization(orgId: string): Promise<number>;
  emailExists(orgId: string, email: string): Promise<boolean>;
  updateLoginStats(id: string): Promise<void>;
}
```

### Data Types

```typescript
interface User {
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
  birthdate: string | null;       // ISO 8601 date string (YYYY-MM-DD)
  zoneinfo: string | null;        // IANA timezone (e.g., "Europe/Amsterdam")
  locale: string | null;          // BCP 47 (e.g., "nl-NL")
  phoneNumber: string | null;
  phoneNumberVerified: boolean;

  // Address (OIDC §5.1.1)
  addressStreet: string | null;
  addressLocality: string | null;
  addressRegion: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;  // ISO 3166-1 alpha-2

  // Status
  status: 'active' | 'inactive' | 'suspended' | 'locked';
  lockedAt: Date | null;
  lockedReason: string | null;
  lastLoginAt: Date | null;
  loginCount: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface CreateUserInput {
  organizationId: string;
  email: string;
  password?: string;              // Optional — if not set, user is passwordless-only
  givenName?: string;
  familyName?: string;
  middleName?: string;
  nickname?: string;
  preferredUsername?: string;
  profileUrl?: string;
  pictureUrl?: string;
  websiteUrl?: string;
  gender?: string;
  birthdate?: string;
  zoneinfo?: string;
  locale?: string;
  phoneNumber?: string;
  address?: AddressInput;
  emailVerified?: boolean;        // Default: false
}

interface UpdateUserInput {
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
  phoneNumberVerified?: boolean;
  address?: AddressInput | null;
}

interface AddressInput {
  street?: string | null;
  locality?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

interface UserListOptions {
  page: number;
  pageSize: number;
  status?: 'active' | 'inactive' | 'suspended' | 'locked';
  search?: string;                // Search by email, given_name, family_name
  sortBy?: 'email' | 'given_name' | 'family_name' | 'created_at' | 'last_login_at';
  sortOrder?: 'asc' | 'desc';
}
```

### OIDC Claims Building

Maps user profile to OIDC Standard Claims based on requested scopes:

```typescript
function buildClaims(user: User, scopes: string[]): OidcClaims {
  const claims: OidcClaims = { sub: user.id };

  if (scopes.includes('profile')) {
    // Derive "name" from given_name + family_name
    const nameParts = [user.givenName, user.middleName, user.familyName].filter(Boolean);
    claims.name = nameParts.length > 0 ? nameParts.join(' ') : undefined;
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
    claims.updated_at = Math.floor(user.updatedAt.getTime() / 1000); // Unix timestamp
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
```

### Password Management

```
Password Requirements:
- Minimum 8 characters
- Maximum 128 characters
- No complexity requirements (length > complexity per NIST SP 800-63B)
- Hashed with Argon2id:
  - Memory: 64 MB
  - Iterations: 3
  - Parallelism: 4
  - Salt: 16 bytes (auto-generated)
  - Hash length: 32 bytes

Password Verification:
1. Load user by org_id + email
2. Check user.status is 'active'
3. Check user.password_hash IS NOT NULL (has password set)
4. argon2.verify(user.password_hash, provided_password)
5. If match → return true, record login
6. If no match → return false, check lock policy
```

### Account Lock Policy

```
Auto-lock:
- After N failed login attempts (configurable via system_config: "max_login_attempts", default: 10)
  within a time window (configurable: "login_attempt_window", default: 15 minutes)
- Lock reason: "Too many failed login attempts"
- Rate limiting is the first defense (RD-07), auto-lock is the second

Manual lock:
- Admin can lock any user with a reason
- Lock reason: provided by admin

Unlock:
- Admin unlocks via CLI or API
- Resets failed attempt counter
- Audit logged
```

### User Status Lifecycle

```
  ┌──────────────────────────────────────────────────┐
  │                                                    │
  ▼                                                    │
┌──────────┐  suspend   ┌───────────┐   activate     │
│  active   │──────────▶│ suspended  │───────────────┘
└──────────┘           └───────────┘
  │    │
  │    │  lock (auto or manual)
  │    ▼
  │  ┌──────────┐  unlock
  │  │  locked   │──────────┐
  │  └──────────┘           │
  │                          ▼
  │  deactivate            active
  ▼
┌──────────┐  reactivate  ┌──────────┐
│ inactive  │◀─────────────│  active   │
└──────────┘              └──────────┘

Rules:
- active: Can log in normally
- suspended: Cannot log in, admin-initiated, reversible
- locked: Cannot log in, auto or admin-initiated, requires unlock
- inactive: Soft-deleted, cannot log in, can be reactivated by admin
```

### Audit Events

| Event | Event Type | Category |
|-------|-----------|----------|
| User created | `user.created` | `admin` |
| User updated | `user.updated` | `admin` |
| User deactivated | `user.deactivated` | `admin` |
| User reactivated | `user.reactivated` | `admin` |
| User suspended | `user.suspended` | `admin` |
| User locked (manual) | `user.locked` | `admin` |
| User locked (auto) | `user.locked.auto` | `security` |
| User unlocked | `user.unlocked` | `admin` |
| Password set | `user.password.set` | `admin` |
| Password changed | `user.password.changed` | `security` |
| Email verified | `user.email.verified` | `authentication` |

---

## Integration Points

### With RD-03 (OIDC Core)
- `findAccount` uses UserService to load user and build claims
- User `sub` claim is the user UUID
- Claims are built based on requested OIDC scopes

### With RD-04 (Organizations)
- Users belong to exactly one organization
- Organization suspend/archive affects user login ability

### With RD-07 (Auth Workflows)
- Password verification during login
- Email verification after magic link or registration
- Login tracking on successful authentication

### With RD-08 (RBAC & Custom Claims)
- Users are assigned roles (user_roles table)
- Custom claim values are per-user

### With RD-09 (CLI)
- CLI commands for user CRUD, password management, status changes

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Password hashing | bcrypt, scrypt, argon2id | Argon2id | OWASP recommended, memory-hard, GPU-resistant |
| Password policy | Complexity rules, length-only | Length-only (min 8) | NIST SP 800-63B recommendation |
| Email case | Case-sensitive, case-insensitive | Case-insensitive (CITEXT) | Standard practice, avoids user confusion |
| User identifier (sub) | Email, UUID, sequential | UUID | Stable, no PII leakage, standard |
| Soft delete | Boolean flag, status-based, hard delete | Status-based (`inactive`) | Reversible, auditable |
| Multi-org | Allow, deny | Deny (one org per user) | Simpler, matches user's SaaS model |

---

## Acceptance Criteria

1. [ ] User CRUD operations work correctly within organization scope
2. [ ] Email uniqueness is enforced per organization (case-insensitive)
3. [ ] Same email can exist in different organizations
4. [ ] Password is hashed with Argon2id and verified correctly
5. [ ] Passwordless users (no password_hash) can be created
6. [ ] All OIDC Standard Claims are stored and retrievable
7. [ ] Claims building correctly maps to OIDC spec based on scopes
8. [ ] `name` claim is derived from `given_name` + `family_name`
9. [ ] `address` claim is returned as structured object per OIDC spec
10. [ ] `updated_at` claim is Unix timestamp
11. [ ] User status lifecycle transitions work correctly
12. [ ] Account auto-lock triggers after configured failed attempts
13. [ ] Login tracking updates `last_login_at` and `login_count`
14. [ ] User search works by email, given_name, family_name
15. [ ] Pagination works for user listing
16. [ ] All user operations are audit-logged
17. [ ] `findAccount` integration works with node-oidc-provider
