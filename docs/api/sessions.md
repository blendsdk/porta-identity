# Session Management API

The session management API provides endpoints for viewing and revoking OIDC sessions. Session data is read from a PostgreSQL tracking table that mirrors Redis session state.

## Endpoints

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| `GET` | `/api/admin/sessions` | `session:read` | List active sessions |
| `GET` | `/api/admin/sessions/:sessionId` | `session:read` | Get session detail |
| `DELETE` | `/api/admin/sessions/:sessionId` | `session:revoke` | Revoke a session |
| `DELETE` | `/api/admin/users/:userId/sessions` | `session:revoke` | Revoke all user sessions |

## List Sessions

```http
GET /api/admin/sessions?page=1&pageSize=20
Authorization: Bearer <token>
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `userId` | UUID | — | Filter by user |
| `organizationId` | UUID | — | Filter by organization |
| `clientId` | UUID | — | Filter by client |
| `activeOnly` | boolean | `true` | Only show active (non-revoked, non-expired) sessions |
| `page` | number | 1 | Page number |
| `pageSize` | number | 20 | Items per page (max 100) |

### Response

```json
{
  "data": [
    {
      "sessionId": "abc123",
      "userId": "uuid",
      "clientId": "uuid",
      "organizationId": "uuid",
      "grantId": "grant-xyz",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "createdAt": "2026-01-15T10:00:00Z",
      "expiresAt": "2026-01-15T11:00:00Z",
      "lastActivityAt": "2026-01-15T10:30:00Z",
      "revokedAt": null
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

## Get Session Detail

```http
GET /api/admin/sessions/:sessionId
Authorization: Bearer <token>
```

Returns `404` if the session does not exist.

## Revoke a Session

```http
DELETE /api/admin/sessions/:sessionId
Authorization: Bearer <token>
```

Revocation cascade:
1. Marks session as revoked in the PostgreSQL tracking table
2. Deletes the session from Redis (kills the live session immediately)

Returns `204 No Content` on success.

## Revoke All User Sessions

```http
DELETE /api/admin/users/:userId/sessions
Authorization: Bearer <token>
```

### Response

```json
{
  "revoked": 3
}
```

## Session Tracking Architecture

Sessions are tracked via a fire-and-forget PostgreSQL mirror of Redis OIDC sessions:

- **Create/Update**: When an OIDC session is created or updated in Redis, a corresponding record is upserted in `admin_sessions`
- **Destroy**: When a session is destroyed in Redis, the tracking record is marked as revoked
- **Expiry**: Expired sessions are cleaned up periodically (records older than 7 days are purged)

This design ensures that session tracking never blocks or degrades the OIDC authentication flow.
