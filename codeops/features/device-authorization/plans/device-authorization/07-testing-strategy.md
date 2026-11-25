# Testing Strategy: Device Authorization

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)
> **Preflight**: [00-preflight-report.md](00-preflight-report.md) — PF-007, PF-008, PF-009, PF-020

## Testing Overview

### Coverage Goals

| Code type | Target |
|---|---|
| Provider protocol and storage | 90% |
| Tenant binding and rate limits | 90% |
| Client contract surfaces | 85% |
| CLI coordinator and verifier | 85% |
| Templates/locales/glue | 60% |

Test names state behavior. Integration tests use a real PostgreSQL/Redis test server. E2E tests use
the existing shared server. UI tests use Playwright. No new test harness is created. A unit test does
not open PostgreSQL, Redis or HTTP; a case that needs one of those belongs in integration/E2E.

## Test Slices & Groups

`N/A — no codeops/test-map.json exists.` The phase gate is `pnpm verify` (CI authoritative) plus
`pnpm test:ui`, `pnpm harness:test` and the assurance selectors where the phase touches browser,
interaction or security behavior. During implementation, task verification uses the narrow existing
commands: `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:ui`,
`pnpm test:pentest`, `pnpm test:structure`, `pnpm docs:build`, and the registered assurance
selectors. A local run is a selection, not a waiver of CI.

Every phase that adds a test file also updates the exact counts in
`repo-tests/monorepo/server-package.spec.test.mjs` before its gate. `pnpm verify` includes
`pnpm test:structure` as its first step; without the count update the gate fails on an unrelated
assertion.

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

These cases are derived from RD-01–RD-05, the component specs, RFC 8628 and RFC 6749, and the plan
register. Expectations are fixed before implementation. Each ST case has exactly one owning file in
the table below; other layers may add separately named regression tests, but they do not redefine
the oracle.

### Provider, storage and tenant binding

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-01 | GET both discovery documents for an org with the feature enabled | HTTP 200; `device_authorization_endpoint` equals `{issuer}/device/auth`; `grant_types_supported` contains `urn:ietf:params:oauth:grant-type:device_code`; existing endpoints unchanged | RD-01 §Discovery |
| ST-02 | POST `/acme/device/auth` with a public device-only client (`grant_types: [device URN]`, `redirect_uris: []`, `response_types: []`) and scope `openid profile offline_access` | HTTP 200 JSON with `device_code`, `user_code` matching `^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$`, `verification_uri` = `{issuer}/device`, `verification_uri_complete` with `user_code`, `expires_in: 600`, `interval: 5` | RD-01 §Device authorization, AR-20 |
| ST-03 | POST device/auth with (a) a client without the grant, (b) an unknown client, (c) a client owned by another org | (a) HTTP 400 `invalid_request`; (b) and (c) HTTP 404 generic `Client not found`; no device code | RD-01 §Client grant, RD-02 §Tenant |
| ST-04 | Complete a device authorization and read the `oidc_payloads` row | Row `type='DeviceCode'`, normalized `user_code`, `expires_at` about 1500s ahead, provider payload `exp` about 600s ahead, no `ip` or `ua`; the partial unique index exists | RD-01 §Storage, AR-10 |
| ST-05 | Poll the token endpoint before approval | HTTP 400 `error=authorization_pending`; no token | RD-01 §Token exchange |
| ST-06 | Approve, poll once, poll again with the same device code | First poll HTTP 200 with access token, optional ID/refresh token; second HTTP 400 `invalid_grant`, row has `consumed_at`, and the first token set is revoked by the provider's replay handling | RD-01 §Single use, RD-05 §Replay |
| ST-07 | Set the payload `exp` to the past while the retained `expires_at` is still in the future; poll; then set `expires_at` past and purge | First HTTP 400 `error=expired_token`; after `purgeExpired()` HTTP 400 `invalid_grant` (absent) | RD-01 §Retention, AR-20 |
| ST-08 | Poll with a different client ID than the DeviceCode client | HTTP 400 `error=invalid_grant`; no token | RD-01 §Token exchange |
| ST-09 | Force two DeviceCode rows to share a user code (adapter seam or controlled generation) | The new device authorization request returns HTTP 503 with a custom exposed `temporarily_unavailable` error (not 500 `server_error`); the existing row is unchanged; no token | RD-01 §Collision, AR-31 |
| ST-10 | A valid org A user code is submitted to org B `POST /device`, including lowercase/no-dash/space/`ß`/fullwidth variants that normalize to the same code, an underscore variant that stays distinct, and an overlong value | Normalized variants return HTTP 404 generic body; the distinct and overlong values return the same generic 404 without a DB lookup; no client name/scopes; no interaction; no token | RD-02 §Cross-tenant, AR-29 |
| ST-11 | Org B requests `GET /device/:uid` for an org A device interaction, including provider-shaped 43-character mixed-case UIDs, `/DEVICE/...`, trailing slashes, encoded variants and a mismatched resume cookie | All variants return HTTP 404; the org A interaction is not resumed; HEAD returns 405 | RD-02 §Resume, AR-29 |

