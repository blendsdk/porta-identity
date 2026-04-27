# Organizations API

Manage tenant organizations. Each organization represents an isolated tenant with its own users, clients, and configuration.

**Base path:** `/api/admin/organizations`

## Create Organization

```http
POST /api/admin/organizations
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Organization display name |
| `slug` | string | | URL slug (auto-generated from name if omitted) |
| `default_locale` | string | | Default locale (e.g., `en`) |
| `default_login_methods` | string[] | | Login methods: `["password", "magic_link"]` |

```json
{
  "name": "Acme Corp",
  "default_locale": "en",
  "default_login_methods": ["password", "magic_link"]
}
```

**Response:** `201 Created`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "status": "active",
  "isSuperAdmin": false,
  "defaultLocale": "en",
  "defaultLoginMethods": ["password", "magic_link"],
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

## List Organizations

```http
GET /api/admin/organizations
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `pageSize` | integer | Items per page (default: 20) |
| `search` | string | Search by name or slug |
| `status` | string | Filter by status |
| `sort` | string | Sort field (`name`, `createdAt`) |
| `order` | string | Sort direction (`asc`, `desc`) |

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "...",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "status": "active",
      "isSuperAdmin": false,
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

## Get Organization

```http
GET /api/admin/organizations/:id
```

**Response:** `200 OK` — Full organization object including branding fields.

## Update Organization

```http
PUT /api/admin/organizations/:id
```

**Request body:** Any subset of mutable fields:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name |
| `default_locale` | string | Default locale |
| `default_login_methods` | string[] | Default login methods |

**Response:** `200 OK` — Updated organization object.

## Suspend Organization

```http
POST /api/admin/organizations/:id/suspend
```

Suspends the organization. All authentication requests will be rejected.

**Response:** `200 OK`

## Activate Organization

```http
POST /api/admin/organizations/:id/activate
```

Reactivates a suspended organization.

**Response:** `200 OK`

## Archive Organization

```http
POST /api/admin/organizations/:id/archive
```

Permanently archives the organization. **This action is irreversible.**

**Response:** `200 OK`

::: danger
Archiving is permanent. An archived organization cannot be reactivated.
:::

## Update Branding

```http
PUT /api/admin/organizations/:id/branding
```

**Request body:**

| Field | Type | Description |
|-------|------|-------------|
| `logo_url` | string | Logo URL |
| `favicon_url` | string | Favicon URL |
| `primary_color` | string | Primary color (hex, e.g., `#0078d4`) |
| `company_name` | string | Company display name |
| `custom_css` | string | Custom CSS for login pages |

**Response:** `200 OK` — Updated organization with branding fields.

## Get Branding

```http
GET /api/admin/organizations/:id/branding
```

**Response:** `200 OK` — Branding fields for the organization.

## Destroy Organization

```http
DELETE /api/admin/organizations/:idOrSlug
```

Permanently hard-deletes an organization and all child entities via PostgreSQL CASCADE. The super-admin organization is protected and cannot be deleted.

**Permission:** `ORG_ARCHIVE`

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `dry-run` | boolean | If `true`, return cascade counts without deleting |

### Dry Run Response

```http
DELETE /api/admin/organizations/acme?dry-run=true
```

**Response:** `200 OK`

```json
{
  "dryRun": true,
  "organization": { "id": "...", "name": "Acme Corp", "slug": "acme", "..." },
  "cascadeCounts": {
    "applications": 3,
    "clients": 5,
    "users": 42,
    "roles": 8,
    "permissions": 16,
    "claim_definitions": 4
  }
}
```

### Destroy Response

```http
DELETE /api/admin/organizations/acme
```

**Response:** `200 OK`

```json
{
  "organization": { "id": "...", "name": "Acme Corp", "slug": "acme", "..." },
  "cascadeCounts": {
    "applications": 3,
    "clients": 5,
    "users": 42,
    "roles": 8,
    "permissions": 16,
    "claim_definitions": 4
  }
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| `400` | Attempting to destroy the super-admin organization |
| `404` | Organization not found |
