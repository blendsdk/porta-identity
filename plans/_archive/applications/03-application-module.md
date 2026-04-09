# Application Module: Types, Slugs, Repository, Cache, Service

> **Document**: 03-application-module.md
> **Parent**: [Index](00-index.md)

## Overview

The application module (`src/applications/`) manages global application definitions
and their modules. It follows the exact same pattern as `src/organizations/`:
types → slugs → errors → repository → cache → service → barrel export.

Applications are platform-wide (not scoped to any organization). They represent
SaaS products (e.g., "BusinessSuite") that organizations subscribe to. Each
application can have modules (e.g., "CRM", "Invoicing") used for permission
namespacing.

## Architecture

### File Structure

```
src/applications/
  types.ts         — Application, ApplicationModule interfaces, row mapping
  slugs.ts         — Slug generation and validation for applications
  errors.ts        — ApplicationNotFoundError, ApplicationValidationError
  repository.ts    — PostgreSQL CRUD for applications + modules
  cache.ts         — Redis cache (by slug and ID)
  service.ts       — Business logic: CRUD, status lifecycle, module management, audit
  index.ts         — Barrel export (public API)
```

## Implementation Details

### types.ts — Application Types

```typescript
/** Application status values — matches the DB CHECK constraint */
export type ApplicationStatus = 'active' | 'inactive' | 'archived';

/** Module status values — matches the DB CHECK constraint */
export type ModuleStatus = 'active' | 'inactive';

/** Full application record (camelCase) */
export interface Application {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ApplicationStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Full application module record (camelCase) */
export interface ApplicationModule {
  id: string;
  applicationId: string;
  name: string;
  slug: string;
  description: string | null;
  status: ModuleStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for creating a new application */
export interface CreateApplicationInput {
  name: string;
  slug?: string;         // Auto-generated from name if not provided
  description?: string;
}

/** Input for updating an application (partial) */
export interface UpdateApplicationInput {
  name?: string;
  description?: string | null;  // null to clear
}

/** Input for creating a module */
export interface CreateModuleInput {
  name: string;
  slug?: string;
  description?: string;
}

/** Input for updating a module */
export interface UpdateModuleInput {
  name?: string;
  description?: string | null;
}

/** Pagination options for listing applications */
export interface ListApplicationsOptions {
  page: number;
  pageSize: number;
  status?: ApplicationStatus;
  search?: string;
  sortBy?: 'name' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

/** Raw database row from applications table (snake_case) */
export interface ApplicationRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

/** Raw database row from application_modules table (snake_case) */
export interface ApplicationModuleRow {
  id: string;
  application_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

/** Map a DB row to Application (snake_case → camelCase) */
export function mapRowToApplication(row: ApplicationRow): Application { ... }

/** Map a DB row to ApplicationModule (snake_case → camelCase) */
export function mapRowToModule(row: ApplicationModuleRow): ApplicationModule { ... }
```

### slugs.ts — Slug Utilities

Follows the same pattern as `src/organizations/slugs.ts`. Core logic is identical:
- `generateSlug(name)` — lowercase, replace spaces/special chars with hyphens, trim
- `validateSlug(slug)` — format validation + reserved word check

**Reserved words for applications**: `admin`, `api`, `system`, `internal`, `default`,
`health`, `status`. (Different from org reserved words because app slugs appear in
different contexts.)

### errors.ts — Domain Errors

```typescript
/** Thrown when an application is not found by ID or slug */
export class ApplicationNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Application not found: ${identifier}`);
    this.name = 'ApplicationNotFoundError';
  }
}