### Branded verification and UX

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-12 | GET `/device`; open `verification_uri_complete`; confirm a valid code; approve | Branded HTML on the entry and confirmation pages (the transient auto-submit may be provider-owned); labeled input; client name, exact requested scopes from the DeviceCode, and user code on confirmation; static success page with client name; no external resources; no device code or IP/UA | RD-02 §Pages, AR-3/AR-10 |
| ST-13 | Submit unknown, expired and already-used codes; abort a valid confirmation; omit/mismatch the XSRF | Unknown/expired/used/aborted all render the same generic invalid-or-expired page with a retry form; missing/mismatched XSRF is rejected by the provider; abort causes the device poll to receive `access_denied`; no token | RD-02 §Errors, AR-15 |
| ST-14 | Approve with (a) an existing session, (b) no session + 2FA, (c) `requireConsent=true`, (d) trusted client; request en and nl | (a) no second login; (b) existing 2FA challenge; (c) existing consent page; (d) auto-consent after confirmation with scopes visible; both locales resolve (no raw keys) | RD-02 §Login/consent, AR-13/AR-14 |
| ST-34 | Request a device page with an unknown or missing `Accept-Language` and an organization default locale | Falls back to the organization default or `en`; no raw keys; en/nl still resolve | RD-02 AC-2 |

### Client contracts

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-15 | Admin API create: device-only public native with `redirectUris: []` + `responseTypes: []`; auth-code with `[]`; device+auth-code with `[]`; device-only with `responseTypes: ['code']`; unknown grant; omitted grantTypes | Device-only `201`; auth-code and mixed `400`; device-only with `['code']` `400`; unknown `400`; omitted stores existing defaults without the device grant | RD-03 §Admin API, AR-4/AR-12 |
| ST-16 | Update an existing client to add the URN; remove auth code and clear redirects/response types; send a stale ETag | Valid updates succeed with existing ETag behavior; stale ETag returns the existing precondition failure; complete resulting configuration is validated; a device-only client persists `responseTypes: []` | RD-03 §Admin API, P-10 |
| ST-17 | SDK create/update with the URN, `redirectUris: []`, `responseTypes: []`; runtime response with the URN and empty response types; unknown grant | SDK type and runtime validator accept the URN and empty arrays only for device-only; unknown grant is rejected | RD-03 §SDK, AR-8 |
| ST-18 | `porta client create` device-only without redirects; auth-code without redirects; update with `--grant-types` and `--redirect-uris ""`; get/list; `porta init` | Device-only succeeds and sends `responseTypes: []`; auth-code fails before the API call; update replaces grants and clears redirects only when valid; output contains the URN; init stores the device grant and the existing exact-grant tests are updated | RD-03 §CLI, AR-17 |
| ST-19 | Admin terminal Protocol edit and registration for a device-only client | Terminal displays/saves the URN and empty response types; registration can create device-only without a redirect URI and rejects auth-code without one | RD-03 §Admin terminal, AR-16 |
| ST-32 | Portability export/import round-trip for a device-only client | Portability round-trips the URN and empty redirects/response types; current readers reject an unknown grant | RD-03 §Portability, AR-18 |

### CLI device login

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-20 | `porta login --device-code` against a live E2E server with support and a granted admin client; approve | Discovery validated; device auth called; URL and user code printed with the expiry hint; device code never printed; polls at interval; stores the existing credential shape; prints the identity | RD-04 §Flow, AR-5/AR-28 |
| ST-21 | Poll returns pending, `slow_down`, `429` with small/large/missing `Retry-After`, `access_denied`, `expired_token`, `invalid_grant`, an ambiguous network timeout/5xx after send, and an unknown OAuth error/status | Pending continues; `slow_down` increases interval by 5s (cap 60); `429` waits at least the current interval and at most 60s; terminal errors stop without credentials; an ambiguous exchange is not retried and requires a new login; unknown errors are terminal; deadline never exceeded | RD-04 §Polling, AR-20, PF-006 |
| ST-22 | Device ID token valid without nonce; supplied nonce absent from the token; wrong signature/issuer/audience/expired/future iat/missing sub; authorization-code verifier with no nonce | Device verifier accepts the valid token and rejects each invalid claim; a supplied nonce is accepted at the device endpoint but absent from the ID token; the authorization-code verifier still rejects a missing nonce | RD-04 §ID token, AR-35 |
| ST-33 | Discovery has no device authorization endpoint, no device grant, or a foreign URL | Clear “server does not support device login”/bounded error before printing or requesting; no device authorization request; no credentials | RD-04 §Discovery, AC-3 |

