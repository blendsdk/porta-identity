# Authority Boundaries: Roles and Permissions

> **Document**: 03-01-authority-boundaries.md
> **Parent**: [Index](00-index.md)

## Overview

Separate application-owned authorization from Porta's control-plane authorization before exposing
RBAC editing. This changes existing queries and middleware directly; it adds no policy engine or
authorization service (AR-3, AR-8).

## OIDC Application Claims

`buildRoleClaims` and `buildPermissionClaims` receive `applicationId` and use application-qualified
repository queries. Roles remain ordered by existing display order; permissions remain deduplicated
and ordered by slug. Callers compare claim contents as sets where role display names tie.

```ts
buildRoleClaims(userId: string, applicationId: string): Promise<string[]>
buildPermissionClaims(userId: string, applicationId: string): Promise<string[]>
```

`findForOidc` copies the already-authoritative client/application foreign-key value into one
Porta-namespaced internal provider metadata property, and `extraClientMetadata` preserves that
property. `account-finder.ts` validates it before starting both RBAC queries. Only account claim
construction consumes it. Missing or malformed context returns empty `roles` and `permissions`
while retaining standard claims. Query failure retains the existing fixed failed-account behavior.
Global fallback is prohibited (AR-8, AR-12).

The internal application identifier never becomes an ID-token, UserInfo, introspection, discovery,
rendered login/consent/error, or log field. The logger redacts it as a backstop, but code never logs
the complete provider metadata object. A production-path specification covers metadata creation,
provider preservation, account consumption, and every public non-disclosure boundary (AR-12).

## Canonical Porta Admin Authority

Admin middleware joins assigned roles to the globally unique Application slug `porta-admin` and
accepts only code-defined built-in role slugs from that application. It resolves capabilities from
`ADMIN_ROLE_DEFINITIONS`; editable role-permission rows never expand Admin API authority. The legacy
`porta-admin` role, while retained, is subject to the same canonical-application provenance rule
(AR-3).

Assignment of a canonical Admin role succeeds only when every capability in its static definition
is present in the actor's current static capability set. A foreign application may reuse any role
slug but receives no Admin API significance. Existing organization-membership checks stay
authoritative.

Canonical built-in role and permission records and their role-permission mappings reject every
generic update or deletion. Reset/init is their sole writer. This single rule prevents descriptive
labels from diverging from static control-plane authority and avoids a field-specific exception
matrix (AR-3–AR-4, AR-15).

## Error Handling

| Error case                                  | Handling                                                       | AR Ref    |
| ------------------------------------------- | -------------------------------------------------------------- | --------- |
| Foreign `porta-*` role                      | Ignore for Admin capability resolution                         | AR-3      |
| Actor assigns stronger canonical role       | Sanitized `403`; no assignment or audit success                | AR-3      |
| Canonical identity/mapping mutation         | Sanitized `400` conflict-style validation outcome; no mutation | AR-3–AR-4 |
| Canonical metadata update                   | Same fixed rejection; no field-specific exceptions             | AR-15     |
| Missing/malformed claim application context | Standard claims plus empty RBAC arrays                         | AR-8      |
| RBAC claim query failure                    | Existing fixed account lookup failure                          | AR-8      |

## Testing Requirements

- Unit specifications for canonical provenance, legacy provenance, and the capability ceiling.
- Query/service specifications for application filtering and same-slug isolation.
- OIDC and penetration coverage proving foreign roles never cross either trust boundary and the
  internal application identifier never appears in a public authentication output or log.
- Retained protocol harness coverage for changed observable claims.
