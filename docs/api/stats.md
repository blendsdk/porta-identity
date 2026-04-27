# Dashboard Statistics API

The statistics API provides aggregated metrics for the admin dashboard, giving administrators a real-time overview of the Porta instance.

## Endpoints

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| `GET` | `/api/admin/stats` | `stats:read` | Get dashboard statistics |

## Get Dashboard Statistics

```http
GET /api/admin/stats
Authorization: Bearer <token>
```

### Response

```json
{
  "organizations": {
    "total": 15,
    "active": 12,
    "suspended": 2,
    "archived": 1
  },
  "users": {
    "total": 342,
    "active": 298,
    "inactive": 20,
    "suspended": 15,
    "locked": 9
  },
  "applications": {
    "total": 8,
    "active": 7,
    "archived": 1
  },
  "clients": {
    "total": 23,
    "active": 20,
    "revoked": 3
  },
  "sessions": {
    "activeSessions": 47,
    "uniqueUsers": 31
  },
  "recentActivity": {
    "loginsLast24h": 156,
    "failedLoginsLast24h": 12,
    "newUsersLast7d": 8,
    "newOrgsLast7d": 1
  }
}
```

### Field Descriptions

| Section | Field | Description |
|---------|-------|-------------|
| `organizations` | `total` | Total number of organizations |
| `organizations` | `active/suspended/archived` | Count by status |
| `users` | `total` | Total users across all organizations |
| `users` | `active/inactive/suspended/locked` | Count by status |
| `sessions` | `activeSessions` | Currently active (non-revoked, non-expired) OIDC sessions |
| `sessions` | `uniqueUsers` | Distinct users with active sessions |
| `recentActivity` | `loginsLast24h` | Successful login events in the last 24 hours |
| `recentActivity` | `failedLoginsLast24h` | Failed login events in the last 24 hours |
| `recentActivity` | `newUsersLast7d` | Users created in the last 7 days |
| `recentActivity` | `newOrgsLast7d` | Organizations created in the last 7 days |

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
      "ipAddress": "192.168.1.1",
      "createdAt": "2026-01-15T10:30:00Z"
    }
  ],
  "hasMore": true,
  "nextCursor": "eyJjIjoiMjAyNi0wMS0xNVQxMDozMDowMFoiLCJpIjoiOThmZTQ2M2EtLi4uIn0"
}
```
