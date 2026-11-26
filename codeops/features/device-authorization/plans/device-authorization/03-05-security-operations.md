# 03-05: Security Operations and Assurance

> **Document**: 03-05-security-operations.md
> **Parent**: [Index](00-index.md)
> **Requirements**: RD-05 (amended by preflight PF-005)
> **AR Refs**: P-7, P-12, P-13, P-15, preflight PF-002, PF-004, PF-005, PF-013, PF-014, PF-015, PF-017, PF-019, PF-020, PF-021, PF-023

## Scope

Implement the fixed device limits, audit events, Pino redaction, cleanup verification and assurance
evidence. This document owns the exact keys, thresholds and event placement; RD-05 owns the
behavioral contract. The fixed limits and redaction land before any client receives the device grant.

## Fixed Constants

Add near the existing rate-limit definitions:

| Constant | Value | Window |
|---|---|---|
| `DEVICE_AUTHORIZATION_RATE_LIMIT` | 10 | 300 seconds |
| `DEVICE_AUTHORIZATION_IP_RATE_LIMIT` | 30 | 300 seconds |
| `DEVICE_USER_CODE_RATE_LIMIT` | 10 | 600 seconds |
| `DEVICE_USER_CODE_IP_RATE_LIMIT` | 30 | 600 seconds |
| `DEVICE_TOKEN_RATE_LIMIT` | 180 | 900 seconds |
| `DEVICE_TOKEN_IP_RATE_LIMIT` | 600 | 300 seconds |
| `DEVICE_POLL_INTERVAL_SECONDS` | 5 | — |
| `DEVICE_POLL_INTERVAL_TOLERANCE_SECONDS` | 1 | — |
| `DEVICE_USER_CODE_MAX_NORMALIZED_LENGTH` | 64 | — |

These are code constants, not system-config keys.

## Middleware and Path Normalization

New `packages/server/src/middleware/device-rate-limiter.ts` exports:

```ts
deviceAuthorizationRateLimiter(): Middleware
deviceUserCodeRateLimiter(provider: Provider): Middleware
deviceTokenRateLimiter(): Middleware
```

The user-code factory takes the provider so it can read `provider.cookieName('session')` and
`provider.Session` when resolving the signed session UID. The other factories do not need it.

Mount order in `packages/server/src/server.ts`:

1. Tenant resolver.
2. A malformed-body counter wrapper around the OIDC body parser for `POST /device`: on a parser
   error, increment the per-IP aggregate once and rethrow; do not increment on a successful parse.
3. Device authorization limiter, device token limiter and user-code limiter, **before**
   `oidcClientTenantBinding`. The generic token limiter is mounted here too and skips the exact
   device grant.
4. `oidcClientTenantBinding`, CORS and the client-secret bridge.
5. `deviceTenantBinding`, then the provider callback.

The user-code limiter runs **before** `deviceTenantBinding` so both the `user_code`-bearing GET and
the POST lookup are budgeted. It counts `GET /device?user_code=` and `POST /device`; the plain
code-entry GET is not counted. The pre-parser counter increments only the **per-IP aggregate** on
the body-parser error path; a malformed POST cannot resolve a session UID or a body, but it still
consumes the address budget. A valid body is counted once by the post-parser limiter (primary +
aggregate); the pre-parser counter must not double-count it.

Use one shared `relativeOidcRoute(ctx)` from `oidc/org-resolution.ts` for the device limiters and
the generic token limiter. It strips
exactly the tenant resolver’s slug (`ctx.state.organization.slug`, with `ctx.params.orgSlug` as a
fallback), lowercases only the route segments, removes trailing slashes and returns `/device/:uid`
for a resume; the UID is read from `ctx.params.uid`, never from a lowercased string. Test
`/acme/DEVICE`, `/acme/Device/Auth`, `/acme/TOKEN`, `/acme/token/`, encoded variants and a mixed-case
resume UID. If `@koa/router` accepts a variant, the limiter must accept it.

The generic `tokenRateLimiter()` skips its counters when the parsed body has exactly the device grant
and no duplicate `grant_type`; the exemption branch sits above the per-IP increment. Other grants
keep the existing limits. The generic limiter also uses the shared relative path predicate, so
`/TOKEN`, `/token/` and encoded variants keep their existing 30/300 and 300/300 limits instead of
falling through the old case-sensitive regex.

## Keys

Use fixed prefixes and hashed identifiers with a separator; never store raw codes.

