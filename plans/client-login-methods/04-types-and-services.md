# Types, Repository & Service: Client Login Methods

> **Document**: 04-types-and-services.md
> **Parent**: [Index](00-index.md)

## Overview

This document specifies all TypeScript-level changes across the `organizations` and `clients` modules, plus the new `resolve-login-methods.ts` helper. It covers types, repositories, services, caches, and the OIDC integration point (`findForOidc()`).

## Architecture

### Changed Modules

```
src/
├── organizations/
│   ├── types.ts          ← add defaultLoginMethods + mapping
│   ├── repository.ts     ← INSERT/UPDATE/SELECT include new column
│   ├── service.ts        ← validate + audit log
│   └── cache.ts          ← (verify — no code change expected)
├── clients/
│   ├── types.ts          ← add LoginMethod type + loginMethods (nullable) + mapping
│   ├── repository.ts     ← INSERT/UPDATE/SELECT include new column
│   ├── service.ts        ← validate, expose raw value in findForOidc()
│   ├── cache.ts          ← (verify — no code change expected)
│   ├── resolve-login-methods.ts  ← **NEW** pure function
│   └── index.ts          ← barrel export
```

## Implementation Details

### New Types

#### `src/clients/types.ts` — add `LoginMethod` + extend interfaces

```typescript
/** Supported login methods — extensible union (future: 'sso', 'passkey') */
export type LoginMethod = 'password' | 'magic_link';

/** All currently valid values — used for runtime validation */
export const LOGIN_METHODS: readonly LoginMethod[] = ['password', 'magic_link'] as const;
```

Add to `Client` interface:

```typescript
export interface Client {
  // ... existing fields ...
  /** Login methods for this client. null = inherit from organization.defaultLoginMethods. */
  loginMethods: LoginMethod[] | null;
}
```

Add to `CreateClientInput`:

```typescript
export interface CreateClientInput {
  // ... existing fields ...
  /** Optional override — null/undefined means inherit from org default. */
  loginMethods?: LoginMethod[] | null;
}
```

Add to `UpdateClientInput`:

```typescript
export interface UpdateClientInput {
  // ... existing fields ...
  /**
   * null → reset to inherit, array → explicit override.
   * Sentinel approach: `undefined` on the input object means "don't change".
   * An explicit `null` means "clear override, inherit".
   */
  loginMethods?: LoginMethod[] | null;
}
```

Add to `ClientRow`:

```typescript
export interface ClientRow {
  // ... existing fields ...
  login_methods: string[] | null;
}
```

Update `mapRowToClient`:

```typescript
export function mapRowToClient(row: ClientRow): Client {
  return {
    // ... existing ...
    loginMethods: row.login_methods === null ? null : (row.login_methods as LoginMethod[]),
  };
}
```

#### `src/organizations/types.ts` — add `defaultLoginMethods`

Reuse the `LoginMethod` type by re-exporting it from `clients/types.ts`. To avoid a circular dependency between `organizations` and `clients`, we'll place `LoginMethod` in a neutral location:

**Decision:** Define `LoginMethod` and `LOGIN_METHODS` in `src/clients/types.ts` (primary owner). The `organizations` module imports it via a type-only import — `import type { LoginMethod } from '../clients/types.js';`. Type-only imports do not create runtime circular deps.

```typescript
import type { LoginMethod } from '../clients/types.js';

export interface Organization {
  // ... existing fields ...
  /** Default login methods for all clients in this org. Always non-empty. */
  defaultLoginMethods: LoginMethod[];
}

export interface CreateOrganizationInput {
  // ... existing fields ...
  defaultLoginMethods?: LoginMethod[];  // defaults to ['password', 'magic_link'] in the service
}

export interface UpdateOrganizationInput {
  // ... existing fields ...
  defaultLoginMethods?: LoginMethod[];
}

export interface OrganizationRow {
  // ... existing fields ...
  default_login_methods: string[];
}
```

Update `mapRowToOrganization`:

```typescript
export function mapRowToOrganization(row: OrganizationRow): Organization {
  return {
    // ... existing ...
    defaultLoginMethods: (row.default_login_methods ?? ['password', 'magic_link']) as LoginMethod[],
  };
}
```

### New File: `src/clients/resolve-login-methods.ts`

