# Service & Audit: Organization Management

> **Document**: 05-service-and-audit.md
> **Parent**: [Index](00-index.md)

## Overview

Implement the business logic service for organization management and a generic
audit log writer. The organization service orchestrates the repository, cache,
slug utilities, and audit logging to provide the complete feature API.

## Architecture

### Module Structure

```
src/organizations/
├── service.ts     — Business logic orchestrating all components
└── index.ts       — Barrel export

src/lib/
└── audit-log.ts   — Generic audit log writer
```

### Dependency Flow

```
service.ts
  ├── repository.ts     (database CRUD)
  ├── cache.ts          (Redis caching)
  ├── slugs.ts          (slug generation/validation)
  ├── types.ts          (type definitions)
  └── audit-log.ts      (audit event logging)
```

## Implementation Details

### Audit Log Service (src/lib/audit-log.ts)

A generic, reusable audit log writer for the `audit_log` table. Not specific
to organizations — will be used by future RDs (users, clients, auth workflows).

```typescript
/**
 * Write an audit log entry.
 * Uses fire-and-forget pattern — audit failures are logged but never block
 * the calling operation.
 *
 * @param entry - Audit log entry data
 */
export async function writeAuditLog(entry: {
  organizationId?: string;
  userId?: string;
  actorId?: string;
  eventType: string;
  eventCategory: string;
  description?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> { ... }
```

Key design decisions:
- **Fire-and-forget**: Audit log write failures are caught and logged but never
  propagate to the caller. This ensures audit logging never blocks core operations.
- **Generic**: No organization-specific logic — just maps input to the audit_log table.
- **IP/User-Agent from context**: The service layer extracts these from the Koa context
  and passes them down; the audit writer doesn't know about Koa.

### Organization Service (src/organizations/service.ts)

The main business logic module. Each function validates inputs, performs the
operation via repository/cache, and logs audit events.

```typescript
import type {
  Organization, CreateOrganizationInput, UpdateOrganizationInput,
  BrandingInput, ListOrganizationsOptions, PaginatedResult,
} from './types.js';

/**
 * Create a new organization.
 *
 * 1. Generate slug from name (if not provided)
 * 2. Validate slug format and reserved words
 * 3. Check slug uniqueness
 * 4. Insert organization via repository
 * 5. Cache the new organization
 * 6. Write audit log entry
 *
 * @param input - Organization creation data
 * @param actorId - UUID of the user performing the action (for audit)
 * @returns Created organization
 * @throws If slug is invalid, already taken, or creation fails
 */
export async function createOrganization(
  input: CreateOrganizationInput,
  actorId?: string,
): Promise<Organization> { ... }

/**
 * Find an organization by ID.
 * Checks Redis cache first, falls back to database.
 *
 * @param id - Organization UUID
 * @returns Organization or null
 */
export async function getOrganizationById(id: string): Promise<Organization | null> { ... }

/**
 * Find an organization by slug.
 * Checks Redis cache first, falls back to database.
 *
 * @param slug - Organization slug
 * @returns Organization or null
 */
export async function getOrganizationBySlug(slug: string): Promise<Organization | null> { ... }

/**
 * Update an organization's basic fields (name, locale).
 *
 * 1. Verify organization exists and is not archived
 * 2. Apply updates via repository
 * 3. Invalidate cache
 * 4. Re-cache updated organization
 * 5. Write audit log entry
 *
 * @param id - Organization UUID
 * @param input - Fields to update
 * @param actorId - UUID of the user performing the action
 * @returns Updated organization
 * @throws If organization not found or archived
 */
export async function updateOrganization(
  id: string,
  input: UpdateOrganizationInput,
  actorId?: string,
): Promise<Organization> { ... }

/**
 * Update an organization's branding configuration.
 *
 * @param id - Organization UUID
 * @param branding - Branding fields to update
 * @param actorId - UUID of the user performing the action
 * @returns Updated organization
 */
export async function updateOrganizationBranding(
  id: string,
  branding: BrandingInput,
  actorId?: string,
): Promise<Organization> { ... }

/**
 * Suspend an organization (active → suspended).
 * Super-admin organization cannot be suspended.
 *
 * @param id - Organization UUID
 * @param reason - Optional reason for suspension
 * @param actorId - UUID of the user performing the action
 * @throws If org is super-admin, already suspended, or archived
 */
export async function suspendOrganization(
  id: string,
  reason?: string,
  actorId?: string,
): Promise<void> { ... }

/**
 * Activate an organization (suspended → active).
 *
 * @param id - Organization UUID
 * @param actorId - UUID of the user performing the action
 * @throws If org is not currently suspended
 */
export async function activateOrganization(
  id: string,
  actorId?: string,
): Promise<void> { ... }

/**
 * Archive an organization (soft-delete).
 * Super-admin organization cannot be archived.
 *
 * @param id - Organization UUID
 * @param actorId - UUID of the user performing the action
 * @throws If org is super-admin or already archived
 */
export async function archiveOrganization(
  id: string,
  actorId?: string,
): Promise<void> { ... }

/**
 * Restore an archived organization (archived → active).
 *
 * @param id - Organization UUID
 * @param actorId - UUID of the user performing the action
 * @throws If org is not currently archived
 */
export async function restoreOrganization(
  id: string,
  actorId?: string,
): Promise<void> { ... }

/**
 * List organizations with pagination and filtering.
 * Super-admin only — includes all statuses if no filter.
 *
 * @param options - Pagination, filter, and sort options
 * @returns Paginated result
 */
export async function listOrganizations(
  options: ListOrganizationsOptions,
): Promise<PaginatedResult<Organization>> { ... }

/**
 * Validate if a slug is available and valid.
 *
 * @param slug - Slug to validate
 * @param excludeId - Optional org ID to exclude (for updates)
 * @returns Object with isValid boolean and optional error message
 */
export async function validateSlugAvailability(
  slug: string,
  excludeId?: string,
): Promise<{ isValid: boolean; error?: string }> { ... }
```

