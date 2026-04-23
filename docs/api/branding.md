# Branding Assets API

The branding API manages organization-level logo and favicon images. Assets are stored as PostgreSQL bytea for simple deployment.

## Endpoints

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| `GET` | `/api/admin/organizations/:orgId/branding` | `org:read` | List branding assets |
| `GET` | `/api/admin/organizations/:orgId/branding/:type` | `org:read` | Get asset (binary) |
| `PUT` | `/api/admin/organizations/:orgId/branding/:type` | `org:update` | Upload/replace asset |
| `DELETE` | `/api/admin/organizations/:orgId/branding/:type` | `org:update` | Delete asset |

## Asset Types

| Type | Description |
|------|-------------|
| `logo` | Organization logo (displayed in login pages, admin UI) |
| `favicon` | Browser favicon for the organization |

## Supported Formats

| Content Type | Description |
|-------------|-------------|
| `image/png` | PNG image |
| `image/svg+xml` | SVG vector image |
| `image/x-icon` | ICO favicon |
| `image/vnd.microsoft.icon` | Microsoft ICO format |
| `image/jpeg` | JPEG image |
| `image/webp` | WebP image |

**Maximum file size:** 512 KB

## List Branding Assets

```http
GET /api/admin/organizations/:orgId/branding
Authorization: Bearer <token>
```

Returns metadata only (no binary data):

```json
{
  "data": [
    {
      "id": "uuid",
      "organizationId": "uuid",
      "assetType": "logo",
      "contentType": "image/png",
      "fileSize": 15234,
      "createdAt": "2026-01-15T10:00:00Z",
      "updatedAt": "2026-01-15T10:00:00Z"
    },
    {
      "id": "uuid",
      "organizationId": "uuid",
      "assetType": "favicon",
      "contentType": "image/x-icon",
      "fileSize": 4096,
      "createdAt": "2026-01-15T10:00:00Z",
      "updatedAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

## Get Asset (Binary)

```http
GET /api/admin/organizations/:orgId/branding/logo
Authorization: Bearer <token>
```

Returns the raw binary image data with appropriate `Content-Type` header and 1-hour cache control.

## Upload Asset

```http
PUT /api/admin/organizations/:orgId/branding/logo
Authorization: Bearer <token>
Content-Type: application/json
```

### Request Body (JSON with base64)

```json
{
  "data": "iVBORw0KGgoAAAANSUhEUg...",
  "contentType": "image/png"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | string | Yes | Base64-encoded image data |
| `contentType` | string | Yes | MIME type of the image |

### Response

```json
{
  "data": {
    "id": "uuid",
    "organizationId": "uuid",
    "assetType": "logo",
    "contentType": "image/png",
    "fileSize": 15234,
    "createdAt": "2026-01-15T10:00:00Z",
    "updatedAt": "2026-01-15T10:00:00Z"
  }
}
```

If an asset of the same type already exists, it is replaced (upsert behavior).

## Delete Asset

```http
DELETE /api/admin/organizations/:orgId/branding/logo
Authorization: Bearer <token>
```

Returns `204 No Content` on success, `404` if no asset of that type exists.
