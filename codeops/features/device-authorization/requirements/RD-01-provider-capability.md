# RD-01: Provider Capability and Protocol

> **Document**: RD-01-provider-capability.md
> **Status**: Draft
> **Created**: 2026-11-24
> **Project**: Porta
> **Depends On**: —
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

This requirement enables the OAuth 2.0 Device Authorization Grant (RFC 8628) in Porta's
node-oidc-provider runtime. A registered client asks Porta for a device code and a short user code,
the user approves the request in a browser, and the device exchanges the device code for tokens.

The requirement covers the protocol surface and storage behavior only. The browser verification
experience is RD-02, the client administration contract is RD-03, the CLI is RD-04, and the fixed
rate limits, audit and assurance work is RD-05.

The feature is enabled server-wide but authorized per client. A client without the device grant
cannot use the endpoint. No new organization policy, global setting or scope is introduced.

---

## Functional Requirements

### Must Have

- [ ] The provider configuration enables `features.deviceFlow` without changing the existing
      authorization-code, client-credentials, refresh-token, introspection, revocation,
      resource-indicator or logout features.
- [ ] Both organization discovery documents advertise `device_authorization_endpoint` and include
      the full device grant URN in `grant_types_supported`:
      - `/{orgSlug}/.well-known/openid-configuration`
      - `/{orgSlug}/.well-known/oauth-authorization-server`
- [ ] A registered client with the full URN
      `urn:ietf:params:oauth:grant-type:device_code` in its `grant_types` can call
      `POST /{orgSlug}/device/auth`.
- [ ] A client without the grant receives an OAuth `invalid_request` error and no device code.
- [ ] A public device client is allowed without a client secret. A confidential device client
      authenticates with its existing `client_secret_basic` or `client_secret_post` method.
- [ ] The device authorization response contains exactly the RFC 8628 fields:
      `device_code`, `user_code`, `verification_uri`, `verification_uri_complete`, `expires_in`,
      and `interval`.
- [ ] `expires_in` is `600` seconds. `interval` is `5` seconds.
- [ ] `verification_uri` is `{issuer}/device`. `verification_uri_complete` is
      `{issuer}/device?user_code={user_code}`.
- [ ] The user code is eight characters from node-oidc-provider's base-20 alphabet, formatted
      `****-****`, and normalized on lookup exactly as the provider normalizes it.
- [ ] The DeviceCode is stored in PostgreSQL in `oidc_payloads` with `type = 'DeviceCode'`, a
      non-null `user_code`, and the provider payload.
- [ ] `findByUserCode()` returns only a DeviceCode whose normalized user code matches, and honors
      the provider's expiry check.
- [ ] A partial unique index prevents two live DeviceCode rows from sharing a user code. A
      collision fails the new authorization request closed with a retryable error and never returns
      or approves another request.
- [ ] The DeviceCode expires after `600` seconds. Its row is retained for an additional `900`
      seconds after expiry so the token endpoint can return `expired_token`.
- [ ] `consume()` is atomic and conditional on an unconsumed, unexpired row. A successful token
      exchange consumes the device code exactly once.
- [ ] `POST /{orgSlug}/token` accepts
      `grant_type=urn:ietf:params:oauth:grant-type:device_code`, `device_code`, and the client's
      existing authentication. The client ID in the request must match the DeviceCode client.
- [ ] While pending, the token endpoint returns HTTP `400` with `error=authorization_pending`.
- [ ] After denial or abort, the token endpoint returns HTTP `400` with `error=access_denied`.
- [ ] After expiry, the token endpoint returns HTTP `400` with `error=expired_token`.
- [ ] After successful consumption, a replay returns HTTP `400` with `error=invalid_grant`.
- [ ] A client mismatch returns HTTP `400` with `error=invalid_grant`.
- [ ] A successful exchange returns the normal token response. An `openid` request receives an ID
      token; `offline_access` plus a refresh-token-capable client receives a refresh token.
- [ ] Existing resource-indicator handling remains available for device authorization requests.
      No rich-authorization-request feature is added.
