# Porta v5 — Data Model

> **Part of:** [OVERVIEW.md](./OVERVIEW.md)
> **Section:** §6 Data Model
> **Version**: 0.10.0

---

## Table of Contents

- [Entity Relationship Overview](#entity-relationship-overview)
- [Tables](#tables)
- [Foreign Key Cascade / Deletion Behavior](#foreign-key-cascade--deletion-behavior)
- [Database Index Strategy](#database-index-strategy)

---

## Entity Relationship Overview

```
organizations ──< organization_applications >──── applications ──< permissions
     │                                                │                │
     │                                                │                │
     │                                                ├──< roles ──────┤ (role_permissions)
     │                                                │
     ├──< organization_members >──── users            │
     │                                 │              │
     │                                 │              │
     └──< oidc_clients >──────────────┼──────────────┘
     │                                 │
     │                                 │
     └──< user_org_app_roles >────────┘
                │
                └──> roles

     users ──< magic_links
            ──< mfa_backup_codes
            ──< invitations (org-scoped)

     signing_keys (encrypted at rest)
     audit_log
     admin_api_keys
```

---

## Tables

### `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | User identifier |
| `email` | TEXT | UNIQUE, NOT NULL | Email address (login identifier) |
| `email_verified` | BOOLEAN | DEFAULT false | Email verification status |
| `password_hash` | TEXT | NULLABLE | Argon2id hash (NULL for passwordless users) |
| `display_name` | TEXT | | Full display name |
| `first_name` | TEXT | | Given name |
| `last_name` | TEXT | | Family name |
| `phone` | TEXT | | Phone number |
| `avatar_url` | TEXT | | Profile picture URL |
| `auth_method` | TEXT | DEFAULT 'password' | Preferred auth: 'password', 'magic_link', 'both' |
| `mfa_secret` | TEXT | NULLABLE | TOTP secret (encrypted at rest) |
| `mfa_enabled` | BOOLEAN | DEFAULT false | Whether MFA is active |
| `status` | TEXT | DEFAULT 'active' | 'active', 'suspended', 'locked' |
| `failed_logins` | INT | DEFAULT 0 | Failed login attempt counter |
| `locale` | TEXT | DEFAULT 'en' | Preferred locale (BCP 47 language tag, e.g., 'en', 'nl') |
| `locked_until` | TIMESTAMPTZ | NULLABLE | Account lockout expiry |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

### `organizations`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Organization identifier |
| `slug` | TEXT | UNIQUE, NOT NULL | URL-friendly identifier (e.g., "company-a") |
| `name` | TEXT | NOT NULL | Display name |
| `description` | TEXT | | |
| `logo_url` | TEXT | | Organization logo |
| `status` | TEXT | DEFAULT 'active' | 'active', 'suspended' |
| `system` | BOOLEAN | DEFAULT false | `true` for protected entities (e.g., `porta-system`); cannot be deleted via API |
| `settings` | JSONB | DEFAULT '{}' | Org-level settings (includes `default_locale` in Phase 2) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

**Organization settings JSONB structure (Phase 2):**
```json
{
  "default_locale": "nl"
}
```

### `organization_members`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `organization_id` | UUID | FK → organizations(id), PK | |
| `user_id` | UUID | FK → users(id), PK | |
| `org_role` | TEXT | DEFAULT 'member', NOT NULL | 'owner', 'admin', 'member' |
| `joined_at` | TIMESTAMPTZ | DEFAULT now() | |

### `applications`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Application identifier — user-provided slug (lowercase alphanumeric + hyphens, 3-64 chars, must start with a letter, immutable after creation). e.g., `"app-crm"`, `"porta-admin"` |
| `name` | TEXT | NOT NULL | Display name |
| `description` | TEXT | | |
| `icon_url` | TEXT | | Application icon |
| `homepage_url` | TEXT | | Application homepage |
| `owner_id` | UUID | FK → users(id), NULLABLE | Application owner (informational in MVP; used for Phase 2 org-admin delegation). ON DELETE SET NULL |
| `status` | TEXT | DEFAULT 'active' | 'active', 'disabled' |
| `system` | BOOLEAN | DEFAULT false | `true` for protected entities (e.g., `porta-admin`); cannot be deleted via API |
| `settings` | JSONB | DEFAULT '{}' | Application-level settings |
| `branding` | JSONB | DEFAULT '{}' | Branding config (see below) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

**Branding JSONB structure:**
```json
{
  "logo_url": "https://example.com/logo.svg",
  "primary_color": "#1a73e8",
  "accent_color": "#ffffff",
  "background_color": "#f5f5f5",
  "custom_css": "/* optional custom CSS overrides */"
}
```

### `organization_applications`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `organization_id` | UUID | FK → organizations(id), PK | |
| `application_id` | TEXT | FK → applications(id), PK | |
| `enabled` | BOOLEAN | DEFAULT true | Whether this org has access to this app |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

### `permissions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `application_id` | TEXT | FK → applications(id), NOT NULL | |
| `name` | TEXT | NOT NULL | e.g., "documents:read" |
| `description` | TEXT | | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| | | UNIQUE(application_id, name) | |

### `roles`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `application_id` | TEXT | FK → applications(id), NOT NULL | |
| `name` | TEXT | NOT NULL | e.g., "editor" |
| `description` | TEXT | | |
| `is_default` | BOOLEAN | DEFAULT false | Auto-assigned to new users (column present in MVP; auto-assignment behavior implemented in Phase 2 per APP-06) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |
| | | UNIQUE(application_id, name) | |

### `role_permissions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `role_id` | UUID | FK → roles(id), PK | |
| `permission_id` | UUID | FK → permissions(id), PK | |

### `user_org_app_roles`

> User role assignments scoped to (organization, application).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | UUID | FK → users(id), PK | |
| `organization_id` | UUID | FK → organizations(id), PK | |
| `application_id` | TEXT | FK → applications(id), PK | |
| `role_id` | UUID | FK → roles(id), PK | |
| `assigned_at` | TIMESTAMPTZ | DEFAULT now() | |
| `assigned_by` | UUID | FK → users(id), NULLABLE | Who assigned the role. ON DELETE SET NULL |

### `oidc_clients`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | client_id — server-generated as `{application_id}-{nanoid(12)}` (e.g., `app-crm-aB3xK9mQ2pRw`) |
| `application_id` | TEXT | FK → applications(id), NOT NULL | |
| `organization_id` | UUID | FK → organizations(id), NOT NULL | Organization this client belongs to |
| `secret_hash` | TEXT | NULLABLE | SHA-256 hash of client_secret (NULL for public clients) |
| `payload` | JSONB | NOT NULL | oidc-provider client metadata (see key fields below) |
| `client_roles` | TEXT[] | DEFAULT '{}' | Role names for client_credentials grant (machine-to-machine) |
| `description` | TEXT | | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | Last modification timestamp |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**`oidc_clients.payload` key fields:**
The `payload` JSONB stores oidc-provider's client metadata. Key fields managed by Porta:

| Field | Type | Description |
|-------|------|-------------|
| `client_id` | string | Same as `oidc_clients.id` — duplicated for oidc-provider |
| `redirect_uris` | string[] | Allowed redirect URIs (exact match) |
| `grant_types` | string[] | e.g., `["authorization_code", "refresh_token"]` or `["client_credentials"]` |
| `response_types` | string[] | e.g., `["code"]` |
| `token_endpoint_auth_method` | string | `"none"` (public), `"client_secret_basic"`, `"client_secret_post"` |
| `scope` | string | Space-separated allowed scopes (e.g., `"openid profile email app:roles"`) |
| `post_logout_redirect_uris` | string[] | Allowed post-logout redirect URIs |
| `skipConsent` | boolean | Custom field: `true` for first-party, `false` for third-party (see [API-SURFACE.md §5.1 Consent Policy](./API-SURFACE.md#consent-policy)) |
| `client_name` | string | Display name shown on consent page |
| `logo_uri` | string | Client logo shown on consent page |
| `application_type` | string | `"web"` or `"native"` |

Additional fields may be present per oidc-provider's client metadata schema. The Admin API validates and maps user input to this JSONB on client creation/update.

### `email_verification_tokens`

> Single-use tokens for email address verification.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `user_id` | UUID | FK → users(id), NOT NULL | |
| `token_hash` | TEXT | UNIQUE, NOT NULL | SHA-256 of the verification token |
| `expires_at` | TIMESTAMPTZ | NOT NULL | |
| `used_at` | TIMESTAMPTZ | NULLABLE | NULL until consumed |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

### `password_reset_tokens`

> Single-use tokens for password reset flow.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `user_id` | UUID | FK → users(id), NOT NULL | |
| `token_hash` | TEXT | UNIQUE, NOT NULL | SHA-256 of the reset token |
| `expires_at` | TIMESTAMPTZ | NOT NULL | |
| `used_at` | TIMESTAMPTZ | NULLABLE | NULL until consumed |
| `ip_address` | INET | | Requestor IP |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

### `oidc_models`

> Generic storage for oidc-provider models (tokens, grants, sessions, etc.)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `model_name` | TEXT | PK | Model type (RefreshToken, Grant, etc.) |
| `id` | TEXT | PK | Model instance ID |
| `payload` | JSONB | NOT NULL | oidc-provider model data |
| `grant_id` | TEXT | NULLABLE, INDEXED | For revokeByGrantId |
| `user_code` | TEXT | NULLABLE, INDEXED | For device flow |
| `uid` | TEXT | NULLABLE, INDEXED | For session binding |
| `expires_at` | TIMESTAMPTZ | NULLABLE, INDEXED | Expiration time |
| `consumed_at` | TIMESTAMPTZ | NULLABLE | When consumed (auth codes) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

### `invitations`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `email` | TEXT | NOT NULL | Invitee email |
| `organization_id` | UUID | FK → organizations(id), NOT NULL | Target organization |
| `application_id` | TEXT | FK → applications(id), NOT NULL | Target application |
| `role_ids` | UUID[] | DEFAULT '{}' | Role UUIDs to assign on acceptance (resolved at invitation creation, validated at acceptance) |
| `token_hash` | TEXT | UNIQUE, NOT NULL | SHA-256 hash of invitation token |
| `invited_by` | UUID | FK → users(id), NULLABLE | Admin who sent it. ON DELETE SET NULL |
| `client_id` | TEXT | NULLABLE | Which client initiated (metadata only, no FK constraint) |
| `message` | TEXT | NULLABLE | Custom message |
| `metadata` | JSONB | DEFAULT '{}' | Pass-through data |
| `status` | TEXT | DEFAULT 'pending' | 'pending', 'accepted', 'expired', 'revoked' |
| `expires_at` | TIMESTAMPTZ | NOT NULL | |
| `user_id` | UUID | FK → users(id), NULLABLE | Set when accepted |
| `accepted_at` | TIMESTAMPTZ | NULLABLE | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

### `magic_links`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `user_id` | UUID | FK → users(id), NOT NULL | |
| `interaction_uid` | TEXT | NOT NULL | OIDC interaction this belongs to |
| `token_hash` | TEXT | UNIQUE, NOT NULL | SHA-256 of the magic token |
| `expires_at` | TIMESTAMPTZ | NOT NULL | |
| `used_at` | TIMESTAMPTZ | NULLABLE | NULL until consumed |
| `ip_address` | INET | | Requestor IP |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

### `mfa_backup_codes`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `user_id` | UUID | FK → users(id), NOT NULL | |
| `code_hash` | TEXT | NOT NULL | SHA-256 of the backup code |
| `used_at` | TIMESTAMPTZ | NULLABLE | NULL until consumed |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

### `signing_keys`

> OIDC signing keys stored encrypted. Used for JWKS and token signing.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Key ID (kid) — UUID v4 string generated at key creation time |
| `algorithm` | TEXT | NOT NULL | Signing algorithm (e.g., "RS256", "ES256") |
| `private_key_enc` | TEXT | NOT NULL | AES-256-GCM encrypted private key PEM |
| `public_key` | TEXT | NOT NULL | Public key PEM (not encrypted) |
| `status` | TEXT | DEFAULT 'active', NOT NULL | 'active', 'rotated', 'retired' |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `rotated_at` | TIMESTAMPTZ | NULLABLE | When this key was replaced by a new active key |
| `expires_at` | TIMESTAMPTZ | NULLABLE | When to remove from JWKS (overlap period end) |

### `admin_api_keys`

> Static API keys for admin API access (automation, CI/CD).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `name` | TEXT | NOT NULL | Human-readable key name (e.g., "CI Pipeline") |
| `key_hash` | TEXT | UNIQUE, NOT NULL | SHA-256 hash of the API key |
| `key_prefix` | TEXT | NOT NULL | First 8 chars of key (for identification) |
| `scopes` | TEXT[] | DEFAULT '{*}' | Allowed scopes (Phase 2: fine-grained). In MVP, all keys have full access — scopes are not checked |
| `revoked_at` | TIMESTAMPTZ | NULLABLE | Set when key is revoked via `DELETE /api/admin/api-keys/:id`. Key lookup must check `revoked_at IS NULL` |
| `last_used_at` | TIMESTAMPTZ | NULLABLE | |
| `created_by` | UUID | FK → users(id), NULLABLE | |
| `expires_at` | TIMESTAMPTZ | NULLABLE | Optional expiry |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

### `audit_log`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PK | |
| `event_type` | TEXT | NOT NULL | Event category (see [FEATURES.md §4.12 Audit Event Catalog](./FEATURES.md#audit-event-type-catalog)) |
| `user_id` | UUID | FK → users(id), NULLABLE | ON DELETE SET NULL |
| `client_id` | TEXT | NULLABLE | Metadata only (no FK — clients may be deleted) |
| `organization_id` | UUID | FK → organizations(id), NULLABLE | ON DELETE SET NULL |
| `application_id` | TEXT | FK → applications(id), NULLABLE | ON DELETE SET NULL |
| `ip_address` | INET | | |
| `user_agent` | TEXT | | |
| `details` | JSONB | | Additional event data |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

---

## Foreign Key Cascade / Deletion Behavior

> Defines what happens when a parent entity is deleted via the Admin API.

| Parent Deleted | Child Table | Behavior | Rationale |
|----------------|-------------|----------|-----------|
| `organizations` | `organization_members` | CASCADE | Members are meaningless without the org |
| `organizations` | `organization_applications` | CASCADE | Subscriptions belong to the org |
| `organizations` | `oidc_clients` | CASCADE | Clients are org-scoped |
| `organizations` | `user_org_app_roles` | CASCADE | Role assignments are org-scoped |
| `organizations` | `invitations` | CASCADE | Invitations are org-scoped |
| `organizations` | `audit_log.organization_id` | SET NULL | Preserve audit history |
| `applications` | `permissions` | CASCADE | Permissions belong to the app |
| `applications` | `roles` | CASCADE | Roles belong to the app |
| `applications` | `organization_applications` | CASCADE | Subscriptions reference the app |
| `applications` | `oidc_clients` | RESTRICT | Must remove clients first (prevent orphan tokens) |
| `applications` | `user_org_app_roles` | CASCADE | Role assignments reference the app |
| `applications` | `invitations` | CASCADE | Invitations reference the app |
| `users` | `organization_members` | CASCADE | Memberships are user-specific |
| `users` | `user_org_app_roles` | CASCADE | Role assignments are user-specific |
| `users` | `magic_links` | CASCADE | Magic links are user-specific |
| `users` | `mfa_backup_codes` | CASCADE | Backup codes are user-specific |
| `users` | `email_verification_tokens` | CASCADE | Tokens are user-specific |
| `users` | `password_reset_tokens` | CASCADE | Tokens are user-specific |
| `users` | `audit_log.user_id` | SET NULL | Preserve audit history |
| `users` | `invitations.user_id` | SET NULL | Preserve invitation record |
| `users` | `invitations.invited_by` | SET NULL | Preserve invitation record |
| `users` | `user_org_app_roles.assigned_by` | SET NULL | Preserve assignment record |
| `users` | `applications.owner_id` | SET NULL | Preserve application record |
| `users` | `admin_api_keys.created_by` | SET NULL | Preserve API key record |
| `applications` | `audit_log.application_id` | SET NULL | Preserve audit history |
| `roles` | `role_permissions` | CASCADE | Permission links are role-specific |
| `roles` | `user_org_app_roles` | CASCADE | Assignments reference the role |

**Admin API enforcement:** DELETE endpoints must validate preconditions before deletion (e.g., return 422 if deleting an organization with active clients when RESTRICT is set). The API returns a descriptive error listing what must be removed first.

---

## Database Index Strategy

> Indexes beyond primary keys and unique constraints. Required for production query performance.

| Table | Index | Columns | Type | Rationale |
|-------|-------|---------|------|-----------|
| `users` | `idx_users_email` | `email` | UNIQUE (already via constraint) | Login lookup |
| `users` | `idx_users_status` | `status` | B-tree | Filter active/suspended/locked users |
| `organization_members` | `idx_org_members_user` | `user_id` | B-tree | "List user's organizations" query |
| `organization_applications` | `idx_org_apps_app` | `application_id` | B-tree | "List orgs using this app" query |
| `oidc_clients` | `idx_clients_org_app` | `(organization_id, application_id)` | Composite B-tree | List clients for org+app |
| `user_org_app_roles` | `idx_uoar_user` | `user_id` | B-tree | "List user's roles across all orgs/apps" |
| `user_org_app_roles` | `idx_uoar_org_app` | `(organization_id, application_id)` | Composite B-tree | "List users with roles for org+app" |
| `invitations` | `idx_invitations_token` | `token_hash` | UNIQUE (already via constraint) | Token lookup on acceptance |
| `invitations` | `idx_invitations_org` | `organization_id` | B-tree | List invitations per org |
| `invitations` | `idx_invitations_email` | `email` | B-tree | Check existing invitations for user |
| `magic_links` | `idx_magic_links_token` | `token_hash` | UNIQUE (already via constraint) | Token lookup |
| `magic_links` | `idx_magic_links_user` | `user_id` | B-tree | Rate limit check per user |
| `email_verification_tokens` | `idx_evt_token` | `token_hash` | UNIQUE (already via constraint) | Token lookup |
| `password_reset_tokens` | `idx_prt_token` | `token_hash` | UNIQUE (already via constraint) | Token lookup |
| `admin_api_keys` | `idx_api_keys_hash` | `key_hash` | UNIQUE (already via constraint) | Key lookup on each request |
| `audit_log` | `idx_audit_type_created` | `(event_type, created_at)` | Composite B-tree | Filter by event type + date range |
| `audit_log` | `idx_audit_user` | `user_id` | B-tree | Filter audit by user |
| `audit_log` | `idx_audit_org` | `organization_id` | B-tree | Filter audit by organization |
| `audit_log` | `idx_audit_created` | `created_at` | B-tree | Date range queries, retention cleanup |
| `oidc_models` | `idx_oidc_models_grant` | `grant_id` | B-tree (already noted) | revokeByGrantId |
| `oidc_models` | `idx_oidc_models_uid` | `uid` | B-tree (already noted) | Session binding |
| `oidc_models` | `idx_oidc_models_expires` | `expires_at` | B-tree (already noted) | Cleanup expired models |

**Partial indexes (optimization):**
- `idx_invitations_pending` on `invitations(email)` WHERE `status = 'pending'` — fast lookup of active invitations
- `idx_oidc_models_active` on `oidc_models(expires_at)` WHERE `expires_at IS NOT NULL` — cleanup queries skip permanent records

---

## oidc_models Model Names

> The `model_name` column in `oidc_models` stores the oidc-provider model type. Models are split between PostgreSQL and Redis based on their lifecycle.

| Model Name | Storage | TTL Source | Notes |
|------------|---------|-----------|-------|
| `AccessToken` | Redis | `ACCESS_TOKEN_TTL` | Short-lived, high-frequency |
| `AuthorizationCode` | Redis | 60 seconds (oidc-provider default) | Very short-lived |
| `ReplayDetection` | Redis | Matches related token TTL | Replay tracking |
| `Session` | Redis | `SESSION_TTL` | Cookie session data |
| `Interaction` | Redis | `INTERACTION_TTL` | Login/consent flow state |
| `RefreshToken` | PostgreSQL | `REFRESH_TOKEN_TTL` | Long-lived, must persist |
| `Grant` | PostgreSQL | No TTL (persists until revoked) | User consent records |
| `ClientCredentials` | PostgreSQL | `ACCESS_TOKEN_TTL` | Machine-to-machine tokens |
| `DeviceCode` | Redis | Phase 2 (RFC 8628) | Device authorization flow |
