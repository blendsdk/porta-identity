# Catalog, Storage, and Runtime: PostgreSQL-Backed Global Configuration

> **Document**: 03-01-catalog-storage-runtime.md
> **Parent**: [Index](00-index.md)

## Overview

One immutable server catalog owns every public key, type, label, description, unit, default, range,
allowed value, group, and application mode. PostgreSQL owns current values. Runtime getters combine
the two without coercion and retain the existing 60-second cache. (AR-2–AR-5, AR-7–AR-9)

## Architecture

### Current Architecture

Historical migrations seed mixed JSONB types. Generic getters accept arbitrary keys and caller
fallbacks, while routes trust database metadata. Runtime consumers therefore can disagree with the
administrative surface.

### Proposed Changes

Add `packages/server/src/lib/system-config-catalog.ts` as the only runtime catalog. Keep the cache
and OIDC loader in `system-config.ts`, but replace coercing APIs with public-catalog getters and one
separately named internal-string reader for `super_admin_user_id`. Migration
`030_global_configuration_catalog.sql` writes the exact approved defaults and removes only the seven
obsolete public rows. (AR-2, AR-4, AR-5, AR-14)

## Implementation Details

### Catalog Types and Functions

```ts
export const SUPPORTED_LOCALES = ['en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type SystemConfigGroup = 'lifetimes' | 'rate-limits' | 'lockout' | 'general';
export type SystemConfigApplicationMode = 'runtime' | 'restart-required';
export type SystemConfigValueType = 'integer' | 'string';
export type SystemConfigValue = number | SupportedLocale;

export interface SystemConfigDefinition {
  readonly key: SystemConfigKey;
  readonly group: SystemConfigGroup;
  readonly label: string;
  readonly description: string;
  readonly valueType: SystemConfigValueType;
  readonly unit: 'seconds' | 'attempts' | 'days' | 'locale';
  readonly defaultValue: SystemConfigValue;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly allowedValues?: readonly SupportedLocale[];
  readonly applicationMode: SystemConfigApplicationMode;
}

export const SYSTEM_CONFIG_CATALOG: readonly SystemConfigDefinition[];
export function findSystemConfigDefinition(key: string): SystemConfigDefinition | undefined;
export function validateSystemConfigValue(
  definition: SystemConfigDefinition,
  value: unknown,
): SystemConfigValue | undefined;
```

The catalog order is the RD-03 table order. `SystemConfigKey` is the literal union derived from the
catalog. Validation accepts finite integers within inclusive boundaries or an exact supported-locale
string; it never coerces. (AR-2, AR-4, AR-7)

### Labels and Descriptions

| Key | Label | Description |
|---|---|---|
| `access_token_ttl` | Access token lifetime | How long newly issued access tokens remain valid. |
| `id_token_ttl` | ID token lifetime | How long newly issued ID tokens remain valid. |
| `refresh_token_ttl` | Refresh token lifetime | How long newly issued refresh tokens remain valid. |
| `authorization_code_ttl` | Authorization code lifetime | How long a newly issued authorization code remains valid. |
| `session_ttl` | Session lifetime | How long newly created OIDC sessions remain valid. |
| `magic_link_ttl` | Magic-link lifetime | How long a newly created magic-link token remains valid. |
| `password_reset_ttl` | Password-reset lifetime | How long a newly created password-reset token remains valid. |
| `invitation_ttl` | Invitation lifetime | How long a newly created user invitation remains valid. |
| `rate_limit_login_max` | Login attempt limit | Maximum login attempts allowed in one login window. |
| `rate_limit_login_window` | Login window | Window used to count login attempts. |
| `rate_limit_magic_link_max` | Magic-link request limit | Maximum magic-link requests allowed in one window. |
| `rate_limit_magic_link_window` | Magic-link request window | Window used to count magic-link requests. |
| `rate_limit_password_reset_max` | Password-reset request limit | Maximum password-reset requests allowed in one window. |
| `rate_limit_password_reset_window` | Password-reset request window | Window used to count password-reset requests. |
| `max_failed_logins` | Failed login limit | Failed login count that activates automatic lockout. |
| `lockout_duration_seconds` | Lockout duration | Duration applied when automatic lockout eligibility is checked. |
| `audit_retention_days` | Audit retention | Default number of days retained by audit cleanup. |
| `default_locale` | Default locale | Final locale fallback used by the authentication UI. |