- [ ] Existing client-to-tenant binding remains enforced on the device authorization and token
      endpoints.
- [ ] Existing client, user and organization authority checks apply. A disabled client,
      deactivated user or suspended organization cannot complete the exchange.
- [ ] Existing logout cascade and connected-app revocation remove approved DeviceCode rows by
      `grant_id`.
- [ ] No new system-config setting, organization setting, scope, claim, permission, application
      type or provider feature is introduced.
- [ ] No device IP address or user agent is stored in the DeviceCode payload.

### Should Have

- [ ] Provider events and structured logs identify device authorization success, approval, denial,
      expiry and rejection without including the device code or user code.
- [ ] The discovery document ordering and existing endpoint values remain unchanged except for the
      new endpoint and grant value.

### Won't Have (Out of Scope)

- Browser verification pages, branding, localization or consent UI — covered by RD-02.
- Admin API, SDK, CLI or Admin terminal changes — covered by RD-03 and RD-04.
- Fixed rate limits, audit events, log redaction and assurance evidence — covered by RD-05.
- CIBA, rich authorization requests, token exchange, implicit flow or a new response type.
- Device management, device trust, device sessions or a device list.
- A per-organization device-flow policy or a global feature flag.
- QR-code generation in the server.
- A custom user-code generator or a configurable alphabet.

---

## Technical Requirements

### Provider configuration

The provider configuration adds the native feature and the fixed DeviceCode lifetime:

```ts
features: {
  // ...existing features unchanged
  deviceFlow: {
    enabled: true,
    deviceInfo: () => ({}),
  },
},
ttl: {
  // ...existing TTLs unchanged
  DeviceCode: 600,
},
```

The empty `deviceInfo` object is deliberate. node-oidc-provider's default returns the request IP
address and user agent. Porta stores neither (AR-10).

The `interval: 5` field is added by a Porta-owned response hook or provider event listener after the
provider builds the device authorization body. The provider does not emit `interval` by default.
The hook must not change the other response fields.

### Endpoint surface

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/{orgSlug}/device/auth` | Device authorization request |
| `GET` | `/{orgSlug}/device` | User-code entry page |
| `POST` | `/{orgSlug}/device` | User-code submission, confirmation or abort |
| `GET` | `/{orgSlug}/device/:uid` | Resume after login or consent |
| `POST` | `/{orgSlug}/token` | Device-code polling and exchange |

The provider's default relative routes are `/device/auth` and `/device`. Porta's existing
organization prefix and issuer rewriting apply.

### Device authorization request

The request is `application/x-www-form-urlencoded` and uses the existing OIDC body parser, client
authentication, CORS handling and tenant binding.

Required/optional parameters follow RFC 8628 §3.1 and the provider's supported parameter set:

| Parameter | Requirement |
| --- | --- |
| `client_id` | Required for public clients; confidential clients may authenticate with Basic or form credentials |
| `scope` | Requested scopes; existing client scope validation applies |
| `resource` | Optional; existing resource-indicator validation applies when present |
| `authorization_details` | Not supported; Porta does not enable rich authorization requests |

The endpoint returns HTTP `200` with a JSON body. Error responses use the OAuth error shape
(`error`, optional `error_description`) and must not redirect anywhere.

### DeviceCode model and storage

| Concern | Requirement |
| --- | --- |
| Table | `oidc_payloads` |
| Row type | `DeviceCode` |
| Primary key | Provider-generated device code identifier |
| User-code column | `user_code`, normalized provider value |
| Index | Existing generic index stays; add a partial unique index for `type = 'DeviceCode'` |
| Expiry | `expires_at = now + 600s + 900s` for DeviceCode rows |
| Payload expiry | Provider `exp` remains `now + 600s` so the model can return an expired code |
| Single use | Conditional `consumed_at` update; exactly one successful consumer |
| Cleanup | Existing `purgeExpired()` removes rows after the extended `expires_at` |
| PII | No IP address, user agent or other device identity fields |

The partial unique index is:

```sql
CREATE UNIQUE INDEX idx_oidc_payloads_device_user_code
  ON oidc_payloads (user_code)
  WHERE type = 'DeviceCode' AND user_code IS NOT NULL;
