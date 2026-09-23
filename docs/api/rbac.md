# Roles and Permissions API

Porta provides application-scoped roles and permissions plus organization-scoped user-role
assignments. Every endpoint requires Admin authentication and its specific `admin:*` capability.
Successful JSON responses use the `{ "data": ... }` envelope.

## Roles

Base path: `/api/admin/applications/:appId/roles`

| Method   | Path                   | Capability          | Result                                                                |
| -------- | ---------------------- | ------------------- | --------------------------------------------------------------------- |
| `POST`   | `/`                    | `admin:role:create` | `201` with the created role                                           |
| `GET`    | `/`                    | `admin:role:read`   | `200` with the complete role array                                    |
| `GET`    | `/:roleId`             | `admin:role:read`   | `200` with one role                                                   |
| `PUT`    | `/:roleId`             | `admin:role:update` | `200` with `{ role, reauthenticationRequired }`                       |
| `DELETE` | `/:roleId`             | `admin:role:delete` | `200` with `{ reauthenticationRequired }`                             |
| `GET`    | `/:roleId/permissions` | `admin:role:read`   | `200` with directly assigned permissions                              |
| `PUT`    | `/:roleId/permissions` | `admin:role:update` | `204` after assigning the supplied permission IDs                     |
| `DELETE` | `/:roleId/permissions` | `admin:role:update` | `200` with `{ reauthenticationRequired }` after removing supplied IDs |

Create accepts `name`, optional `slug`, and optional `description`. When omitted, the slug is
derived from the name. Update accepts any subset of those fields; `description` may be `null`.
An explicit slug is the exact role claim value expected by the application.

```http
POST /api/admin/applications/3d4c25e1-908a-4df5-b97a-f61742d36b51/roles
Content-Type: application/json

{
  "name": "Sales manager",
  "slug": "GROUP_SALES_MANAGER",
  "description": "Manages the sales pipeline"
}
```

Permission mappings use one non-empty UUID array:

```json
{ "permissionIds": ["7d620f65-0a49-45f3-a90b-0d98230df63d"] }
```

Deleting a role permanently removes its permission mappings and user assignments. An actual
authority reduction revokes affected grants and sessions. If the authenticated actor is affected,
`reauthenticationRequired` is `true`.

## Permissions

Base path: `/api/admin/applications/:appId/permissions`

| Method   | Path             | Capability                | Result                                    |
| -------- | ---------------- | ------------------------- | ----------------------------------------- |
| `POST`   | `/`              | `admin:permission:create` | `201` with the created permission         |
| `GET`    | `/`              | `admin:permission:read`   | `200` with the complete permission array  |
| `GET`    | `/:permId`       | `admin:permission:read`   | `200` with one permission                 |
| `PUT`    | `/:permId`       | `admin:permission:update` | `200` with the updated permission         |
| `DELETE` | `/:permissionId` | `admin:permission:delete` | `200` with `{ reauthenticationRequired }` |
| `GET`    | `/:permId/roles` | `admin:permission:read`   | `200` with roles using the permission     |

`GET /` accepts an optional `moduleId` UUID query parameter. Create requires `name` and `slug`, and
accepts optional `moduleId` and `description`. Update changes only `name` and `description`; slug
and scope are stable identity. The slug is the exact permission claim value expected by the
application; a colon-separated value is a convention, not a requirement.

```http
POST /api/admin/applications/3d4c25e1-908a-4df5-b97a-f61742d36b51/permissions
Content-Type: application/json

{
  "name": "Write deals",
  "slug": "CAN_WRITE_DEAL",
  "moduleId": "5221bf2e-9083-43b7-961d-f3137ebdd68c",
  "description": "Creates and updates deals"
}
```

Deleting a permission permanently removes its role mappings and revokes authority for affected
users.

Role and permission slugs preserve case and internal characters. Porta trims surrounding
whitespace, rejects empty or control-character values, and enforces the documented length limits.
Each slug must be unique within its application. OIDC role and permission claim arrays contain
unique values.

## User-role assignments

Base path: `/api/admin/organizations/:orgId/users/:userId/roles`

| Method   | Path           | Capability          | Result                                                                |
| -------- | -------------- | ------------------- | --------------------------------------------------------------------- |
| `GET`    | `/`            | `admin:role:read`   | `200` with complete role objects assigned to the user                 |
| `PUT`    | `/`            | `admin:role:assign` | `204` after assigning the supplied role IDs                           |
| `DELETE` | `/`            | `admin:role:assign` | `200` with `{ reauthenticationRequired }` after removing supplied IDs |
| `GET`    | `/permissions` | `admin:role:read`   | `200` with the user's resolved permission objects                     |

Assignment and removal both accept one non-empty UUID array:

```json
{ "roleIds": ["4d451b89-b288-4a57-9370-05b05732727c"] }
```

The target user must belong to `:orgId`. Assigning a canonical Porta Admin role is also limited by
the authenticated actor's own static Admin capabilities; an administrator cannot delegate more
Admin authority than they possess. Removing a role is idempotent and reports
`reauthenticationRequired: false` when no assignment changed.

## Application and canonical boundaries

Role and permission child IDs are always checked against `:appId`; a valid child from another
application is not accepted. Ordinary applications may reuse names or slugs used elsewhere without
gaining Porta Admin authority.

The canonical roles, permissions, and mappings in the `porta-admin` application cannot be changed
through generic RBAC mutation endpoints. `porta init` and the development reset workflow own those
definitions.
