# RBAC Types & Errors: RBAC & Custom Claims

> **Document**: 03-rbac-types-and-errors.md
> **Parent**: [Index](00-index.md)

## Overview

Define all TypeScript types, interfaces, DB row mappers, error classes, and slug/permission validation for the RBAC module. Follows the established pattern from `src/organizations/types.ts`, `src/organizations/errors.ts`, and `src/organizations/slugs.ts`.

## Architecture

### File Structure

```
src/rbac/
  types.ts       # Role, Permission, UserRole types, DB row interfaces, row mappers
  errors.ts      # RoleNotFoundError, PermissionNotFoundError, RbacValidationError
  slugs.ts       # Role slug generation, permission slug validation
```

## Implementation Details

### New Types/Interfaces — `src/rbac/types.ts`

```typescript
// --- Role Types ---

export interface Role {
  id: string;
  applicationId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleRow {
  id: string;
  application_id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateRoleInput {
  applicationId: string;
  name: string;
  slug?: string;           // Auto-generated from name if not provided
  description?: string;
}

export interface UpdateRoleInput {
  name?: string;
  slug?: string;
  description?: string | null;
}

export function mapRowToRole(row: RoleRow): Role { /* snake_case → camelCase */ }

// --- Permission Types ---

export interface Permission {
  id: string;
  applicationId: string;
  moduleId: string | null;
  name: string;
  slug: string;            // e.g., "crm:contacts:read"
  description: string | null;
  createdAt: Date;
}

export interface PermissionRow {
  id: string;
  application_id: string;
  module_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  created_at: Date;
}

export interface CreatePermissionInput {
  applicationId: string;
  moduleId?: string;
  name: string;
  slug: string;            // Must follow module:resource:action format
  description?: string;
}

export interface UpdatePermissionInput {
  name?: string;
  description?: string | null;
  // slug is NOT updatable (it's the permission identity)
}

export function mapRowToPermission(row: PermissionRow): Permission { /* ... */ }

// --- User-Role Types ---

export interface UserRole {
  userId: string;
  roleId: string;
  assignedBy: string | null;
  createdAt: Date;
}

export interface UserRoleRow {
  user_id: string;
  role_id: string;
  assigned_by: string | null;
  created_at: Date;
}

export function mapRowToUserRole(row: UserRoleRow): UserRole { /* ... */ }

// --- Role with Permissions (joined query result) ---

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}
```

### New Error Classes — `src/rbac/errors.ts`

Following the established pattern from `src/organizations/errors.ts`:

```typescript
/**
 * Thrown when a role cannot be found by ID or slug.
 */
export class RoleNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Role not found: ${identifier}`);
    this.name = 'RoleNotFoundError';
  }
}

/**
 * Thrown when a permission cannot be found by ID or slug.
 */
export class PermissionNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Permission not found: ${identifier}`);
    this.name = 'PermissionNotFoundError';
  }
}

/**
 * Thrown when RBAC validation fails (slug conflicts, invalid format, etc.).
 */
export class RbacValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RbacValidationError';
  }
}
```

### Slug & Permission Validation — `src/rbac/slugs.ts`

```typescript
/**
 * Generate a slug from a role name.
 * Uses the same slugification logic as organizations/applications.
 * e.g., "CRM Editor" → "crm-editor"
 */
export function generateRoleSlug(name: string): string { /* ... */ }

/**
 * Validate a role slug format (kebab-case, 1-100 chars).
 */
export function validateRoleSlug(slug: string): boolean { /* ... */ }

/**
 * Validate a permission slug follows the module:resource:action format.
 * Each segment must be lowercase alphanumeric with hyphens.
 * Minimum 3 segments separated by colons.
 * e.g., "crm:contacts:read" ✓, "contacts-read" ✗, "a:b" ✗
 */
export function validatePermissionSlug(slug: string): boolean { /* ... */ }

/**
 * Parse a permission slug into its components.
 * Returns { module, resource, action } or null if invalid.
 */
export function parsePermissionSlug(slug: string): {
  module: string;
  resource: string;
  action: string;
} | null { /* ... */ }
```

## Code Examples

### Role Slug Generation

```typescript
import { generateRoleSlug, validateRoleSlug } from './slugs.js';

generateRoleSlug('CRM Editor');        // "crm-editor"
generateRoleSlug('Invoice Approver');  // "invoice-approver"

validateRoleSlug('crm-editor');        // true
validateRoleSlug('CRM Editor');        // false (spaces, uppercase)
validateRoleSlug('');                  // false (empty)
```

### Permission Slug Validation

```typescript
import { validatePermissionSlug, parsePermissionSlug } from './slugs.js';

validatePermissionSlug('crm:contacts:read');     // true
validatePermissionSlug('crm:contacts:write');    // true
validatePermissionSlug('admin:system:manage');   // true
validatePermissionSlug('contacts-read');          // false (no colons)
validatePermissionSlug('a:b');                    // false (only 2 segments)
validatePermissionSlug('');                       // false (empty)

parsePermissionSlug('crm:contacts:read');
// { module: 'crm', resource: 'contacts', action: 'read' }
```

### Row Mapping

```typescript
import { mapRowToRole, mapRowToPermission } from './types.js';

// DB row → domain object
const role = mapRowToRole({
  id: 'uuid',
  application_id: 'app-uuid',
  name: 'CRM Editor',
  slug: 'crm-editor',
  description: null,
  created_at: new Date(),
  updated_at: new Date(),
});
// → { id, applicationId, name, slug, description, createdAt, updatedAt }
```

## Error Handling

| Error Case | Error Type | When Thrown |
|------------|------------|------------|
| Role not found by ID/slug | `RoleNotFoundError` | Repository lookup returns null, service throws |
| Permission not found by ID/slug | `PermissionNotFoundError` | Repository lookup returns null, service throws |
| Duplicate role slug in app | `RbacValidationError` | Service checks before insert |
| Duplicate permission slug in app | `RbacValidationError` | Service checks before insert |
| Invalid permission slug format | `RbacValidationError` | Service validates slug format |
| Role has assigned users (delete) | `RbacValidationError` | Service checks user_roles before delete |
| Permission assigned to roles (delete) | `RbacValidationError` | Service checks role_permissions before delete |

## Testing Requirements

- Unit tests for `mapRowToRole()`, `mapRowToPermission()`, `mapRowToUserRole()` — all fields mapped correctly
- Unit tests for `generateRoleSlug()` — various name inputs, edge cases
- Unit tests for `validateRoleSlug()` — valid/invalid formats
- Unit tests for `validatePermissionSlug()` — valid/invalid formats, edge cases
- Unit tests for `parsePermissionSlug()` — correct parsing, null for invalid
- Unit tests for all error classes — correct name, message, instanceof
