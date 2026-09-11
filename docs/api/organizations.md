# Organizations API

Manage tenant organizations. Each organization represents an isolated tenant with its own users, clients, and configuration.

**Base path:** `/api/admin/organizations`

## Create Organization

```http
POST /api/admin/organizations
```

**Request body:**

| Field                 | Type     | Required | Description                                        |
| --------------------- | -------- | -------- | -------------------------------------------------- |
| `name`                | string   | ✅       | Organization display name                          |
| `slug`                | string   |          | URL slug (auto-generated from name if omitted)     |
| `defaultLocale`       | string   |          | Default locale (e.g., `en`)                        |
| `defaultLoginMethods` | string[] |          | Non-empty selection of `password` and `magic_link` |
| `branding`            | object   |          | Optional initial branding settings                 |

```json
{
  "name": "Acme Corp",
  "defaultLocale": "en",
  "defaultLoginMethods": ["password", "magic_link"]
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

| Parameter  | Type    | Description                      |
| ---------- | ------- | -------------------------------- |
| `page`     | integer | Page number (default: 1)         |
| `pageSize` | integer | Items per page (default: 20)     |
| `search`   | string  | Search by name or slug           |
| `status`   | string  | Filter by status                 |
| `sort`     | string  | Sort field (`name`, `createdAt`) |
| `order`    | string  | Sort direction (`asc`, `desc`)   |

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

| Field                 | Type     | Description                                                   |
| --------------------- | -------- | ------------------------------------------------------------- |
| `name`                | string   | Display name                                                  |
| `defaultLocale`       | string   | Default locale                                                |
| `defaultLoginMethods` | string[] | Non-empty selection of `password` and `magic_link`            |
| `branding`            | object   | Nested branding fields; use `null` to clear an optional field |

The optional `branding` object accepts `logoUrl`, `faviconUrl`, `primaryColor`, `companyName`, and
`customCss`. Image URLs are fallbacks for organizations without an uploaded asset. Porta accepts
HTTPS URLs. In non-production environments it also accepts HTTP URLs for exact loopback hosts only.
Credentials in image URLs and other URL schemes are rejected.

**Response:** `200 OK` — `{ "data": <updated organization> }`.

## Suspend Organization

```http
POST /api/admin/organizations/:id/suspend
```

Suspends the organization. All authentication requests will be rejected.

**Response:** `204 No Content`

## Activate Organization

```http
POST /api/admin/organizations/:id/activate
```

Reactivates a suspended organization.

**Response:** `204 No Content`

## Update Branding

```http
PUT /api/admin/organizations/:id/branding
```

**Request body:**

| Field          | Type           | Description                                                  |
| -------------- | -------------- | ------------------------------------------------------------ |
| `logoUrl`      | string or null | External fallback logo URL, or `null` to clear it            |
| `faviconUrl`   | string or null | External fallback favicon URL, or `null` to clear it         |
| `primaryColor` | string or null | Six-digit hex color such as `#0078d4`, or `null`             |
| `companyName`  | string or null | Company display name, or `null` to use the organization name |
| `customCss`    | string or null | Existing custom template CSS, up to 10 KB                    |

Uploaded logo and favicon assets take precedence over `logoUrl` and `faviconUrl`. The URLs remain
configured fallbacks and are used again if the matching uploaded asset is deleted.

**Permission:** `admin:org:update`

**Response:** `200 OK` — `{ "data": <updated organization> }`.

The SDK exposes the same operation as
`porta.branding.updateSettings(organizationId, input)` and returns the complete updated
`Organization`. Branding settings are otherwise read from the organization resource; there is no
separate branding-settings read endpoint. `GET /:id/branding` belongs to the branding-assets API
and returns asset metadata.

## Delete Organization

```http
DELETE /api/admin/organizations/:idOrSlug
```

Permanently deletes an organization and its owned users, clients, assignments, credentials, and
security data in one database transaction. Affected sessions are revoked. The super-admin
organization is protected and cannot be deleted.

**Permission:** `admin:org:delete`

**Response:** `204 No Content`

The retained audit event follows the configured audit retention policy. It is not a surviving
organization record.

**Error responses:**

| Status | Condition                                         |
| ------ | ------------------------------------------------- |
| `400`  | Attempting to delete the super-admin organization |
| `404`  | Organization not found                            |
