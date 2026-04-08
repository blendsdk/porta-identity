# RD-08: Authorization (RBAC) & Custom Claims

> **Document**: RD-08-rbac-custom-claims.md
> **Status**: Draft
> **Created**: 2026-04-08
> **Project**: Porta v5 — OIDC Provider
> **Depends On**: RD-02 (Database Schema), RD-05 (Applications), RD-06 (Users)

---

## Feature Overview

Implement the Role-Based Access Control (RBAC) system and custom claims mechanism. Roles and permissions are defined globally per application (the SaaS product). Users within each organization are assigned roles, and those roles determine the permissions included in tokens. Custom claims allow applications to attach additional metadata to tokens on a per-user basis.

### Conceptual Model

```
Application: "BusinessSuite"
├── Role: "crm-viewer"
│   └── Permissions: ["crm:contacts:read", "crm:deals:read"]
├── Role: "crm-editor"
│   └── Permissions: ["crm:contacts:read", "crm:contacts:write", "crm:deals:read", "crm:deals:write"]
├── Role: "invoice-approver"
│   └── Permissions: ["invoice:read", "invoice:approve"]
└── Custom Claim: "department" (string)

Organization: "Acme Corp"
├── User: alice@acme.com
│   ├── Roles: ["crm-editor", "invoice-approver"]
│   └── Custom Claims: { department: "Sales" }
└── User: bob@acme.com
    ├── Roles: ["crm-viewer"]
    └── Custom Claims: { department: "Engineering" }
```

---

## Functional Requirements

### Must Have — Roles

- [ ] Role CRUD operations (create, read, update, delete)
- [ ] Roles defined per application (global, not per-org)
- [ ] Role slug uniqueness within application
- [ ] Role listing per application
- [ ] Role deletion only if no users are assigned (or force with cascade)

### Must Have — Permissions

- [ ] Permission CRUD operations (create, read, update, delete)
- [ ] Permissions defined per application (global, not per-org)
- [ ] Permission slug uniqueness within application
- [ ] Permissions optionally linked to an application module
- [ ] Permission slug format: `{module}:{resource}:{action}` (e.g., `crm:contacts:read`)
- [ ] Permission listing per application, filterable by module
- [ ] Permission deletion only if not assigned to any role (or force)

### Must Have — Role-Permission Mapping

- [ ] Assign permissions to roles
- [ ] Remove permissions from roles
- [ ] List permissions for a role
- [ ] List roles that have a specific permission

### Must Have — User-Role Assignment

- [ ] Assign roles to users (per-org, per-user)
- [ ] Remove roles from users
- [ ] List roles for a user
- [ ] List users with a specific role (within an organization)
- [ ] Track who assigned the role (`assigned_by`)

### Must Have — Token Integration

- [ ] Include user's roles in tokens as a custom claim
- [ ] Include user's permissions in tokens as a custom claim
- [ ] Configurable: include roles only, permissions only, or both
- [ ] Claim names configurable per application (default: `roles`, `permissions`)
- [ ] Token claims built during `findAccount.claims()` in OIDC provider

### Must Have — Custom Claim Definitions

- [ ] Custom claim definition CRUD (per application)
- [ ] Supported claim types: `string`, `number`, `boolean`, `json`
- [ ] Configurable inclusion: ID token, access token, userinfo (per claim)
- [ ] Claim name uniqueness per application
- [ ] Claim name must not conflict with OIDC standard claims

### Must Have — Custom Claim Values

- [ ] Set custom claim value per user
- [ ] Update custom claim value
- [ ] Delete custom claim value
- [ ] Get all custom claim values for a user
- [ ] Validate value type matches claim definition type
- [ ] Custom claim values included in tokens via `findAccount.claims()`

### Should Have

- [ ] Bulk role assignment (assign multiple roles to a user at once)
- [ ] Bulk permission assignment (assign multiple permissions to a role at once)
- [ ] Role inheritance (a role can include all permissions of another role)
- [ ] Permission grouping by module in API responses
- [ ] Custom claim value history/audit trail

### Won't Have (Out of Scope)

- Dynamic permission evaluation (runtime rule engine)
- Negative permissions (deny rules)
- Resource-level permissions (e.g., "can edit document X")
- Permission caching in tokens (all lookups are at token issuance time)
- Custom claim computed values (all values are static, set per user)

---

## Technical Requirements

### Role Service

```typescript
interface RoleService {
  // CRUD
  create(data: CreateRoleInput): Promise<Role>;
  findById(id: string): Promise<Role | null>;
  findBySlug(appId: string, slug: string): Promise<Role | null>;
  update(id: string, data: UpdateRoleInput): Promise<Role>;
  delete(id: string, force?: boolean): Promise<void>;
  listByApplication(appId: string): Promise<Role[]>;

  // Permission mapping
  assignPermissions(roleId: string, permissionIds: string[]): Promise<void>;
  removePermissions(roleId: string, permissionIds: string[]): Promise<void>;
  getPermissions(roleId: string): Promise<Permission[]>;
}
```

