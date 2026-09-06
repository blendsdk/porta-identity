# Roles & Permissions API

Manage RBAC roles, permissions, and user-role assignments.

## Roles

**Base path:** `/api/admin/applications/:appId/roles`

### Create Role

```http
POST /api/admin/applications/:appId/roles
```

| Field         | Type   | Required | Description      |
| ------------- | ------ | -------- | ---------------- |
| `name`        | string | ✅       | Role name        |
| `description` | string |          | Role description |

```json
{
  "name": "Sales Manager",
  "description": "Full access to the sales pipeline"
}
```

**Response:** `201 Created` — Role object with auto-generated slug.

### List Roles

```http
GET /api/admin/applications/:appId/roles
```

**Response:** `200 OK` — All roles for the application.

### Get Role

```http
GET /api/admin/applications/:appId/roles/:roleId
```

**Response:** `200 OK` — Role with its assigned permissions.

### Update Role

```http
PUT /api/admin/applications/:appId/roles/:roleId
```

| Field         | Type   | Description      |
| ------------- | ------ | ---------------- |
| `name`        | string | Role name        |
| `description` | string | Role description |

### Delete Role

```http
DELETE /api/admin/applications/:appId/roles/:roleId
```

Deleting a role permanently removes its user and permission assignments. The operation requires
confirmation and cannot be undone.

### Assign Permission to Role

```http
POST /api/admin/applications/:appId/roles/:roleId/permissions
```

| Field          | Type | Required | Description          |
| -------------- | ---- | -------- | -------------------- |
| `permissionId` | uuid | ✅       | Permission to assign |

### Remove Permission from Role

```http
DELETE /api/admin/applications/:appId/roles/:roleId/permissions/:permissionId
```

---

## Permissions

**Base path:** `/api/admin/applications/:appId/permissions`

### Create Permission

```http
POST /api/admin/applications/:appId/permissions
```

| Field         | Type   | Required | Description                           |
| ------------- | ------ | -------- | ------------------------------------- |
| `name`        | string | ✅       | Permission name (e.g., `deals:write`) |
| `description` | string |          | Permission description                |

### List Permissions

```http
GET /api/admin/applications/:appId/permissions
```

### Get Permission

```http
GET /api/admin/applications/:appId/permissions/:permissionId
```

### Delete Permission

```http
DELETE /api/admin/applications/:appId/permissions/:permissionId
```

Deleting a role removes its user assignments and permission links. Deleting a permission removes
its role links. Each operation returns `204 No Content`.

---

## User-Role Assignments

**Base path:** `/api/admin/organizations/:orgId/users/:userId/roles`

### Assign Role to User

```http
POST /api/admin/organizations/:orgId/users/:userId/roles
```

| Field    | Type | Required | Description    |
| -------- | ---- | -------- | -------------- |
| `roleId` | uuid | ✅       | Role to assign |

### Remove Role from User

```http
DELETE /api/admin/organizations/:orgId/users/:userId/roles/:roleId
```

### List User's Roles

```http
GET /api/admin/organizations/:orgId/users/:userId/roles
```

**Response:** `200 OK` — All roles assigned to the user, grouped by application.
