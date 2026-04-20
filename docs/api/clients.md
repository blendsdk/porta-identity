# Clients API

Manage OIDC clients. Each client belongs to an organization and an application.

**Base path:** `/api/admin/clients`

## Create Client

```http
POST /api/admin/clients
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `client_name` | string | ✅ | Human-readable client name |
| `organization_id` | uuid | ✅ | Owning organization |
| `application_id` | uuid | ✅ | Associated application |
| `client_type` | string | ✅ | `confidential` or `public` |
| `application_type` | string | | `web`, `native`, or `spa` (default: `web`) |
| `redirect_uris` | string[] | ✅ | Allowed redirect URIs |
| `grant_types` | string[] | | Grant types (defaults based on client type) |
| `response_types` | string[] | | Response types |
| `scope` | string | | Space-separated scopes |
| `token_endpoint_auth_method` | string | | `client_secret_post` or `none` |
| `cors_origins` | string[] | | Allowed CORS origins (for SPAs) |
| `require_pkce` | boolean | | Require PKCE (default: `true` for public clients) |
| `login_methods` | string[] | | Override org default login methods |

```json
{
  "client_name": "ERP Web App",
  "organization_id": "org-uuid",
  "application_id": "app-uuid",
  "client_type": "public",
  "application_type": "spa",
  "redirect_uris": ["https://erp.example.com/callback"],
  "scope": "openid profile email roles custom_claims",
  "cors_origins": ["https://erp.example.com"]
}
```

**Response:** `201 Created` — Returns the client object with the generated `client_id`. For confidential clients, the initial secret is included in the response (shown only once).

## List Clients

```http
GET /api/admin/clients
```

Supports `page`, `pageSize`, `search`, `status`, `sort`, `order`, and `organization_id` filter.

**Response:** `200 OK` — Paginated list with `effectiveLoginMethods` computed for each client.

## Get Client

```http
GET /api/admin/clients/:id
```

**Response:** `200 OK` — Full client object including `effectiveLoginMethods`.

## Update Client

```http
PUT /api/admin/clients/:id
```

Updatable fields: `client_name`, `redirect_uris`, `grant_types`, `response_types`, `scope`, `cors_origins`, `login_methods`.

**Response:** `200 OK`

## Status Management

```http
POST /api/admin/clients/:id/revoke
POST /api/admin/clients/:id/activate
POST /api/admin/clients/:id/deactivate
```

**Response:** `200 OK`

::: warning
Revoking a client immediately invalidates all its tokens and prevents new authentication flows.
:::

## Client Secrets

Confidential clients can have multiple active secrets for zero-downtime rotation.

### Generate Secret

```http
POST /api/admin/clients/:id/secrets
```

| Field | Type | Description |
|-------|------|-------------|
| `label` | string | Optional label for the secret |

**Response:** `201 Created`

```json
{
  "id": "secret-uuid",
  "clientId": "client-uuid",
  "label": "production-2024",
  "secret": "the-plaintext-secret",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

::: danger
The plaintext secret is shown **only once** in this response. Store it securely.
:::

### List Secrets

```http
GET /api/admin/clients/:id/secrets
```

Returns metadata only (no plaintext secrets).

### Revoke Secret

```http
POST /api/admin/clients/:id/secrets/:secretId/revoke
```

**Response:** `200 OK`
