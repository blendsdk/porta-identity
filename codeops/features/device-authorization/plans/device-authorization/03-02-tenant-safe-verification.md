# 03-02: Tenant-Safe Verification and Branded Approval

> **Document**: 03-02-tenant-safe-verification.md
> **Parent**: [Index](00-index.md)
> **Requirements**: RD-02
> **AR Refs**: P-7, P-9, P-12, preflight PF-002, PF-010, PF-016, PF-017, PF-022, PF-023, PF-025

## Scope

Add the organization binding that makes device approval safe in Porta's path-based tenancy, then
render branded code-entry, confirmation and success pages. Login, 2FA and consent continue through
the existing interaction routes. The device flow is not enabled until this binding is mounted.

## Tenant-Binding Middleware

New file `packages/server/src/middleware/device-tenant.ts`:

```ts
export function deviceTenantBinding(provider: Provider): Middleware;
```

Mounted in `packages/server/src/server.ts` on the organization-prefixed OIDC router after the body
parser and before the provider callback. It handles:

| Method | Path | Check |
|---|---|---|
| `GET` | `/{orgSlug}/device` | If `user_code` is present, resolve the DeviceCode client and compare organizations |
| `POST` | `/{orgSlug}/device` | Resolve the submitted `user_code` before the provider handles it |
| `GET` | `/{orgSlug}/device/:uid` | Resolve the interaction's DeviceCode client and compare organizations |

### Path handling

Use one shared helper, `relativeOidcRoute(ctx)`, from
`packages/server/src/oidc/org-resolution.ts`:

```ts
function relativeOidcRoute(ctx: Context): string {
  const orgSlug =
    (ctx.state.organization as { slug?: string } | undefined)?.slug ?? ctx.params.orgSlug;
  const prefix = `/${orgSlug ?? ''}`;
  const path = ctx.path.startsWith(prefix) ? ctx.path.slice(prefix.length) : ctx.path;
  const segments = path.split('/').filter(Boolean).map((segment) => segment.toLowerCase());
  if (segments[0] === 'device' && ctx.method === 'POST' && segments[1] === 'auth') {
    return '/device/auth';
  }
  if (segments[0] === 'device' && segments.length === 2) {
    return '/device/:uid';
  }
  return `/${segments.join('/')}`;
}
```

The helper strips exactly the resolved org slug, lowercases only the route segments, removes
trailing slashes and returns `/device/:uid` for a resume. Use `ctx.state.organization.slug` from the
tenant resolver; `.use()` middleware must not rely solely on router params being populated. The UID
itself is read from `ctx.params.uid` (or the matched route), never from the lowercased string, so
its case is preserved. `deviceTenantBinding` matches `/device`, `/device/auth` and `/device/:uid`.
Registering real `@koa/router` routes is an acceptable alternative; use `ctx.params` and preserve
UID case.

### User-code lookup

1. Read `ctx.state.organization.id` (the tenant resolver already validated the slug).
2. Extract one bounded string `user_code`: reject arrays, objects, duplicate values and strings whose
   normalized form exceeds 64 characters with the same generic `404` body used for a tenant
   mismatch. Do not query the database for overlong input. Empty values are left to the provider's
   generic no-code page; malformed input is not a tenant decision and reveals nothing about a code.
3. Normalize with a local `normalizeUserCode` that copies the provider’s exact rule: uppercase ASCII
   `[a-z]`, then remove `\W` (which removes non-ASCII and keeps underscore). Do not use a naive
   `.toUpperCase()`; `ß` and fullwidth characters must behave exactly as the provider behaves. Add a
   property test comparing the helper with `oidc-provider`’s `normalize` for lowercase, hyphen,
   space, underscore, `ß`, `İ` and fullwidth inputs.
4. Call `provider.DeviceCode.findByUserCode(normalized, { ignoreExpiration: true })`. Do not pass
   `ignoreSessionBinding` to this method; its type and implementation do not support it.
5. A missing or expired code is left for the provider’s generic page; it is not a tenant mismatch.
6. Resolve the client from the code’s `clientId` through `getClientByClientId`. If the client is
   missing, foreign or belongs to another organization, respond `404` with a generic body and stop.
   Do not call the provider, create an interaction, show a client name or start a session.