| Surface | Key |
|---|---|
| Device authorization | `ratelimit:device-auth:{orgId}:{sha256(ip + '|' + clientId)[:16]}` |
| Device authorization per IP | `ratelimit:device-auth:ip:{sha256(ip)[:16]}` |
| User code | `ratelimit:device-user-code:{orgId}:{sha256(ip + '|' + sessionUid)[:16]}` |
| User code per IP | `ratelimit:device-user-code:ip:{sha256(ip)[:16]}` |
| Poll interval | `ratelimit:device-poll-last:{clientId}:{sha256(deviceCode)[:16]}` |
| Poll per client | `ratelimit:device-poll:client:{clientId}:{sha256(ip)[:16]}` |
| Poll per IP | `ratelimit:device-poll:ip:{sha256(ip)[:16]}` |
| Authorized-audit idempotency | `audit:device-authorized:{sha256(jti)[:16]}` |
| Rate-limit audit marker | `audit:device-rate-limit:{event}:{keyHash}:{windowStart}` |

`sessionUid` is the provider session UID resolved from the signed `_session` cookie through the
configured `cookieKeys`/`provider.Session`. When no session can be resolved, the IP is the fallback.
The limiter and the reset must use the same identifier. The per-IP aggregate is never reset. The
device auth and token client ID is extracted from the parsed body or HTTP Basic credentials with the
existing bounded helper (export/reuse `presentedClientId`); do not duplicate that parsing.

The poll-interval key stores the last poll time with a TTL of 1500 seconds. The check is
`now - last < interval - tolerance`; use `SET`/`GET` or a small Lua script so two concurrent polls
cannot both pass. Two rapid polls may both be allowed only if the hard counters still bound them.

`sha256` inputs use a separator (`ip + '|' + clientId`, `ip + '|' + sessionUid`) to avoid
concatenation collisions. Use the existing `checkRateLimit()` graceful Redis-failure policy for the
counter limits, matching RD-05; this is an accepted residual risk (preflight PF-019, Option B).

## Responses

| Surface | Response |
|---|---|
| Device authorization limit | `429` JSON `rate_limit_exceeded`, `Retry-After` |
| User-code limit | `429` branded generic page, `Retry-After` |
| Poll faster than interval | `400` `slow_down` |
| Poll hard limit | `429` `rate_limit_exceeded`, `Retry-After` |

Set CORS headers consistently with the existing token limiter. Set `Cache-Control: no-store` and
`Pragma: no-cache` on early `slow_down`/`429` responses. Do not reveal code state in the user-code
429 page.

The device token limiter increments both hard counters on every device poll **before** evaluating
the soft interval. A 1-second poller therefore consumes the hard budget even while receiving
`slow_down`; the 180/15-minute and 600/5-minute limits remain reachable. Add `X-RateLimit-*` headers
where the response shape allows.

## Concurrent Approval

Two concurrent confirmation POSTs must not both approve one code. The provider checks
`code.error || code.accountId || code.inFlight`, then sets `inFlight = true` and saves; that
check/save is not atomic. The DeviceCode adapter upsert must compare-and-set only the
**pre-approval confirmation** transition: when the incoming payload has `inFlight = true`, no
`accountId` (and no `grantId`), **and no `error`/`errorDescription`**, update only a row whose stored
`payload->>'inFlight'` is not true; if no row is updated, throw a conflict that the provider maps to
the generic invalid page.

Two later legitimate saves must bypass the CAS:

- the completion save that carries `accountId`/`grantId`; and
- the provider’s denial/error save after confirmation, which carries `inFlight = true` and
  `error = 'access_denied'` (or another error) but no account/grant. Rejecting it would leave the
  DeviceCode without the error, so the device poll would stay `authorization_pending` and the denial
  audit would never see the user decision. This bypass applies only while the stored row has no
  `accountId`/`grantId`; if the code is already approved, the late error save must not overwrite the
  approval (leave the row unchanged; the completion save wins).

Do not change the generic upsert for other models. ST-31 must assert both that the loser is rejected
and that the winner’s completion save succeeds; ST-27 must assert that a consent denial after
confirmation persists `error = 'access_denied'` and the poll receives `access_denied`.

## Audit Events

Use `writeAuditLog` best-effort:

| Event | Category | Placement | Metadata |
|---|---|---|---|
| `user.device.authorized` | `authentication` | Start of `deviceSuccessSourceHook`, before rendering | org, user, public client ID, scopes |
| `user.device.denied` | `authentication` | `userCodeInputSourceHook` when a device code exists and the error is a user abort or consent denial | org, user if known, client ID, scopes, bounded reason |
| `rate_limit.device_code` | `security` | Device authorization/poll limiters | org, client ID when known, IP |
| `rate_limit.device_user_code` | `security` | User-code limiter | org, IP |

Rules:

- Write authorized exactly once. Use a short-lived Redis `SET NX` keyed by
  `sha256(DeviceCode jti)` (the raw `jti` is the device code, so never use it raw), with a TTL tied
  to the 1500-second retention. If the audit write fails after `SET NX`, delete the key so a retry can
  write the row.
- Resolve the DeviceCode from `ctx.oidc.deviceCode` or
  `ctx.oidc.entities.Interaction?.deviceCode`; the consent-denial path may not set the entity.