/** Thrown when an operation violates application business rules */
export class ApplicationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApplicationValidationError';
  }
}
```

### repository.ts — PostgreSQL CRUD

Functions (following org repository pattern):

| Function                     | Description                            | Returns                    |
|------------------------------|----------------------------------------|----------------------------|
| `insertApplication(data)`    | Insert new application                 | `Application`              |
| `findApplicationById(id)`    | Find by UUID                           | `Application \| null`      |
| `findApplicationBySlug(slug)`| Find by slug                           | `Application \| null`      |
| `updateApplication(id, data)`| Dynamic partial update                 | `Application`              |
| `listApplications(options)`  | Paginated list with filters            | `PaginatedResult<App>`     |
| `slugExists(slug, exclude?)` | Check slug uniqueness                  | `boolean`                  |
| `insertModule(data)`         | Insert new module for an app           | `ApplicationModule`        |
| `findModuleById(id)`         | Find module by UUID                    | `ApplicationModule \| null`|
| `updateModule(id, data)`     | Update module fields                   | `ApplicationModule`        |
| `listModules(appId)`         | List all modules for an application    | `ApplicationModule[]`      |
| `moduleSlugExists(appId, slug, exclude?)` | Check module slug within app | `boolean`             |

Key implementation details:
- Dynamic UPDATE query builder for partial updates (same as org repo)
- Module slug uniqueness checked within app scope using composite key
- Paginated listing with optional status/search filters
- Whitelisted sort columns to prevent SQL injection

### cache.ts — Redis Cache Layer

Same pattern as `src/organizations/cache.ts`:

| Function                           | Key Pattern            | TTL   |
|------------------------------------|------------------------|-------|
| `getCachedApplicationBySlug(slug)` | `app:slug:{slug}`      | 300s  |
| `getCachedApplicationById(id)`     | `app:id:{id}`          | 300s  |
| `cacheApplication(app)`           | Both keys               | 300s  |
| `invalidateApplicationCache(slug, id)` | Deletes both keys  | —     |

**Note**: Module data is NOT cached separately — modules are small enough to always
load from DB. Application-level caching is sufficient since apps are looked up
frequently by the client service.

### service.ts — Business Logic

Functions composing repository + cache + slugs + audit log:

| Function                           | Description                                |
|------------------------------------|--------------------------------------------|
| `createApplication(input, actor?)` | Validate slug → insert → cache → audit     |
| `getApplicationById(id)`           | Cache-first lookup                         |
| `getApplicationBySlug(slug)`       | Cache-first lookup                         |
| `updateApplication(id, input, actor?)` | Update → invalidate cache → re-cache → audit |
| `archiveApplication(id, actor?)`   | Validate status → update → invalidate → audit |
| `activateApplication(id, actor?)`  | inactive → active transition               |
| `deactivateApplication(id, actor?)` | active → inactive transition              |
| `listApplications(options)`        | Delegate to repository                     |
| `createModule(appId, input, actor?)` | Validate app exists + slug unique → insert → audit |
| `updateModule(moduleId, input, actor?)` | Update → audit                        |
| `deactivateModule(moduleId, actor?)` | Set status → audit                       |
| `listModules(appId)`              | Delegate to repository                      |

**Status lifecycle**:
- `active` → `inactive` (deactivate)
- `inactive` → `active` (activate)
- `active` or `inactive` → `archived` (archive — soft delete)
- `archived` → cannot be restored (unlike orgs which support restore)

**Audit events**: `app.created`, `app.updated`, `app.archived`, `app.activated`,
`app.deactivated`, `app.module.created`, `app.module.updated`, `app.module.deactivated`

## Error Handling

| Error Case                        | Handling Strategy                    |
|-----------------------------------|--------------------------------------|
| Application not found             | Throw `ApplicationNotFoundError`     |
| Invalid slug format               | Throw `ApplicationValidationError`   |
| Slug already taken                | Throw `ApplicationValidationError`   |
| Module slug taken within app      | Throw `ApplicationValidationError`   |
| Invalid status transition         | Throw `ApplicationValidationError`   |
| No fields to update               | Throw `Error('No fields to update')` |
| Redis failure                     | Log warning, graceful degradation    |
| DB failure                        | Propagate to caller                  |