```typescript
/**
 * Login method resolution helper.
 *
 * Computes the effective login methods for a client by applying the
 * inheritance rule: if client.loginMethods is null, fall back to the
 * organization's defaultLoginMethods. Otherwise, use the client's explicit
 * override.
 *
 * This is the single source of truth for "which login methods apply here?"
 * and is used by:
 *   - the login interaction handler (to drive template rendering)
 *   - the POST /login and POST /magic-link handlers (to enforce)
 *   - the admin API + CLI (to display the resolved value)
 */

import type { Organization } from '../organizations/types.js';
import type { Client, LoginMethod } from './types.js';

/**
 * Resolve the effective login methods for a client.
 *
 * - If the client has explicit methods set (non-null, non-empty), use those.
 * - Otherwise, use the organization's default login methods.
 *
 * @param org - Organization owning the client
 * @param client - Client — either with its own `loginMethods` or null to inherit
 * @returns Non-empty array of login methods that apply to this client
 */
export function resolveLoginMethods(
  org: Pick<Organization, 'defaultLoginMethods'>,
  client: Pick<Client, 'loginMethods'>,
): LoginMethod[] {
  if (client.loginMethods !== null && client.loginMethods.length > 0) {
    return client.loginMethods;
  }
  return org.defaultLoginMethods;
}

/**
 * Normalize a list of login-method inputs — dedupe while preserving order.
 *
 * Duplicate values (e.g., `['password', 'password', 'magic_link']`) are
 * collapsed to the first occurrence. This is called by the service layer
 * during create/update to sanitize incoming arrays before persisting.
 *
 * @param methods - Raw input array (may have duplicates)
 * @returns De-duplicated array preserving first-occurrence order
 */
export function normalizeLoginMethods(methods: LoginMethod[]): LoginMethod[] {
  const seen = new Set<LoginMethod>();
  const result: LoginMethod[] = [];
  for (const m of methods) {
    if (!seen.has(m)) {
      seen.add(m);
      result.push(m);
    }
  }
  return result;
}
```

### Repository Changes

#### `src/organizations/repository.ts`

- `insertOrganization()` — add `default_login_methods` column + `$N` placeholder
- `updateOrganization()` — add case to the dynamic SET-clause builder for `defaultLoginMethods`
- `findOrganizationById()` / `findOrganizationBySlug()` / `listOrganizations()` — add `default_login_methods` to SELECT

#### `src/clients/repository.ts`