### Security operations and assurance

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-23 | 10 then 11 device authorization requests for one IP+client; 30 then 31 for one IP with varying client IDs; `/DEVICE`/`/Device/Auth` variants | 11th primary returns 429 JSON `rate_limit_exceeded`; 31st per-IP returns 429; case/trailing-slash variants hit the same limiter; a security audit event is written once per window | RD-05 §Device auth limiter, AR-36 |
| ST-24 | 10 then 11 user-code submissions for one IP+session; 30 then 31 for one IP with rotating sessions; `GET /device?user_code=` and POST both consume budget; approve a valid code; simulate a Redis failure | Primary and per-IP limits return the branded 429 page for both GET-with-code and POST; approval resets only the primary counter and leaves the per-IP aggregate unchanged; no code-state detail; a Redis failure allows the request with a warning (accepted fail-open), not a 5xx | RD-05 §User code limiter, AR-27/AR-36, PF-005/PF-019 |
| ST-25 | 5s polling for the full lifetime; 1s polling; 180/181 polls; 600/601 per IP; other grants; `/TOKEN`/`/token/` variants | Drive the poll counts directly or with a fake clock; do not wall-clock sleep ten minutes. Normal polling succeeds without 429; faster polls get 400 `slow_down` but still consume the hard counters, so the 181st/601st eventually get 429; case/trailing-slash variants hit the same limiter; generic 30/5min limit does not count device polls; other grants unchanged; early responses include `Cache-Control: no-store` | RD-05 §Token limiter, AR-6/AR-20 |
| ST-26 | Requests to `/DEVICE`, `/Device/Auth`, `/TOKEN`, trailing-slash and equivalent encoded variants | Same limiter as the canonical path; no variant bypasses the budget; the shared helper preserves a mixed-case `:uid` | RD-05 §Path normalization |
| ST-27 | Approve; abort; consent-deny after confirmation; two concurrent resumes; audit-write failure; 100 denied requests; hit each limiter | Exactly one `user.device.authorized` per approved code (hashed idempotency key), written before render; `user.device.denied` only for a real user abort or consent denial with a bounded reason; a consent denial after confirmation persists `error=access_denied` and the poll receives `access_denied`; one rate-limit audit row per window; no codes, no IP/UA in auth events; rate-limit events may include IP | RD-05 §Audit, AR-22, PF-013/PF-014 |
| ST-28 | Log a payload with `device_code`, `user_code`, `deviceCode`, `userCode` at top level and nested; assert the destination stream | Pino emits `[Redacted]` for every structured path; the assertion reads the destination stream, not the pre-redaction observer; no URL/query is logged | RD-05 §Redaction, AR-30, PF-021 |
| ST-29 | Delete client/user/org; revoke connected app; logout; deactivate client/user/org; approve then revoke | Applicable DeviceCode rows are removed or rejected; no token after stale authority; `offline_access` case verified | RD-05 §Cleanup, AR-21 |
| ST-30 | Run the cross-tenant pentest matrix | No cross-tenant approval/resume, brute force, replay, path-case or leakage finding; the docs build is a separate gate, not this test | RD-05 §Assurance, PF-008 |
| ST-31 | Two concurrent confirmation POSTs for one code, plus a late error/denial save after completion | Exactly one pre-approval transition wins; the loser receives the generic invalid page; the winner’s completion save (accountId/grantId) succeeds; a late error save does not overwrite the approved row; only one grant/audit outcome is created | RD-05 §Concurrent approval, PF-014 |

## Test Categories

### Specification Tests

| Test file | Role | Phase | ST cases |
|---|---|---|---|
| `packages/server/tests/integration/oidc/device-discovery.spec.test.ts` | owner | 1 | ST-01, ST-02, ST-04 |
| `packages/server/tests/integration/oidc/device-authorization.spec.test.ts` | owner | 1, 2, 5 | ST-03, ST-05–ST-11 (1); ST-23–ST-27, ST-31 (2); ST-29 (5) |
| `packages/server/tests/integration/admin/client-device-grant.spec.test.ts` | owner | 3 | ST-15, ST-16 |
| `packages/server/tests/integration/admin/portability-device-grant.spec.test.ts` | owner | 3 | ST-32 |
| `packages/server/tests/e2e/flows/device-authorization.spec.test.ts` | regression | 1/2 | ST-02, ST-05–ST-08, ST-13 |
| `packages/server/tests/e2e/flows/device-cli-login.spec.test.ts` | owner | 4 | ST-20 |
| `packages/server/tests/ui/flows/device-authorization.spec.ts` | owner | 2 | ST-12–ST-14, ST-34 |
| `packages/server/tests/pentest/auth-bypass/device-authorization.spec.test.ts` | owner | 5 | ST-30; regression ST-10/ST-11/ST-23–ST-30 |
| `packages/sdk/tests/domains/clients-device-grant.spec.test.ts` | owner | 3 | ST-17 |
| `packages/cli/tests/commands/client-device-grant.spec.test.ts` | owner | 3 | ST-18 |
| `packages/cli/tests/admin/oidc-client-device-grant.spec.test.ts` | owner | 3 | ST-19 |
| `packages/cli/tests/auth/device-flow.spec.test.ts` | owner | 4 | ST-21, ST-33 |
| `packages/cli/tests/auth/device-id-token.spec.test.ts` | owner | 4 | ST-22 |
| `packages/server/tests/unit/clients/device-grant.spec.test.ts` | regression | 3 | ST-15/ST-16 helper |
| `packages/server/tests/unit/lib/logger-device-redaction.spec.test.ts` | owner | 2 | ST-28 |

