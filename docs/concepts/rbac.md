# RBAC & Permissions

Porta provides a full **Role-Based Access Control (RBAC)** system that is scoped to applications. Roles and permissions are defined per application, and users are assigned roles within their organization context.

## Data Model

```mermaid
erDiagram
    APPLICATION ||--o{ ROLE : "has"
    APPLICATION ||--o{ PERMISSION : "has"
    ROLE ||--o{ ROLE_PERMISSION : "maps to"
    PERMISSION ||--o{ ROLE_PERMISSION : "maps to"
    USER ||--o{ USER_ROLE : "assigned"
    ROLE ||--o{ USER_ROLE : "assigned to"

    ROLE {
        uuid id
        uuid application_id
        string name
        string slug
        string description
        boolean is_system
    }

    PERMISSION {
        uuid id
        uuid application_id
        string name
        string slug
        string description
    }

    ROLE_PERMISSION {
        uuid role_id
        uuid permission_id
    }

    USER_ROLE {
        uuid user_id
        uuid role_id
    }
```

## Key Concepts

### Applications Scope Roles

Roles and permissions are defined **per application**, not globally. This means:

- An ERP application can have roles like `erp-admin`, `accountant`, `viewer`
- A CRM application can have roles like `sales-manager`, `support-agent`
- Role names don't conflict across applications

### Organization Scope Assignments

User-role assignments are checked within the **organization context**. A user in Organization A with the `admin` role has no authority in Organization B.

### System Roles

Some roles are marked as **system roles** (`is_system = true`). These are created during bootstrap and cannot be deleted. The most important system role is `porta-admin`, which grants access to the Admin API.

## How Roles Appear in Tokens

When a user authenticates, their roles are included in the access token and ID token under the `roles` claim:

```json
{
  "sub": "user-uuid",
  "email": "alice@example.com",
  "roles": [
    {
      "application": "erp",
      "roles": ["admin", "accountant"]
    },
    {
      "application": "crm",
      "roles": ["viewer"]
    }
  ]
}
```

Roles are included when the `roles` scope is requested during the authorization flow.

## Permission Resolution

Permissions are attached to roles through **role-permission mappings**. When checking authorization in your application:

1. Get the user's roles from the token
2. Look up the permissions for those roles (via Porta's API or cache them)
3. Check if the required permission is present

```mermaid
flowchart LR
    A[User authenticates] --> B[Token includes roles]
    B --> C[Your app receives token]
    C --> D{Check permission}
    D -->|Has permission| E[Allow access]
    D -->|Missing permission| F[Deny access]
```

## Managing RBAC

### Via Admin API

```bash
# Create a role
POST /api/admin/applications/{appId}/roles
{ "name": "Sales Manager", "description": "Can manage sales pipeline" }

# Create a permission
POST /api/admin/applications/{appId}/permissions
{ "name": "deals:write", "description": "Create and edit deals" }

# Assign permission to role
POST /api/admin/applications/{appId}/roles/{roleId}/permissions
{ "permissionId": "..." }

# Assign role to user
POST /api/admin/organizations/{orgId}/users/{userId}/roles
{ "roleId": "..." }
```

### Via CLI

```bash
# Create role and permission
porta app role create --app-id <id> --name "Sales Manager"
porta app permission create --app-id <id> --name "deals:write"

# Assign permission to role
porta app role assign-perm --app-id <id> --role-id <id> --permission-id <id>

# Assign role to user
porta user roles assign --org-id <id> --user-id <id> --role-id <id>
```

## Caching

Role and permission lookups are cached in Redis with automatic invalidation when assignments change. This ensures that token generation remains fast even with complex RBAC hierarchies.
