# Admin Asset and SDK Contracts: Organization Settings and Branding

> **Document**: 03-01-admin-assets-and-sdk.md
> **Parent**: [Index](00-index.md)

## Overview

Repair the existing protected branding-asset path and SDK contract without retaining a second
upload format. This component owns the forward database constraint, actual-content validation,
strict JSON/base64 request, organization branding URL validation, and truthful SDK methods.
(RD-06 AC-09–AC-14, AC-18–AC-19; AR-2)

## Architecture

### Current Architecture

`routes/branding.ts` calls `lib/branding-assets.ts` directly. The service validates only declared
content type, nonempty bytes, and one 512 KiB limit. A separate `image-validator.ts` already owns
the desired type/size/content checks but is not called. The SDK expects a misleading settings
response and uploads raw binary even though the route accepts JSON/base64.

### Proposed Changes

Keep the route → service → PostgreSQL flow. The route validates the JSON envelope with existing
Zod primitives and decodes base64. The service passes bytes through `validateImage()` and persists
the returned data. Migration 027 replaces only the existing size check. The SDK serializes the
same envelope and returns the server's real metadata/settings shapes. (AR-2)

## Implementation Details

### Persistence and Validation

- Add `027_branding_asset_size_limits.sql`; drop/recreate only
  `branding_assets_valid_size` as `logo <= 2097152` and `favicon <= 524288`, while retaining
  `file_size > 0`. Never edit migration 018. (RD-06 AC-13, AC-18; AR-2)
- The migration runs before the matching server build serves uploads and is forward-only with a
  no-op down section. Porta has no legacy uploads, so no cleanup, backfill, read-time validation, or
  mixed-version compatibility path is needed. Development environments can use the established
  database reset workflow. (AR-1, AR-2)
- Keep `AssetType` at exactly `logo | favicon` and the five accepted media types from RD-06.
- Strengthen binary recognition only where needed: full PNG signature, JPEG SOI marker, WebP
  `RIFF....WEBP`, and ICO header. Continue using the existing SVG validation/sanitization path;
  do not add a parser or dependency. (RD-06 AC-13; AR-2)
- `uploadAsset()` calls `validateImage(data, contentType, assetType)`, rejects a false result with a
  fixed service validation error, and persists `result.data` and its actual byte length.

### Admin Upload Request

The protected PUT body is exactly:

```ts
interface BrandingAssetUploadBody {
  readonly data: string;
  readonly contentType:
    | 'image/png'
    | 'image/jpeg'
    | 'image/webp'
    | 'image/x-icon'
    | 'image/vnd.microsoft.icon'
    | 'image/svg+xml';
}
```

Use Zod 4's base64 validation and require nonempty data. The server decodes once, checks the
decoded per-type size, and then calls the service. Malformed envelopes, base64, content, and size
return the same sanitized 400 family without echoing content. Authorization remains
`admin:org:update`; listing remains `admin:org:read`. (RD-06 AC-12–AC-14, AC-18–AC-19; AR-2)

The selective body-parser branch in `server.ts` uses an exact 3 MiB JSON limit only for
`PUT /api/admin/organizations/:orgId/branding/:type`. Every other Admin endpoint retains 100 KiB.
Decoded data remains limited to 2 MiB for logos and 512 KiB for favicons. Do not introduce a
body-limit middleware framework. (RD-06 AC-18; AR-2)

### Branding Settings Validation

Extend the existing organization route schemas rather than add another endpoint. Trim URL input.
Allow HTTPS everywhere; outside production also allow HTTP only for exact loopback hosts
`localhost`, `127.0.0.1`, and `::1`. Reject credentials and all other schemes/hosts. Keep custom CSS
in the existing API but outside the Admin workspace. (RD-06 AC-09–AC-10; AR-1, AR-2)

### SDK Contracts

`BrandingDomain` becomes the direct public contract:

```ts
interface BrandingDomain {
  listAssets(orgId: string): Promise<BrandingAsset[]>;
  updateSettings(orgId: string, input: UpdateBrandingSettingsInput): Promise<Organization>;
  uploadAsset(
    orgId: string,
    assetType: 'logo' | 'favicon',
    input: BrandingAssetUploadInput,
  ): Promise<BrandingAsset>;
  getAsset(orgId: string, assetType: 'logo' | 'favicon'): Promise<TransportResponse>;
  deleteAsset(orgId: string, assetType: 'logo' | 'favicon'): Promise<void>;
}
```

`BrandingAssetUploadInput` contains `data: string` and `contentType: BrandingAssetContentType`.
`getSettings()` is removed rather than aliased. The existing truthful protected `getAsset()` binary
read remains unchanged; the new public image URL owns unauthenticated presentation. Update types,
barrel exports, domain tests, conventional CLI callers, and documentation together. Do not add an
upload compatibility shim. (RD-06 AC-11–AC-14; AR-1, AR-2)

## Integration Points

- `organizations.get/update` continue to own organization values, including `defaultLoginMethods`.
- `twoFactor.getPolicy/setPolicy` remains unchanged and sends no `If-Match` from this UI.
- The Admin UI reads files locally, base64-encodes once, and calls `branding.uploadAsset()`.
- The public route in [03-02](03-02-public-branding-rendering.md) reads the same stored asset service.

## Error Handling

| Error case                                         | Handling strategy                                         | AR Ref |
| -------------------------------------------------- | --------------------------------------------------------- | ------ |
| Malformed/empty base64 or unsupported media type   | Fixed sanitized 400; no persistence                       | AR-2   |
| Signature/type mismatch or invalid SVG             | Fixed sanitized 400; preserve previous asset              | AR-2   |
| Decoded data exceeds per-type limit                | Reject before persistence                                 | AR-2   |
| Missing organization or cross-tenant Admin request | Existing scoped not-found/authorization behavior          | AR-2   |
| Duplicate asset type                               | Atomic PostgreSQL upsert replaces that organization's row | AR-2   |
| SDK response shape is invalid                      | Admin service rejects it as an invalid response           | AR-2   |

## Testing Requirements

- Unit specifications for Zod input, signature matching, sanitization handoff, permissions, and
  fixed errors.
- Integration specifications for migration constraints, upsert metadata, isolation, and preserved
  prior data on rejection.
- SDK runtime and type specifications for exact list/upload/update responses and removed false
  methods.
- Conventional CLI regression coverage for the corrected `updateSettings()` response.