The exact keys, values, units, ranges, groups, and modes remain owned by RD-03. (AR-17)

### Runtime Read Result

`system-config.ts` keeps cache entries for found values only and distinguishes `found`, `missing`,
and `unavailable` database results internally. Public catalog getters take only a catalog key; they
obtain the default and validation rule from the catalog. A valid cached value is returned until its
expiry. After expiry, a missing/invalid/unavailable value returns the catalog default and logs only:

```ts
{ event: 'system-config-fallback', key, reason: 'missing' | 'invalid' | 'unavailable' }
```

No raw error or stored value is logged. `clearSystemConfigCache()` remains the explicit local
invalidation function. Clearing replaces the active Map; each in-flight query retains its starting
Map so a read started before clearing cannot repopulate the replacement with stale policy. An
already-started read may finish with its old value. This is a direct local control, not a distributed
version protocol. (PF-003)

A small injectable clock or `now` parameter may be used inside the existing
module for deterministic cache tests; it must not become a new cache abstraction. (AR-3, AR-9,
AR-12, AR-14)

### Internal Row Boundary

`super_admin_user_id` is not a catalog key. `super-admin-protection.ts` uses an explicitly named
internal string reader so the public typed getters cannot accept internal or arbitrary keys. The
internal reader retains safe fallback behavior and never enters Admin projections. (AR-2, AR-9)

### Runtime Consumers

- OIDC startup uses the five restart-required catalog getters before provider construction.
- Recovery job processing reads the applicable TTL immediately before creating its artifact.
- Invitation creation reads `invitation_ttl` before calculating `expiresAt`.
- Login, magic-link, and password-reset limit loaders read catalog maxima/windows.
- Automatic lock checks read current `max_failed_logins` and `lockout_duration_seconds`.
- Audit cleanup uses `audit_retention_days` only when the request omits an explicit value.
- Locale resolution uses catalog `default_locale` as its final configured fallback.

Absolute token/session/invitation expiries and Redis window expiries are never rewritten. Existing
automatic locks use the current duration on their next eligibility check; changed maxima apply at
the next rate-limit decision. (AR-3, AR-8)

### Locale Completeness

The existing authentication namespaces become an exported immutable list used by initialization
and tests. Tests read every `locales/default/<locale>/<namespace>.json` for each
`SUPPORTED_LOCALES` entry. Adding a locale therefore requires both the allowlist and complete
resources. No runtime filesystem discovery is added. (AR-7)

### Migration 030

The Up section upserts all 18 canonical rows with native JSONB scalars and compatible metadata
columns, overwriting any prior canonical value. It then deletes exactly:
`login_rate_limit`, `lockout_duration`, `api_rate_limit`, `cookie_secure`, `magic_link_length`,
`require_pkce`, and `cors_max_age`. It does not touch `super_admin_user_id` or any unknown internal
row. The Down section is a documented no-op. Applied migrations remain unchanged. (AR-5)

## Error Handling

| Error Case | Handling Strategy | AR Ref |
|---|---|---|
| Runtime row missing | Return exact catalog default; fixed `missing` warning | AR-9, AR-12 |
| Runtime row has wrong type/range | Return exact catalog default; fixed `invalid` warning | AR-2, AR-9, AR-12 |
| Runtime database query fails | Use unexpired cache when available, otherwise default; fixed `unavailable` warning | AR-3, AR-9, AR-12 |
| Locale resource missing | Specification fails; locale is not safely supportable | AR-7 |
| Migration runs over development values | Canonical public values are intentionally reset | AR-5 |

## Testing Requirements

- Exact catalog and locale-resource specification tests.
- Migration unit contract plus scratch-database integration coverage.
- Deterministic cache, fallback-warning, startup TTL, and runtime-consumer specifications.
- Implementation tests for cache edges and internal-row separation.
