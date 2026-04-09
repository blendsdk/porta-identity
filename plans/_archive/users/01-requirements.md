# Requirements: User Management

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-06](../../requirements/RD-06-user-management.md)

## Feature Overview

Implement the user management system for Porta v5. Users belong to exactly one organization, with email uniqueness enforced per-org (case-insensitive via CITEXT). The user profile follows OIDC Standard Claims (§5.1), including name, address, phone, and locale fields. Authentication supports both password (Argon2id) and passwordless modes. Accounts have a status lifecycle with auto-lock after excessive failed login attempts.

## Functional Requirements

### Must Have

- [ ] User CRUD operations (create, read, update, deactivate)
- [ ] Users scoped to exactly one organization (enforced by `organization_id` FK)
- [ ] Email uniqueness per organization (same email can exist in different orgs)
- [ ] Case-insensitive email handling (CITEXT column — already in migration)
- [ ] Full OIDC Standard Claims profile (OpenID Connect Core 1.0, §5.1)
- [ ] Password storage using Argon2id hashing
- [ ] Support for passwordless-only users (`password_hash` = NULL)
- [ ] Password validation: 8–128 characters, no complexity rules (NIST SP 800-63B)
- [ ] User status lifecycle: `active` → `inactive` / `suspended` / `locked`
- [ ] Email verification tracking (`email_verified` boolean)
- [ ] Login tracking (`last_login_at`, `login_count`)
- [ ] Account locking with reason (`locked_at`, `locked_reason`)
- [ ] User soft-delete (set status to `inactive`, don't hard-delete)
- [ ] OIDC claims building: scope-based mapping (profile, email, phone, address)
- [ ] Account finder integration with node-oidc-provider (upgrade existing stub)
- [ ] Admin API endpoints under `/api/admin/users` with super-admin authorization
- [ ] All operations audit-logged

### Should Have

- [ ] User search by email, name (within org scope)
- [ ] Pagination for user listing
- [ ] Phone number format validation (E.164)
- [ ] Locale validation (BCP 47)
- [ ] Timezone validation (IANA timezone database)

### Won't Have (Out of Scope for RD-06)

- Multi-org membership (user belongs to exactly one org)
- User self-registration (admin-created or invite-based only)
- Social login / external identity providers
- Multi-factor authentication (MFA) — RD-12
- User profile picture upload (URL-based only)
- Random password generation (users always set their own password)
- User invitation flow (token generation, email sending) — deferred to RD-07/RD-09
- Auto-lock after failed attempts (needs login flow from RD-07)
- Magic link token management — deferred to RD-07

## Technical Requirements

### Password Management

```
Argon2id Configuration:
- Library: argon2 (already in package.json)
- Type: argon2id
- Memory: 64 MB (library default — follows OWASP)
- Iterations: 3 (library default)
- Parallelism: 4 (library default)
- Salt: 16 bytes (auto-generated)
- Hash length: 32 bytes

Password Policy:
- Minimum: 8 characters
- Maximum: 128 characters
- No complexity requirements (NIST SP 800-63B)
```

### User Status Lifecycle

```
  active → suspended (admin suspend)
  active → locked (admin lock / auto-lock)
  active → inactive (admin deactivate / soft-delete)
  suspended → active (admin activate)
  locked → active (admin unlock)
  inactive → active (admin reactivate)
```

### OIDC Claims Mapping

| Scope      | Claims Returned                                                        |
| ---------- | ---------------------------------------------------------------------- |
| `openid`   | `sub`                                                                  |
| `profile`  | `name`, `given_name`, `family_name`, `middle_name`, `nickname`,        |
|            | `preferred_username`, `profile`, `picture`, `website`, `gender`,       |
|            | `birthdate`, `zoneinfo`, `locale`, `updated_at`                       |
| `email`    | `email`, `email_verified`                                              |
| `phone`    | `phone_number`, `phone_number_verified`                                |
| `address`  | `address` (structured object per OIDC §5.1.1)                         |

### Audit Events

| Event               | Event Type              | Category         |
| ------------------- | ----------------------- | ---------------- |
| User created        | `user.created`          | `admin`          |
| User updated        | `user.updated`          | `admin`          |
| User deactivated    | `user.deactivated`      | `admin`          |
| User reactivated    | `user.reactivated`      | `admin`          |
| User suspended      | `user.suspended`        | `admin`          |
| User locked         | `user.locked`           | `admin`          |
| User unlocked       | `user.unlocked`         | `admin`          |
| Password set        | `user.password.set`     | `admin`          |
| Password cleared    | `user.password.cleared` | `admin`          |
| Email verified      | `user.email.verified`   | `authentication` |

## Scope Decisions

| Decision           | Options Considered                     | Chosen              | Rationale                                    |
| ------------------ | -------------------------------------- | ------------------- | -------------------------------------------- |
| Password hashing   | bcrypt, scrypt, argon2id               | Argon2id            | OWASP recommended, memory-hard, GPU-resistant |
| Password policy    | Complexity rules, length-only          | Length-only (8–128) | NIST SP 800-63B recommendation               |
| Email case         | Case-sensitive, case-insensitive       | Case-insensitive    | CITEXT column, standard practice             |
| User identifier    | Email, UUID, sequential                | UUID                | Stable, no PII leakage, standard             |
| Soft delete        | Boolean flag, status-based, hard delete | Status (`inactive`) | Reversible, auditable                        |
| Cache key strategy | By ID, By email, Both                  | By ID only          | Simpler, email lookups less frequent         |
| Invitation flow    | Include in RD-06, Defer               | Defer to RD-07/RD-09| Needs email sending (not yet available)      |

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
12. [ ] Login tracking updates `last_login_at` and `login_count`
13. [ ] User search works by email, given_name, family_name
14. [ ] Pagination works for user listing
15. [ ] All user operations are audit-logged
16. [ ] `findAccount` integration works with node-oidc-provider
17. [ ] All tests pass with `yarn verify`