### Permission Service

```typescript
interface PermissionService {
  // CRUD
  create(data: CreatePermissionInput): Promise<Permission>;
  findById(id: string): Promise<Permission | null>;
  findBySlug(appId: string, slug: string): Promise<Permission | null>;
  update(id: string, data: UpdatePermissionInput): Promise<Permission>;
  delete(id: string, force?: boolean): Promise<void>;
  listByApplication(appId: string, moduleId?: string): Promise<Permission[]>;

  // Role lookup
  getRolesWithPermission(permissionId: string): Promise<Role[]>;
}
```

### User Role Service

```typescript
interface UserRoleService {
  // Assignment
  assignRoles(userId: string, roleIds: string[], assignedBy?: string): Promise<void>;
  removeRoles(userId: string, roleIds: string[]): Promise<void>;

  // Queries
  getUserRoles(userId: string): Promise<Role[]>;
  getUserPermissions(userId: string): Promise<Permission[]>;
  getUsersWithRole(roleId: string, orgId: string, options?: ListOptions): Promise<PaginatedResult<User>>;

  // Token claims building
  buildRoleClaims(userId: string): Promise<string[]>;
  buildPermissionClaims(userId: string): Promise<string[]>;
}
```

### Custom Claim Service

```typescript
interface CustomClaimService {
  // Definitions
  createDefinition(data: CreateClaimDefinitionInput): Promise<CustomClaimDefinition>;
  updateDefinition(id: string, data: UpdateClaimDefinitionInput): Promise<CustomClaimDefinition>;
  deleteDefinition(id: string): Promise<void>;
  listDefinitions(appId: string): Promise<CustomClaimDefinition[]>;

  // Values
  setValue(userId: string, claimId: string, value: unknown): Promise<CustomClaimValue>;
  getValue(userId: string, claimId: string): Promise<CustomClaimValue | null>;
  deleteValue(userId: string, claimId: string): Promise<void>;
  getValuesForUser(userId: string): Promise<CustomClaimValue[]>;

  // Token claims building
  buildCustomClaims(userId: string, appId: string, tokenType: 'id_token' | 'access_token' | 'userinfo'): Promise<Record<string, unknown>>;
}
```

### Data Types

```typescript
interface Role {
  id: string;
  applicationId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Permission {
  id: string;
  applicationId: string;
  moduleId: string | null;
  name: string;
  slug: string;                     // e.g., "crm:contacts:read"
  description: string | null;
  createdAt: Date;
}

interface UserRole {
  userId: string;
  roleId: string;
  assignedBy: string | null;
  createdAt: Date;
}

interface CustomClaimDefinition {
  id: string;
  applicationId: string;
  claimName: string;
  claimType: 'string' | 'number' | 'boolean' | 'json';
  description: string | null;
  includeInIdToken: boolean;
  includeInAccessToken: boolean;
  includeInUserinfo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface CustomClaimValue {
  id: string;
  userId: string;
  claimId: string;
  claimName: string;                // Denormalized for convenience
  value: unknown;                   // Typed based on definition
  createdAt: Date;
  updatedAt: Date;
}

interface CreateRoleInput {
  applicationId: string;
  name: string;
  slug?: string;                    // Auto-generated from name if not provided
  description?: string;
}

interface CreatePermissionInput {
  applicationId: string;
  moduleId?: string;
  name: string;
  slug: string;                     // Must follow "module:resource:action" format
  description?: string;
}

interface CreateClaimDefinitionInput {
  applicationId: string;
  claimName: string;
  claimType: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
  includeInIdToken?: boolean;       // Default: false
  includeInAccessToken?: boolean;   // Default: true
  includeInUserinfo?: boolean;      // Default: true
}
```

### Token Claims Integration

The RBAC and custom claims are injected into tokens via the `findAccount.claims()` method in the OIDC provider:

```typescript
// In findAccount (RD-03)
async function claims(use: string, scope: string, claims: object, rejected: string[]) {
  const user = await userRepository.findById(accountId);
  const baseClaims = buildStandardClaims(user, scope);

  // Resolve the application from the client context
  const client = await clientRepository.findByClientId(ctx.oidc.client.clientId);
  const appId = client.applicationId;

  // Add role claims
  const roles = await userRoleService.buildRoleClaims(user.id);

  // Add permission claims
  const permissions = await userRoleService.buildPermissionClaims(user.id);

  // Add custom claims (filtered by token type)
  const tokenType = use === 'id_token' ? 'id_token'
                  : use === 'userinfo' ? 'userinfo'
                  : 'access_token';
  const customClaims = await customClaimService.buildCustomClaims(user.id, appId, tokenType);

  return {
    sub: user.id,
    ...baseClaims,
    roles,                           // e.g., ["crm-editor", "invoice-approver"]
    permissions,                     // e.g., ["crm:contacts:read", "crm:contacts:write", ...]
    ...customClaims,                 // e.g., { department: "Sales" }
  };
}
```

### Permission Slug Format

