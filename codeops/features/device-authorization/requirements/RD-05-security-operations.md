# RD-05: Security Operations and Assurance

> **Document**: RD-05-security-operations.md
> **Status**: Draft
> **Created**: 2026-11-24
> **Project**: Porta
> **Depends On**: RD-01, RD-02, RD-03, RD-04
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

This requirement defines the cross-cutting controls that make the device authorization grant safe
to operate: fixed rate limits, audit events, log redaction, DeviceCode cleanup and the security
assurance evidence.

The limits are deliberately not configurable. They use the existing Redis rate-limit
infrastructure and fixed constants. Device approval and denial add dedicated authentication audit
events; rate-limit denials add security events. Neither event contains the device code or user code.

The assurance section defines the minimum unit, integration, end-to-end, UI, penetration,
compatibility and production-security evidence required before the feature is accepted.

---

## Functional Requirements

### Must Have

- [ ] Device authorization requests are limited to **10 requests per 5 minutes per IP + client**.
- [ ] Device authorization requests are also limited to **30 requests per 5 minutes per IP** across
      all clients, so rotating client IDs cannot reset the budget.
- [ ] User-code submissions are limited to **10 attempts per 10 minutes per IP + provider session
      UID**. A successful approval resets only the primary counter; the per-IP aggregate is never
      reset. When no session UID exists, the IP is the fallback.
- [ ] User-code submissions are also limited to **30 attempts per 10 minutes per IP** across all
      sessions, so rotating provider sessions cannot reset the budget.
- [ ] Device token polling is limited to **180 requests per 15 minutes per client + IP**.
- [ ] Device token polling from one IP is limited to **600 requests per 5 minutes across all
      clients**.
- [ ] A device poll faster than the advertised five-second interval receives HTTP `400` with
      `error=slow_down`.
- [ ] A device poll that crosses the hard 180/15-minute budget receives HTTP `429` with
      `error=rate_limit_exceeded` and `Retry-After`.
- [ ] The existing generic token limiter does not count device-code polls. All other grants keep
      their current 30/5-minute per-client and 300/5-minute per-IP limits.
- [ ] All device limits use privacy-safe Redis keys. The device code and user code never appear raw
      in a key.
- [ ] Path matching for the device limiters is case-insensitive and trailing-slash tolerant, in
      line with `@koa/router` matching. `/DEVICE`, `/Device/Auth`, `/TOKEN` and equivalent variants
      cannot bypass a limiter.
- [ ] Redis failures follow the existing authentication rate-limit policy: the request is allowed,
      a warning is logged, and the service does not crash. No new fail-open or fail-closed policy is
      introduced.
- [ ] Approval writes `user.device.authorized` in the `authentication` category with organization,
      user, client and scopes. It contains no device code, user code, IP address or user agent.
- [ ] Denial or abort writes `user.device.denied` in the `authentication` category with the same
      non-secret fields and a bounded reason.
- [ ] Rate-limit denials write `rate_limit.device_code` or `rate_limit.device_user_code` in the
      `security` category. These may include the source IP, following the existing rate-limit audit
      pattern, but never a device code or user code.
- [ ] Audit writes are best-effort and never block or change the protocol response. A failed audit
      write is logged without secrets.
- [ ] `device_code`, `user_code`, `deviceCode` and `userCode` are added to Pino redaction paths,
      including nested `*.` paths and request-body paths.
- [ ] The DeviceCode row is purged after its 600-second lifetime plus 900-second retention, using
      the existing opportunistic `purgeExpired()` path. The device verification flow triggers the
      purge without awaiting it.
- [ ] Client deletion, user deletion, organization deletion, logout cascade and connected-app
      revocation remove the applicable DeviceCode rows.
- [ ] The feature adds no new global setting, permission, dependency, service, worker or
      infrastructure.
- [ ] The security assurance covers cross-tenant approval, user-code brute force, polling abuse,
      replay, client mismatch, path-case bypass, code leakage and stale authority.
- [ ] The production-security assurance profile is run because this feature changes the OIDC
      public surface.
