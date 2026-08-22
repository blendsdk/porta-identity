# Bulk Operations API

The bulk operations API enables performing status changes on multiple entities in a single request. Designed for admin UI batch operations.

## Endpoints

| Method | Path                                   | Permission                                    | Description                           |
| ------ | -------------------------------------- | --------------------------------------------- | ------------------------------------- |
| `POST` | `/api/admin/bulk/organizations/status` | matching `admin:org:*` transition permission  | Bulk organization status change       |
| `POST` | `/api/admin/bulk/users/status`         | matching `admin:user:*` transition permission | Tenant-scoped bulk user status change |

## Bulk Organization Status Change

```http
POST /api/admin/bulk/organizations/status
Authorization: Bearer <token>
Content-Type: application/json
```

### Request Body

```json
{
  "ids": ["uuid-1", "uuid-2", "uuid-3"],
  "action": "suspend",
  "reason": "Policy review"
}
```

| Field    | Type   | Required | Description                                  |
| -------- | ------ | -------- | -------------------------------------------- |
| `ids`    | UUID[] | Yes      | Organization IDs (1-100)                     |
| `action` | string | Yes      | One of: `activate`, `suspend`, `archive`     |
| `reason` | string | No       | Reason for the status change (max 500 chars) |

### Valid Organization Transitions

| Action     | From Status       | To Status |
| ---------- | ----------------- | --------- |
| `activate` | suspended         | active    |
| `suspend`  | active            | suspended |
| `archive`  | active, suspended | archived  |

## Bulk User Status Change

```http
POST /api/admin/bulk/users/status
Authorization: Bearer <token>
Content-Type: application/json
```

### Request Body

```json
{
  "ids": ["uuid-1", "uuid-2"],
  "action": "suspend",
  "reason": "Suspicious activity",
  "organizationId": "org-uuid"
}
```

| Field            | Type   | Required | Description                                                   |
| ---------------- | ------ | -------- | ------------------------------------------------------------- |
| `ids`            | UUID[] | Yes      | User IDs (1-100)                                              |
| `action`         | string | Yes      | One of: `activate`, `deactivate`, `suspend`, `lock`, `unlock` |
| `reason`         | string | No       | Reason for suspend/lock (max 500 chars)                       |
| `organizationId` | UUID   | Yes      | Organization scope                                            |

### Valid User Transitions

| Action       | From Status         | To Status |
| ------------ | ------------------- | --------- |
| `activate`   | inactive, suspended | active    |
| `deactivate` | active              | inactive  |
| `suspend`    | active              | suspended |
| `lock`       | active              | locked    |
| `unlock`     | locked              | active    |

## Response Format

Both endpoints return the same response format with per-item results:

```json
{
  "total": 3,
  "succeeded": 2,
  "failed": 1,
  "results": [
    {
      "id": "uuid-1",
      "success": true,
      "code": null,
      "previousStatus": "active",
      "newStatus": "suspended"
    },
    {
      "id": "uuid-2",
      "success": true,
      "previousStatus": "active",
      "newStatus": "suspended"
    },
    {
      "id": "uuid-3",
      "success": false,
      "code": "not_found_or_not_authorized"
    }
  ]
}
```

## Limits

- Maximum **100 items** per bulk operation
- Items are processed individually, so partial success is possible
- Duplicate IDs reject the complete request before access or mutation
- Each item uses a tenant-qualified `SELECT ... FOR UPDATE` and a separate transaction containing
  the update and durable audit row
- An audit-write failure rolls back that item; earlier committed items remain authoritative and
  the failed item plus every remaining item is reported as `not_attempted`
- If infrastructure stops after committed items, every remaining row is returned in order with
  code `not_attempted` and one correlation ID; raw dependency diagnostics are never returned
- All queries are parameterized (SQL injection safe)
