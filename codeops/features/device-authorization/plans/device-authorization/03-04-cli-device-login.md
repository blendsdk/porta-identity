# 03-04: CLI Device Login

> **Document**: 03-04-cli-device-login.md
> **Parent**: [Index](00-index.md)
> **Requirements**: RD-04 (amended by preflight PF-006)
> **AR Refs**: P-11, P-14, preflight PF-006, PF-007, PF-024, PF-026

## Scope

Add `porta login --device-code`. The CLI discovers the endpoint, requests a code, prints the URL
and user code, polls at the advertised interval, verifies the ID token without a nonce, fetches
UserInfo, and stores credentials in the existing store.

## Command Wiring

`packages/cli/src/commands/login.ts` adds:

```ts
.option('device-code', {
  type: 'boolean',
  describe: 'Use device authorization instead of opening a browser',
  default: false,
})
```

The handler branches:

```ts
if (argv['device-code']) {
  result = await authenticateDeviceCodeSession({...}, interaction, { signal });
} else {
  result = await authenticateCliSession({...}, interaction, { signal });
}
```

`--device-code` implies no browser; `--no-browser` remains the authorization-code mode. Existing
`--server`, `--client-id`, `--insecure`, `--verbose` and `--json` behavior is unchanged. The command
passes the existing `saveCredentialsDurably` callback and the credential-replacement confirmation.

## Coordinator

New `packages/cli/src/auth/device-flow.ts`:

```ts
export interface DeviceCodeLoginRequest {
  readonly server: URL;
  readonly clientId?: string;
  readonly currentServer?: URL;
  readonly persistCredentials?: (credentials: AuthFlowResult) => Promise<void> | void;
}

export interface DeviceCodeLoginInteraction {
  readonly presentDeviceCode: (
    verificationUri: URL,
    userCode: string,
    expiresAt: Date,
    signal: AbortSignal,
  ) => Promise<void>;
  readonly confirmCredentialReplacement: (
    currentServer: URL,
    nextServer: URL,
    signal: AbortSignal,
  ) => Promise<boolean>;
}

export async function authenticateDeviceCodeSession(
  request: DeviceCodeLoginRequest,
  interaction: DeviceCodeLoginInteraction,
  options: CliAuthOperationOptions,
): Promise<VerifiedSession | CancelledLogin>;
```

The coordinator reuses `fetchAdminMetadata`, `fetchIssuerJwks`, `fetchVerifiedUserInfo` and the
existing credential persistence callback. It does not add a credential profile or SDK auth provider.

## Discovery and Endpoint Validation

Fetch `{issuer}/.well-known/openid-configuration` using the issuer returned by
`GET /api/admin/metadata` (even when `--client-id` overrides the client). Require:

- `issuer` exactly equals the metadata issuer.
- `device_authorization_endpoint` present.
- `grant_types_supported` includes the full device URN.
- The endpoint is HTTPS, same origin as the selected server, and under the issuer path.
- The token endpoint is `{issuer}/token`.

A missing endpoint/grant produces a clear “server does not support device login” error. A malformed
or foreign URL fails closed before printing anything. The CLI still uses the metadata client ID
unless `--client-id` is supplied.

## Device Authorization Request

```http
POST {device_authorization_endpoint}
Content-Type: application/x-www-form-urlencoded

client_id={clientId}&scope=openid%20profile%20email%20offline_access
```

The CLI uses the public admin client and sends no secret. A confidential `--client-id` override
without a secret is expected to fail at the server; the CLI does not add a secret prompt.

## Response Validation and Output

| Field | Validation |
|---|---|
| `device_code` | Non-empty, bounded (≤4096), never printed |
| `user_code` | Non-empty, bounded (≤64), allowed only from the provider alphabet `[BCDFGHJKLMNPQRSTVWXZ-]`; reject terminal control characters; printed exactly |
| `verification_uri` | HTTPS, same issuer origin, exactly `{issuer}/device` (the issuer path plus `/device`) |
| `verification_uri_complete` | Same checks when present |
| `expires_in` | Positive integer, capped at 3600 |
| `interval` | Positive integer, clamp 1–60; default 5 |

Print:

```text
To sign in, open:
  https://porta.example.com/acme/device

Enter code:
  BCDF-GHJK

This code expires in 10 minutes.
```

No QR code and no device code.

## Polling

New `packages/cli/src/auth/device-poll.ts` (or a private section of `device-flow.ts`) exposes
injectable sleep/clock/transport boundaries for tests.

