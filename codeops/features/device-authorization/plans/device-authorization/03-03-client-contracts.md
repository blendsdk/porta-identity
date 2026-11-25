# 03-03: Client Contracts and Administration

> **Document**: 03-03-client-contracts.md
> **Parent**: [Index](00-index.md)
> **Requirements**: RD-03
> **AR Refs**: P-10, P-15, preflight PF-001, PF-011, PF-012, PF-018, PF-025

## Scope

Make the full device grant and the zero-redirect device-only client a consistent public contract
across the server validator, Admin API, SDK, CLI client commands, Admin terminal, portability and
docs. The provider consumes the grant through `findForOidc`; no provider code changes are needed
here.

## Shared Grant and Response-Type Contract

Server `packages/server/src/clients/validators.ts`:

```ts
export const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code' as const;

export const clientGrantTypesSchema = z
  .array(z.enum([
    'authorization_code',
    'refresh_token',
    'client_credentials',
    DEVICE_CODE_GRANT,
  ]))
  .min(1);

export const clientResponseTypesSchema = z.array(z.literal('code')).max(1);
```

`responseTypes` may be `[]` only for a device-only client. All other clients keep exactly
`['code']`. The compatibility validator enforces the relationship:

```ts
const hasAuthorizationCode = grantTypes.includes('authorization_code');
const hasDeviceCode = grantTypes.includes(DEVICE_CODE_GRANT);
const deviceOnly = hasDeviceCode && !hasAuthorizationCode;

if (deviceOnly) {
  if (responseTypes.length !== 0) errors.push('device-only clients cannot have response types');
} else if (responseTypes.length !== 1 || responseTypes[0] !== 'code') {
  errors.push('responseTypes must contain only code');
}
```

`getDefaultGrantTypes()` stays unchanged. The device grant is explicit opt-in. The service applies
`responseTypes: []` only when the resulting grant set is device-only and the caller omitted
`responseTypes`; an explicit non-empty response type on a device-only client is rejected. For every
other client the default remains `['code']`. The compatibility validator’s **second** grant
allowlist (`supportedGrants` in `validators.ts`) must include `DEVICE_CODE_GRANT`; adding the URN
only to the Zod enum is not sufficient.

The provider client schema rejects a client whose response types are non-empty and whose redirect
URIs are empty, and it adds `authorization_code` when the response type contains `code`. Empty
response types are therefore mandatory for a zero-redirect device-only client; a synthetic redirect
URI is not permitted.

## Conditional Redirect Rule

`redirectUrisSchema` becomes `z.array(z.string().url()).max(10)`. `validateRedirectUris` keeps its
non-empty behavior for callers that require a redirect. The device-only path must gate the empty
array in all three places:

1. `validateClientProtocolCompatibility` uses the device-only condition instead of the unconditional
   `redirectUris.length < 1` check, and skips the internal `validateRedirectUris([...])` rejection
   for an empty device-only array. The current condition ORs that helper, which returns invalid for
   an empty array; keep the URL, control-character and uniqueness checks for non-empty arrays.
2. `createClient` calls `validateRedirectUris` only when `redirectUris.length > 0` or the client is
   not device-only.
3. `applyClientUpdate` applies the same gate to the merged configuration before the repository
   update.

```ts
if (!deviceOnly && redirectUris.length < 1) {
  errors.push('redirectUris must contain at least one URI unless the client is device-only');
}
```

Keep the existing URL, fragment, wildcard, control-character and uniqueness checks, the one-to-ten
maximum, public/confidential rules, response-type rule and PKCE invariant. A device-only client may
be public or confidential; public clients still require `requirePkce=true`.

## Admin API

`packages/server/src/routes/clients.ts` uses the extended grant and response-type schemas. The
create schema’s `superRefine` must derive the effective response types from the grant set
(device-only → `[]`, otherwise `['code']`) before calling the compatibility validator; it must not
hardcode `responseTypes ?? ['code']`. The service layer remains the final validator and validates
the complete resulting configuration on update.

| Create input | Result |
|---|---|
| `grantTypes` omitted | Existing defaults; `responseTypes: ['code']`; no device grant |
| Device-only + `redirectUris: []` + `responseTypes: []` | `201` |
| Device-only + non-empty redirects + `responseTypes: []` | `201` (unused redirects allowed) |
| Device-only + `responseTypes: ['code']` | `400` |
| Auth-code + `redirectUris: []` | `400` |
| Device + auth-code + `redirectUris: []` | `400` |
| Unknown grant | `400` |
| Public + `client_credentials` | `400` (existing) |
| Public + `requirePkce=false` | `400` (existing) |

Update validates the resulting complete configuration, not the patch alone. ETag, tenant ownership,
control-plane authority, permissions and response shape stay unchanged.

## SDK

Add `DEVICE_CODE_GRANT` to `packages/sdk/src/types/clients.ts`; export it from
`packages/sdk/src/types/index.ts` and `packages/sdk/src/index.ts`. Keep `ResponseType = 'code'` and
allow an empty `responseTypes` array in `CreateClientInput`/`UpdateClientInput` only for a
device-only client. The runtime validator accepts the full URN and `responseTypes: []` for a
device-only client, and rejects `[]` for a client that still has `authorization_code`.

