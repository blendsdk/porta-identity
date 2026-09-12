# Organization State and Service: Organization Context and Navigation

> **Document**: 03-01-organization-state-and-service.md
> **Parent**: [Index](00-index.md)

## Overview

This component owns the UI-neutral trust boundary between live UserInfo/SDK data and application
state. It retains two capability booleans, validates the four fields used for organization context,
maps SDK failures to fixed local results, and never exposes raw server data. (AR-3, AR-6, AR-7)

## Architecture

### Current Architecture

`session-service.ts` converts UserInfo directly to `VerifiedIdentity`. Organization SDK calls are
made by other CLI commands but have no admin-UI-specific validation or public-error boundary.

### Proposed Changes

Add `packages/cli/src/admin/organization-service.ts` and extend the existing state/session/auth
types. The new module accepts an injected factory for the existing SDK organization domain; it does
not construct transports, read credentials, own presentation, or implement pagination. (AR-1,
AR-4)

## Implementation Details

### State Types

```ts
export interface AdminCapabilities {
  readonly canReadOrganizations: boolean;
  readonly canCreateOrganizations: boolean;
}

export interface AdminOrganizationContext {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: 'active' | 'suspended' | 'archived';
}

export type AdminOrganizationFailureKind =
  'validation' | 'unauthorized' | 'conflict' | 'unavailable' | 'invalid-response';

export type AdminOrganizationResult<T> =
  | { readonly kind: 'success'; readonly value: T }
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'failure'; readonly failure: AdminOrganizationFailureKind };

export type AdminOrganizationReconciliation =
  | { readonly kind: 'match'; readonly organization: AdminOrganizationContext }
  | { readonly kind: 'absent' }
  | { readonly kind: 'matching-invalid' }
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'failure'; readonly failure: AdminOrganizationFailureKind };
```

The authenticated connection state carries identity, capabilities, an optional selected
`AdminOrganizationContext`, and an optional fixed failure. A `createRecoveryRequired` boolean is
application-private operation state rather than persisted connection/profile data. (AR-7, AR-8)

### Capabilities

```ts
export function validateAdminCapabilities(roles: unknown, permissions: unknown): AdminCapabilities;
```

- Validate roles and permissions independently.
- A valid permissions array enables read/create only for exact, control-free strings within Porta's
  existing permission-slug bound.
- A separately valid roles array containing exact `porta-admin` enables both capabilities.
- Missing/malformed permissions disable ordinary permission-derived actions; malformed roles cannot
  invalidate otherwise valid permissions.
- Return booleans only. Never retain raw arrays in application or credential state. (AR-6)

`fetchVerifiedUserInfo()` returns a verified admin profile containing `identity` and `capabilities`.
`finishAuthentication()` stores only the existing identity subset in credentials while returning
both values to the running application. Stored-session verification recreates capabilities from the
fresh `/me` response. No credential-schema change occurs. (AR-4, AR-6)

### Organization Validation

```ts
export function validateOrganizationContext(value: unknown): AdminOrganizationContext | undefined;
```

Accept only:

- a UUID `id`;
- a control-free, server-bounded `name`;
- a control-free slug satisfying Porta's established slug expression and length;
- exact status `active`, `suspended`, or `archived`.

Discard every other SDK field. A malformed row invalidates the whole list operation; a malformed
create response becomes `invalid-response`. Safe row/display truncation remains presentation-owned.
(AR-7)

### Operations

```ts
export interface AdminOrganizationOperations {
  readonly listAll: () => Promise<AdminOrganizationResult<readonly AdminOrganizationContext[]>>;
  readonly reconcile: (selectedId: string) => Promise<AdminOrganizationReconciliation>;
  readonly create: (
    input: CreateOrganizationInput,
  ) => Promise<AdminOrganizationResult<AdminOrganizationContext>>;
}

export function createAdminOrganizationOperations(
  domain: () => Pick<OrganizationsDomain, 'listAll' | 'create'>,
): AdminOrganizationOperations;
```

- `listAll()` calls the existing SDK method once, validates every returned row, preserves its order,
  and publishes only a complete validated list. (AR-2)
- `reconcile(selectedId)` calls the same SDK method once and returns only a sanitized match, absence,
  malformed matching row, or fixed failure. Duplicate matching UUIDs and malformed unrelated rows
  return `invalid-response` and preserve the prior selection. Failures thrown before `listAll()`
  returns are `unavailable`, because the unchanged SDK does not expose malformed page envelopes
  separately from transport/unclassified failures. No partial or raw data is exposed.
- `create()` forwards only `name`, non-empty optional `slug`, and non-empty optional
  `defaultLocale`; it validates the returned context projection.
- The wrapper does not retry. The existing SDK transport may perform its one definite-401 refresh
  replay before returning.
- Logical cancellation is application-owned: the wrapper promise may complete, but only its current
  operation owner may publish a result. (AR-8)

### Failure Mapping

| SDK/result condition                                  | Internal result             | Fixed displayed category            | AR Ref     |
| ----------------------------------------------------- | --------------------------- | ----------------------------------- | ---------- |
| Local or SDK 400 validation                           | `failure: validation`       | `Validation failed`                 | AR-3       |
| SDK 401 after refresh handling                        | `session-invalid`           | RD-01 authentication-required state | AR-6, AR-8 |
| SDK 403                                               | `failure: unauthorized`     | `Not authorized`                    | AR-3, AR-6 |
| SDK 409                                               | `failure: conflict`         | `Conflict`                          | AR-3       |
| Invalid list/create response                          | `failure: invalid-response` | `Invalid server response`           | AR-3, AR-7 |
| Rate limit, 5xx, network, or unclassified SDK failure | `failure: unavailable`      | `Service unavailable`               | AR-3       |

Raw error messages, bodies, headers, paths, and stacks never cross the wrapper result.

## Integration Points

- `session-service.ts` calls `validateAdminCapabilities()` from the same live UserInfo object used
  for subject continuity.
- `login-coordinator.ts` returns capabilities to the running application but leaves
  `AuthFlowResult.userInfo` unchanged.
- `application.ts` owns selection and recovery flags; `presentation.ts` consumes only validated
  state.
- `commands/admin.ts` supplies a lazy factory backed by unchanged `createClient()`.

## Testing Requirements

- Capability independence, legacy role, malformed values, and non-persistence.
- Complete order-preserving list validation and all-or-nothing malformed-list behavior.
- Reconciliation refresh, absence, malformed-match clearing, and unrelated-malformation preservation.
- Create payload omission, response projection, typed error classification, and raw-detail
  suppression.
- No SDK source or public contract change. (AR-4)
