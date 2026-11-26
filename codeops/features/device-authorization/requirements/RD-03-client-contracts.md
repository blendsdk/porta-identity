# RD-03: Client Contracts and Administration

> **Document**: RD-03-client-contracts.md
> **Status**: Draft
> **Created**: 2026-11-24
> **Project**: Porta
> **Depends On**: RD-01
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

The device authorization grant is part of a client's public OIDC contract. A client cannot use the
flow unless its registered grants include
`urn:ietf:params:oauth:grant-type:device_code`. The grant must be visible and editable through every
Porta administration surface, and a device-only client must be creatable without a redirect URI.

This requirement defines the server validators, Admin API, TypeScript SDK, CLI client commands,
Admin terminal workspaces, portability schema and documentation. It does not implement the CLI
device-login runtime flow (RD-04) or the provider protocol (RD-01).

The change is deliberately consistent: an administrator must not encounter a grant that the API
accepts but the SDK rejects, or a client the CLI can create but the Admin terminal cannot. The
repository's lockstep release model is the supported upgrade boundary.

---

## Functional Requirements

### Must Have

- [ ] One named constant represents the device grant in the server and one in the SDK:
      `urn:ietf:params:oauth:grant-type:device_code`. The literal is not duplicated across call
      sites.
- [ ] The shared client grant schema accepts the full URN in addition to the three existing grants.
- [ ] The protocol compatibility validator accepts the full URN.
- [ ] `getDefaultGrantTypes()` is unchanged. A new client never receives the device grant unless
      the caller selects it.
- [ ] A client create/update request may use zero redirect URIs only when:
      - the device grant is present, and
      - the authorization-code grant is absent.
- [ ] A device-only client stores `response_types: []`; any non-empty response-type collection is
      rejected with HTTP `400`. All other clients keep exactly `['code']`. This is required because
      the provider rejects non-empty response types with zero redirects and would add
      `authorization_code` to a `code` client.
- [ ] A client with the authorization-code grant still requires one to ten redirect URIs.
- [ ] A client with no authorization-code grant and no device grant keeps the existing redirect-URI
      requirement.
- [ ] A device-only client may be public or confidential.
- [ ] A public device-only client still requires `requirePkce=true`; PKCE is unused by the device
      flow but the existing public-client invariant is preserved.
- [ ] `application_type=native` is the documented device-client choice, but no new application type
      is added and the value is not enforced.
- [ ] The Admin API create and update routes accept and return the full URN in `grantTypes`.
- [ ] The Admin API accepts `redirectUris: []` for a valid device-only configuration and rejects it
      for an authorization-code client with HTTP `400`.
- [ ] The Admin API preserves its existing permissions, tenant ownership, ETag behavior, error
      mapping, audit and response shape.
- [ ] The SDK `GrantType` union and runtime response validator accept the full URN.
- [ ] The SDK create/update inputs can send the full URN, an empty redirect URI array and an empty
      response-type array for a device-only client.
- [ ] `porta client create` accepts `--grant-types` as a comma-separated list of full grant URNs.
- [ ] `porta client create` accepts an omitted `--redirect-uris` only when the selected grants are
      device-only; otherwise it fails before the API call with a clear message.
- [ ] `porta client update` accepts `--grant-types` as a full replacement list and an empty
      `--redirect-uris ""` to clear redirect URIs when the resulting client is device-only.
- [ ] `porta client get` and the client list render the device grant without truncation or error.
- [ ] `porta init` includes the device grant in the built-in admin CLI client for new installs.
- [ ] Existing installations can enable the grant explicitly through the Admin API, SDK, CLI or
      Admin terminal. No migration silently widens the built-in client's grants.
- [ ] The Admin terminal client state, response parser and Protocol editor accept the full URN.
- [ ] The Admin terminal Protocol editor displays a human-readable device-authorization label and
      saves the full URN.
- [ ] The Admin terminal registration flow can create a device-only client without a redirect URI
      and with an empty response-type collection, and prevents creating an authorization-code client
      without a redirect.
- [ ] Portability export and import round-trip the full URN, an empty redirect URI array and an empty
      response-type array for a device-only client.
- [ ] Portability keeps its existing strict manifest version and atomic apply behavior. A manifest
      containing the device grant is documented as requiring a server release that understands it.
- [ ] The public API and CLI documentation describes the full URN, the device-only redirect and
      empty-response-type rules, the explicit-opt-in default and the admin-client enablement step.
- [ ] The touched client API documentation uses the actual camelCase request fields.
- [ ] The custom-UI documentation states that device code entry, confirmation and success are
      Porta-rendered pages while login and consent remain host-UI interactions.
- [ ] No new admin permission, API endpoint, audit event, application type or global setting is
      added.

### Should Have