Each ST case has exactly one `owner` file. A `regression` row re-runs the same behavior at another
layer without redefining the oracle or creating a second owner. ST-20 is owned by the live CLI E2E;
the `device-flow` unit spec covers ST-21/ST-33, and `device-id-token` covers ST-22.

### Implementation Tests

| Test file | Description |
|---|---|
| `packages/server/tests/unit/oidc/device-authorization.impl.test.ts` | Adapter retention, collision mapping, interval listener, TTL guard |
| `packages/server/tests/unit/oidc/org-resolution.impl.test.ts` | Shared path helper, UID case, normalizer equivalence and bound |
| `packages/server/tests/unit/middleware/device-rate-limiter.impl.test.ts` | Key builders, separators, Redis failure, case normalization, counters, interval TTL |
| `packages/server/tests/unit/oidc/device-pages.impl.test.ts` | Form/XSRF extraction, escaping, scope source, locale fallbacks |
| `packages/server/tests/unit/lib/device-audit.impl.test.ts` | Event metadata, no-code guarantees, best-effort failure, hashed idempotency, cause classification |
| `packages/server/tests/unit/clients/device-grant.impl.test.ts` | Conditional redirect/response-type validator, empty-array service gates |
| `packages/cli/tests/auth/device-flow.impl.test.ts` | Sleep/clock injection, no-retry after send, 429 clamp, response bounds, terminal controls |
| `packages/cli/tests/admin/oidc-client-device-grant.impl.test.ts` | Grant selector, registration redirect/response-type validation, last-redirect guards |

### Integration and E2E

- Real PostgreSQL `oidc_payloads` lifecycle, retention, unique index and duplicate preflight.
- Real Redis limiters and multi-instance key sharing.
- Full E2E device auth → poll pending → UI approval → token exchange.
- Concurrent confirmation approval.
- Portability round-trip and admin client enablement.
- Live CLI device login against the E2E server with credential cleanup.

### UI

- Branded code-entry/confirmation/success pages; the transient auto-submit page is provider-owned.
- Password, magic link, 2FA and consent reuse.
- Generic invalid, abort, 429 and cross-tenant 404 states.
- XSRF negative case.
- Accessibility/page-quality checks, en/nl.

### Security and assurance

- Pentest matrix ST-10/ST-11/ST-23–ST-31.
- `pnpm assurance:harness --project security --profile production-security` — no new findings; the
  three accepted forwarding-context gaps remain; exit 40 recorded.
- `pnpm assurance:compat --select compatibility` — packed SDK/CLI and credential isolation; it does
  not exercise device login. Do not record it as device-flow evidence.
- Full `pnpm verify` in CI plus `pnpm test:ui` and `pnpm harness:test` where the phase requires them.

## Test Data and Fixtures

- Reuse `createTestOrganization`, `createTestApplication`, `createTestClientWithSecret`,
  `createTestUserWithPassword`.
- Add a public native device-only client fixture with the URN, `redirectUris: []` and
  `responseTypes: []`.
- Add a granted public admin CLI client for CLI tests.
- Add an org B client to exercise cross-tenant rejection.
- Use real PostgreSQL and Redis; mock only external SMTP/network boundaries.
- No new test harness or container.
- Update the structure-test counts whenever a file is added.

## Verification Checklist

- [ ] Every ST case has a concrete input and expected output, a source reference and one owner.
- [ ] Specification tests are written before implementation and verified red.
- [ ] Every spec test passes after implementation without changing expectations.
- [ ] Implementation tests cover edge cases and internals.
- [ ] Integration/E2E/UI/pentest suites pass; UI and harness gates are recorded.
- [ ] The structure-test counts match the new inventory.
- [ ] Production-security evidence records no new findings and the three accepted gaps.
- [ ] The compatibility selector is described truthfully.
- [ ] `pnpm docs:build` and CI `pnpm verify` pass.
