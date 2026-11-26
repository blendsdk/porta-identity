# 03-01: Provider Protocol and DeviceCode Storage

> **Document**: 03-01-provider-protocol.md
> **Parent**: [Index](00-index.md)
> **Requirements**: RD-01
> **AR Refs**: P-7, P-8, P-15, preflight PF-001, PF-018, PF-023

## Scope

Enable the native RFC 8628 feature, advertise it, return the device authorization response, store
DeviceCode rows with correct retention/uniqueness, and preserve the provider's token exchange
errors. Browser pages are 03-02; limits/audit are 03-05. The feature is not enabled until the tenant
binding is mounted (execution plan).

## Provider Configuration

`packages/server/src/oidc/configuration.ts`:

```ts
features: {
  // existing features unchanged
  deviceFlow: {
    enabled: true,
    deviceInfo: () => ({}),
  },
},
ttl: {
  // existing TTLs unchanged
  DeviceCode: 600,
},
```

`deviceInfo: () => ({})` is mandatory: the default provider value stores the request IP and user
agent, which RD-01/AR-10 prohibit.

The `interval: 5` field is added by a provider event listener registered in
`packages/server/src/oidc/provider.ts`:

```ts
provider.on('device_authorization.success', (_ctx, body) => {
  body.interval = 5;
});
```

The listener must mutate only `interval`; all other response fields stay provider-owned.

## Endpoints and Discovery

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/{orgSlug}/device/auth` | Client with the full device grant obtains codes |
| `GET` | `/{orgSlug}/device` | User-code entry (03-02) |
| `POST` | `/{orgSlug}/device` | Code/confirm/abort (03-02) |
| `GET` | `/{orgSlug}/device/:uid` | Resume (03-02) |
| `POST` | `/{orgSlug}/token` | Poll/exchange |

Discovery (`/.well-known/openid-configuration` and
`/.well-known/oauth-authorization-server`) must expose
`device_authorization_endpoint = {issuer}/device/auth` and include
`urn:ietf:params:oauth:grant-type:device_code` in `grant_types_supported`. The provider computes the
grant set from `features.deviceFlow.enabled`; no separate static grant list is needed.

The device authorization response is provider-shaped plus the interval:

```json
{
  "device_code": "<opaque>",
  "user_code": "BCDF-GHJK",
  "verification_uri": "https://host/{orgSlug}/device",
  "verification_uri_complete": "https://host/{orgSlug}/device?user_code=BCDF-GHJK",
  "expires_in": 600,
  "interval": 5
}
```

The user code uses node-oidc-provider's `base-20` alphabet
`BCDFGHJKLMNPQRSTVWXZ` and `****-****` mask. No custom generator is added.

## DeviceCode Storage and Retention

Migration `packages/server/migrations/039_device_authorization_user_code.cjs`:

```js
exports.up = (pgm) => {
  pgm.noTransaction();
  pgm.sql(<duplicate preflight>);
  pgm.createIndex('oidc_payloads', ['user_code'], {
    name: 'idx_oidc_payloads_device_user_code',
    unique: true,
    concurrently: true,
    where: "type = 'DeviceCode' AND user_code IS NOT NULL",
  });
};
exports.down = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX IF EXISTS idx_oidc_payloads_device_user_code;');
};
```

`oidc_payloads` stores every OIDC artifact, so a regular index build would take a `SHARE` lock that
blocks token, session and grant writes. The migration therefore opts out of the runner transaction
and builds the unique index with `CONCURRENTLY`. Before creating the index, preflight existing rows
for duplicate DeviceCode user codes and fail with a clear remediation. The existing generic
`user_code` index remains.

`packages/server/src/oidc/postgres-adapter.ts` changes:

- For `this.name === 'DeviceCode'`, every `upsert` adds 900 seconds to the adapter `expiresAt`
  while the provider payload keeps its own `exp` at 600 seconds. Apply the extension on each
  re-save (confirm/abort), so `expires_at` remains `exp + 900`. For a non-finite or `<= 0` TTL,
  DeviceCode stores `now + 900s` rather than `null` (never expires).
- `find` and `findByUserCode` keep their `expires_at > NOW()` filter. Because the row outlives the
  payload `exp`, the provider model can return `expired_token`/expired state during retention.
- `purgeExpired` removes the row after the extended expiry.
- A unique violation (`code === '23505'` on the DeviceCode user-code index) is mapped to a custom
  `DeviceCodeCollisionError` with `statusCode = 503`, `expose = true` and message
  `temporarily_unavailable`. The provider's error handler uses the error's `statusCode`, `expose`
  and `message`; no `device_authorization.error` listener is added or needed. No existing code is
  read, modified or returned.
- No IP address or user agent is stored.

The adapter remains parameterized SQL. `findByUserCode` is an exact lookup; the provider normalizes
the submitted code before calling it. The tenant middleware uses the same two-regex normalizer
(`[a-z]` uppercase, `\W` removal) as the provider and bounds the normalized code to 64 characters
before the lookup; see 03-02. The CLI does not submit user codes.

## Token Exchange

The provider's device-code grant handler handles pending/denied/expired/consumed/client-mismatch
states. Porta adds only the device-aware polling limiter (03-05).

| State | HTTP | Error |
|---|---|---|
| Pending | 400 | `authorization_pending` |
| Faster than interval | 400 | `slow_down` (Porta limiter) |
| Denied/aborted | 400 | `access_denied` |
| Expired within retention | 400 | `expired_token` |
| Consumed/replayed/wrong client | 400 | `invalid_grant` |
| Hard abuse | 429 | `rate_limit_exceeded` |
| Approved | 200 | Token response |

The token response is provider-owned: access token, ID token when `openid` was requested, refresh
token when `offline_access` and the client allows refresh.

**Replay consequence:** the provider's `consumeGrantSource` revokes the whole grant when a consumed
device code is presented again. A second exchange after success therefore returns `invalid_grant`
and invalidates the first token set. Tests must assert this; the CLI must not retry an ambiguous
exchange (03-04/P-19 and RD-04 PF-006).

The Phase 1 gate covers provider-owned errors only; `slow_down`, 429 and the fixed limits are
Phase 2 controls and are tested in 03-05. Do not include Phase 2 rows in the Phase 1 matrix.

## Tenant and Authority Boundaries

The existing `oidcClientTenantBinding` continues to check the client on the device authorization and
token endpoints. The verification/resume organization check is 03-02 and is mounted before the
feature is enabled.

`adapter-factory.ts` live-authority checks and the existing client/user/organization deletion,
logout cascade and connected-app revocation must remove or reject DeviceCode rows. The 03-05 tests
verify the `offline_access` case where the provider's default session binding differs.

**Older server fleet:** an instance whose `features.deviceFlow` is disabled rejects a client whose
stored `grant_types` contains the device URN. Every server instance must run a release that
understands the URN before the grant is enabled on any client (03-03).

## Files

| File | Change |
|---|---|
| `packages/server/src/oidc/configuration.ts` | Enable `deviceFlow`, empty `deviceInfo`, `ttl.DeviceCode` |
| `packages/server/src/oidc/provider.ts` | Add the interval listener |
| `packages/server/src/oidc/postgres-adapter.ts` | DeviceCode retention, unique-collision error, zero-TTL guard |
| `packages/server/migrations/039_device_authorization_user_code.cjs` | Partial unique index and duplicate preflight |

## Tests

ST-01–ST-09 in [07-testing-strategy.md](07-testing-strategy.md), with the DB/HTTP cases in
integration/E2E. The provider config unit test, discovery E2E, adapter retention and token error
matrix must all pass before the next phase.