- [ ] The registered SDK/CLI compatibility selector is run because the client contract changes.
- [ ] The full CI verification remains the release gate.

### Should Have

- [ ] Rate-limit responses include the existing informational `X-RateLimit-*` headers where the
      response shape allows it.
- [ ] Rate-limit audit metadata includes the public client ID for device authorization and polling,
      and the organization ID for all events.
- [ ] The operational documentation states the fixed limits, the audit event names and the absence
      of a configuration setting.
- [ ] The device verification page calls the opportunistic purge on entry.

### Won't Have (Out of Scope)

- New dashboards, metrics, alerts, queues, workers or schedulers.
- Configurable limits or a new system-config key.
- Device-specific retention beyond the 15-minute expired window.
- A new audit storage subsystem; the existing audit log is used.
- A new RBAC permission or an operator-facing rate-limit editor.
- Device fingerprinting or device reputation.
- Changes to the existing login, 2FA, password-reset or admin rate limits.

---

## Technical Requirements

### Fixed limit constants

Add constants near the existing rate-limit definitions:

| Constant | Value | Window |
| --- | --- | --- |
| `DEVICE_AUTHORIZATION_RATE_LIMIT` | 10 | 300 seconds |
| `DEVICE_AUTHORIZATION_IP_RATE_LIMIT` | 30 | 300 seconds |
| `DEVICE_USER_CODE_RATE_LIMIT` | 10 | 600 seconds |
| `DEVICE_USER_CODE_IP_RATE_LIMIT` | 30 | 600 seconds |
| `DEVICE_TOKEN_RATE_LIMIT` | 180 | 900 seconds |
| `DEVICE_TOKEN_IP_RATE_LIMIT` | 600 | 300 seconds |
| `DEVICE_POLL_INTERVAL_SECONDS` | 5 | — |
| `DEVICE_POLL_INTERVAL_TOLERANCE_SECONDS` | 1 | — |

These are exported for tests and documentation. They are not system-config keys.

### Route matching

The limiters run on the organization-prefixed OIDC router after tenant resolution and body parsing,
before the provider callback. They use a normalized path:

```ts
const normalizedPath = ctx.path.toLowerCase().replace(/\/+$/, '') || '/';
```

The match table:

| Route | Limit |
| --- | --- |
| `POST /{orgSlug}/device/auth` | Device authorization |
| `POST /{orgSlug}/device` | User-code attempts |
| `POST /{orgSlug}/token` with device grant | Device polling |
| `POST /{orgSlug}/token` with other grants | Existing generic token limiter |

The limiters must be tested with mixed case, trailing slashes and equivalent encoded forms that
`@koa/router` accepts. If the router accepts a variant, the limiter must match it.

### Device authorization limiter

Key:

```text
ratelimit:device-auth:{organizationId}:{sha256(ip + clientId)[:16]}
ratelimit:device-auth:ip:{sha256(ip)[:16]}
```

The client ID is read from the parsed form body or HTTP Basic credentials. When absent, `unknown`
is used. Both the primary key and the per-IP aggregate are checked. The response is HTTP `429` with
the OAuth JSON error:

```json
{
  "error": "rate_limit_exceeded",
  "error_description": "Too many device authorization requests. Please try again later.",
  "retry_after": 300
}
```

Set `Retry-After` and the existing CORS headers. Write `rate_limit.device_code` with the organization
ID and public client ID when available.

### User-code limiter

Key:

```text
ratelimit:device-user-code:{organizationId}:{sha256(ip + sessionUid)[:16]}
ratelimit:device-user-code:ip:{sha256(ip)[:16]}
```

`sessionUid` is the provider session UID when it can be resolved from the signed provider session
cookie; otherwise the IP is used alone. The limiter and the reset must use the same identifier. Both
the primary key and the per-IP aggregate are checked. Each counted request consumes one attempt in
both counters. A successful approval resets only the primary counter from the success hook; the
per-IP aggregate is never reset. The 11th primary attempt or the 31st per-IP attempt within the
window returns HTTP `429` with the branded generic page and `Retry-After`; it does not reveal whether
a code exists.

