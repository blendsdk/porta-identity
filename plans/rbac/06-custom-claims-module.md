# Custom Claims Module: RBAC & Custom Claims

> **Document**: 06-custom-claims-module.md
> **Parent**: [Index](00-index.md)

## Overview

Implement the Custom Claims module — a self-contained module for managing per-application claim definitions and per-user claim values. This module is separate from the RBAC module because custom claims are conceptually distinct (arbitrary metadata vs. authorization roles/permissions) but both integrate into the same OIDC token claims flow.

## Architecture

### File Structure

```
src/custom-claims/
  types.ts        # CustomClaimDefinition, CustomClaimValue types, row mappers
  errors.ts       # ClaimNotFoundError, ClaimValidationError
  validators.ts   # Reserved claim name check, value type validation
  repository.ts   # PostgreSQL CRUD for definitions + values
  cache.ts        # Redis cache for claim definitions
  service.ts      # Business logic: definition CRUD, value management, token claims building
  index.ts        # Barrel export
```

## Implementation Details

### Types — `src/custom-claims/types.ts`

```typescript
/** Supported custom claim value types */
export type ClaimType = 'string' | 'number' | 'boolean' | 'json';

/** Token types where a claim can be included */
export type TokenType = 'id_token' | 'access_token' | 'userinfo';

// --- Claim Definition ---

export interface CustomClaimDefinition {
  id: string;
  applicationId: string;
  claimName: string;
  claimType: ClaimType;
  description: string | null;
  includeInIdToken: boolean;
  includeInAccessToken: boolean;
  includeInUserinfo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomClaimDefinitionRow {
  id: string;
  application_id: string;
  claim_name: string;
  claim_type: string;
  description: string | null;
  include_in_id_token: boolean;
  include_in_access_token: boolean;
  include_in_userinfo: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateClaimDefinitionInput {
  applicationId: string;
  claimName: string;
  claimType: ClaimType;
  description?: string;
  includeInIdToken?: boolean;      // Default: false
  includeInAccessToken?: boolean;  // Default: true
  includeInUserinfo?: boolean;     // Default: true
}

export interface UpdateClaimDefinitionInput {
  description?: string | null;
  includeInIdToken?: boolean;
  includeInAccessToken?: boolean;
  includeInUserinfo?: boolean;
  // claimName and claimType are NOT updatable (they define the claim identity)
}

export function mapRowToDefinition(row: CustomClaimDefinitionRow): CustomClaimDefinition { /* ... */ }

// --- Claim Value ---

export interface CustomClaimValue {
  id: string;
  userId: string;
  claimId: string;
  value: unknown;          // Typed based on definition's claimType
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomClaimValueRow {
  id: string;
  user_id: string;
  claim_id: string;
  value: unknown;          // JSONB from PostgreSQL
  created_at: Date;
  updated_at: Date;
}

export function mapRowToValue(row: CustomClaimValueRow): CustomClaimValue { /* ... */ }

// --- Joined type for convenience ---

export interface CustomClaimWithValue {
  definition: CustomClaimDefinition;
  value: CustomClaimValue;
}
```

### Error Classes — `src/custom-claims/errors.ts`

```typescript
/**
 * Thrown when a claim definition cannot be found.
 */
export class ClaimNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Custom claim not found: ${identifier}`);
    this.name = 'ClaimNotFoundError';
  }
}

/**
 * Thrown when custom claim validation fails.
 * Covers: reserved names, type mismatches, duplicate names.
 */
export class ClaimValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaimValidationError';
  }
}
```

### Validators — `src/custom-claims/validators.ts`

```typescript
/**
 * OIDC standard and Porta reserved claim names.
 * Custom claims cannot use any of these names.
 */
export const RESERVED_CLAIM_NAMES: ReadonlySet<string> = new Set([
  // OIDC Standard Claims
  'sub', 'iss', 'aud', 'exp', 'iat', 'nbf', 'jti', 'nonce', 'at_hash', 'c_hash',
  'name', 'given_name', 'family_name', 'middle_name', 'nickname',
  'preferred_username', 'profile', 'picture', 'website',
  'email', 'email_verified', 'gender', 'birthdate', 'zoneinfo', 'locale',
  'phone_number', 'phone_number_verified', 'address', 'updated_at',
  // Porta Internal
  'roles', 'permissions', 'org_id', 'org_slug',
]);

/**
 * Check if a claim name is reserved.
 */
export function isReservedClaimName(name: string): boolean {
  return RESERVED_CLAIM_NAMES.has(name);
}

/**
 * Validate a custom claim name.
 * Must be: non-empty, lowercase alphanumeric + underscores, not reserved.
 */
export function validateClaimName(name: string): { valid: boolean; reason?: string } { /* ... */ }

/**
 * Validate a claim value matches the expected type from the definition.
 * - string: typeof value === 'string'
 * - number: typeof value === 'number' && !isNaN(value)
 * - boolean: typeof value === 'boolean'
 * - json: value !== null && typeof value === 'object'
 */
