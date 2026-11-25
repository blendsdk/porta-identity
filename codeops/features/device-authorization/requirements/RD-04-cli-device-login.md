# RD-04: CLI Device Login

> **Document**: RD-04-cli-device-login.md
> **Status**: Draft
> **Created**: 2026-11-24
> **Project**: Porta
> **Depends On**: RD-01, RD-03
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

This requirement adds `porta login --device-code`, a headless login mode for the Porta CLI. The CLI
requests a device code from the selected Porta server, prints the verification URL and user code,
polls the token endpoint at the advertised interval, verifies the resulting ID token and stores the
credentials in the existing durable credential store.

The mode is explicit. It never replaces the current browser or pasted-callback PKCE flow
automatically. It is intended for servers, containers and terminals where opening a browser is not
practical.

The CLI remains a public native client. It does not carry a client secret, and it does not add a
device-flow authentication provider to the SDK.

---

## Functional Requirements

### Must Have

- [ ] `porta login` accepts an explicit `--device-code` flag.
- [ ] `--device-code` implies no browser. `--no-browser` remains unchanged for the authorization-code
      flow and may be supplied alongside `--device-code` without changing behavior.
- [ ] The CLI continues to use `GET /api/admin/metadata` for the issuer, organization slug and
      default admin client ID. `--client-id` still overrides the client.
- [ ] The CLI fetches the issuer discovery document and requires a valid
      `device_authorization_endpoint`. It does not hardcode the endpoint.
- [ ] The discovery endpoint and all returned URLs must be HTTPS, same-origin as the selected
      server, and under the issuer path. A mismatch fails closed before any code is displayed.
- [ ] If discovery has no device authorization endpoint, the CLI fails with a clear message that
      the server does not support device login and suggests upgrading the server or using the
      existing login mode.
- [ ] The CLI POSTs a form-encoded device authorization request with `client_id` and
      `scope=openid profile email offline_access`.
- [ ] The CLI validates the device authorization response:
      - `device_code`: non-empty, bounded, never printed.
      - `user_code`: non-empty, bounded, printed exactly as received.
      - `verification_uri`: same issuer origin and expected `/device` path.
      - `verification_uri_complete`: same issuer origin and path, when present.
      - `expires_in`: positive integer, capped at one hour.
      - `interval`: positive integer, clamped to 1–60 seconds; default 5 when absent.
- [ ] The CLI prints the verification URL and user code to stdout. It does not print a QR code and
      does not print the device code.
- [ ] The CLI waits the advertised interval before the first poll and then polls the issuer token
      endpoint with `grant_type=urn:ietf:params:oauth:grant-type:device_code`, `device_code` and
      `client_id`.
- [ ] Poll handling:
      - `authorization_pending`: continue at the current interval.
      - `slow_down`: increase the interval by 5 seconds, capped at 60, then continue.
      - `access_denied`: stop with a denial message.
      - `expired_token`: stop with an expiry message.
      - `invalid_grant`: stop with an authentication failure.
      - HTTP `429`: honor a bounded `Retry-After`, then continue until expiry; do not spin.
      - Other OAuth errors: stop with the bounded error description.
- [ ] After the CLI has dispatched a token request, a transport failure or HTTP `5xx` is terminal
      for that device code: the CLI reports an indeterminate outcome and requires a new login.
      This avoids replaying a single-use device code, because a replay revokes the first token set.
      A failure that provably occurred before dispatch may be retried at the current interval; the
      CLI never retries a timeout or a `5xx` after send.
- [ ] The CLI never polls past the `expires_in` deadline.
- [ ] Ctrl+C aborts the current HTTP request and sleep, exits with the existing cancellation
      behavior, and stores no partial credentials.
- [ ] On success, the CLI validates the token response, verifies the ID token without a nonce, fetches
      UserInfo, confirms credential replacement when the server origin changed, and persists the
      credentials through the existing durable store.
- [ ] The device-flow ID token verifier validates:
      - ES256 signature against the issuer JWKS.
      - Exact issuer.
      - Audience containing the selected client ID.
      - `iat` not more than 60 seconds in the future.
      - `exp` in the future.
      - Non-empty bounded `sub`.
      - `azp` equals the client ID when present or when there are multiple audiences.