### Status Lifecycle Rules

```
                    ┌──── activate ────┐
                    ▼                  │
  ┌──────────┐  ┌──────────┐  ┌──────────────┐
  │  active   │──│ suspended │──│   archived    │
  └──────────┘  └──────────┘  └──────────────┘
      │              │
      │   suspend    │
      └──────────────┘

Validation rules enforced by the service:
- suspend(): current status MUST be 'active'. NOT allowed for super-admin.
- activate(): current status MUST be 'suspended'.
- archive(): current status MUST be 'active' or 'suspended'. NOT allowed for super-admin.
- restore(): current status MUST be 'archived'. NOT allowed for super-admin (can't get there).
```

### Audit Events

| Operation          | event_type             | event_category | metadata                    |
|--------------------|------------------------|----------------|-----------------------------|
| Create             | `org.created`          | `admin`        | `{ slug, name }`            |
| Update             | `org.updated`          | `admin`        | `{ fields: [...changed] }`  |
| Branding update    | `org.branding.updated` | `admin`        | `{ fields: [...changed] }`  |
| Suspend            | `org.suspended`        | `admin`        | `{ reason }`                |
| Activate           | `org.activated`        | `admin`        | `{}`                        |
| Archive            | `org.archived`         | `admin`        | `{}`                        |
| Restore            | `org.restored`         | `admin`        | `{}`                        |

### Cache Strategy in Service

Every write operation follows this pattern:
1. Perform the database operation (via repository)
2. Invalidate the cache (by slug + id)
3. Re-cache the updated organization (for immediate read-through)
4. Return the result

Read operations follow:
1. Check cache first
2. If cache miss, read from database
3. Cache the result if found
4. Return the result

## Error Handling

| Error Case                           | Handling Strategy                               |
|--------------------------------------|-------------------------------------------------|
| Slug validation failure              | Throw descriptive error with reason             |
| Slug already taken                   | Throw error: "Slug already in use"              |
| Organization not found               | Throw error: "Organization not found"           |
| Invalid status transition            | Throw error: "Cannot [action] from [status]"    |
| Super-admin protection               | Throw error: "Super-admin org cannot be [action]"|
| Audit log write failure              | Log warning, do NOT throw (fire-and-forget)     |
| Cache operation failure              | Log warning, continue with DB (graceful degrade)|

### Error Types

We'll use simple Error subclasses for domain errors that API routes can map to
appropriate HTTP status codes:

```typescript
/** Thrown when an organization is not found */
export class OrganizationNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Organization not found: ${identifier}`);
    this.name = 'OrganizationNotFoundError';
  }
}

/** Thrown when an operation violates business rules */
export class OrganizationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrganizationValidationError';
  }
}
```

## Testing Requirements

### Audit Log Service (~6 tests)

- `writeAuditLog()`: success with all fields, success with minimal fields
- Fire-and-forget: database error does not throw
- Correct INSERT SQL with all columns
- Null handling for optional fields

### Organization Service (~25-30 tests)

- `createOrganization()`: success with auto-slug, success with custom slug, slug validation failure, slug already taken
- `getOrganizationById()`: cache hit, cache miss → DB, not found
- `getOrganizationBySlug()`: cache hit, cache miss → DB, not found
- `updateOrganization()`: success, not found, archived org rejection
- `updateOrganizationBranding()`: success, not found
- `suspendOrganization()`: success, super-admin rejection, already suspended, archived
- `activateOrganization()`: success, not suspended
- `archiveOrganization()`: success, super-admin rejection, already archived
- `restoreOrganization()`: success, not archived
- `listOrganizations()`: delegates to repository correctly
- `validateSlugAvailability()`: valid + available, valid + taken, invalid format
- Cache invalidation on writes
- Audit log called on all write operations