export function validateClaimValue(
  claimType: ClaimType,
  value: unknown
): { valid: boolean; reason?: string } { /* ... */ }
```

### Repository — `src/custom-claims/repository.ts`

```typescript
// --- Claim Definitions ---

/**
 * Insert a new claim definition.
 */
export async function insertDefinition(input: CreateClaimDefinitionInput): Promise<CustomClaimDefinition> { /* ... */ }

/**
 * Find a claim definition by ID.
 */
export async function findDefinitionById(id: string): Promise<CustomClaimDefinition | null> { /* ... */ }

/**
 * Find a claim definition by application ID and claim name.
 */
export async function findDefinitionByName(applicationId: string, claimName: string): Promise<CustomClaimDefinition | null> { /* ... */ }

/**
 * Update a claim definition by ID.
 */
export async function updateDefinition(id: string, input: UpdateClaimDefinitionInput): Promise<CustomClaimDefinition> { /* ... */ }

/**
 * Delete a claim definition by ID.
 * CASCADE deletes all associated values.
 */
export async function deleteDefinition(id: string): Promise<boolean> { /* ... */ }

/**
 * List all claim definitions for an application.
 */
export async function listDefinitionsByApplication(applicationId: string): Promise<CustomClaimDefinition[]> { /* ... */ }

/**
 * Check if a claim name exists for a given application.
 */
export async function claimNameExists(applicationId: string, claimName: string): Promise<boolean> { /* ... */ }

// --- Claim Values ---

/**
 * Set (upsert) a claim value for a user.
 * Uses INSERT ... ON CONFLICT (user_id, claim_id) DO UPDATE.
 */
export async function upsertValue(userId: string, claimId: string, value: unknown): Promise<CustomClaimValue> { /* ... */ }

/**
 * Get a claim value for a user and claim definition.
 */
export async function findValue(userId: string, claimId: string): Promise<CustomClaimValue | null> { /* ... */ }

/**
 * Delete a claim value.
 */
export async function deleteValue(userId: string, claimId: string): Promise<boolean> { /* ... */ }

/**
 * Get all claim values for a user, joined with definitions.
 * Returns values with their definition metadata for claims building.
 */
export async function getValuesForUser(userId: string): Promise<Array<{
  definition: CustomClaimDefinition;
  value: CustomClaimValue;
}>> { /* ... */ }

/**
 * Get all claim values for a user within a specific application.
 * Used for token claims building (scoped to the client's application).
 */
export async function getValuesForUserByApp(userId: string, applicationId: string): Promise<Array<{
  definition: CustomClaimDefinition;
  value: CustomClaimValue;
}>> { /* ... */ }
```

**Key SQL — Values for User by Application** (token claims hot path):
```sql
SELECT 
  d.id AS def_id, d.application_id, d.claim_name, d.claim_type,
  d.description, d.include_in_id_token, d.include_in_access_token,
  d.include_in_userinfo, d.created_at AS def_created_at,
  d.updated_at AS def_updated_at,
  v.id AS val_id, v.user_id, v.claim_id, v.value,
  v.created_at AS val_created_at, v.updated_at AS val_updated_at
FROM custom_claim_values v
JOIN custom_claim_definitions d ON d.id = v.claim_id
WHERE v.user_id = $1 AND d.application_id = $2
ORDER BY d.claim_name ASC
```

### Cache — `src/custom-claims/cache.ts`

```typescript
const DEFINITIONS_PREFIX = 'claims:defs:';
const CACHE_TTL = 300; // 5 minutes

/**
 * Get cached claim definitions for an application.
 */
export async function getCachedDefinitions(applicationId: string): Promise<CustomClaimDefinition[] | null> { /* ... */ }

/**
 * Cache claim definitions for an application.
 */
export async function setCachedDefinitions(applicationId: string, definitions: CustomClaimDefinition[]): Promise<void> { /* ... */ }

/**
 * Invalidate cached claim definitions for an application.
 */
export async function invalidateDefinitionsCache(applicationId: string): Promise<void> { /* ... */ }
```

**Note:** Claim values are NOT cached because:
1. They change per-user and per-claim (high cardinality)
2. The DB query with JOIN is already efficient
3. Token claims are resolved at issuance time, not a high-frequency operation per user

### Service — `src/custom-claims/service.ts`

```typescript
// --- Definition Management ---

/**
 * Create a custom claim definition for an application.
 * - Validates claim name is not reserved
 * - Validates claim name format
 * - Ensures name uniqueness within application
 * - Audit logs: claim.defined
 */
export async function createDefinition(input: CreateClaimDefinitionInput): Promise<CustomClaimDefinition> { /* ... */ }

/**
 * Update a claim definition (inclusion flags and description only).
 * - Invalidates definitions cache
 * - Audit logs: claim.updated
 */
export async function updateDefinition(id: string, input: UpdateClaimDefinitionInput): Promise<CustomClaimDefinition> { /* ... */ }

/**
 * Delete a claim definition (cascades to values).
 * - Invalidates definitions cache
 * - Audit logs: claim.deleted
 */
