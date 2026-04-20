# Admin API Overview

The Porta Admin API provides programmatic access to manage all aspects of the identity platform. All admin endpoints are served under the `/api/admin/` prefix and require JWT Bearer authentication (except the metadata endpoint).

## Base URL

```
https://your-porta-instance/api/admin
```

## Authentication

All Admin API endpoints (except `/api/admin/metadata`) require a valid JWT Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

The token must be issued by Porta's super-admin organization and the user must have the `porta-admin` RBAC role. See [Authentication](/api/authentication) for details.

## Response Format

All responses use JSON. Successful responses follow this pattern:

```json
// Single resource
{
  "id": "uuid",
  "name": "Example",
  "status": "active",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}

// Collection with pagination
{
  "data": [...],
  "pagination": {
    "total": 42,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
  }
}
```

## Error Responses

Errors follow a consistent structure:

```json
{
  "error": "NotFound",
  "message": "Organization not found",
  "statusCode": 404
}
```

| Status Code | Meaning |
|-------------|---------|
| `400` | Bad Request — validation error or invalid input |
| `401` | Unauthorized — missing or invalid token |
| `403` | Forbidden — insufficient permissions |
| `404` | Not Found — resource does not exist |
| `409` | Conflict — duplicate resource (e.g., slug already exists) |
| `422` | Unprocessable Entity — semantic validation error |
| `500` | Internal Server Error — unexpected failure |

## Pagination

List endpoints support pagination via query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number (1-based) |
| `pageSize` | integer | `20` | Items per page (max 100) |

## Filtering & Search

Many list endpoints support filtering:

| Parameter | Description |
|-----------|-------------|
| `search` | Free-text search across relevant fields |
| `status` | Filter by status (`active`, `suspended`, `archived`) |
| `sort` | Sort field (e.g., `name`, `createdAt`) |
| `order` | Sort direction (`asc` or `desc`) |

## Endpoint Groups

| Group | Prefix | Description |
|-------|--------|-------------|
| [Organizations](/api/organizations) | `/api/admin/organizations` | Tenant management |
| [Applications](/api/applications) | `/api/admin/applications` | Application registration |
| [Clients](/api/clients) | `/api/admin/clients` | OIDC client management |
| [Users](/api/users) | `/api/admin/organizations/:orgId/users` | User management |
| [Roles & Permissions](/api/rbac) | `/api/admin/applications/:appId/roles` | RBAC management |
| [Custom Claims](/api/custom-claims) | `/api/admin/applications/:appId/claims` | Custom claim definitions & values |
| [Configuration](/api/config) | `/api/admin/config` | System configuration |
| [Signing Keys](/api/keys) | `/api/admin/keys` | ES256 key management |
| [Audit Log](/api/audit) | `/api/admin/audit` | Audit trail viewer |

## Discovery Endpoint

The metadata endpoint is **unauthenticated** and used by the CLI for OIDC login discovery:

```
GET /api/admin/metadata
```

```json
{
  "issuer": "https://your-porta-instance/porta-admin",
  "authorization_endpoint": "https://your-porta-instance/porta-admin/auth/authorize",
  "token_endpoint": "https://your-porta-instance/porta-admin/auth/token"
}
```

## Rate Limiting

The Admin API does not impose its own rate limits, but the underlying OIDC token and authentication endpoints are rate-limited to prevent abuse.
