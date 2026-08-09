# Dashboard Statistics API

The statistics API provides aggregated metrics for the admin dashboard, giving administrators a real-time overview of the Porta instance.

## Endpoints

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| `GET` | `/api/admin/stats/overview` | `stats:read` | System-wide dashboard statistics |
| `GET` | `/api/admin/stats/organization/:orgId` | `stats:read` | Per-organization dashboard statistics |

## Get System-Wide Statistics

```http
GET /api/admin/stats/overview
Authorization: Bearer <token>
```

### Response

The response is wrapped in a `{ "data": ... }` envelope. Entity counts are
`StatusCounts` objects: `total` is always present, and additional keys are the
per-status counts discovered for that table.

```json
{
  "data": {
    "organizations": { "total": 15, "active": 12, "suspended": 2, "archived": 1 },
    "users": {
      "total": 342, "active": 298, "inactive": 20, "suspended": 15, "locked": 9,
      "newLast7d": 8, "newLast30d": 25, "activeLast30d": 180
    },
    "applications": { "total": 8, "active": 7, "archived": 1 },
    "clients": { "total": 23, "active": 20, "revoked": 3 },
    "loginActivity": {
      "last24h": { "successful": 156, "failed": 12 },
      "last7d":  { "successful": 980, "failed": 64 },
      "last30d": { "successful": 4120, "failed": 210 }
    },
    "systemHealth": { "database": true, "redis": true },
    "generatedAt": "2026-01-15T10:30:00Z"
  }
}
```

### Field Descriptions

| Section | Field | Description |
|---------|-------|-------------|
| `organizations` / `applications` / `clients` | `total` + per-status keys | `StatusCounts` — total plus a count for each status found |
| `users` | `total` + per-status keys | `StatusCounts` (active/inactive/suspended/locked) |
| `users` | `newLast7d` / `newLast30d` | Users created in the last 7 / 30 days |
| `users` | `activeLast30d` | Users who logged in within the last 30 days |
| `loginActivity` | `last24h` / `last7d` / `last30d` | `{ successful, failed }` login counts per rolling window |
| `systemHealth` | `database` / `redis` | Service health booleans |
| `generatedAt` | — | ISO-8601 timestamp the snapshot was generated |

## Get Per-Organization Statistics

```http
GET /api/admin/stats/organization/:orgId
Authorization: Bearer <token>
```

Returns the same shape scoped to a single organization (no `organizations` or
`applications` sections; adds `organizationId`).

```json
{
  "data": {
    "organizationId": "org-uuid",
    "users": {
      "total": 42, "active": 38, "inactive": 2, "suspended": 1, "locked": 1,
      "newLast7d": 3, "newLast30d": 9, "activeLast30d": 30
    },
    "clients": { "total": 4, "active": 4 },
    "loginActivity": {
      "last24h": { "successful": 22, "failed": 1 },
      "last7d":  { "successful": 140, "failed": 6 },
      "last30d": { "successful": 600, "failed": 25 }
    },
    "generatedAt": "2026-01-15T10:30:00Z"
  }
}
```


## Entity Change History

Each entity (organization, application, client, user) exposes a history endpoint that returns audit log entries specific to that entity.

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| `GET` | `/api/admin/organizations/:id/history` | `org:read` | Organization change history |
| `GET` | `/api/admin/applications/:id/history` | `app:read` | Application change history |
| `GET` | `/api/admin/clients/:id/history` | `client:read` | Client change history |
| `GET` | `/api/admin/organizations/:orgId/users/:userId/history` | `user:read` | User change history |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 20 | Number of history entries (max 100) |
| `after` | string | — | Opaque cursor for pagination (pass `nextCursor` from previous response) |
| `event_type` | string | — | Filter by event type prefix (e.g., `org.status`) |

### Response

```json
{
  "data": [
    {
      "id": "uuid",
      "eventType": "user.status.suspended",
      "actorId": "uuid",
      "metadata": { "reason": "Policy violation" },
      "createdAt": "2026-01-15T10:30:00Z"

    }
  ],
  "hasMore": true,
  "nextCursor": "eyJjIjoiMjAyNi0wMS0xNVQxMDozMDowMFoiLCJpIjoiOThmZTQ2M2EtLi4uIn0"
}
```