> **Preflight amendment (PF-005, 2026-11-25):** The confirmation hook runs when the confirmation page
> is rendered, before approval, and resetting the per-IP aggregate would let one valid code clear the
> cross-session brute-force budget. The approved behavior is “successful approval resets only the
> primary counter.”

The limiter must not count a GET of the code-entry page. It must count the POST even when the body
is malformed; a malformed request is still an attempt.

Write `rate_limit.device_user_code` with the organization ID and source IP. Do not include the
submitted code.

### Device token polling limiter

The existing `tokenRateLimiter()` is changed to skip its counters when the parsed body has:

```text
grant_type=urn:ietf:params:oauth:grant-type:device_code
```

The device limiter then applies:

| Check | Key | Decision |
| --- | --- | --- |
| Interval | `ratelimit:device-poll-last:{clientId}:{sha256(deviceCode)[:16]}` | If the last poll was less than 4 seconds ago, return `slow_down` |
| Hard per-client | `ratelimit:device-poll:{clientId}:{sha256(ip)[:16]}` | 180/900 seconds |
| Hard per-IP | `ratelimit:device-poll:ip:{sha256(ip)[:16]}` | 600/300 seconds |

The interval key stores the last poll time with a short TTL. It never stores the raw device code.
A missing or malformed device code is left for the provider to reject, but the request still counts
against the hard per-IP budget.

Responses:

- Soft interval violation: HTTP `400` with `error=slow_down` and a bounded description.
- Hard budget: HTTP `429` with `error=rate_limit_exceeded` and `Retry-After`.
- Allowed: continue to the provider.

The generic token limiter's per-IP aggregate must not count device polls. The device per-IP limit
replaces that coverage.

### Rate-limit failure policy

Use the existing `checkRateLimit()` for all device limits. On Redis failure it logs a warning and
allows the request. This matches the existing login, token and password-reset behavior. The device
code's entropy, short lifetime and single-use consumption remain in force. Do not introduce
`checkRateLimitStrict()` for these limits without a separate decision.

### Audit events

| Event | Category | When | Metadata |
| --- | --- | --- | --- |
| `user.device.authorized` | `authentication` | Successful approval, once | organization, user, public client ID, scopes |
| `user.device.denied` | `authentication` | User aborts or denies, once | organization, user if known, public client ID, scopes, reason `aborted` or `denied` |
| `rate_limit.device_code` | `security` | Device authorization or polling limit | organization, public client ID when known, source IP |
| `rate_limit.device_user_code` | `security` | User-code limit | organization, source IP |

Rules:

- Never include `device_code`, `user_code`, raw request bodies or raw provider errors.
- Approval and denial do not include IP address or user agent. The user chose no device details for
  the approval flow.
- Rate-limit security events may include the source IP, matching the existing `rate_limit.login`
  and `rate_limit.password_reset` events.
- The approval event is written from the success hook; the denial event from the aborted/denied
  input state. Do not write both for one outcome.
- Audit writes are best-effort. A failure is logged without codes and does not change the response.

### Log redaction

Extend `packages/server/src/lib/logger.ts` redaction paths with:

```text
device_code
user_code
deviceCode
userCode
*.device_code
*.user_code
*.deviceCode
*.userCode
req.body.device_code
req.body.user_code
```

Add tests that a log payload containing either code is emitted as `[Redacted]`. The CLI must also
avoid logging the device code; the user code is printed only as the intentional instruction.

### Cleanup and retention

- DeviceCode rows use `expires_at = now + 600 + 900` seconds.
- The provider payload `exp` remains `now + 600`.
- `purgeExpired()` runs opportunistically from the device verification entry point and from the
  existing login entry point. It is fire-and-forget.
- Client deletion deletes by public client ID.
- User deletion deletes by account ID for approved codes.
- Organization deletion deletes by client and account references.
- Logout cascade deletes by grant ID.
- Connected-app revocation deletes by grant ID.
- Pending codes with no account are removed by client or organization deletion, or by expiry.

### Privacy and data handling

- No IP address or user agent is stored in the DeviceCode payload.
- Approval and denial audit rows do not include IP or user agent.
- Rate-limit security rows may include the source IP, following the existing security audit
  pattern.