```
Format: {module}:{resource}:{action}

Module:    Application module slug (e.g., "crm", "invoice", "hr")
Resource:  The entity being accessed (e.g., "contacts", "deals", "employees")
Action:    The operation (e.g., "read", "write", "delete", "approve", "export")

Examples:
  crm:contacts:read
  crm:contacts:write
  crm:contacts:delete
  crm:deals:read
  crm:deals:write
  invoice:invoices:read
  invoice:invoices:approve
  hr:employees:read
  hr:employees:write

Special permissions:
  {module}:*:*          → All permissions for a module (wildcard, if implemented)
  admin:system:manage   → System-level admin permission
```

### Reserved Claim Names

Custom claims cannot use these names (OIDC standard + Porta internal):

```typescript
const RESERVED_CLAIM_NAMES = [
  // OIDC Standard
  'sub', 'iss', 'aud', 'exp', 'iat', 'nbf', 'jti', 'nonce', 'at_hash', 'c_hash',
  'name', 'given_name', 'family_name', 'middle_name', 'nickname',
  'preferred_username', 'profile', 'picture', 'website',
  'email', 'email_verified', 'gender', 'birthdate', 'zoneinfo', 'locale',
  'phone_number', 'phone_number_verified', 'address', 'updated_at',
  // Porta internal
  'roles', 'permissions', 'org_id', 'org_slug',
];
```

### Value Type Validation

```typescript
function validateClaimValue(definition: CustomClaimDefinition, value: unknown): boolean {
  switch (definition.claimType) {
    case 'string':  return typeof value === 'string';
    case 'number':  return typeof value === 'number' && !isNaN(value);
    case 'boolean': return typeof value === 'boolean';
    case 'json':    return value !== null && typeof value === 'object';
    default:        return false;
  }
}
```

### Audit Events

| Event | Event Type | Category |
|-------|-----------|----------|
| Role created | `role.created` | `admin` |
| Role updated | `role.updated` | `admin` |
| Role deleted | `role.deleted` | `admin` |
| Permission created | `permission.created` | `admin` |
| Permission updated | `permission.updated` | `admin` |
| Permission deleted | `permission.deleted` | `admin` |
| Permissions assigned to role | `role.permissions.assigned` | `admin` |
| Permissions removed from role | `role.permissions.removed` | `admin` |
| Roles assigned to user | `user.roles.assigned` | `admin` |
| Roles removed from user | `user.roles.removed` | `admin` |
| Custom claim defined | `claim.defined` | `admin` |
| Custom claim updated | `claim.updated` | `admin` |
| Custom claim deleted | `claim.deleted` | `admin` |
| Custom claim value set | `claim.value.set` | `admin` |
| Custom claim value deleted | `claim.value.deleted` | `admin` |

---

## Integration Points

### With RD-03 (OIDC Core)
- Claims injected via `findAccount.claims()` during token issuance
- Roles and permissions included as token claims
- Custom claims filtered by token type (id_token, access_token, userinfo)

### With RD-05 (Applications)
- Roles and permissions are scoped per application
- Modules provide namespace for permissions
- Custom claim definitions are per application

### With RD-06 (Users)
- User-role assignments are per user
- Custom claim values are per user
- User deletion cascades role assignments and claim values

### With RD-09 (CLI)
- CLI commands for role/permission CRUD
- CLI commands for user-role assignment
- CLI commands for custom claim management

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Role scope | Per-org, per-app, global | Per-app (global) | Same SaaS product, same roles for all customers |
| Assignment scope | Global, per-org | Per-org (user_roles per user) | Users are org-scoped, so assignments are too |
| Permission format | Flat string, hierarchical, bitfield | Hierarchical slug (`module:resource:action`) | Readable, namespaced, filterable |
| Token claim format | Nested object, flat array | Flat arrays (`roles: [...]`, `permissions: [...]`) | Simple, widely supported by client libraries |
| Custom claim storage | JSON column on user, separate table | Separate table (definition + values) | Type-safe, queryable, auditable |
| Claim inclusion | Always all, configurable per claim | Configurable per claim per token type | Flexible, minimizes token size |

---

## Acceptance Criteria

1. [ ] Role CRUD works per application
2. [ ] Permission CRUD works per application with module namespacing
3. [ ] Permissions assigned to roles correctly
4. [ ] Users assigned roles within their organization
5. [ ] User's roles appear in token claims as `roles: ["slug1", "slug2"]`
6. [ ] User's permissions appear in token claims as `permissions: ["mod:res:act", ...]`
7. [ ] Custom claim definition CRUD works per application
8. [ ] Custom claim values are validated against definition type
9. [ ] Custom claim values appear in correct token type (id_token/access_token/userinfo)
10. [ ] Reserved claim names are rejected for custom claims
11. [ ] Roles/permissions resolve correctly in `findAccount.claims()`
12. [ ] Role deletion prevented if users are assigned (without force flag)
13. [ ] `assigned_by` tracked on user-role assignments
14. [ ] All RBAC operations are audit-logged
15. [ ] Permission slug format enforced (`module:resource:action`)