- [ ] The CLI help text and examples use the full URN rather than a friendly alias.
- [ ] The Admin terminal grant label uses “Device authorization” and keeps the stored value exact.
- [ ] The SDK exports the device grant constant for consumers that build client-management tools.
- [ ] Release notes state the lockstep server/SDK/CLI requirement for device-enabled clients.

### Won't Have (Out of Scope)

- A `device_code` alias or a translation layer.
- A new Admin API version or capability-negotiation endpoint.
- A new permission or RBAC role.
- A new application type or a device-management model.
- Device-only client defaults for native or public clients.
- A separate admin UI for device grants.
- The CLI device-login runtime (RD-04) or provider behavior (RD-01).

---

## Technical Requirements

### Shared grant contract

Server:

```ts
// packages/server/src/clients/validators.ts
export const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code' as const;

export const clientGrantTypesSchema = z
  .array(z.enum([
    'authorization_code',
    'refresh_token',
    'client_credentials',
    DEVICE_CODE_GRANT,
  ]))
  .min(1);
```

SDK:

```ts
// packages/sdk/src/types/clients.ts
export const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code' as const;
export type GrantType =
  | 'authorization_code'
  | 'client_credentials'
  | 'refresh_token'
  | typeof DEVICE_CODE_GRANT;
```

The server validator remains the protocol authority. The SDK constant is a type/runtime helper, not
a second source of truth; contract tests assert the literal.

### Conditional redirect-URI rule

`redirectUrisSchema` currently rejects an empty array at the Zod boundary. Change the shared schema
to permit zero and enforce the conditional rule in `validateClientProtocolCompatibility`, which is
already called by the Admin API and portability import:

```ts
const hasAuthorizationCode = grantTypes.includes('authorization_code');
const hasDeviceCode = grantTypes.includes(DEVICE_CODE_GRANT);
const deviceOnly = hasDeviceCode && !hasAuthorizationCode;

if (!deviceOnly && redirectUris.length < 1) {
  errors.push('redirectUris must contain at least one URI unless the client is device-only');
}
```

Keep the existing one-to-ten maximum, URL validation, control-character rejection and uniqueness
checks. Keep the existing public/confidential, origin and PKCE rules.

### Device-only response types

The shared `clientResponseTypesSchema` must permit an empty array. The protocol compatibility
validator then enforces:

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

The compatibility validator already has a second grant allowlist (`supportedGrants`); add
`DEVICE_CODE_GRANT` there as well as in the Zod enum. The service and Admin API route derive the
effective response types from the grant set: device-only → `[]`, otherwise `['code']`. The provider
client metadata receives the stored empty array; a non-empty response type with zero redirects is
invalid, and a `code` response type would silently add `authorization_code` to the client.

### Admin API