No SDK device-flow auth provider is added.

## CLI Client Commands

`packages/cli/src/commands/client.ts`:

| Command | Change |
|---|---|
| `create` | Optional `--grant-types`; optional `--redirect-uris`; device-only may omit redirects and sends `responseTypes: []` |
| `update` | Optional `--grant-types` replacement; `--redirect-uris ""` clears; device-only sends `responseTypes: []`; a client that regains auth code must send `['code']` and at least one redirect |
| `get` / `list` | Render the full URN and the empty response-type state |

Rules:

1. Parse comma-separated full URNs; reject empty/unknown values before the request.
2. On create, if redirects are omitted, send `[]` and `responseTypes: []` only for a device-only
   selection; otherwise fail with a clear message and send `responseTypes: ['code']`.
3. On update, send an empty redirect array only when `--redirect-uris ""` is supplied; the server
   rejects it when the resulting client still has authorization code. Send `responseTypes: []`
   only when the resulting grants are device-only.
4. No friendly alias.

`packages/server/src/cli/commands/init.ts` adds `DEVICE_CODE_GRANT` to the new public native admin
client's grants and updates the existing exact-grant tests. Existing installs enable it explicitly
through `porta client update`, the SDK, the Admin API or `porta admin`. Docs include the exact
command.

## Admin Terminal

| File | Change |
|---|---|
| `packages/cli/src/admin/client-state.ts` | Add the URN to `grantTypes`; allow an empty `responseTypes` collection |
| `packages/cli/src/admin/client-service.ts` | Parser accepts the URN and up to four grants; redirect list minimum becomes 0; response types may be empty only for device-only |
| `packages/cli/src/admin/client-workspace.ts` | Append the grant to the Protocol `CheckGroup` with the label `Device authorization` and the exact stored value; save `responseTypes: []` for device-only and `['code']` otherwise; preserve `client_credentials` index assumptions; make the last-redirect deletion guard conditional |
| `packages/cli/src/admin/client-authentication-dialog.ts` | Make the last-redirect guard conditional on the client retaining authorization code; add the file to the plan’s test inventory |
| `packages/cli/src/admin/client-registration-dialog.ts` | Add a grant `CheckGroup`; default auth-code+refresh; device-only may omit the redirect and sends `responseTypes: []` |

The terminal remains single-operator. No concurrency, polling or mutation retry is added. A save
reloads authoritative server state through the existing controller.

## Portability

`packages/server/src/portability/schema.ts` uses the extended grant, zero-permitting redirect and
empty response-type schema; the existing `validateClientProtocolCompatibility` call enforces the
conditional rules. Export/import keep their atomicity, ordering, ownership and error behavior. A
manifest containing the device grant requires a server release that understands it; no manifest
version bump is added. Older readers reject the closed value.

## Release and Fleet Compatibility

Release notes and the release preflight state:

- The server adds the full grant value and accepts `responseTypes: []` for device-only clients.
- SDK/CLI/Admin terminal must be upgraded in lockstep to read device-enabled clients.
- Existing installs must explicitly enable the grant on the built-in admin CLI client.
- **Every server instance must run a release that understands the device URN before the grant is
  enabled on any client.** An older server instance rejects a client whose stored `grant_types`
  contains the URN for every flow, including authorization-code and refresh, during a rolling
  deployment. This is a deployment gate, not a manifest-version change.

## Documentation

| Document | Change |
|---|---|
| `docs/api/clients.md` | Correct create/update fields to camelCase; grant values; empty response types; device-only rule and example |
| `docs/cli/clients.md` | `--grant-types`, optional redirects, device-only example, admin-client enablement |
| `docs/concepts/oidc.md` | Add the device flow and endpoints; fixed limits, audit event names, absence of a device setting |
| `docs/concepts/capabilities.md` | Add the supported flow |
| `docs/guide/custom-ui.md` | Porta-rendered device pages; host UI keeps login/consent |
| `docs/api/authentication.md` | Link the device-login path |
| `techdocs/` | Refine during implementation if code diverges |

The public docs build must pass. Do not edit generated `dist/` files.

## Files

`clients/validators.ts`, `clients/service.ts`, `routes/clients.ts`, `portability/schema.ts`,
`packages/sdk/src/types/clients.ts`, `packages/sdk/src/types/index.ts`, `packages/sdk/src/index.ts`,
`packages/sdk/src/domains/clients.ts`, `packages/cli/src/commands/client.ts`,
`packages/cli/src/admin/client-state.ts`, `client-service.ts`, `client-workspace.ts`,
`client-authentication-dialog.ts`, `client-registration-dialog.ts`,
`packages/server/src/cli/commands/init.ts`, docs and tests.

## Tests

ST-15–ST-19 and ST-32 in [07-testing-strategy.md](07-testing-strategy.md), plus the existing client,
SDK, CLI, Admin terminal and portability suites. Add an end-to-end case that creates a device-only
client and then completes `POST /device/auth`; the Admin API test alone is not sufficient. Update
the existing `porta init` exact-grant tests.