```

A unique violation is a rare random collision. The device authorization request fails closed with
HTTP `503` and `error=temporarily_unavailable`; the device client can retry. No existing code is
returned, approved or modified.

The adapter must continue to return a stored DeviceCode within its extended retention window so the
provider model can apply its own `exp` check and return `expired_token`. The existing expiry filter
on `expires_at` remains correct because the stored value includes retention.

### Token exchange

The request is `application/x-www-form-urlencoded`:

```text
grant_type=urn:ietf:params:oauth:grant-type:device_code
device_code=<opaque value>
client_id=<public client id>        # required for public clients
```

Confidential clients use their existing token-endpoint authentication. The provider's existing
`findGrantSource` check rejects a client mismatch before any token is issued.

| State | HTTP | `error` | Notes |
| --- | --- | --- | --- |
| Pending | 400 | `authorization_pending` | No user approval yet |
| Polling faster than `interval` | 400 | `slow_down` | Porta's device-aware limiter; increase interval |
| Denied or aborted | 400 | `access_denied` | The user declined or aborted |
| Expired | 400 | `expired_token` | Row retained for the 15-minute window |
| Consumed, replayed or wrong client | 400 | `invalid_grant` | No second token set |
| Abuse threshold crossed | 429 | `rate_limit_exceeded` | Hard limit; RD-05 defines the counters |
| Approved | 200 | — | Normal token response |

Token responses keep the existing cache headers and CORS behavior. The device code is never
returned in a token response or an error body.

### Tenant and authority boundaries

The existing `oidcClientTenantBinding` middleware runs before the provider and continues to reject
foreign or unknown client IDs on the device authorization and token endpoints.

The verification and resume paths need an additional DeviceCode-specific organization check. That
control is specified in RD-02 because it applies to the browser pages, not the token protocol.

Approved DeviceCode rows carry the account and grant identifiers the provider writes during
approval. The existing authority checks in `adapter-factory.ts` and the existing logout and
connected-app deletion paths must reject or remove them consistently. RD-05 verifies the
`offline_access` case, where the provider's default session-binding flag differs.

### Data migration

The feature adds one migration for the partial unique index. No column, table, backfill or data
rewrite is required. The migration is safe on an empty DeviceCode set because the feature has not
been enabled.

### Observability boundary

RD-01 does not add audit rows. RD-05 adds the dedicated audit events and rate-limit events. RD-01
only requires that no provider or adapter log line contains the raw device code or user code.

---

## Integration Points

### With RD-02 (Tenant-Safe Verification and Approval)

RD-02 consumes the endpoints and DeviceCode model defined here. It must not enable the browser flow
until the tenant-binding control is implemented and tested.

### With RD-03 (Client Contracts and Administration)

RD-03 makes the full grant URN selectable on every client administration surface. RD-01 assumes the
client can already have the grant in its stored `grant_types`; it does not define the Admin API or
SDK contract.

### With RD-04 (CLI Device Login)

RD-04 consumes the device authorization and token endpoints defined here. It does not change the
protocol.

### With RD-05 (Security Operations and Assurance)

RD-05 owns the fixed limits, audit events, log redaction, cleanup verification and assurance
evidence referenced by this RD.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
| --- | --- | --- | --- | --- |
| Implementation | Native provider feature / custom flow | Native provider feature | Existing library support and dormant adapter storage; custom flow would duplicate protocol behavior. | AR-1 |
| Enablement | Per-client / org policy / global flag | Per-client grant | The grant is the authorization boundary; no new setting. | AR-2 |
| Grant representation | Full URN / friendly alias | Full URN | Matches provider metadata; no translation layer. | AR-8 |
| Code format | Upstream base-20 / digits / custom | Upstream base-20 | No custom generator; adequate entropy with short lifetime and limits. | AR-24 |
| Lifetime | Configurable / fixed | Fixed 600 seconds | Avoids expanding the global catalog. | AR-6 |
| Expired retention | None / 15 minutes | 15 minutes | Keeps `expired_token` observable. | AR-6, AR-20 |
| Unique codes | Probabilistic / unique index / retry generation | Unique index, fail closed | Prevents misrouting without provider-generation changes. | AR-31 |
| Device info | Default IP+UA / user agent only / none | None | Privacy-first; the confirmation page uses client and scopes. | AR-10 |
| Polling errors | Full RFC / generic | Full RFC with `interval` | Required for interoperable device clients. | AR-20 |
| Authority binding | Full / approval-only / none | Full | Prevents stale or revoked approvals from issuing tokens. | AR-21 |

---

## Security Considerations

- **Data sensitivity:** The device code is a bearer secret for the pending request. The user code
  identifies the request but cannot fetch tokens. The DeviceCode payload also links an account,
  client and grant after approval. No IP address, user agent or other device identity is stored.
- **Input validation:** Client authentication, grant type, scope, `resource`, `device_code` and
  `user_code` are validated by the existing Zod and provider boundaries. The adapter uses
  parameterized SQL. No raw request value is interpolated into SQL or HTML.
- **Authentication and authorization:** Only clients with the device grant can start the flow.
  Existing client-to-tenant binding, client status, user status and organization status checks
  remain in force. The user authentication and consent decisions are RD-02.
- **Injection risks:** SQL uses parameters; provider pages escape values; error bodies contain only
  fixed OAuth fields. The device code and user code are never reflected into logs or audit.
- **Encryption:** TLS protects the public endpoints. DeviceCode rows live in the existing
  PostgreSQL storage; no new encryption boundary is introduced. Signing keys and token signing
  remain ES256.
- **Rate limiting:** RD-05 applies the fixed authorization, user-code and polling limits. RD-01
  must not ship without those controls.
- **Infrastructure:** No new service, container, network path, secret or dependency is added.

---

## Acceptance Criteria

1. [ ] With the feature enabled, both discovery documents return
   `device_authorization_endpoint` exactly equal to
   `{issuer}/device/auth` and `grant_types_supported` contains
   `urn:ietf:params:oauth:grant-type:device_code`.
2. [ ] A client with the grant receives HTTP `200` from `POST /{orgSlug}/device/auth` with
   `device_code`, `user_code`, `verification_uri`, `verification_uri_complete`, `expires_in: 600`
   and `interval: 5`; the user code matches
   `^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$` (the provider's base-20 alphabet).
3. [ ] A client without the grant receives HTTP `400` with `error=invalid_request`; a foreign or
   unknown client receives the existing generic `404`.
4. [ ] The device code row is `type='DeviceCode'` in `oidc_payloads`, has the normalized user code,
   has no IP or user-agent field, and expires after 600 seconds with row retention for 900
   additional seconds.
5. [ ] A pending poll returns HTTP `400` with `error=authorization_pending` and no token.
6. [ ] Polling faster than the advertised interval returns HTTP `400` with `error=slow_down`.
7. [ ] An approved code returns a token response exactly once. A second exchange returns HTTP `400`
   with `error=invalid_grant`.
8. [ ] A denied or aborted code returns HTTP `400` with `error=access_denied`.
9. [ ] A code polled after 600 seconds but within retention returns HTTP `400` with
   `error=expired_token`; after retention and purge it is treated as absent.
10. [ ] A token request with a different client ID returns HTTP `400` with `error=invalid_grant`.
11. [ ] A disabled client, deactivated user or suspended organization cannot complete the exchange.
12. [ ] Logout and connected-app revocation remove the approved DeviceCode row by `grant_id`.
13. [ ] Two live DeviceCode rows cannot share a user code; a collision returns HTTP `503` with
    `error=temporarily_unavailable` and does not modify an existing request.
14. [ ] No new system-config key, organization setting, scope, claim, permission or application type
    exists.
15. [ ] The device code and user code never appear in server logs or test output.
16. [ ] Existing authorization-code, client-credentials, refresh-token, discovery, introspection,
    revocation and logout tests remain green.
17. [ ] Security requirements verified: input validation, parameterized SQL, tenant binding,
    authority checks, no secret logging.