- `insertClient()` — add `login_methods` column + `$N` placeholder (value may be `null`)
- `updateClient()` — add case to the dynamic SET-clause builder for `loginMethods`. **Important:** `null` is a valid new value (explicit reset to inherit), so the builder must distinguish `undefined` (don't change) from `null` (set to NULL) from `[...]` (explicit override).
- `findClientById()` / `findClientByClientId()` / `listClients()` — add `login_methods` to SELECT

**Implementation note on the UPDATE builder:** Review the current dynamic SET-clause logic — most builders use `if (input.xxx !== undefined)`. That pattern works here too, because `undefined` = not in patch, `null` = set to NULL. Confirm when editing.

### Service Changes

#### `src/organizations/service.ts`

**`createOrganization()`**:
1. If `input.defaultLoginMethods` is provided, validate:
   - Non-empty
   - All values are in `LOGIN_METHODS`
   - Call `normalizeLoginMethods()` to dedupe
2. If not provided, pass `undefined` to the repo (DB DEFAULT kicks in)
3. Include in audit log metadata

**`updateOrganization()`**:
1. If `input.defaultLoginMethods` is provided, validate + normalize
2. Compute the diff vs. current org (to skip no-op writes and reduce audit noise)
3. Include old + new values in audit log metadata

**New validation helper (private):**
```typescript
function validateLoginMethodsArray(methods: LoginMethod[], context: string): LoginMethod[] {
  if (!Array.isArray(methods) || methods.length === 0) {
    throw new OrganizationValidationError(`${context}: must be a non-empty array`);
  }
  for (const m of methods) {
    if (!LOGIN_METHODS.includes(m)) {
      throw new OrganizationValidationError(`${context}: invalid method "${m}"`);
    }
  }
  return normalizeLoginMethods(methods);
}
```

#### `src/clients/service.ts`

**`createClient()`**:
1. If `input.loginMethods === undefined`, pass `null` to repo (will be NULL in DB → inherit)
2. If `input.loginMethods === null`, pass `null` to repo (explicit inherit — same as undefined)
3. If `input.loginMethods` is an array, validate (non-empty, valid values) + normalize

**`updateClient()`**:
1. If `input.loginMethods === undefined`, don't include in the UPDATE patch
2. If `input.loginMethods === null`, include `login_methods = NULL` in the UPDATE
3. If array, validate + normalize before UPDATE
4. Audit log includes old + new values

**`findForOidc()`** — expose the raw client value:

```typescript
const metadata: Record<string, unknown> = {
  // ... existing fields ...
  'urn:porta:allowed_origins': client.allowedOrigins,
  'urn:porta:client_type': client.clientType,
  // Expose raw login_methods (null = inherit). The resolver in showLogin()
  // applies the org default at render time.
  'urn:porta:login_methods': client.loginMethods,
  organizationId: client.organizationId,
};
```

**Note on null values in OIDC metadata:** node-oidc-provider preserves the value as-is (including `null`) when the key is declared in `extraClientMetadata.properties`. The interaction handler treats `null` correctly via the resolver.

### Cache Changes

#### `src/organizations/cache.ts` and `src/clients/cache.ts`

These use JSON-based Redis serialization. JSON preserves arrays and `null` natively, so **no code changes are needed**. However, we must verify via tests:

- Org cache roundtrip preserves `defaultLoginMethods` array
- Client cache roundtrip preserves `loginMethods` (both `null` and `['password']` cases)

Date-deserialization logic already exists in these caches for `createdAt`/`updatedAt` — the new fields don't need similar handling since they're plain arrays/null.

### Barrel Exports

#### `src/clients/index.ts` — add new exports

```typescript
export { resolveLoginMethods, normalizeLoginMethods } from './resolve-login-methods.js';
export type { LoginMethod } from './types.js';
export { LOGIN_METHODS } from './types.js';
```

## Integration Points

### How `findForOidc()` connects to `showLogin()`

```
┌──────────────────────┐
│ Admin saves client   │
│ with loginMethods    │
│ = ['magic_link']     │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ clients.repository   │
│ INSERT/UPDATE SQL    │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ clients.cache        │
│ (invalidate)         │
└──────────┬───────────┘
           ▼
Next OIDC authorization request:
           ▼
┌──────────────────────┐
│ adapter-factory      │
│ .find('Client', id)  │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ service.findForOidc  │
│ → metadata obj       │
│   includes           │
│   'urn:porta:        │
│   login_methods'     │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ OIDC provider stores │
│ client metadata      │
│ (extraClientMetadata │
│ preserves field)     │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ showLogin()          │
│ - provider.Client    │
│   .find(client_id)   │
│ - reads metadata     │
│ - looks up org       │
│ - resolveLoginMethods│
│ - renders login.hbs  │
└──────────────────────┘
```

## Code Examples

### Example 1: Create org with explicit methods

```typescript
const org = await createOrganization({
  name: 'Acme',
  slug: 'acme',
  defaultLoginMethods: ['password'],  // org-wide: only password
});
// org.defaultLoginMethods === ['password']
```

### Example 2: Create client that inherits

```typescript
const client = await createClient({
  organizationId: org.id,
  applicationId: app.id,
  clientName: 'Customer Portal',
  clientType: 'public',
  applicationType: 'spa',
  redirectUris: ['https://portal.acme.com/callback'],
  // loginMethods not specified → null in DB → inherits org default
});
// client.loginMethods === null
// resolveLoginMethods(org, client) === ['password']
```

### Example 3: Override a client

```typescript
await updateClient(client.id, { loginMethods: ['magic_link'] });
// client.loginMethods === ['magic_link']
// resolveLoginMethods(org, client) === ['magic_link']
```

### Example 4: Reset client to inherit

```typescript
await updateClient(client.id, { loginMethods: null });
// client.loginMethods === null
// resolveLoginMethods(org, client) === org.defaultLoginMethods
```

## Error Handling

| Error Case                                          | Handling Strategy                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `createOrganization` with empty array               | Service throws `OrganizationValidationError('defaultLoginMethods: must be a non-empty array')` |
| `createOrganization` with invalid method            | Service throws `OrganizationValidationError('defaultLoginMethods: invalid method "xyz"')` |
| `createClient` with empty array                     | Service throws `ClientValidationError('loginMethods: must be a non-empty array')` |
| `updateClient` with invalid method                  | Service throws `ClientValidationError('loginMethods: invalid method "xyz"')` |
| `mapRowToOrganization` with null `default_login_methods` (impossible per schema) | Defaults to `['password', 'magic_link']` for safety |
| `mapRowToClient` with undefined `login_methods` (old cache) | Normalized to `null` via `?? null` |

## Testing Requirements

- **`src/clients/types.ts`** — test `mapRowToClient` with all three shapes (null, empty array rejected by repo, non-empty array)
- **`src/clients/resolve-login-methods.ts`** — full test file:
  - `resolveLoginMethods` with client override (array)
  - `resolveLoginMethods` with null (inherit)
  - `resolveLoginMethods` with empty array on client (edge case — shouldn't happen, but test defensively)
  - `normalizeLoginMethods` with duplicates (dedupe preserves order)
  - `normalizeLoginMethods` with single item
  - `normalizeLoginMethods` with empty array (returns empty)
- **`src/organizations/types.test.ts`** — test `mapRowToOrganization` includes new field
- **`src/organizations/repository.test.ts`** — INSERT + UPDATE + SELECT roundtrip
- **`src/organizations/service.test.ts`** — validation error cases, normalization, audit log metadata
- **`src/clients/repository.test.ts`** — INSERT null + array, UPDATE with null (reset), UPDATE with array (override), UPDATE without (no change)
- **`src/clients/service.test.ts`** — all create/update paths; `findForOidc()` output includes `urn:porta:login_methods`
- **`src/clients/cache.test.ts`** — roundtrip preserves null + array
- **`src/organizations/cache.test.ts`** — roundtrip preserves array