```text
deadline = monotonic now + expires_in
interval = clamp(interval, 1, 60)
sleep(interval)

while monotonic now < deadline and not aborted:
  POST /token (grant_type=device_code, device_code, client_id)
  200 -> validate token response; stop
  400 authorization_pending -> continue
  400 slow_down -> interval = min(60, interval + 5); continue
  400 access_denied / expired_token / invalid_grant -> terminal error
  429 -> wait max(Retry-After ?? interval, interval), capped at 60; continue
  5xx / network after the request was dispatched -> terminal indeterminate; do not retry
  any other 4xx/5xx or unexpected status -> terminal error
  sleep(interval)
```

`authorization_pending` and `slow_down` are safe to continue. A `429` backs off but cannot exceed
the deadline; the wait is never shorter than the current interval. A network timeout or 5xx after
the token request has been sent is **not** retried with the same device code: the provider consumes
the code on success and a replay revokes the first token set. The CLI reports an indeterminate
outcome and requires a new `porta login --device-code`. A failure that provably occurred before
dispatch (for example a connection that was never opened) may be retried at the current interval;
the CLI never retries a timeout or 5xx after send. The loop never sleeps past the deadline. Ctrl+C
aborts the HTTP request and sleep, exits with the existing cancellation behavior, and stores
nothing.

Unknown OAuth errors and statuses are terminal with a bounded message; they must not fall through
to another poll iteration. This is the RD-04 amendment recorded by preflight PF-006.

## Token Response

Validate:

- `access_token`: non-empty bounded string.
- `id_token`: non-empty compact JWT.
- `expires_in`: positive integer.
- `refresh_token`: optional non-empty string.

A missing/malformed field is an authentication failure; no retry after a successful 200 with an
invalid body. On a successful 200, the CLI never sends the same device code again. If the response
is lost or the request times out, the CLI surfaces an indeterminate outcome and asks the user to run
login again.

## ID Token Verification

Add `verifyDeviceIdToken` to `packages/cli/src/auth/id-token-verifier.ts`:

```ts
verifyDeviceIdToken({
  token,
  issuer,
  clientId,
  jwks,
}): Promise<VerifiedIdentity>
```

It shares claim checks with `verifyCliIdToken` but does not require `nonce`. It validates ES256,
exact issuer, audience, `iat` (≤60s future), `exp`, bounded `sub`, and `azp` when present or when
multiple audiences. `verifyCliIdToken` remains unchanged and still requires a nonce.

The device authorization request accepts a `nonce` parameter in `oidc-provider` 9.13.3, but the
provider does not copy it to the DeviceCode, so the issued ID token has no nonce. The device
verifier therefore does not require one. Add a regression test that a supplied nonce is accepted by
the device authorization endpoint but absent from the ID token; if a future provider starts binding
it, the verifier must be revisited. The single-use device code and TLS bind the request; the CLI
still validates the token cryptographically.

## Credentials, Refresh and Errors

After verification:

1. Fetch UserInfo with the access token and require the same subject.
2. Reuse the credential replacement confirmation for a different server origin.
3. Persist through `saveCredentialsDurably`; store the same `AuthFlowResult` shape.
4. A refresh token is stored when present and consumed by the existing SDK refresh path.

Error messages are fixed and non-secret: missing support, missing grant with remediation, denied,
expired, invalid/used code, rate limited, unknown OAuth error, network failure. The device code and
raw response bodies are never printed. If the admin client lacks the device grant, the error names
the exact remediation: enable the grant on the admin CLI client through the Admin API, SDK, CLI or
Admin terminal, then retry.

## Files

| File | Change |
|---|---|
| `packages/cli/src/commands/login.ts` | `--device-code`, branch, print callback |
| `packages/cli/src/auth/device-flow.ts` | Coordinator |
| `packages/cli/src/auth/device-poll.ts` | Polling loop/clock/sleep boundaries |
| `packages/cli/src/auth/id-token-verifier.ts` | `verifyDeviceIdToken` and shared helpers |
| `packages/cli/src/auth/types.ts` | Reuse `TokenResponse`/`AuthFlowResult`; add bounded response types |
| `packages/cli/tests/` | Command, coordinator, polling, verifier and one live CLI E2E |
| `docs/cli/overview.md` | Document `--device-code` |

## Tests

ST-20–ST-22 and ST-33 in [07-testing-strategy.md](07-testing-strategy.md), plus command wiring,
polling, abort, credential persistence, refresh compatibility, unknown OAuth error, 429 clamp,
terminal-control rejection and the live CLI E2E against the shared server. The live E2E is required
for success criterion 5; a mocked coordinator alone is not sufficient.