- [ ] The device-flow ID token verifier does not require a nonce. The authorization-code verifier
      continues to require one; the device path must not weaken it.
- [ ] The UserInfo subject must equal the ID token subject.
- [ ] The CLI stores the same credential shape as the authorization-code login: server, org slug,
      client ID, access token, optional refresh token, ID token, expiry and user info.
- [ ] Refresh tokens obtained through the device flow are used by the existing CLI credential
      refresh path without a new profile or storage format.
- [ ] If the admin client lacks the device grant, the CLI reports the exact remediation: enable the
      grant on the admin CLI client through the Admin API, SDK, CLI or Admin terminal, then retry.
- [ ] The device code, user code and token values never appear in logs, error messages or test
      output. The user code is printed only as the intentional instruction to the user.
- [ ] No new dependency is added for QR rendering, terminal UI or HTTP.
- [ ] The existing browser and pasted-callback login paths remain unchanged.

### Should Have

- [ ] The CLI prints a short expiry hint, such as “This code expires in 10 minutes.”
- [ ] The CLI prints the verification URL and code on separate labeled lines for terminal
      accessibility and copy/paste.
- [ ] The CLI uses the existing error formatting and exit-code conventions.
- [ ] The polling loop exposes injectable sleep, clock and transport boundaries for deterministic
      tests.

### Won't Have (Out of Scope)

- Automatic device-flow selection in containers or when no browser is detected.
- QR-code rendering in the terminal.
- A separate credential profile for device login.
- A confidential-client secret prompt.
- A new SDK authentication provider.
- A device approval or logging UI.
- A server metadata capability flag; the CLI uses discovery.

---

## Technical Requirements

### Command wiring

`packages/cli/src/commands/login.ts` adds:

```ts
.option('device-code', {
  type: 'boolean',
  describe: 'Use device authorization instead of opening a browser',
  default: false,
})
```

The handler branches to a new `authenticateDeviceCodeSession` when the flag is true. It does not
pass `noBrowser` to the device path. The existing `authenticateCliSession` remains the
authorization-code path.

The existing `--server`, `--client-id`, `--no-browser`, `--insecure`, `--verbose` and `--json`
options keep their current meanings. `--device-code` is a login-mode selector, not a server or
client override.

### Device login request and interaction boundaries

Add a UI-neutral coordinator:

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
```

The function returns the existing `VerifiedSession | CancelledLogin` shape. It reuses
`fetchAdminMetadata`, `fetchIssuerJwks`, `fetchVerifiedUserInfo`, the credential-replacement prompt
and the durable persistence callback.

### Discovery

The CLI fetches:

```text
{issuer}/.well-known/openid-configuration
```

It requires:

- `issuer` exactly equal to the metadata issuer.
- `device_authorization_endpoint` present.
- `grant_types_supported` contains the full device grant URN.
- The endpoint is an HTTPS URL on the selected server origin and under the issuer path.

The token endpoint is `{issuer}/token`, not a value taken from the device authorization response.
The device authorization response does not carry an issuer or token endpoint.

### Device authorization request

```http
POST {device_authorization_endpoint}
Content-Type: application/x-www-form-urlencoded

client_id={clientId}&scope=openid%20profile%20email%20offline_access
```

The CLI uses the public admin client. No client secret is sent. A confidential `--client-id`
override without a secret is expected to fail at the server; the CLI does not add a secret prompt.

### Polling loop

```text
deadline = monotonic now + expires_in
interval = clamp(response.interval ?? 5, 1, 60)
sleep(interval)

while monotonic now < deadline and not aborted:
  response = POST /token (grant_type, device_code, client_id)
  if 200: validate tokens; break
  if 400 authorization_pending: continue
  if 400 slow_down: interval = min(60, interval + 5); continue
  if 429: sleep(clamp(Retry-After, interval, 60)); continue
  if 5xx or network after send: fail indeterminate; do not retry
  if failure provably before dispatch: retry at current interval
  terminal error: fail
  sleep(interval)