export async function deleteDefinition(id: string): Promise<void> { /* ... */ }

/**
 * Find a definition by ID.
 */
export async function findDefinitionById(id: string): Promise<CustomClaimDefinition | null> { /* ... */ }

/**
 * List all definitions for an application. Cache-first.
 */
export async function listDefinitions(applicationId: string): Promise<CustomClaimDefinition[]> { /* ... */ }

// --- Value Management ---

/**
 * Set a custom claim value for a user.
 * - Validates claim definition exists
 * - Validates value type matches definition type
 * - Upserts (insert or update)
 * - Audit logs: claim.value.set
 */
export async function setValue(
  userId: string,
  claimId: string,
  value: unknown
): Promise<CustomClaimValue> { /* ... */ }

/**
 * Get a specific claim value for a user.
 */
export async function getValue(userId: string, claimId: string): Promise<CustomClaimValue | null> { /* ... */ }

/**
 * Delete a claim value.
 * - Audit logs: claim.value.deleted
 */
export async function deleteValue(userId: string, claimId: string): Promise<void> { /* ... */ }

/**
 * Get all claim values for a user (across all applications).
 */
export async function getValuesForUser(userId: string): Promise<CustomClaimWithValue[]> { /* ... */ }

// --- Token Claims Building ---

/**
 * Build custom claims for inclusion in a token.
 * 
 * Resolves the user's custom claim values for the specified application,
 * filtered by the token type (id_token, access_token, or userinfo).
 * 
 * Returns a flat object: { claimName: value, ... }
 * 
 * @param userId - The user whose claims to resolve
 * @param applicationId - The application whose claim definitions to use
 * @param tokenType - Which token type is being built (determines which claims are included)
 */
export async function buildCustomClaims(
  userId: string,
  applicationId: string,
  tokenType: TokenType
): Promise<Record<string, unknown>> {
  // 1. Query all user's claim values for this application (with definitions)
  // 2. Filter by token type inclusion flag:
  //    - id_token → includeInIdToken
  //    - access_token → includeInAccessToken
  //    - userinfo → includeInUserinfo
  // 3. Build result object: { claimName: value }
  // 4. Return flat object
}
```

**Audit Events:**
| Operation | Event Type | Category |
|-----------|-----------|----------|
| Claim defined | `claim.defined` | `admin` |
| Claim updated | `claim.updated` | `admin` |
| Claim deleted | `claim.deleted` | `admin` |
| Claim value set | `claim.value.set` | `admin` |
| Claim value deleted | `claim.value.deleted` | `admin` |

### Barrel Export — `src/custom-claims/index.ts`

```typescript
// Types
export type {
  ClaimType,
  TokenType,
  CustomClaimDefinition,
  CustomClaimValue,
  CreateClaimDefinitionInput,
  UpdateClaimDefinitionInput,
  CustomClaimWithValue,
} from './types.js';

// Errors
export { ClaimNotFoundError, ClaimValidationError } from './errors.js';

// Validators
export { RESERVED_CLAIM_NAMES, isReservedClaimName, validateClaimName, validateClaimValue } from './validators.js';

// Service (public API)
export {
  createDefinition,
  updateDefinition,
  deleteDefinition,
  findDefinitionById,
  listDefinitions,
  setValue,
  getValue,
  deleteValue,
  getValuesForUser,
  buildCustomClaims,
} from './service.js';
```

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| Reserved claim name | Throw `ClaimValidationError` with list of reserved names |
| Invalid claim name format | Throw `ClaimValidationError` with format requirements |
| Duplicate claim name in app | Throw `ClaimValidationError` |
| Value type mismatch | Throw `ClaimValidationError` with expected vs actual type |
| Claim definition not found | Throw `ClaimNotFoundError` |
| Set value for non-existent definition | Throw `ClaimNotFoundError` |

## Testing Requirements

### Validator Tests
- `isReservedClaimName` — all OIDC standard claims, Porta reserved claims, non-reserved
- `validateClaimName` — valid names, reserved names, empty, special chars, uppercase
- `validateClaimValue` — string/number/boolean/json correct types, mismatches, edge cases (NaN, null, arrays)

### Repository Tests
- Insert definition, verify all fields
- Find by ID / by name (found + not found)
- Update definition (partial update)
- Delete definition (cascades values)
- List by application (empty + populated)
- Claim name exists check
- Upsert value (insert new, update existing)
- Find value (found + not found)
- Delete value
- Get values for user (all apps + filtered by app)

### Cache Tests
- Get/set/invalidate definitions cache
- Graceful degradation on Redis error

### Service Tests
- Create definition (valid, reserved name → error, duplicate → error)
- Update definition
- Delete definition
- List definitions (cache hit, cache miss)
- Set value (valid type, invalid type → error, non-existent definition → error)
- Get value
- Delete value
- Get values for user
- `buildCustomClaims` — filters by token type correctly
- `buildCustomClaims` — empty result for user with no values
- `buildCustomClaims` — correct JSONB value extraction
- Audit log called for all write operations