7. Emit the existing privacy-safe protocol rejection observation
   (`observeProtocolSecurityRejection`) with the existing `client-tenant-binding-rejected` class on
   the 404 path; do not add a new closed event class.
8. For a resume route, bound the UID to 1..128 characters matching `[A-Za-z0-9_-]+`, call
   `provider.Interaction.find(uid)`, read its `deviceCode` identifier and call
   `provider.DeviceCode.find(jti, { ignoreExpiration: true, ignoreSessionBinding: true })`. The
   installed `@types/oidc-provider` declares only `ignoreExpiration` for this method; add a narrow
   local type augmentation or a typed wrapper for the runtime-supported option (no unsafe cast) and
   test an `expiresWithSession` code. Compare the interaction’s client organization with the request
   organization. Read the signed resume
   cookie with the provider cookie keys; if it verifies and names a different interaction, return
   the same generic `404`; if it cannot be verified, leave the provider to reject. Never trust the
   path UID alone. A missing/mismatched interaction is a generic `404`; tests use provider-shaped
   43-character nanoid fixtures, never UUID fakes.
9. Reject `HEAD` on `/device` and `/device/:uid` with the existing `rejectHeadProbe` helper. The
   provider auto-routes HEAD to GET; `/device/:uid` is state-changing and must not be probed.
10. Otherwise continue.

The user-code limiter (03-05) runs **before** this middleware and counts `GET /device` requests that
carry `user_code` as well as `POST /device` submissions, so the lookup cannot be used as an
unthrottled database path. The plain code-entry GET without a code is not counted.

The middleware must not return the client name, scopes, code state or any tenant-specific branding
for a mismatch.

### Interaction organization hardening

`packages/server/src/oidc/provider.ts` changes the `interactionUrl` callback to prefer the loaded
client's organization:

```ts
const clientOrgId = (ctx as InternalCtx).oidc?.client?.organizationId;
const org = clientOrgId ? { id: clientOrgId } : req?._portaOrganization;
```

Reuse the shared `resolveOrganizationId()` helper from `oidc/org-resolution.ts` rather than adding a
second org-resolution copy. The request organization remains the fallback for routes with no loaded
client. This is defense in depth only: the middleware is the primary control. Move
`resolveOrgForProviderHook` into the shared module and pass it into the page-hook factory so
`configuration.ts` does not import `device-pages.ts` while `device-pages.ts` imports
`configuration.ts`.

## Provider Page Hooks

Add `packages/server/src/oidc/device-pages.ts` with:

```ts
userCodeInputSourceHook(ctx, form, out, err): Promise<void>
userCodeConfirmSourceHook(ctx, form, client, deviceInfo, userCode): Promise<void>
deviceSuccessSourceHook(ctx): Promise<void>
```

Register them in `buildProviderConfiguration` under `features.deviceFlow`. The hooks:

- Resolve the organization with the shared resolver; the request organization (`_portaOrganization`)
  is the first strategy, then the loaded client’s `organizationId`, then the existing session
  strategy.
- Resolve locale with the existing `resolveLocale` and `Accept-Language` fallback, load branding with
  `resolveEffectiveBranding`, build `t` with `getTranslationFunction(locale, orgSlug)` and pass the
  provider XSRF as the template `csrfToken`.
- Render `device-code`, `device-confirm` or `device-success` through `renderPage`.
- Set `Content-Security-Policy` with `buildHtmlCsp(branding.imageSources)`; no third-party fonts,
  scripts or stylesheets; only the organization's validated branding images.
- Never render `device_code`, raw provider errors or stack information.

### Form contract

The provider gives a trusted prebuilt form with the action URL, XSRF value and field names. The
implementation may extract the XSRF value with a bounded regex and build a Porta-owned form:

- Action: `ctx.oidc.urlFor('code_verification')`.
- Input page fields: `xsrf`, `user_code`.
- Confirmation fields: `xsrf`, `user_code`, `confirm=yes`; abort button `abort=yes`.
- Input: visible `<label for="device-user-code">`, `id="device-user-code"`, uppercase display,
  `autocomplete="off"`, `autocapitalize="characters"`, `spellcheck="false"`, bounded length.
