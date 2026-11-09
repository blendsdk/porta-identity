# Resource Servers API

Manage application-owned API resource servers for RFC 8707 resource indicators.

**Base path:** `/api/admin/applications/:appId/resource-servers`

::: warning Deployment-global configuration
A resource server belongs to one application and is shared across every organization that uses
that application. Changes affect all clients of the application. See the
[Core ownership model](../concepts/ownership-model.md).
:::

The `:appId` and `:resourceServerId` path parameters accept either the internal UUID or the
corresponding slug. Identifiers and audiences are matched exactly, so register the canonical URI
form clients will send.

## Permissions

| Operation | Permission |
| --- | --- |
| List, get | `admin:app:read` |
| Create, update, delete | `admin:app:update` |

A missing permission returns the existing `403` response. A resource server owned by another
application is indistinguishable from an unknown resource and returns `404`.

## Resource-server fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Internal UUID |
| `applicationId` | string | Owning application UUID |
| `slug` | string | Stable application-local slug |
| `name` | string | Display name |
| `identifier` | string | Exact absolute RFC 8707 resource identifier |
| `audience` | string | Access-token `aud`; defaults to the identifier |
| `scopes` | string[] | Sorted custom scope registry |
| `createdAt` | string | ISO-8601 creation timestamp |
| `updatedAt` | string | ISO-8601 last-change timestamp |

`slug` reuses the application slug rules: 3–100 lowercase letters, numbers, and hyphens; it cannot
start or end with a hyphen, cannot be a reserved application word, and cannot look like a UUID.
`identifier` and `audience` must be absolute URIs with a lowercase scheme, no fragment, no raw
whitespace or control characters, and at most 2,048 characters. Identifiers and audiences are
globally unique across all applications.

## List Resource Servers

```http
GET /api/admin/applications/:appId/resource-servers
```

Returns every resource server owned by the application, ordered by name and then identifier.

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "applicationId": "22222222-2222-4222-8222-222222222222",
      "slug": "billing-api",
      "name": "Billing API",
      "identifier": "https://billing.example.test",
      "audience": "https://billing.example.test",
      "scopes": ["billing:read"],
      "createdAt": "2026-11-09T00:00:00.000Z",
      "updatedAt": "2026-11-09T00:00:00.000Z"
    }
  ]
}
```

An application with no rows returns `{ "data": [] }`.

## Create Resource Server

```http
POST /api/admin/applications/:appId/resource-servers
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | ✅ | 1–255 characters; no control characters |
| `slug` | string | | Application-local slug; derived from `name` when omitted |
| `identifier` | string | ✅ | Exact absolute resource URI |
| `audience` | string or null | | Access-token audience; omitted or null means the identifier |
| `scopes` | string[] | | Custom scopes; omitted means an empty registry |

```bash
curl -X POST "https://porta.example.test/api/admin/applications/acme/resource-servers" \
  -H "Authorization: Bearer $PORTA_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Billing API",
    "identifier": "https://billing.example.test",
    "scopes": ["billing:read", "billing:write"]
  }'
```

**Response:** `201 Created` with `{ "data": ResourceServer }`.

The custom scope registry may not contain the standard OIDC scopes `openid`, `profile`, `email`,
`address`, `phone`, or `offline_access`; those are protocol-owned and already available through
the resolver. Duplicate scopes are rejected. Provider-registered tenant scopes may be registered
when a resource server actually exposes them; client metadata still gates grants.

## Get Resource Server

```http
GET /api/admin/applications/:appId/resource-servers/:resourceServerId
```

**Response:** `200 OK` with `{ "data": ResourceServer }`.

## Update Resource Server

```http
PUT /api/admin/applications/:appId/resource-servers/:resourceServerId
```

`PUT` is a full replacement. `name`, `slug`, and `identifier` are required. An omitted or `null`
`audience` resets to the identifier. An omitted `scopes` array clears the custom registry; sending a
new array replaces the complete registry atomically.

```bash
curl -X PUT "https://porta.example.test/api/admin/applications/acme/resource-servers/billing-api" \
  -H "Authorization: Bearer $PORTA_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Billing API",
    "slug": "billing-api",
    "identifier": "https://billing.example.test",
    "audience": "https://api.billing.example.test",
    "scopes": ["billing:read"]
  }'
```

**Response:** `200 OK` with the updated resource server.

## Delete Resource Server

```http
DELETE /api/admin/applications/:appId/resource-servers/:resourceServerId
```

**Response:** `204 No Content`

Deletion is permanent and cascades the custom-scope registry and identifier/audience namespace
entries. It does not delete the application, clients, users, or already-issued tokens. New requests
for the deleted identifier or audience fail with `invalid_target`; already-issued opaque access
tokens remain valid until their normal expiry.

## Errors

| Status | Body | When |
| --- | --- | --- |
| `400` | `{ "error": "Resource server request is invalid" }` | Invalid body, path, URI, slug, name, scope, duplicate scope, or standard OIDC scope |
| `404` | `{ "error": "Application not found" }` | `:appId` does not resolve |
| `404` | `{ "error": "Resource server not found" }` | Unknown or foreign resource server |
| `409` | `{ "error": "Resource server conflicts with an existing identifier, audience, or slug" }` | Unique constraint collision |
| `503` | `{ "error": "Resource server operation failed" }` | Unexpected storage failure |

## Related

- [Applications API](applications.md)
- [Resource indicators](../concepts/ownership-model.md)
- [CLI: Resource Servers](../cli/resource-servers.md)