The existing routes keep their paths and permissions:

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/api/admin/clients` | `admin:client:create` |
| `PUT` | `/api/admin/clients/:id` | `admin:client:update` |
| `GET` | `/api/admin/clients/:id` | `admin:client:read` |

Create behavior:

| Input | Result |
| --- | --- |
| `grantTypes` omitted | Existing defaults; device grant absent |
| Device-only grants and `redirectUris: []` | `201`, client created |
| Device-only grants and non-empty redirects | `201`, redirects stored but unused |
| Authorization-code grant and `redirectUris: []` | `400` |
| Device grant plus authorization-code grant and `redirectUris: []` | `400` |
| Unknown grant value | `400` |
| Public client with `client_credentials` | `400` (existing rule) |
| Public client with `requirePkce=false` | `400` (existing rule) |

Update behavior:

- `grantTypes` replaces the stored list when present.
- `redirectUris` replaces the stored list when present; an empty array clears it.
- Validation uses the resulting complete configuration, not the patch alone.
- ETag, `If-Match`, tenant ownership, control-plane authority, audit and response shape stay
  unchanged.

The route and service layers both rely on the shared validator. The service layer remains the final
authority for direct SDK/CLI consumers and portability import.

### SDK contract

Update:

- `packages/sdk/src/types/clients.ts`: `GrantType`, `DEVICE_CODE_GRANT`, JSDoc for
  `CreateClientInput.redirectUris` (required field, may be `[]` for device-only).
- `packages/sdk/src/types/index.ts` and `packages/sdk/src/index.ts`: export the constant.
- `packages/sdk/src/domains/clients.ts`: runtime validator accepts the URN.
- Type-contract tests: the constant is assignable to `GrantType`, an unknown grant is rejected, and
  a device-only create input type-checks with `redirectUris: []`.

The SDK does not add a device-flow auth provider. It remains an Admin API client; the CLI owns the
device-login runtime.

### CLI client commands

`packages/cli/src/commands/client.ts` changes:

| Command | New behavior |
| --- | --- |
| `porta client create` | `--grant-types` optional; `--redirect-uris` optional; device-only may omit redirects; auth-code clients must include them |
| `porta client update` | `--grant-types` optional replacement; `--redirect-uris` optional; `--redirect-uris ""` clears when valid |
| `porta client get` | Renders the full device grant |
| `porta client list` | Renders the full device grant |

Validation rules:

1. Parse `--grant-types` as a comma-separated list. Reject an empty list when explicitly supplied.
2. Reject unknown values before the request with a message naming the accepted grants.
3. On create, if redirect URIs are omitted:
   - send `[]` only when the selected grants are device-only;
   - otherwise print a clear error and do not call the API.
4. On update, if `--redirect-uris ""` is supplied, send `[]`; the server rejects it when the
   resulting client still has the authorization-code grant.
5. Do not add friendly aliases. The full URN is the value.

`porta init` adds `DEVICE_CODE_GRANT` to the built-in public native admin client's grants. Existing
installations use the new `--grant-types` flag, the SDK, the Admin API or the Admin terminal. The
documentation includes the exact update command.

### Admin terminal

Update:

- `packages/cli/src/admin/client-state.ts`: `grantTypes` union.
- `packages/cli/src/admin/client-service.ts`: parser allows the URN and up to four grants.
- `packages/cli/src/admin/client-workspace.ts`: append the device grant to the Protocol editor's
  choices, preserving the existing index assumptions for `client_credentials`; save the full URN.
- `packages/cli/src/admin/client-registration-dialog.ts`: add a grant-type selection consistent with
  the Protocol editor and make the redirect URI optional only when the selected grants are
  device-only. The existing default remains authorization code plus refresh token with a required
  redirect URI.

The terminal remains a single-operator application. No concurrency, optimistic locking or polling
is added. A save reloads the authoritative server state through the existing controller.

### Portability

Update `packages/server/src/portability/schema.ts`:

- `grant_types` uses the extended schema.
- `redirect_uris` uses the zero-permitting schema.
- The existing `validateClientProtocolCompatibility` call enforces the conditional rule.

Export, preview and import keep their current atomicity, ordering, ownership and error behavior.
A manifest containing the device grant is rejected by older servers that do not know the value. The
documentation and release notes state this boundary. No manifest version bump is introduced.

### Documentation

Update:

| Document | Change |
| --- | --- |
| `docs/api/clients.md` | Correct the create/update request fields to camelCase; add the grant values, device-only rule and example |
| `docs/cli/clients.md` | Add `--grant-types`, optional redirect URIs, device-only example and admin-client enablement |
| `docs/concepts/oidc.md` | Add the device flow to supported flows and endpoints |
| `docs/concepts/capabilities.md` | Add device authorization to the supported-flow list |
| `docs/guide/custom-ui.md` | Document the Porta-rendered device pages and host-UI login/consent boundary |
| `docs/api/authentication.md` | Add a short device-login entry point linking to the CLI and OIDC docs |
| `techdocs/` | Update the architecture/data-model/integration notes and record the native device-flow decision |

The public documentation build must pass. Do not edit generated `dist/` files.

### Release compatibility

The grant enum is closed. An older SDK, CLI or Admin terminal rejects a client response containing
the new value. The supported boundary is the same lockstep release for the server and its clients
when device-enabled clients are used.

Release notes must state:

- The server adds the new grant value.
- SDK and CLI must be upgraded to the same lockstep release to read device-enabled clients.
- Existing installations must explicitly enable the grant on the built-in admin CLI client before
  using `porta login --device-code`.

---

## Integration Points

### With RD-01 (Provider Capability)

RD-03 makes the grant selectable in client storage. RD-01 consumes it through `findForOidc`. The
provider sees the same full URN.

### With RD-02 (Tenant-Safe Verification)

The tenant binding uses the DeviceCode client's `organizationId`. RD-03 preserves that field and
does not change client ownership.

### With RD-04 (CLI Device Login)

RD-04 uses the admin CLI client's grant and the new `--grant-types` command for remediation. It does
not change the client contract.

### With RD-05 (Security Operations)

RD-03 reuses the existing generic Admin mutation audit and permissions. RD-05 adds device-specific
audit and assurance; it does not add a second admin audit path.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
| --- | --- | --- | --- | --- |
| Grant representation | Full URN / friendly alias | Full URN | Matches provider metadata; no translation. | AR-8 |
| Default grants | Explicit / native default / public default | Explicit opt-in | Avoids accidental exposure. | AR-12 |
| Device-only redirects | Conditional zero / always required / new type | Conditional zero | Protocol-correct and narrow. | AR-4 |
| Administration surfaces | Full consistency / API+SDK+CLI / API only | Full consistency | One public contract across API, SDK, CLI, terminal, portability and docs. | AR-16 |
| CLI grant editing | `--grant-types` / terminal only / dedicated command | `--grant-types` | General, scriptable and needed for admin-client enablement. | AR-17 |
| Portability version | Strict same-version / manifest bump / ignore unknown | Strict same-version | Avoids silently changing security-relevant configuration. | AR-18 |
| Device-only validation | Keep PKCE/native/both types / relax PKCE / public only | Keep PKCE, document native, support both types | Smallest safe change; no weakened authorization-code path. | AR-19 |
| Built-in client | Explicit enablement / automatic / separate client | Explicit enablement | No silent grant widening. | AR-9 |
| Mixed versions | Lockstep / forward-compatible / API version | Lockstep | Matches repository release model and closed grant contract. | AR-32 |

---

## Security Considerations

- **Data sensitivity:** Client registration metadata is administrative, not secret. Confidential
  client secrets remain in the existing secret store and are never returned except at creation.
- **Input validation:** The grant value is a closed enum. Redirect URIs keep exact URL, fragment,
  wildcard, control-character and uniqueness validation. Device-only empty arrays are accepted only
  under the narrow conditional rule.
- **Authentication and authorization:** The existing admin permissions, tenant ownership,
  control-plane authority and ETag checks remain. No new permission or bypass is added.
- **Injection risks:** Admin API input is validated by Zod; SQL is parameterized; CLI output is
  escaped by the terminal renderer; docs examples are static.
- **Encryption:** No new secret or encryption boundary. Client secrets keep their existing
  hashing/storage behavior.
- **Rate limiting:** Admin routes keep their existing rate limits. No device-specific admin limiter
  is added.
- **Infrastructure:** No new service, dependency or configuration key.

---

## Acceptance Criteria

1. [ ] `clientGrantTypesSchema` accepts the full URN and rejects an unknown grant with HTTP `400`.
2. [ ] `validateClientProtocolCompatibility` accepts a device-only client with `redirectUris: []`
   and `responseTypes: []`, and rejects an authorization-code client with `redirectUris: []`.
3. [ ] `getDefaultGrantTypes()` returns only the existing defaults; a create request that omits
   `grantTypes` never stores the device grant.
4. [ ] `POST /api/admin/clients` with a public native device-only client and `redirectUris: []` plus
   `responseTypes: []` returns `201`; the response contains the full URN and empty `redirectUris`
   and `responseTypes` arrays.
5. [ ] `POST /api/admin/clients` with `authorization_code` and `redirectUris: []` returns `400`.
6. [ ] `POST /api/admin/clients` with both device and authorization-code grants and
   `redirectUris: []` returns `400`.
7. [ ] `PUT /api/admin/clients/:id` can add the device grant to an existing client and can clear
   redirect URIs and response types after removing the authorization-code grant; ETag behavior is
   unchanged.
8. [ ] A public device-only client still requires `requirePkce=true`; a confidential device-only
   client still requires a token-endpoint authentication method.
9. [ ] SDK `GrantType` and the runtime client validator accept the URN; an unknown grant is
   rejected; `redirectUris: []` and `responseTypes: []` type-check.
10. [ ] `porta client create --grant-types urn:...device_code --type public --application-type native`
    succeeds without `--redirect-uris` and stores empty response types.
11. [ ] `porta client create` with an authorization-code grant and no redirect URIs fails before the
    API call with a clear message.
12. [ ] `porta client update --grant-types <list>` replaces grants; `--redirect-uris ""` clears them
    and sends empty response types when the resulting client is device-only, and is rejected
    otherwise.
13. [ ] `porta init` stores the device grant on the new built-in admin CLI client; existing
    installations are documented to enable it explicitly.
14. [ ] The Admin terminal Protocol editor displays and saves the device grant; registration can
    create a device-only client without a redirect URI and with empty response types, and cannot
    create an authorization-code client without one.
15. [ ] Portability export/import round-trips a device-only client with the full URN and empty
    redirect URIs and response types; an older server rejects the manifest rather than dropping the
    grant.
16. [ ] `docs/api/clients.md` uses the actual camelCase request fields and documents the grant, the
    conditional redirect rule and the empty-response-type rule.
17. [ ] `docs/cli/clients.md`, `docs/concepts/oidc.md`, `docs/concepts/capabilities.md`,
    `docs/guide/custom-ui.md` and `docs/api/authentication.md` are updated and `pnpm docs:build`
    passes.
18. [ ] No new permission, API endpoint, audit event, application type or global setting exists.
19. [ ] Existing client create/update, secret, service-account, SDK, CLI and portability tests remain
    green.
20. [ ] Security requirements verified: closed grant enum, conditional redirect rule, tenant
    ownership, permissions, parameterized SQL, no secret exposure.