- The device code and user code are never exported. The existing GDPR export counts
  `oidc_payloads` rows by account and does not export raw payloads.
- The unique user-code index contains only the normalized code, not any other device identity.

### Security test matrix

| Threat | Required test |
| --- | --- |
| Cross-tenant code entry | Org B `/device` with an org A code returns `404`; no interaction, session or token |
| Cross-tenant resume | Org B `/device/:uid` cannot resume an org A interaction |
| User-code brute force | The 11th primary attempt or 31st per-IP attempt in the window returns `429`; no code-state detail |
| Identifier/session rotation | Varying client IDs or provider sessions still hits the per-IP aggregates |
| Polling abuse | Faster-than-interval polls return `slow_down`; hard budget returns `429` |
| Replay | A consumed device code cannot issue a second token set |
| Client mismatch | A different client ID gets `invalid_grant` |
| Path-case bypass | `/DEVICE`, `/Device/Auth`, `/TOKEN` and trailing-slash variants are limited |
| Code leakage | Device/user codes are absent from logs, audit rows and token responses |
| Stale authority | Disabled client, deactivated user, suspended organization, revoked grant and logout cannot exchange an approved code |
| Redis failure | Limits fail open with a warning and do not crash the request |
| Concurrent approval | Two confirmation posts cannot both approve or consume one code |

### Assurance commands

Run the applicable narrow suites during implementation and the full CI gate before acceptance:

| Purpose | Command |
| --- | --- |
| Unit | `pnpm test:unit` |
| Integration | `pnpm test:integration` |
| End-to-end | `pnpm test:e2e` |
| Browser | `pnpm test:ui` |
| Security | `pnpm test:pentest` |
| Structure | `pnpm test:structure` |
| Docs | `pnpm docs:build` |
| Production security | `pnpm assurance:harness --project security --profile production-security` |
| SDK/CLI compatibility | `pnpm assurance:compat --select compatibility` (packed SDK/CLI and credential isolation); it does not exercise device login, which is covered by the live CLI E2E |

The full `pnpm verify` run remains the CI release gate. Local runs follow the repository's
narrow-test prime directive.

### Operational documentation

Add a short section to the OIDC or deployment documentation stating:

- The fixed rate limits and the 10-minute code lifetime.
- The `user.device.authorized`, `user.device.denied`, `rate_limit.device_code` and
  `rate_limit.device_user_code` events.
- There is no device-flow configuration setting.
- Existing installations must enable the grant on the admin CLI client explicitly.

---

## Integration Points

### With RD-01 (Provider)

RD-05 adds the limits and cleanup around the protocol defined in RD-01. It does not change the
device authorization response or token response.

### With RD-02 (Verification)

RD-05 implements the user-code limiter, the branded `429` page, the approval/denial audit and the
cross-tenant penetration tests. RD-02 supplies the page templates and decision points.

### With RD-03 (Client Contracts)

RD-05 reuses the existing Admin mutation audit. It adds no admin permission or audit path.

### With RD-04 (CLI)

RD-05 verifies that the CLI respects `interval`, `slow_down`, `429` and the expiry deadline. It also
verifies that the CLI does not log or print the device code.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
| --- | --- | --- | --- | --- |
| Configuration | Fixed constants / global settings | Fixed constants | Avoids expanding the closed catalog. | AR-6 |
| Budget rotation | Per-IP aggregates / primary keys only / IP-only | Per-IP aggregates | Prevents client/session rotation from resetting budgets. | AR-36 |
| Audit | Dedicated auth + rate-limit / rely on login/consent / none | Dedicated events | Device approval is a distinct authentication event. | AR-11, AR-22 |
| Redaction | Both codes / device only / none | Both codes | Both are sensitive request material. | AR-30 |
| Limiter failure | Graceful / strict | Graceful, existing policy | Matches current authentication behavior; code entropy remains. | AR-6 |
| Code collision | Fail closed / probabilistic / retry | Fail closed with unique index | Prevents misrouting. | AR-31 |
| Device data | None / user agent / default | None | Privacy-first. | AR-10 |
| Connected apps | Same grant / source label / separate view | Same grant | Existing revocation already covers it. | AR-26 |

