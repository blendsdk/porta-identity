# Public Branding Rendering: Organization Settings and Branding

> **Document**: 03-02-public-branding-rendering.md
> **Parent**: [Index](00-index.md)

## Overview

Make a stored logo or favicon usable by authentication pages and email without exposing the Admin
asset API or raw storage details. This component owns one public image router, one shared effective-
branding service, page/email context adoption, image-only CSP changes, and bundled proxy sizing.
(RD-06 AC-15–AC-18; AR-2)

## Architecture

### Current Architecture

Authentication and recovery routes build branding from organization text fields in several places.
Email service code does the same. The global security middleware replaces HTML CSP after route
execution, while the OIDC catch-all sets `HTML_CSP` directly. Uploaded assets have no public route.

### Proposed Changes

Add `routes/public-branding.ts` before the OIDC catch-all. It performs an exact direct organization
lookup, permits active and suspended status, loads one exact asset, and emits bytes or the same
minimal 404. Add `lib/effective-branding.ts` to resolve uploaded-asset metadata before configured
URLs and defaults. Existing context builders await this service and pass its result to templates.
(AR-2)

### Public Asset Route

`GET /:orgSlug/branding/:type` accepts only `logo` or `favicon`. It does not use `tenantResolver()`
because that middleware rejects suspended organizations. It uses `findOrganizationBySlug()` and
`getAsset(organization.id, type)` with no list operation. Unknown organization, unsupported type,
and absent asset all produce the same fixed 404 body and headers. (RD-06 AC-15, AC-19; AR-2)

Success returns:

- Stored validated bytes and stored media type.
- An ETag set through `setETagHeader(ctx, 'branding-asset', asset.id, asset.updatedAt)`.
- `Cache-Control: public, no-cache` so clients may revalidate without stale long-lived branding.
- No cookies, organization IDs, filenames, byte counts, or storage metadata.
- For SVG, the existing global `nosniff` plus response CSP
  `sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:`. This allows ordinary
  self-contained SVG image rendering while disabling active document behavior and external loads.

No feature-specific rate limiter is added: this is an idempotent bounded image GET, not an
authentication attempt or mutation. Deployment-level availability controls remain outside RD-06.
(AR-1, AR-2)

### Effective Branding Service

Add one async function with a presentation-only result:

```ts
interface EffectiveBranding {
  readonly companyName: string;
  readonly primaryColor: string;
  readonly logoUrl: string | null;
  readonly faviconUrl: string | null;
  readonly customCss: string | null;
  readonly imageSources: readonly string[];
}

async function resolveEffectiveBranding(organization: Organization): Promise<EffectiveBranding>;
```

The resolver lists metadata only. For each asset type, metadata presence selects an absolute URL to
the public route; otherwise the already validated configured URL is used; otherwise the value is
null. Company name falls back to organization name and primary color to Porta's existing default.
Custom CSS is passed through unchanged for existing template compatibility but remains absent from
the Admin UI. Public asset URLs use only the trusted configured `issuerBaseUrl`; request `Host` and
forwarded-host values never influence them. `imageSources` contains only internally derived `'self'`
and validated external HTTP(S) origins. (RD-06 AC-09, AC-16–AC-17; AR-1, AR-2)

If metadata lookup throws, return configured values/defaults and write one sanitized diagnostic
without organization branding content, URLs, bytes, or SQL details. Do not retry. The public route
itself may return the ordinary fixed server error on an infrastructure failure. (RD-06 AC-16; AR-2)

### Context and CSP Integration

- Replace duplicate synchronous branding builders in interaction, magic-link, password-reset,
  invitation, two-factor, OIDC-provider, and email paths with the resolver.
- Keep the existing `TemplateContext.branding` field names so default and organization-provided
  templates receive one compatible contract.
- Extend the Koa state declaration with validated effective image sources. The security-header
  middleware appends only `img-src 'self' data: <validated external origins>` for HTML responses
  and preserves the current script/style/frame/default directives.
- Keep static/base CSP on the generic `oidcProvider.callback()` path. Resolve effective branding and
  apply dynamic image sources only in existing HTML-rendering hooks. Reuse one CSP builder; do not
  add another middleware layer or branding lookup to non-HTML protocol endpoints.
- Escape template values through existing Handlebars behavior; do not inject raw URL or company
  values. Existing custom CSS handling is unchanged and outside this plan's UI scope.

### Bundled Proxy Limits

Add the exact branding-asset PUT location to `docker/nginx-dev.conf` and
`docker/admin-playground/nginx.conf`, with the same exact 3 MiB request limit as the server route.
Reuse each file's current proxy headers. Do not raise the default location limit or add new
deployment files. (RD-06 AC-18; AR-2)

## Error Handling

| Error case                                          | Handling strategy                                       | AR Ref |
| --------------------------------------------------- | ------------------------------------------------------- | ------ |
| Unknown org, invalid type, or missing asset         | Same minimal public 404                                 | AR-2   |
| Suspended organization                              | Serve its exact existing asset                          | AR-2   |
| Deleted organization                                | Same minimal 404                                        | AR-2   |
| Effective metadata lookup fails                     | Configured URL/text, then Porta defaults; sanitized log | AR-2   |
| Invalid stored/configured branding reaches resolver | Ignore invalid presentation value; use default          | AR-2   |
| SVG direct navigation                               | Restrictive response CSP and `nosniff`                  | AR-2   |
| External image origin                               | Add only the validated origin to `img-src`              | AR-2   |

## Testing Requirements

- Route specifications for active/suspended success, 404 equivalence, no cookies/metadata, ETag,
  cache control, and SVG headers.
- Resolver specifications for precedence, absolute URLs, defaults, lookup failure, and safe logs.
- Template/email specifications proving the shared context without raw storage coupling.
- Security-header and penetration specifications proving exact directives and no organization
  enumeration or cross-tenant read.
- Browser tests for uploaded/fallback logo, favicon, TOTP QR data image, and unchanged auth flow.
- Proxy configuration structure assertions for exact route-only request limits.
