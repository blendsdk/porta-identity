# Repository & Cache: Organization Management

> **Document**: 04-repository-and-cache.md
> **Parent**: [Index](00-index.md)

## Overview

Implement the database repository layer for organization CRUD operations and the
Redis cache layer for fast organization lookups. These are the data access
foundations that the service layer depends on.

## Architecture

### Module Structure

```
src/organizations/
├── repository.ts  — PostgreSQL CRUD functions
└── cache.ts       — Redis cache for org lookups
```

### Dependency Flow

```
service.ts → repository.ts → getPool() → PostgreSQL
service.ts → cache.ts       → getRedis() → Redis
```

## Implementation Details

### Organization Repository (src/organizations/repository.ts)

Standalone exported functions following the existing codebase pattern. Each function
uses `getPool()` to access the PostgreSQL pool and returns mapped Organization objects.

```typescript
import type { Organization, OrganizationRow, ListOrganizationsOptions, PaginatedResult } from './types.js';

/**
 * Insert a new organization into the database.
 *
 * @param data - Organization data (must include name, slug, defaultLocale)
 * @returns The inserted organization
 * @throws If slug already exists (unique constraint violation)
 */
export async function insertOrganization(data: {
  name: string;
  slug: string;
  defaultLocale: string;
  brandingLogoUrl?: string | null;
  brandingFaviconUrl?: string | null;
  brandingPrimaryColor?: string | null;
  brandingCompanyName?: string | null;
  brandingCustomCss?: string | null;
}): Promise<Organization> { ... }

/**
 * Find an organization by its UUID.
 *
 * @param id - Organization UUID
 * @returns Organization or null if not found
 */
export async function findOrganizationById(id: string): Promise<Organization | null> { ... }

/**
 * Find an organization by its slug.
 * Returns all statuses (active, suspended, archived) — caller handles status logic.
 *
 * @param slug - Organization slug
 * @returns Organization or null if not found
 */
export async function findOrganizationBySlug(slug: string): Promise<Organization | null> { ... }

/**
 * Update an organization's fields.
 * Only provided fields are updated (partial update via dynamic SQL).
 *
 * @param id - Organization UUID
 * @param data - Fields to update
 * @returns Updated organization
 * @throws If organization not found
 */
export async function updateOrganization(
  id: string,
  data: Partial<{
    name: string;
    slug: string;
    status: string;
    defaultLocale: string;
    brandingLogoUrl: string | null;
    brandingFaviconUrl: string | null;
    brandingPrimaryColor: string | null;
    brandingCompanyName: string | null;
    brandingCustomCss: string | null;
  }>,
): Promise<Organization> { ... }

/**
 * List organizations with pagination, filtering, and sorting.
 *
 * @param options - Pagination, filter, and sort options
 * @returns Paginated result with organizations and total count
 */
export async function listOrganizations(
  options: ListOrganizationsOptions,
): Promise<PaginatedResult<Organization>> { ... }

/**
 * Find the super-admin organization.
 *
 * @returns Super-admin organization or null
 */
export async function findSuperAdminOrganization(): Promise<Organization | null> { ... }

/**
 * Check if a slug is already taken (across all statuses).
 *
 * @param slug - Slug to check
 * @param excludeId - Optional org ID to exclude (for updates)
 * @returns true if slug exists
 */
export async function slugExists(slug: string, excludeId?: string): Promise<boolean> { ... }
```

### Key SQL Patterns

#### Dynamic Update Query

```sql
-- Built dynamically based on provided fields
UPDATE organizations
SET name = COALESCE($2, name),
    status = COALESCE($3, status),
    ...
    updated_at = NOW()
WHERE id = $1
RETURNING *;
```

**Note:** The dynamic query builder will construct SET clauses only for fields that
are explicitly provided (not undefined), using parameterized queries to prevent SQL injection.

#### Paginated List Query

```sql
-- Count query
SELECT COUNT(*) FROM organizations
WHERE ($1::text IS NULL OR status = $1)
  AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR slug ILIKE '%' || $2 || '%');

-- Data query
SELECT * FROM organizations
WHERE ($1::text IS NULL OR status = $1)
  AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR slug ILIKE '%' || $2 || '%')
ORDER BY $3
LIMIT $4 OFFSET $5;
```

**Note:** Sort column and direction will be safely whitelisted (not parameterized)
since they're column names/keywords, not user data. The allowed values are:
`name` or `created_at` for sortBy, and `ASC` or `DESC` for sortOrder.

### Organization Cache (src/organizations/cache.ts)

Redis-backed cache for organization lookups with automatic invalidation.

```typescript
import type { Organization } from './types.js';

/** Cache TTL in seconds (5 minutes) */
const CACHE_TTL = 300;

/**
 * Get an organization from cache by slug.
 *
 * @param slug - Organization slug
 * @returns Cached organization or null if not in cache
 */
export async function getCachedOrganizationBySlug(slug: string): Promise<Organization | null> { ... }

/**
 * Get an organization from cache by ID.
 *
 * @param id - Organization UUID
 * @returns Cached organization or null if not in cache
 */
export async function getCachedOrganizationById(id: string): Promise<Organization | null> { ... }

/**
 * Store an organization in cache (both by slug and by ID keys).
 *
 * @param org - Organization to cache
 */
export async function cacheOrganization(org: Organization): Promise<void> { ... }

/**
 * Invalidate all cache entries for an organization.
 * Deletes both the slug-keyed and ID-keyed cache entries.
 *
 * @param slug - Organization slug
 * @param id - Organization UUID
 */
export async function invalidateOrganizationCache(slug: string, id: string): Promise<void> { ... }
```

### Cache Key Convention

```
org:slug:{slug}  → JSON-serialized Organization (TTL: 300s)
org:id:{id}      → JSON-serialized Organization (TTL: 300s)
```

### Serialization

Organizations are serialized to JSON for Redis storage. Date fields (`createdAt`,
`updatedAt`) are serialized as ISO 8601 strings and deserialized back to `Date`
objects when reading from cache.

## Error Handling

| Error Case                        | Handling Strategy                          |
|-----------------------------------|--------------------------------------------|
| Unique constraint violation (slug)| Throw specific error for caller to handle  |
| Organization not found on update  | Throw specific error                       |
| Redis connection error in cache   | Log warning, return null (fallback to DB)  |
| Redis serialization error         | Log warning, return null (fallback to DB)  |

## Testing Requirements

### Repository (~15 tests)

- `insertOrganization()`: success, slug collision handling
- `findOrganizationById()`: found, not found
- `findOrganizationBySlug()`: found, not found, returns all statuses
- `updateOrganization()`: partial update, full update, not found
- `listOrganizations()`: pagination, filtering by status, search, sorting
- `findSuperAdminOrganization()`: found, not found
- `slugExists()`: exists, doesn't exist, excludeId

### Cache (~12 tests)

- `getCachedOrganizationBySlug()`: cache hit, cache miss, invalid JSON
- `getCachedOrganizationById()`: cache hit, cache miss
- `cacheOrganization()`: stores both keys, correct TTL
- `invalidateOrganizationCache()`: deletes both keys
- Redis error handling: returns null on errors
- Date serialization/deserialization round-trip