```

The loop uses a monotonic deadline, not wall-clock arithmetic. It never sleeps past the deadline.
The abort signal cancels both the HTTP request and the sleep. A cancellation stores nothing.

After a token request is dispatched, a transport failure or `5xx` is terminal: the CLI reports an
indeterminate outcome and requires a new login. A replay of the single-use device code revokes the
first token set, so the CLI does not retry a timeout or a `5xx` after send. A failure that provably
occurred before dispatch may be retried within the polling interval. `429` responses are safe to
continue; `Retry-After` is clamped to `[interval, 60]` and respects the deadline.

> **Preflight amendment (PF-006, 2026-11-25):** The earlier bounded-retry rule was replaced because
> the provider consumes the device code on success and `consumeGrantSource` revokes the grant on a
> replay. The no-retry rule is the approved behavior; ST-21 and the CLI plan follow it.

### Token response validation

The CLI expects a normal token response:

- `access_token`: non-empty string, bounded.
- `id_token`: non-empty compact JWT, bounded.
- `expires_in`: positive integer, bounded.
- `refresh_token`: optional non-empty string.

A missing or malformed required field is an authentication failure. The CLI never retries a
successful HTTP response with an invalid body.

### ID token verification

Add a device-specific verifier that shares the claim checks with the authorization-code verifier
but omits the nonce requirement:

```ts
verifyDeviceIdToken({
  token,
  issuer,
  clientId,
  jwks,
}): Promise<VerifiedIdentity>
```

The existing `verifyCliIdToken` remains unchanged for the authorization-code path. Both functions
use ES256, the exact issuer, the client audience, `iat`, `exp`, `azp` and the bounded subject.

Why no nonce: node-oidc-provider treats the device authorization request as non-frontchannel and
does not forward an OIDC nonce into the resulting ID token. The device code is single-use,
high-entropy, delivered over TLS, and exchanged directly with the token endpoint; the CLI still
validates signature, issuer, audience and time. This is recorded as AR-35.

### Credentials and refresh

The stored credential shape is unchanged. `refreshToken` is stored when the token response includes
one. The existing SDK `createCliAuth` refresh path reads the same file, rotates the refresh token and
preserves the user identity. No new profile, field or lock is added.

If the device login succeeds but the refresh token is absent, the existing warning behavior applies:
the user can use the access token until expiry and must log in again.

### Error messages

The CLI uses bounded, non-secret messages:

| Condition | Message intent |
| --- | --- |
| Discovery has no device endpoint | Server does not support device login; upgrade or use browser login |
| Device grant missing on admin client | Enable the grant on the admin CLI client; name the supported surfaces |
| Device authorization rejected | Authentication failed; no server internals |
| User denied | Login was denied |
| Code expired | Code expired; run the command again |
| Invalid/used code | Authentication failed |
| Rate limited | Server is rate limiting; retry later |
| Indeterminate token exchange (network/5xx after send) | Cannot confirm login; run the command again for a new code |

The CLI must not print the device code, raw response bodies, stack traces or server headers.

### Tests

Unit and command tests must cover:

- Discovery endpoint and grant validation.
- Response field validation and URL origin/path checks.
- Pending poll loop and interval.
- `slow_down` backoff and cap.
- `access_denied`, `expired_token`, `invalid_grant`, other OAuth errors.
- `429` with and without `Retry-After`.
- No retry after a dispatched token request; an indeterminate outcome requires a new login; a
  provable pre-dispatch failure may retry.
- Deadline and abort cancellation.
- Token response validation.
- Device ID token valid, wrong signature, wrong issuer, wrong audience, expired, future `iat`,
  missing subject; no nonce required.
- UserInfo subject mismatch.
- Credential replacement prompt.
- Durable persistence and refresh compatibility.
- No device code or token value in output or logs.

The existing authorization-code login tests must remain green. The device-specific verifier must not
change the nonce-required behavior of the authorization-code verifier.

---

## Integration Points

### With RD-01 (Provider Capability)

RD-04 uses the discovery endpoint, device authorization response fields and token errors defined in
RD-01. It does not change the protocol.

### With RD-03 (Client Contracts)

RD-04 uses the admin CLI client's device grant. The clear remediation message points to the
`--grant-types` command and the other administration surfaces. New installs already include the
grant; existing installs must enable it explicitly.

### With RD-05 (Security Operations)

RD-05 owns the server-side rate limits that make the polling loop safe. RD-04 must respect the
advertised interval and the `slow_down` response. RD-05 also owns the assurance coverage for the
CLI/SDK compatibility boundary.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
| --- | --- | --- | --- | --- |
| CLI mode | Explicit flag / auto headless / no change | Explicit `--device-code` | Predictable; keeps existing login unchanged. | AR-5 |
| Credential storage | Reuse existing / separate profile / no refresh | Reuse existing store and refresh | No new storage contract; same user experience. | AR-28 |
| Device ID token | Verify without nonce / custom nonce / skip | Verify without nonce | The provider accepts a device-request nonce but does not copy it to the DeviceCode/ID token; the device code and TLS bind the request. | AR-35 |
| QR code | Print URL+code / terminal QR | Print URL and code only | No new dependency; the user can open the URL directly. | AR-28 |
| Admin client enablement | New init only / automatic / explicit | New init includes; existing explicit | No silent grant widening. | AR-9 |
| Browser flag | `--device-code` implies no browser / still opens browser | Implies no browser | The mode is explicitly headless. | AR-5 |

---

## Security Considerations

- **Data sensitivity:** The device code is a bearer secret. The user code is intentionally shown.
  Tokens are stored in the existing credential store with its existing permissions and lock.
- **Input validation:** Discovery and device authorization responses are bounded and origin-checked.
  Token responses are validated before use. The issuer and endpoint are exact-match validated.
- **Authentication and authorization:** The CLI uses the public admin client and the user completes
  login, 2FA and consent in the browser. It never bypasses the server's authentication policy.
- **Injection risks:** The CLI prints only fixed labels, validated URLs and the user code. It does
  not evaluate response text as terminal control sequences; bounded output is required.
- **Encryption:** The CLI requires HTTPS for the server and discovery/verification URLs. TLS
  verification remains on unless the existing `--insecure` flag is explicitly used.
- **Rate limiting:** The CLI respects `interval`, `slow_down`, `Retry-After` and the hard deadline.
  It does not poll in a tight loop.
- **Infrastructure:** No new service, dependency, secret store or credential format.

---

## Acceptance Criteria

1. [ ] `porta login --device-code` fetches discovery, requires the device endpoint and grant, calls
   the device authorization endpoint and prints the verification URL and user code.
2. [ ] The CLI never prints the device code; the user code is printed exactly once as the
   instruction.
3. [ ] A missing device endpoint or missing grant produces the documented clear error and no token
   request.
4. [ ] A pending poll returns `authorization_pending` and the CLI continues at the advertised
   interval.
5. [ ] `slow_down` increases the interval by 5 seconds and caps it at 60.
6. [ ] A successful approval validates the token response, ID token and UserInfo, persists the
   credentials and prints the authenticated identity.
7. [ ] `access_denied`, `expired_token`, `invalid_grant` and other OAuth errors stop the flow without
   storing credentials.
8. [ ] A `429` with `Retry-After` backs off and continues; a missing header falls back to the current
   interval.
9. [ ] An ambiguous transport/`5xx` failure after the token request is sent stops the flow with an
   indeterminate outcome; the CLI requires a new login. A `429` clamps `Retry-After` to at least
   the current interval, capped at 60 seconds.
10. [ ] Ctrl+C aborts the request and sleep, exits with the existing cancellation behavior and stores
    nothing.
11. [ ] The device ID token verifier rejects wrong signatures, issuers, audiences, expired tokens,
    future `iat` and missing subjects, and accepts a valid token without a nonce.
12. [ ] The authorization-code verifier still requires a nonce; its existing tests remain green.
13. [ ] The stored credential shape is unchanged and the existing refresh path can rotate the
    device-issued refresh token.
14. [ ] `--device-code` implies no browser; the existing `--no-browser` authorization-code behavior
    is unchanged.
15. [ ] No new dependency, QR renderer, credential profile or SDK auth provider is added.
16. [ ] The CLI documentation covers the flag, output, expiry, denial, rate limiting and admin-client
    enablement.
17. [ ] Security requirements verified: exact endpoint/origin validation, no secret output, no retry
    after a dispatched token request, bounded pre-send failures, TLS, abort handling.