- Write denied only for a real user abort or a user consent denial. Classify `err.cause`:
  `AccessDenied` with a cause is `denied`; no cause is `aborted`. Do not claim a user decision for a
  server-side abort.
- Write the authorized event before page rendering, so a template failure cannot leave an approved
  code without an audit row.
- Write rate-limit audit rows once per key/window, using a `SET NX` marker or a `firstDenied` flag;
  do not insert a row for every request that is already over the limit.
- Never include `device_code`, `user_code`, raw bodies or provider errors.
- Authorized/denied events exclude IP and user agent. Rate-limit events may include IP.
- A failed audit write is logged without codes and never changes the response.

## Log Redaction

Extend `packages/server/src/lib/logger.ts` paths:

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

There is no production URL/query log sink: the request logger emits only requestId, method, route
template, status and duration. Do not add a URL field just to sanitize it, and do not add a separate
`request-url-sanitizer.ts`; the structured Pino redaction covers logged body objects. Keep the
existing route-only privacy contract and document the reverse-proxy access-log exposure
(`verification_uri_complete` contains the user code) as operational guidance.

Test the emitted destination stream, not the pre-redaction operational observer. Export the redact
paths or a test-only `createLogger(destination)` factory; the existing copied-config test is not
sufficient. Add top-level and nested redaction tests. The CLI never logs the device code and prints
the user code only as the instruction.

## Operational Envelope

The approved 180/15-minute client+IP budget supports one concurrent device login at the advertised
interval. Two parallel flows from one client+IP can exhaust the budget and receive `429`; they must
back off. This is documented rather than changing the approved limit. A successful approval resets
only the primary user-code counter; the per-IP aggregate remains.

## Cleanup and Privacy

- DeviceCode adapter expiry is 600s + 900s (03-01); `purgeExpired` removes it.
- Call `purgeExpired()` fire-and-forget on approval/login entry, not on every unauthenticated plain
  GET `/device`.
- The migration preflights duplicate DeviceCode user codes with a clear remediation and uses
  `CONCURRENTLY` if the migration runner supports it.
- Verify client/user/organization deletion, logout cascade and connected-app revocation remove the
  applicable rows.
- Add `device` to the organization reserved slugs, or strip the exact slug prefix in the provider
  mount path so `/device/device` cannot break `urlFor` or the resume-cookie path.
- No IP/UA in DeviceCode or approval/denial audit. The existing GDPR count is unchanged.
- No new setting, permission, dependency, service or worker.

## Assurance

| Purpose | Command |
|---|---|
| Unit | `pnpm test:unit` |
| Integration | `pnpm test:integration` |
| End-to-end | `pnpm test:e2e` |
| Browser | `pnpm test:ui` |
| Security | `pnpm test:pentest` |
| Structure | `pnpm test:structure` |
| Docs | `pnpm docs:build` |
| Production security | `pnpm assurance:harness --project security --profile production-security` |
| SDK/CLI compatibility | `pnpm assurance:compat --select compatibility` |

The `compatibility` selector packs the SDK/CLI and checks credential isolation; it does **not**
exercise `porta login --device-code` or a device-granted client response. The plan must name it
truthfully and rely on the new unit/E2E tests for the device flow. Adding a device-specific selector
would be a new harness surface and is not approved.

The production-security gate is “no new findings; the three accepted forwarding-context observer
gaps remain unchanged; exit 40 is recorded.” Do not call it fully passed.

The full `pnpm verify` run remains the CI gate. `pnpm verify` excludes UI and the OIDC harness, so
the phase gates also run `pnpm test:ui` and `pnpm harness:test` where the phase changes browser or
interaction behavior. Add count-update tasks for
`repo-tests/monorepo/server-package.spec.test.mjs` whenever test files are added.

## Test Matrix

| Threat | Test |
|---|---|
| Cross-tenant entry/resume | ST-10, ST-11, ST-30 |
| Brute force | ST-24 |
| Polling abuse | ST-25 |
| Path-case bypass | ST-23, ST-25, ST-26 |
| Replay/client mismatch | ST-06, ST-08 |
| Code leakage | ST-27, ST-28 |
| Stale authority | ST-29 |
| Ambiguous exchange/self-revocation | ST-06, ST-21 |
| Concurrent approval | ST-31 |
| Concurrent authorized audit | ST-27 |
| Audit write amplification | ST-27 |
| Redis failure (accepted fail-open) | ST-24 |

## Files

`packages/server/src/middleware/device-rate-limiter.ts`, `token-rate-limiter.ts`, `server.ts`,
`logger.ts`, `device-pages.ts`, `postgres-adapter.ts` (conditional confirmation write), the
`oidc/org-resolution.ts` helper, and the related tests/docs. Do not add `request-url-sanitizer.ts`.

## Tests

ST-21–ST-34 in [07-testing-strategy.md](07-testing-strategy.md), plus the assurance commands above.