---

## Security Considerations

- **Data sensitivity:** Device and user codes are secrets. Audit and log output exclude them.
  DeviceCode payloads contain no IP or user agent.
- **Input validation:** Limiters parse bounded client IDs, grant types and codes; malformed input is
  counted and left for the provider to reject.
- **Authentication and authorization:** The limits protect public endpoints but do not replace the
  client grant check, tenant binding, user login, 2FA or consent.
- **Injection risks:** Redis keys use fixed prefixes and hashed identifiers; no raw code appears in
  a key. Audit metadata is structured and code-free.
- **Encryption:** TLS protects the endpoints. Redis and PostgreSQL keep their existing deployment
  controls. No new secret store.
- **Rate limiting:** The fixed limits are the core of this RD. Case/path normalization is mandatory.
  Per-client and per-session keys are paired with per-IP aggregates so identifier rotation cannot
  reset a budget.
- **Infrastructure:** No new service, queue, worker, dashboard or dependency. Existing Redis and
  PostgreSQL are used.

---

## Acceptance Criteria

1. [ ] The 11th device authorization request in five minutes for one IP+client receives HTTP `429`
   `rate_limit_exceeded` with `Retry-After`; the 10th is allowed.
2. [ ] The 11th user-code submission in ten minutes for one IP+session receives the branded `429`
   page; a successful approval resets only the primary counter, and the per-IP aggregate is
   unchanged.
3. [ ] The 31st device authorization request in five minutes from one IP receives HTTP `429` even
   when the client ID changes on every request.
4. [ ] The 31st user-code submission in ten minutes from one IP receives the branded `429` page even
   when the provider session changes on every request.
5. [ ] A device polling every five seconds for the full ten-minute lifetime completes without a
   `429`; a pending response is returned while waiting.
6. [ ] A poll faster than the advertised interval receives HTTP `400` `slow_down`.
7. [ ] The 181st poll in fifteen minutes for one client+IP receives HTTP `429`; the 180th is
   allowed if it is otherwise valid.
8. [ ] The 601st device poll in five minutes from one IP receives HTTP `429`.
9. [ ] The existing generic 30/5-minute token limit does not count device-code polls; other grants
   keep their existing limits.
10. [ ] `/DEVICE`, `/Device/Auth`, `/TOKEN`, trailing-slash and equivalent router-accepted variants
    hit the same limiter; no variant bypasses it.
11. [ ] Redis failure allows the request, logs a warning and does not crash; no new failure policy
    exists.
12. [ ] Approval writes exactly one `user.device.authorized` event with organization, user, client
    and scopes; it has no codes, IP or user agent.
13. [ ] Abort/denial writes exactly one `user.device.denied` event with a bounded reason; it has no
    codes, IP or user agent.
14. [ ] Device authorization/polling and user-code limits write the correct `rate_limit.*` security
    event; the event has no codes.
15. [ ] Pino redacts `device_code`, `user_code`, `deviceCode` and `userCode` at top level and nested.
16. [ ] DeviceCode rows are purged after the extended expiry; client/user/organization deletion,
    logout and connected-app revocation remove applicable rows.
17. [ ] The pentest matrix passes: cross-tenant approval and resume, brute force, polling abuse,
    replay, client mismatch, path-case bypass, code leakage, identifier/session rotation and stale
    authority.
18. [ ] The production-security assurance profile has no new findings, the three accepted
    forwarding-context gaps remain unchanged, and exit 40 is recorded. The compatibility selector is
    described truthfully and does not claim device-login coverage.
19. [ ] `pnpm docs:build` passes and the operational documentation states the fixed limits, audit
    events and absence of a configuration setting.
20. [ ] No new global setting, permission, dependency, service, worker or infrastructure exists.
21. [ ] Security requirements verified: privacy-safe keys, code-free audit/logs, case-normalized
    limits, graceful Redis failure, cleanup and cross-tenant rejection.