- The provider's `checkXsrf` middleware remains authoritative.
- A form-contract test asserts the action, hidden names and XSRF are present, the provider accepts a
  submitted form, and a missing or mismatched XSRF is rejected.

`verification_uri_complete` uses the provider's transient auto-submit page, which is not branded.
It immediately posts to the branded confirmation page and is not treated as the user-facing page.
ST-12 must assert the branded confirmation page after the auto-submit, not the transient page.

### Page content and states

| State | Content |
|---|---|
| Code entry | Organization branding, title, instruction, labeled input, submit |
| Confirmation | Client name, user code, requested scopes, Approve, Abort |
| Invalid/expired/used/aborted | One generic invalid-or-expired message and a new-code form |
| Cross-tenant | `404` generic body; no page data |
| User-code limit | `429` branded generic page with `Retry-After` (03-05) |
| Success | Client name and “return to your device”; no auto-close or redirect |

The confirmation page shows the requested scope string from
`ctx.oidc.deviceCode.params.scope`, split and escaped. Use the existing consent-page human-readable
scope labels where they exist; otherwise show the requested scope string. It must not read
`ctx.oidc.params.scope`: on `POST /device`, `ctx.oidc.params` contains only `xsrf`, `user_code`,
`confirm` and `abort`. The success page may use `ctx.oidc.deviceCode.scope`. The page shows no IP or
user agent.

The aborted state uses the same generic invalid-or-expired page as unknown, expired and used codes.
The device poll receives `access_denied`; the browser does not get a distinct “cancelled” state.
This resolves the RD-02 AC-4/state-table inconsistency.

## Login, 2FA and Consent Reuse

No changes to `packages/server/src/routes/interactions.ts` are required for the flow itself:

- An existing session is reused.
- No session → existing login page and configured methods.
- 2FA → existing challenge.
- `requireConsent=true` → existing consent page.
- Trusted client → existing consent gate auto-consents after the confirmation page.
- Abort/deny → provider sets `access_denied`; 03-05 writes the denial audit.

The provider writes account, grant, scope, auth time, ACR/AMR and session binding to the DeviceCode.

## Templates and Locales

Add:

- `packages/server/templates/default/pages/device-code.hbs`
- `packages/server/templates/default/pages/device-confirm.hbs`
- `packages/server/templates/default/pages/device-success.hbs`
- `packages/server/locales/default/en/device.json`
- `packages/server/locales/default/nl/device.json`

Add `device` to the `NAMESPACES` allowlist in `packages/server/src/auth/i18n.ts` and update
`REQUIRED_NAMESPACES` plus the “exactly eleven namespaces” test in
`packages/server/tests/unit/auth/invitation-locales.spec.test.ts` and
`packages/server/tests/unit/lib/system-config-catalog.spec.test.ts`. Keys cover title, instructions,
labels, generic invalid-or-expired (including abort), Approve, Abort, success and rate-limit text.
Templates follow the existing layout, branding, accessibility and page-quality patterns.

## Files

| File | Change |
|---|---|
| `packages/server/src/middleware/device-tenant.ts` | New organization-binding middleware |
| `packages/server/src/oidc/org-resolution.ts` | Shared path and organization helpers |
| `packages/server/src/server.ts` | Mount the middleware and HEAD guards |
| `packages/server/src/oidc/provider.ts` | Prefer client organization in `interactionUrl` |
| `packages/server/src/oidc/device-pages.ts` | New page hooks |
| `packages/server/src/oidc/configuration.ts` | Register hooks and use the shared resolver |
| `packages/server/src/auth/i18n.ts` | Add the `device` namespace |
| `packages/server/templates/default/pages/device-*.hbs` | New pages |
| `packages/server/locales/default/{en,nl}/device.json` | New locale keys |

## Tests

ST-10–ST-14 and ST-34 in [07-testing-strategy.md](07-testing-strategy.md), plus the
page-quality/accessibility checks and the XSRF negative case. Cross-tenant and resume tests must
pass before any client receives the device grant. ST-24 and ST-28 are Phase 2 limiter/redaction
cases, not this component’s Phase 1 binding gate.
