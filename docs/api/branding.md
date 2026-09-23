# Branding Assets API

Porta stores one optional logo and one optional favicon per organization. Stored assets are used by
authentication pages and HTML email. They take precedence over the external fallback URLs in the
organization's branding settings.

## Endpoints

| Method   | Path                                             | Permission         | Description                       |
| -------- | ------------------------------------------------ | ------------------ | --------------------------------- |
| `GET`    | `/api/admin/organizations/:orgId/branding`       | `admin:org:read`   | List asset metadata               |
| `GET`    | `/api/admin/organizations/:orgId/branding/:type` | `admin:org:read`   | Read protected asset bytes        |
| `PUT`    | `/api/admin/organizations/:orgId/branding/:type` | `admin:org:update` | Create or replace an asset        |
| `DELETE` | `/api/admin/organizations/:orgId/branding/:type` | `admin:org:update` | Permanently delete an asset       |
| `GET`    | `/:orgSlug/branding/:type`                       | Public             | Serve an effective uploaded image |

`:type` is either `logo` or `favicon`.

## Accepted images and limits

| Content type               | Logo limit | Favicon limit |
| -------------------------- | ---------- | ------------- |
| `image/png`                | 2 MiB      | 512 KiB       |
| `image/jpeg`               | 2 MiB      | 512 KiB       |
| `image/webp`               | 2 MiB      | 512 KiB       |
| `image/x-icon`             | 2 MiB      | 512 KiB       |
| `image/vnd.microsoft.icon` | 2 MiB      | 512 KiB       |
| `image/svg+xml`            | 2 MiB      | 512 KiB       |

The limits apply to decoded image bytes. The server checks the declared content type against the
actual PNG, JPEG, WebP, ICO, or SVG content. SVG is accepted through Porta's existing validation and
sanitization path. Malformed SVG returns the same sanitized `400` response as invalid base64,
empty content, type mismatches, and oversized images. Scripts, event handlers, and dangerous links
are removed from otherwise valid SVG before storage.

The upload request is base64 inside JSON, so the exact upload route accepts a 3 MiB JSON body in the
server and bundled development proxies. Other Admin API routes keep their smaller default limit.

## List asset metadata

```http
GET /api/admin/organizations/:orgId/branding
Authorization: Bearer <token>
```

The response contains metadata only:

```json
{
  "data": [
    {
      "id": "5ea2ad30-a62c-427f-a560-497875dc1fdd",
      "organizationId": "550e8400-e29b-41d4-a716-446655440000",
      "assetType": "logo",
      "contentType": "image/png",
      "fileSize": 15234,
      "createdAt": "2026-01-15T10:00:00.000Z",
      "updatedAt": "2026-01-15T10:00:00.000Z"
    }
  ]
}
```

## Upload or replace an asset

```http
PUT /api/admin/organizations/:orgId/branding/logo
Authorization: Bearer <token>
Content-Type: application/json
```

The body has exactly two fields:

```json
{
  "data": "iVBORw0KGgoAAAANSUhEUg...",
  "contentType": "image/png"
}
```

| Field         | Type   | Required | Description                                  |
| ------------- | ------ | -------- | -------------------------------------------- |
| `data`        | string | Yes      | Image bytes encoded as standard base64       |
| `contentType` | string | Yes      | One accepted media type from the table above |

The response is `{ "data": <asset metadata> }`. Uploading the same asset type again atomically
replaces it.

The TypeScript SDK accepts the same envelope:

```ts
const bytes = await readFile('logo.png');
const asset = await porta.branding.uploadAsset(organizationId, 'logo', {
  data: bytes.toString('base64'),
  contentType: 'image/png',
});
```

`porta.branding.listAssets()` returns metadata. `porta.branding.getAsset()` returns the protected
binary response. `porta.branding.deleteAsset()` removes an asset. Branding text settings are
updated with `porta.branding.updateSettings()`, which returns the complete updated organization.

## Delete an asset

```http
DELETE /api/admin/organizations/:orgId/branding/logo
Authorization: Bearer <token>
```

Deletion returns `204 No Content`. A missing asset returns `404`. If an external fallback URL is
configured for this slot, authentication pages use it after the uploaded asset is deleted.

## Protected and public reads

The protected Admin read returns raw bytes, the stored `Content-Type`, and one-hour cache control:

```http
GET /api/admin/organizations/:orgId/branding/logo
Authorization: Bearer <token>
```

Authentication pages and email use the public URL instead:

```http
GET /:orgSlug/branding/logo
```

The public response contains only the validated bytes and media type. It uses an `ETag` and
`Cache-Control: public, no-cache` for revalidation. It sets no cookies and exposes no organization
ID, filename, size, or storage metadata. Unknown organizations, unsupported asset types, and empty
asset slots all return the same minimal `404` response.

Suspended organizations keep their existing branding available so their authentication UI remains
consistent while an administrator repairs or reactivates them. Deleted organizations return the
same minimal `404` as every other missing case.

SVG public responses add a restrictive sandbox Content Security Policy (CSP) and rely on the
global `nosniff` header. Authentication HTML permits same-origin uploaded images, `data:` images
such as TOTP QR codes, and only the validated origins needed by configured external fallback URLs.
