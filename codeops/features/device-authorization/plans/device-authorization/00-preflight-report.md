# Preflight Report: Device Authorization Implementation Plan

> **Status**: ✅ PASSED WITH NOTES — iteration 2; 3 critical + 16 major resolved; PF-019 accepted risk
> **Iteration**: 1 (first scan)
> **Artifact**: Implementation plan at `codeops/features/device-authorization/plans/device-authorization/` (11 documents)
> **Codebase Grounded**: 60+ source, test, migration and provider files examined; 96 path references extracted and checked
> **Iteration 1 baseline**: 30 ST cases and 73 tasks; the revised plan has 34 ST cases and 87 tasks, verified in iteration 2
> **Independence**: uniform-effort — same model for creation and review; five fresh-context generic auditors (documented fallback for the unavailable `preflight-auditor` role) plus one independent-context design challenger
> **Challenger outcome**: 15 design-critical findings challenged; 14 converged with the audit recommendation, 1 diverged (PF-014)
> **Effort**: unavailable (no `--auto-effort` level requested)
> **Scope**: strict; no option additions proposed
> **Last Updated**: 2026-11-25 11:55

> ⚠️ **SAME-SESSION REVIEW**: This plan was created earlier in the same session. Same-agent bias risk is elevated. The five fresh-context auditors and the challenger reduce, but do not eliminate, that risk. A new-session or human OIDC/security reviewer is recommended before execution.

## Iteration 2 Result

> **Previous iteration**: 26 findings (3 critical, 16 major, 6 minor, 1 observation) — all accepted by the user and fixed
> **This iteration**: 6 residual corrections (N-01/PF-014, PF-001, PF-008, PF-012, PF-022, PF-026) plus consistency corrections N-03/N-04/N-05 and one new major (N-06) — all fixed
> **Carried forward**: none
> **Verification**: 87 unique tasks (16/21/21/15/14); ST-01–ST-34 present with one owner each; links resolve; structure, UI/harness and assurance gates task-owned

**Iteration 2 verdict: ✅ PASSED WITH NOTES.** The independent re-check confirmed:

- The conditional confirmation write guards only the pre-approval transition; the completion save
  and the provider's pre-approval denial/error save are allowed, and a late error save cannot
  overwrite an approved row.
- ST-27/ST-31 cover consent denial and the winning completion save.
- RD-03 records the device-only empty-response-type rule; RD-04/RD-05 amendments are consistent.
- No new critical or major finding remains.

**Accepted note:** PF-019 — the user chose to keep RD-05's fail-open Redis policy and record the
residual risk. No other minor or observation remains unresolved.

## Codebase Context Summary

**Tech stack:** TypeScript ESM, Node 22, Koa, `oidc-provider` 9.13.3, PostgreSQL, Redis, Zod, Vitest (unit/integration/e2e/pentest projects), Playwright, pnpm 12 + Turbo.

**Architecture:** one OIDC issuer per organization at `{issuerBaseUrl}/{orgSlug}`; the outer Koa router mounts the provider under `/:orgSlug` and strips the slug before `provider.callback()`. The provider resolves clients from PostgreSQL (`findForOidc`) and artifacts through a hybrid PostgreSQL/Redis adapter. Interactions are rendered by Porta's `/interaction/:uid` routes; the provider creates the interaction and stores its organization in Redis.

**Key files examined:** `packages/server/src/oidc/{configuration,provider,postgres-adapter,adapter-factory}.ts`; `packages/server/src/server.ts`; `packages/server/src/middleware/{token-rate-limiter,oidc-client-tenant,request-logger,reject-head-probe}.ts`; `packages/server/src/routes/{interactions,clients}.ts`; `packages/server/src/clients/{validators,service}.ts`; `packages/server/src/auth/{i18n,template-engine,rate-limiter}.ts`; `packages/server/src/lib/{logger,audit-log,deletion-cleanup}.ts`; `packages/server/src/portability/schema.ts`; `packages/server/src/cli/commands/init.ts`; `packages/sdk/src/{types,domains}/clients.ts`; `packages/cli/src/{commands,admin,auth}/*`; `packages/server/migrations/*`; `packages/server/tests/**`; `repo-tests/monorepo/server-package.spec.test.mjs`; `node_modules/oidc-provider/lib/**`; the five requirements RDs.

**Reference verification (iteration 1):** all internal plan links resolved; 73 task IDs were unique; 12+13+18+13+17 = 73 tasks; ST-01–ST-30 all appeared. The revised plan has 87 tasks and ST-01–ST-34. The failures below are semantic and codebase-alignment failures, not missing files.

## Summary by Dimension

Findings are multi-mapped: one PF entry can test several dimensions. The severity table below is the authoritative count.

| # | Dimension | PF entries |
|---|---|---|
| 1 | Ambiguities | PF-006, PF-013, PF-019 |
| 2 | Implicit Assumptions | PF-003, PF-004, PF-018 |
| 3 | Logical Contradictions | PF-003, PF-005, PF-006, PF-013, PF-016 |
| 4 | Completeness Gaps | PF-001, PF-007, PF-008, PF-010, PF-011, PF-012, PF-014, PF-015, PF-017, PF-020 |
| 5 | Dependency Issues | PF-002, PF-003, PF-015, PF-018, PF-022 |
| 6 | Feasibility Concerns | PF-001, PF-004, PF-014, PF-017, PF-019 |
| 7 | Testability | PF-006, PF-007, PF-008, PF-009, PF-020, PF-024 |
| 8 | Security Blind Spots | PF-002, PF-003, PF-004, PF-005, PF-013, PF-014, PF-015, PF-017, PF-019, PF-021, PF-023, PF-024 |
| 9 | Edge Cases | PF-014, PF-023, PF-024, PF-026 |
| 10 | Scope Creep Indicators | PF-021, PF-025 |
| 11 | Ordering & Sequencing | PF-003, PF-009 |
| 12 | Consistency | PF-002, PF-008, PF-010, PF-025 |
| 13 | Codebase Alignment | PF-001, PF-002, PF-010, PF-011, PF-015, PF-016, PF-018, PF-022, PF-023 |

## Summary by Severity

| Severity | Count | Status |
|---|---|---|
| 🔴 CRITICAL | 3 | 3 resolved |
| 🟠 MAJOR | 16 | 16 resolved |
| 🟡 MINOR | 6 | 5 resolved; 1 accepted risk (PF-019) |
| 🔵 OBSERVATION | 1 | 1 resolved |

---

## Blocking findings

### PF-001: Device-only clients with zero redirect URIs are invalid at the provider [🔴 CRITICAL]

**Dimensions:** Completeness Gaps, Feasibility, Codebase Alignment
**Location:** `03-03-client-contracts.md` §Conditional Redirect Rule (lines 47–64) and §Admin API (66–83); `00-index.md` Quick Reference (96–106); `07-testing-strategy.md` ST-15 (line 62)
**Related cluster findings:** PA-201, PA-301, PA-404, PA-204, PA-205, PA-109, PA-215

**Codebase Evidence:** `packages/server/src/clients/validators.ts:51` requires `responseTypes` to be exactly `['code']`; `service.ts:261` defaults to `getDefaultResponseTypes()`; `service.ts:679` sends `response_types: client.responseTypes` to the provider. `node_modules/oidc-provider/lib/helpers/client_schema.js:289-301` invalidates any client whose response types are non-empty and whose `redirect_uris` is empty, and `:308-310` adds `authorization_code` to `grant_types` when the response type contains `code`. The provider accepts `response_types: []` (service-account fixtures already use it), but Porta never stores it for device-only clients.

**Problem:** The plan's central contract — a device-only client with `redirectUris: []` — cannot be loaded by the provider. The Admin API can return `201` because Porta's validator is relaxed, but `POST /{orgSlug}/device/auth` fails before issuing a code. ST-15, ST-18 and ST-19 only assert the administrative surfaces, so they create a false green. The same defect blocks the Admin terminal projection (`client-service.ts:184` minimum 1), the terminal Protocol editor (`client-workspace.ts:458` saves `['code']`), portability (`portability/schema.ts:304,323`) and the SDK/runtime contract.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Store `response_types: []` for device-only clients; allow empty response types through the server schema/defaults, provider metadata, SDK, CLI, Admin terminal, portability and docs | Matches the provider's schema; satisfies RD-03's zero-redirect contract; no fake authority | Touches six surfaces and adds tests; a device-only client has no authorization-code response type |
| B | Require at least one redirect URI for every client | Smallest code change | Drops the approved zero-redirect behavior and the CLI/device UX |
| C | Inject a synthetic redirect URI so the provider accepts `['code']` | Keeps the response-type rule | Fake authority; the client still gains `authorization_code`; violates RD-03 |

**Recommendation:** A. Store and accept `response_types: []` for device-only clients; make `validateClientProtocolCompatibility` require an empty response-type collection for device-only clients and `['code']` for all others; update the server defaults, `findForOidc`, SDK type/runtime, CLI create default, Admin terminal projection/editor, portability schema and docs; add an end-to-end case that creates the device-only client and completes `POST /device/auth`.
**Challenger:** Converged — A; confidence High. The contradictory case is that empty response types broaden the client contract and require every surface to distinguish device-only from misconfigured; a missed surface still produces a provider-invalid client.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-002: Limiter and tenant path predicates do not match the org-prefixed router, and lowercasing corrupts the resume UID [🔴 CRITICAL]

**Dimensions:** Security Blind Spots, Codebase Alignment, Consistency
**Location:** `03-02-tenant-safe-verification.md` step 2 (lines 33–37); `03-05-security-operations.md` §Middleware and Path Normalization (lines 50–60); `99-execution-plan.md` tasks 5.2.1–5.2.3 (lines 222–224)
**Related cluster findings:** PA-102, PA-203, PA-303, PA-401, PA-402

**Codebase Evidence:** `packages/server/src/server.ts:482` mounts `new Router({ prefix: '/:orgSlug' })`; `ctx.path` inside `.use()` is the full path (`/acme/device`, `/acme/token`). The existing `TOKEN_PATH_REGEX` (`token-rate-limiter.ts:47`) includes the slug and its tests use `/acme/token`. `packages/server/src/middleware/oidc-client-tenant.ts:94-97` shows the existing `path.slice('/'+orgSlug.length)` pattern. Provider interaction UIDs are mixed-case nanoids; `provider.Interaction.find(uid)` is case-sensitive.

**Problem:** The plan’s helper compares the normalized full path to `/token` (or `/device`), so it never matches. If used for the generic token limiter, every real token request stops being limited; if used only for the device limiter, device polling is unlimited. Lowercasing the whole path for `/device/:uid` also lowercases the case-sensitive interaction UID, so legitimate resumes with an uppercase character are 404ed. The `/DEVICE`, `/Device/Auth` and `/TOKEN` tests would pass only if the slug were stripped, which the plan never states.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | One shared `relativeOidcPath(ctx)` that strips exactly `/${orgSlug}`, lowercases only the route segment and preserves the UID; use it in both limiters and the tenant middleware | Minimal; follows the existing `isUserinfoRequest`/`slice` pattern; fixes both symptoms | Requires a small helper and tests for org-prefixed variants |
| B | Full-path case-insensitive regexes for `/device`, `/device/auth`, `/device/:uid` and `/token` | No new helper; reuses the existing regex style | Duplicates the org-slug pattern; the `:uid` group must preserve case; easy to drift |
| C | Register real `@koa/router` routes for `/device` and `/device/:uid` and use `ctx.params` | Router handles case/trailing slash; `ctx.params.uid` preserves case | The token limiter still needs a path check; restructuring the catch-all is larger |

**Recommendation:** A. Add one shared `relativeOidcPath(ctx)` that strips exactly `/${ctx.params.orgSlug}`, lowercases only the route segment, preserves the `:uid` case and normalizes trailing slashes; use it in the tenant middleware and both limiters; add tests for `/acme/DEVICE`, `/acme/device/`, `/acme/TOKEN/` and a mixed-case 43-character UID.
**Challenger:** Converged — A; confidence High. The contradictory case is that stripping the raw path is fragile if the router decodes or normalizes differently; the helper needs encoded and trailing-slash tests.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-003: Security controls are sequenced after the feature is enabled, and the plan’s “binding before exposure” claim is false [🔴 CRITICAL]

**Dimensions:** Ordering & Sequencing, Security Blind Spots, Implicit Assumptions
**Location:** `00-index.md` lines 18–20; `99-execution-plan.md` lines 27–31, 70–73, 106–107, 222–227, 259–261; `03-02-tenant-safe-verification.md:173`
**Related cluster findings:** PA-101, PA-202, PA-302, PA-308, PA-403, PA-311

**Codebase Evidence:** `packages/server/src/oidc/configuration.ts:504-541` has no `deviceFlow` today; Phase 1 task 1.2.1 enables it. `code_verification.js:52-55` resolves the DeviceCode globally; `packages/server/src/middleware/oidc-client-tenant.ts:140-166` checks only a presented `client_id` and cannot protect a `POST /device` carrying only `user_code`. The generic token limiter is 30/300 s (`token-rate-limiter.ts:156-207`), so normal 5 s polling is blocked after about 30 polls until Phase 5 changes it. The requirements README (`requirements/README.md:99-108`) says the RD-05 controls must land with RD-01/RD-02 because they are required before enablement.

**Problem:** Phase 1 enables `features.deviceFlow` before Phase 2 adds the tenant binding and before Phase 5 adds the device limits, audit and redaction. The index says “Phase 1 therefore lands the organization binding,” which is false. The dependency text explicitly allows Phase 3 — which creates device-enabled clients — to start after Phase 1. A completed Phase 1 is a commit-ready revision where the device endpoints are live without the cross-tenant check; a Phase 3/4 revision can be used without the fixed limits, audit or redaction. The plan has no merge/deploy gate for the intermediate states.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Move the tenant binding and its tests into Phase 1 before enabling `deviceFlow`, and move the limits/redaction (and audit) before any client grant | The stated invariant becomes true; the phase gates test the control | Reorders the RD-per-phase structure; Phase 1 grows |
| B | Keep the phase order but leave `deviceFlow` disabled (code-level flag) until Phase 2/5 | No new global setting; preserves phase boundaries | Two enablement states; the feature is not testable end-to-end until the end |
| C | Keep the order and add an explicit “do not merge/deploy before Phase 5” gate plus a kill switch | Smallest plan change | Relies on process discipline; a pushed branch still has the exposure |

**Recommendation:** A. Move `deviceTenantBinding` and ST-10/ST-11 into Phase 1 before the `deviceFlow` enablement; move the fixed limiters and redaction before any client grant (Phase 3), and keep the audit/assurance closure in Phase 5; change “Phase 3 can start after Phase 1” to “Phase 3 requires Phase 2.”
**Challenger:** Converged — A; confidence High. The contradictory case is that Phase 1 grows and delays provider work; the cross-tenant boundary is the one control that cannot wait. If the phase structure must stay, Option B (keep `deviceFlow` disabled until the controls land) is the fallback.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

## Major findings

### PF-004: The user-code limiter cannot resolve the provider session UID, and the reset key cannot match [🟠 MAJOR]

**Dimensions:** Security, Implicit Assumptions, Codebase Alignment
**Location:** `03-05-security-operations.md` §Keys (lines 70–78); `99-execution-plan.md` task 5.2.4 (line 225); `07-testing-strategy.md` ST-24 (line 81)
**Related:** PA-107, PA-214, PA-324, PA-406

**Evidence:** the limiter runs before the provider; `ctx.oidc.session` exists only inside the provider (`node_modules/oidc-provider/lib/shared/session.js:1-20`). The outer app has no `app.keys` (`prompt-login-reset.ts:26`); the provider session cookie is signed (`configuration.ts:664-678`). The provider's `uid` differs from the cookie's `jti`, and `resetIdentifier` rotates `jti` but not `uid`.

**Problem:** `sessionUid` is never available, so the key always falls back to `hash(ip)`. The “primary” key then has the same dimension as the per-IP aggregate; the 10/10-minute budget and the 30/10-minute aggregate collapse into one, and ST-24's rotating-session case cannot pass. The confirmation-hook reset computes `hash(ip + sessionUid)` inside the provider, which cannot address the IP-only key, so the intended reset misses. The plan never states which identifier both sides use.

**Options:** A) resolve the provider session from the signed cookie/`provider.Session` and use `session.uid` in both the limiter and the reset; B) key the primary by org + IP only and amend RD-05/ST-24; C) move the limiter into a provider hook where `ctx.oidc.session.uid` exists.

**Recommendation:** A. Resolve the provider session from the signed `_session` cookie via the configured `cookieKeys`/`provider.Session`, use `session.uid` in both the limiter and the reset, and keep the IP fallback only when no session exists. Add a test that `resetIdentifier()` does not reset the budget.
**Challenger:** Converged — A; confidence Med. The contradictory case is the added provider-internal session read on an unauthenticated endpoint and the coupling to cookie/session internals; under session-store failure the primary tier collapses to IP. Option B (per-org+IP and amend RD-05/ST-24) is the smaller fallback if the user accepts the weaker tier.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-005: The user-code reset runs on confirmation render, resets the per-IP aggregate, and can be abused [🟠 MAJOR]

**Dimensions:** Security, Logical Contradiction, Completeness Gaps
**Location:** `03-05-security-operations.md` lines 76–78; `99-execution-plan.md` task 5.2.4 (line 225); `07-testing-strategy.md` ST-24 (line 81)
**Related:** PA-208, PA-405

**Evidence:** `code_verification.js:81-97` calls `userCodeConfirmSource` only when `!confirm`, then returns; the `confirm=yes` path (`:99-102`) never calls it. `successSource` runs after `code.save()` (`device.js:128-130`). The per-IP key has no organization component (`03-05:71`).

**Problem:** The reset happens when the confirmation page is rendered, not when the user approves. An attacker can start their own device flow to obtain one valid code, render its confirmation page repeatedly, and reset both the 10/10-minute primary and the global 30/10-minute per-IP aggregate without approving. Because the aggregate is not organization-scoped, a reset from org A clears the budget for attacks on org B. ST-24 records this behavior as expected, locking in the bypass. The reset also runs when the user aborts or ignores the page.

**Options:** A) reset only the primary counter in `successSource` after approval, and never the per-IP aggregate; B) remove the reset entirely; C) keep the current reset.

**Recommendation:** A. Reset only the primary counter in `successSource` after approval; never reset the per-IP aggregate. Amend RD-05 from “a valid code resets both counters” to “an approved code resets only the primary counter.”
**Challenger:** Converged — A; confidence High. The contradictory case is that this changes an approved requirement; the aggregate is the cross-session brute-force budget and one valid code must not clear it.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-006: The CLI polling contract contradicts RD-04, lacks a 429 lower bound, and retries unknown errors [🟠 MAJOR]

**Dimensions:** Logical Contradiction, Ambiguities, Testability
**Location:** `03-04-cli-device-login.md` §Polling (lines 124–150) and §Token Response (164–166); `00-ambiguity-register.md` P-19 (199–210); `07-testing-strategy.md` ST-21 (line 73)
**Related:** PA-106, PA-304, PA-411, PA-508, PA-423

**Evidence:** RD-04 must-have lines 66–67 and AC-9 (lines 377–380) require three consecutive transport/`5xx` retries; the plan makes every network/`5xx` after the token request terminal. RD-04 clamps `Retry-After` to `[interval, 60]`; the plan uses `min(Retry-After ?? interval, 60)` with no lower bound. The pseudocode enumerates only `authorization_pending`, `slow_down`, `access_denied`, `expired_token`, `invalid_grant`, 429 and 5xx; other 400/401/403/404 errors fall through to `sleep(interval)`.

**Problem:** The no-retry rule is a defensible security tightening because the provider consumes the code on success and replay revokes the first token set, but it silently replaces an approved acceptance criterion while the plan claims all RD-04 criteria are covered. A small/zero `Retry-After` can make the CLI poll faster than the advertised interval. An unknown permanent OAuth error (for example `invalid_client`) becomes a ten-minute hang instead of a clear failure.

**Options:** A) amend RD-04/ST-21 to no-retry, fix the 429 clamp to `max(Retry-After ?? interval, interval)` capped at 60, and add a terminal branch for every other status/error; B) retry only failures that provably occur before the request is dispatched and treat timeouts/5xx after send as terminal, updating RD-04; C) follow RD-04 literally and accept self-revocation.

**Recommendation:** A. Amend RD-04/ST-21 to no-retry after a token request has been sent, record the replay rationale, clamp `Retry-After` to `max(Retry-After ?? interval, interval)` capped at 60, and add a terminal branch for every other OAuth error/status. This is a requirements change, not a plan-local decision.
**Challenger:** Converged — A; confidence High. The contradictory case is reduced resilience to a proxy 503 that occurred before the provider saw the request; protocol correctness (no self-revocation) outranks that convenience. Option B (retry only definite pre-send failures) cannot be proven with `fetch` for timeouts/5xx.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-007: ST cases are assigned to test layers that cannot observe them [🟠 MAJOR]

**Dimensions:** Testability, Dependency Issues, Codebase Alignment
**Location:** `07-testing-strategy.md` §Specification Tests (lines 95–105); `99-execution-plan.md` tasks 1.1.1, 2.1.1, 5.1.1–5.1.2, 5.3.1; `07` Integration/E2E (line 125)
**Related:** PA-207, PA-501, PA-502, PA-503, PA-505, PA-320

**Evidence:** `packages/server/vitest.config.ts:80-101` defines the unit project with no DB/Redis setup; integration/E2E/pentest have services. ST-01/02/04/09 are assigned to unit files; ST-04 reads `oidc_payloads` and `pg_indexes`; ST-09 forces a unique collision and HTTP 503. ST-07 needs a 600–1500 s wait; ST-25 needs ten minutes of polling or 600 requests; integration times out at 30 s and pentest at 60 s. The CLI tests are pure unit; no test runs `porta login --device-code` against a server.

**Problem:** The red phase fails at import or database access, not at the missing behavior; the tests can be skipped or mocked into a false green. The time-based cases cannot run inside the assigned timeouts without a clock/time-shift seam. Success criterion 5 (“completes a full approval and persists usable credentials”) has no executable owner.

**Options:** A) move DB/HTTP cases to integration/E2E, rewrite ST-07/ST-25 as row-expiry/counter assertions, keep unit for pure config/hooks/normalizer/form parsing, and add one live CLI E2E; B) add a DB-backed unit project and a live CLI harness; C) mock the boundaries and accept weaker evidence.

**Recommendation:** A. Move ST-01/02/04/09/10/11/23–29 to integration/E2E; rewrite ST-07/ST-25 as row-expiry/counter assertions with a clock/TTL seam; keep unit for pure config/hooks/normalizer/form parsing; add one live CLI E2E against the E2E server for ST-20 and success criterion 5.
**Challenger:** Converged — A; confidence High. The contradictory case is the slow live CLI test and that TTL manipulation tests the adapter, not real elapsed time; without it success criterion 5 is unproven.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-008: The 07 and 99 test inventories and ST ownership disagree [🟠 MAJOR]

**Dimensions:** Consistency, Completeness Gaps
**Location:** `07-testing-strategy.md` §Test Categories (91–117); `99-execution-plan.md` tasks 1.1.1–5.3.1; component test refs `03-01:156`, `03-02:171`, `03-03:168`, `03-04:215`, `03-05:203`
**Related:** PA-105, PA-313, PA-510, PA-515

**Evidence:** 07 assigns ST-20–22 to a single CLI file; 99 splits ST-22 into `device-id-token.spec.test.ts` and ST-20 wiring into `login-device-code.spec.test.ts`. 07 names `client-registration-device.impl.test.ts`; 99 names `oidc-client-device-grant.impl.test.ts`. 07 lists `device-audit.impl.test.ts`; 99 lists `device-audit.spec.test.ts`. 99 adds a unit client spec that 07 does not list. ST-02/05–08/10–11/19/23–30 are assigned to multiple layers with no authoritative copy. `99:116` calls ST-28 a cross-tenant pentest case; ST-30 mixes the pentest matrix with `pnpm docs:build`.

**Problem:** An executor following 99 creates a different file set than 07 claims; the coverage table becomes false, and the “immutable oracle” has no single owner. The component test references omit ST-18/19/21/22 or include Phase 5 cases in earlier phases.

**Options:** A) make 07 the single ST→file→phase matrix, fix 99 and every component reference, give each ST one owner and use separately named regression tests in other layers; B) make 99 authoritative and regenerate 07; C) add a crosswalk.

**Recommendation:** A. One owner per immutable ST is the only way to prevent drift. This is a direct consistency correction, not a design choice; confidence High.
**Challenger:** Covered by the design-critical batch at the test-layer level (PF-007); the inventory correction is mechanical.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-009: The phase gates omit the UI suite and the structure test’s exact counts make Phase 1 fail [🟠 MAJOR]

**Dimensions:** Testability, Ordering & Sequencing
**Location:** `99-execution-plan.md` phase gates (80, 117, 159, 196, 236); `03-05-security-operations.md` §Assurance (163–177); `07-testing-strategy.md` line 23
**Related:** PA-311, PA-504, PA-506, PA-104, PA-120, PA-318, PA-507, PA-412

**Evidence:** `package.json:35` defines `verify` as `pnpm test:structure && turbo run verify`; `packages/server/package.json:24` defines `test:all` as unit + integration + e2e + pentest and keeps `test:ui` separate. `repo-tests/monorepo/server-package.spec.test.mjs:411-446` pins exact counts (465 server, 26 UI, 62 SDK, 130 CLI); the plan adds roughly 16 server, 1 UI, 1 SDK and 7 CLI files. `assurance:compat --select compatibility` packs SDK/CLI but does not exercise device login or SDK client create. The production-security profile has three accepted forwarding-context gaps and exit 40.

**Problem:** The first new test file fails `pnpm test:structure`, which is the first step of `pnpm verify`; no task updates the counts. ST-12–ST-14 (branded pages, SSO, 2FA, consent, accessibility) are never run by `pnpm verify`; no phase task runs `pnpm test:ui` or `pnpm harness:test`. The compatibility selector can pass without touching the new flow, and “production-security passes” is undefined against the known exit 40.

**Options:** A) add a count-update task, explicit `pnpm test:ui`/`pnpm harness:test` gates, a truthfully scoped `--select compatibility` (or a device leg), and a production-security definition of “no new findings; three accepted gaps unchanged; exit 40 recorded”; B) relax the structure contract and rely on separate CI jobs; C) put all new tests into existing files.

**Recommendation:** A. Add count-update tasks at each phase that adds a test file so `repo-tests/monorepo/server-package.spec.test.mjs` matches the new totals; add explicit `pnpm test:ui` and `pnpm harness:test` gates with recorded CI run ids; name the assurance selector truthfully and define production-security as “no new findings; the three accepted gaps unchanged; exit 40 recorded.”
**Challenger:** Converged — A; confidence High. The contradictory case is that exact counts are brittle and create merge conflicts, but changing the contract is broader than updating the counts.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-010: The `device` i18n namespace is not registered and breaks two exact-namespace tests [🟠 MAJOR]

**Dimensions:** Completeness Gaps, Codebase Alignment
**Location:** `03-02-tenant-safe-verification.md` §Templates and Locales (142–154); `99-execution-plan.md` task 2.2.5 (line 110)
**Related:** PA-103, PA-206, PA-306

**Evidence:** `packages/server/src/auth/i18n.ts:47-59` defines a frozen `NAMESPACES` list, `:82` loads only those namespaces, `:396` loads org overrides only for them, and `:429` recognizes dot-notation namespaces only from the list. `packages/server/tests/unit/auth/invitation-locales.spec.test.ts:85-89` asserts each locale directory has exactly the same eleven JSON files; `packages/server/tests/unit/lib/system-config-catalog.spec.test.ts:328` asserts `NAMESPACES` equals `REQUIRED_NAMESPACES`.

**Problem:** Adding `device.json` without `device` in `NAMESPACES` means `t('device.*')` looks in `common` and renders raw keys; org overrides are not loaded. Adding `device` to `NAMESPACES` breaks both tests unless their lists are updated. The Phase 2 gate fails, and the branded pages may ship untranslated.

**Options:** A) add `device` to `NAMESPACES`, update `REQUIRED_NAMESPACES` and the invitation-locale test list, and add `i18n.ts` to the 03-02 Files table; B) put device keys in `common.json`; C) enumerate locale files dynamically.

**Recommendation:** A. It preserves the allowlist and preloading contract; confidence High. Direct codebase/test-impact correction.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-011: The Admin terminal still requires one redirect and saves `response_types: ['code']` [🟠 MAJOR]

**Dimensions:** Completeness Gaps, Codebase Alignment
**Location:** `03-03-client-contracts.md` §Admin Terminal (116–126) and Files (158–164); `99-execution-plan.md` task 3.2.5 (line 149)
**Related:** PA-109, PA-205, PA-307, PA-215

**Evidence:** `packages/cli/src/admin/client-service.ts:184` projects `redirectUris` with a minimum of 1; `:129-136` requires exactly one response type; `packages/cli/src/admin/client-workspace.ts:458` saves `responseTypes: ['code']`; `client-workspace.ts:371` and `client-authentication-dialog.ts:203` guard the last redirect. `client-authentication-dialog.ts` is absent from the plan’s Files table.

**Problem:** A device-only client returned by the Admin API is rejected by the terminal projection, so it cannot be listed or opened. The Protocol editor rewrites it with `['code']`, and the last-redirect guards prevent clearing the final redirect. RD-03 AC-12/AC-14 require the terminal to display and save device-only clients.

**Options:** A) allow zero redirects/response types with grant-aware validation, save `responseTypes: []` for device-only clients, make the last-redirect guards conditional, and add `client-authentication-dialog.ts` to the Files/tests; B) manage device-only clients only through the API/CLI; C) inject a dummy redirect.

**Recommendation:** A. Allow zero redirects/response types with grant-aware validation; save `responseTypes: []` for device-only clients; make the last-redirect guards conditional; add `client-authentication-dialog.ts` to the Files/tests.
**Challenger:** Converged — A; confidence High. The contradictory case is the shared editor code and single-operator UI regression risk; parity is an approved contract requirement.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-012: The `porta init` change breaks two exact-grant tests and lacks missing-support/locale cases [🟠 MAJOR]

**Dimensions:** Completeness Gaps, Testability
**Location:** `03-03-client-contracts.md` §CLI Client Commands (112–114); `99-execution-plan.md` task 3.2.6 (line 150); `07-testing-strategy.md` ST-20 (line 72), ST-12 (line 54)
**Related:** PA-326, PA-509

**Evidence:** `packages/server/tests/unit/cli/commands/init.test.ts:305` and `packages/server/tests/integration/cli/init.test.ts:147` assert exactly `['authorization_code', 'refresh_token']`; task 3.2.6 changes `packages/server/src/cli/commands/init.ts:331-356` but no task updates those tests. RD-03 AC-13 requires the new admin client to store the device grant; RD-04 AC-3 requires a clear missing-endpoint/grant error; RD-02 AC-2 requires en/nl locale fallback; ST-20 covers only the supported happy path and ST-12 does not assert locale.

**Problem:** The Phase 3 gate fails on two existing exact-match tests. Three must-have behaviors have no concrete red-phase case, so the plan’s “all RD acceptance criteria covered” claim is overstated.

**Options:** A) update both init tests and add missing-support, locale-fallback and `porta init` grant cases; B) accept the coverage gap; C) move the assertions into existing suites.

**Recommendation:** A. The init test break is a certain gate failure; confidence High.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-013: Audit design stores the raw device code, writes unbounded rows, and misclassifies denial [🟠 MAJOR]

**Dimensions:** Security, Ambiguities, Logical Contradiction
**Location:** `03-05-security-operations.md` §Audit Events (104–114); `99-execution-plan.md` task 5.2.4 (line 225); `07-testing-strategy.md` ST-27 (line 84)
**Related:** PA-110, PA-321, PA-409, PA-410, PA-114

**Evidence:** `device.js:152` returns `device_code: await dc.save()`; `opaque.js:52` returns `value: token.jti`; the plan keys the audit idempotency `SET NX` by the DeviceCode `jti`, so the key contains the live device code. `writeAuditLog` inserts one row per call (`audit-log.ts:229-253`); `checkRateLimit` increments every request, including requests already over the limit. The consent-denial path `device.js:39-66` does not set `ctx.oidc.entity('DeviceCode', code)`. `AbortedError` has no cause for an explicit abort and a cause for a server-side `AccessDenied`.

**Problem:** The idempotency key exposes the device code to Redis key inspection, violating the plan’s own no-raw-code rule. Once a caller is over a limit, every additional request writes another audit row; a single attacker can fill the audit table. A hook that checks only `ctx.oidc.deviceCode` skips the consent-denial event. A hook that writes on every `AbortedError` writes a false user-denial row for a server-side abort.

**Options:** A) hash the `jti`, write one audit row per key/window with a Redis `SET NX` (or a `firstDenied` flag), resolve the DeviceCode from `ctx.oidc.entities.Interaction?.deviceCode`, classify `err.cause` as user abort vs consent `AccessDenied`, audit before render, and delete the NX key if the audit write fails; B) use an audit-table unique constraint and a provider observer; C) keep the current design.

**Recommendation:** A. Hash the `jti`; write one audit row per key/window with Redis `SET NX` (or a `firstDenied` flag); resolve the DeviceCode via `ctx.oidc.entities.Interaction?.deviceCode` on consent denial; classify `err.cause` (no cause = user abort; cause = server-side `AccessDenied`); audit before render; delete the NX key if the audit write fails.
**Challenger:** Converged — A; confidence Med. The contradictory case is that `SET NX` silently drops a second legitimate denial if the same code is retried, and Redis failure permits duplicate rows; the user may prefer an audit-table unique constraint.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-014: Two concurrent confirmation POSTs can both approve one code [🟠 MAJOR]

**Dimensions:** Security, Edge Cases
**Location:** `03-05-security-operations.md` §Test Matrix (179–193); `07-testing-strategy.md` ST-27 (line 84)
**Related:** PA-314

**Evidence:** `code_verification.js:85-90` checks `code.error || code.accountId || code.inFlight`, then sets `inFlight = true` and saves; the check and the save are not atomic. `device.js:96-118` then writes `accountId`, `grantId` and scope and saves again. RD-05’s security matrix requires “Concurrent approval — two confirmation posts cannot both approve or consume one code.” ST-27 covers two concurrent **resumes** of the success page, not two confirmation POSTs.

**Problem:** Two simultaneous confirmations can both pass the `inFlight` check and both approve, creating two grants or an orphaned grant while the audit idempotency key suppresses the second audit row. The RD-05 matrix item is not covered, so the plan’s “all RD criteria” claim is false.

**Options:** A) add a conditional approval write (compare-and-set on `accountId`/`inFlight`) in the adapter and a spec case; B) serialize confirmation with a short-lived Redis `SET NX` per device code; C) rely on `inFlight` and document the residual orphaned-grant behavior.

**Recommendation:** A if the RD-05 concurrent-approval matrix is a hard guarantee; B if the user accepts a Redis-fail-open residual. A durable conditional write is the only option that holds under Redis failure; B is smaller but must be paired with a documented residual and a fail-closed or duplicate-row policy.
**Challenger:** Diverged — prefers B (Redis `SET NX`) on implementation risk; the auditors recommend A for durability. Reconciled: choose A for the hard guarantee, or B plus an explicit residual. Confidence Med.
**User Decision:** Resolved — User accepted Option A (durable conditional write), the only option that holds under Redis failure (2026-11-25)

---

### PF-015: Device limiter placement relative to `oidcClientTenantBinding` is unspecified [🟠 MAJOR]

**Dimensions:** Security, Dependency Issues
**Location:** `03-05-security-operations.md` §Middleware and Path Normalization (41–48); `99-execution-plan.md` task 5.2.3 (line 224)
**Related:** PA-212, PA-322, PA-413

**Evidence:** `packages/server/src/server.ts:524` mounts the generic token limiter before `:541` `oidcClientTenantBinding`. The generic limiter skips device grants (P-7), so the device token limiter is the only per-poll budget. The plan says “after the OIDC body parser and tenant resolver, before the provider callback” and only places the user-code limiter before `deviceTenantBinding`; it never states the order relative to `oidcClientTenantBinding`.

**Problem:** If the device limiters are mounted after the client tenant binding, a poll with a foreign or unknown `client_id` is 404ed before the per-IP budget is incremented. Because the generic limiter is skipped for the device grant, an attacker can vary client IDs and consume no device budget. RD-05 AC-8 and the path-case matrix require the per-IP aggregate to bound exactly that rotation.

**Options:** A) mount all device limiters before `oidcClientTenantBinding`, mirroring the generic token limiter; B) mount after and add a separate pre-binding per-IP counter; C) rely on the provider 404 and accept the uncovered rotation path.

**Recommendation:** A. Mount all device limiters before `oidcClientTenantBinding`, after the body parser, mirroring the generic token limiter.
**Challenger:** Converged — A; confidence High. The contradictory case is that requests which will be 404ed consume limiter budget; that is intentional flood protection.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-016: The confirmation page reads scopes from `ctx.oidc.params.scope`, which is undefined [🟠 MAJOR]

**Dimensions:** Logical Contradiction, Codebase Alignment
**Location:** `03-02-tenant-safe-verification.md` lines 126–127; `07-testing-strategy.md` ST-12 (line 54), ST-14 (line 56)
**Related:** PA-108, PA-213, PA-408

**Evidence:** `code_verification.js:38` builds `ctx.oidc.params` from only `xsrf`, `user_code`, `confirm`, `abort`; `:81-95` calls `userCodeConfirmSource` and returns without `next()`. The original device authorization params are stored on the DeviceCode (`device.js:142`); `device_resume` merges them into `ctx.oidc.params` only later.

**Problem:** The confirmation page cannot show the requested scopes from the stated source; ST-12/ST-14’s “scopes visible” assertions fail or render an empty section. RD-02 requires the scopes on the confirmation page, even for trusted clients.

**Options:** A) read `ctx.oidc.deviceCode.params.scope` on confirmation and `ctx.oidc.deviceCode.scope` on success; B) pass the requested scope through the hook arguments; C) show scopes only on the success page.

**Recommendation:** A. Read `ctx.oidc.deviceCode.params.scope` on confirmation and `ctx.oidc.deviceCode.scope` on success; intersect with the effective grant where possible.
**Challenger:** Converged — A; confidence High. The contradictory case is that the raw request scope may include scopes later filtered by client/grant policy.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-017: User-code normalization is unbounded [🟠 MAJOR]

**Dimensions:** Security, Feasibility, Edge Cases
**Location:** `03-02-tenant-safe-verification.md` step 3 (37–39); RD-02 §Security Considerations (272)
**Related:** PA-111

**Evidence:** `node_modules/oidc-provider/lib/helpers/user_codes.js:34-37` normalizes without a length bound; the OIDC body parser allows 100 KB (`server.ts:498-505`). The tenant middleware performs the lookup on both the code-bearing GET and the POST; the plan explicitly forbids a stricter length bound.

**Problem:** A 100 KB string of letters becomes a 100 KB SQL parameter on every attempt. The request-count limiter bounds the number of requests, not the per-request work; this is a cheap database/CPU denial-of-service path and contradicts RD-02’s “normalized and bounded before lookup” rule.

**Options:** A) bound the normalized code (for example 64 characters) and render the generic invalid page for overlong input; B) bound the raw input before normalization; C) rely only on the request-count limiter.

**Recommendation:** A. Bound the normalized code (for example 64 characters) and render the generic invalid page for overlong input; keep the provider normalization for plausible codes and add boundary tests.
**Challenger:** Converged — A; confidence High. The contradictory case is that normalizing 100 KB still costs CPU before the bound; a raw pre-bound is cheaper, but either bound must be tested against provider-normalization equivalence.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-018: Older server instances reject a client whose stored grants contain the device URN [🟠 MAJOR]

**Dimensions:** Dependency Issues, Implicit Assumptions
**Location:** `03-03-client-contracts.md` §Release Compatibility (150–157); `00-index.md` line 119
**Related:** PA-210

**Evidence:** `packages/server/src/clients/service.ts:678` passes stored `grant_types` to the provider; `node_modules/oidc-provider/lib/helpers/client_schema.js:176` validates `grant_types` against `configuration.grantTypes`; `configuration.js:477-497` adds the device URN only when `features.deviceFlow.enabled`. On an older server instance with the feature disabled, a client whose DB row contains the URN throws `InvalidClientMetadata` for every flow, not just device.

**Problem:** During a rolling deployment, enabling the grant on a client can break that client’s existing authorization-code and refresh flows on old instances. The release note covers older SDK/CLI/Admin terminals but not older **server** instances. The plan’s only mitigation is “upgrade the readers.”

**Options:** A) document and enforce a server-fleet upgrade before enabling the grant on any client, with a release preflight; B) strip unsupported grants in `findForOidc` when `deviceFlow` is disabled, with a warning; C) version the client contract/manifest.

**Recommendation:** A. Document and enforce a server-fleet upgrade before enabling the grant on any client, with a release preflight. Option B cannot protect the first rolling upgrade because the old release has no filter code.
**Challenger:** Converged — A; confidence High. The contradictory case is that A is deployment discipline and cannot be technically enforced; a mixed fleet can still break authorization-code/refresh if an operator enables the grant early.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-019: The user-code limiter uses fail-open `checkRateLimit` while a strict helper exists [🟡 MINOR]

**Dimensions:** Security, Feasibility
**Location:** `03-05-security-operations.md` lines 76–78; `07-testing-strategy.md` ST-25; `03-05` Redis-failure matrix (183–193)
**Related:** PA-211

**Evidence:** `packages/server/src/auth/rate-limiter.ts:70-86` returns `allowed: true` on any Redis error; `:96-100` provides `checkRateLimitStrict`, already used by magic-link callbacks, service-account invitations and client-secret hashing. RD-05 line 52 explicitly chooses the existing fail-open policy.

**Problem:** The user-code limiter is the only brute-force boundary on a 34.6-bit code. A Redis outage removes it entirely. The plan follows the approved RD-05 policy, so this is a requirement risk rather than a plan contradiction; the test matrix lists “Redis failure” without stating that fail-open is accepted.

**Options:** A) use `checkRateLimitStrict` for user-code attempts and return 503/429 on Redis failure; B) keep the approved fail-open policy and record/test the accepted risk; C) add an in-memory fallback limiter.

**Recommendation:** B. The plan follows RD-05; changing to strict is a security-policy change the user should decide explicitly. If choice A is preferred, RD-05 must be amended. Confidence Medium.
**Challenger:** Not in the design-critical batch; this is a requirements-policy decision.
**User Decision:** Resolved — User accepted Option B (keep the approved fail-open policy; record the residual risk) (2026-11-25)

---

### PF-020: The compatibility selector and the production-security “pass” do not cover the new surfaces [🟠 MAJOR]

**Dimensions:** Testability, Completeness Gaps
**Location:** `03-05-security-operations.md` §Assurance (163–177); `99-execution-plan.md` tasks 3.3.2 and 5.3.3; `01-requirements.md` acceptance criterion 7 (line 53)
**Related:** PA-120, PA-318, PA-412, PA-507

**Evidence:** `test-harness/assurance/compat/command.ts:46-58` registers only `ST-69`–`ST-73`, `tenant-admin`, `admin-data`, `p1-admin`, `protocol` and `compatibility`. `protocol-cli-login.ts` performs a browser-assisted CLI login; `compatibility` packs the SDK/CLI and checks credential isolation; neither exercises `porta login --device-code` or a device-granted client response. AGENTS.md records the production-security run with three accepted forwarding-context observer gaps and exit 40, and says not to call it fully passed.

**Problem:** An executor can run `--select compatibility`, see green, and record it as device-flow evidence; the claim is false coverage. The production-security gate can be blocked or falsely marked green because “passes” is undefined against the known exit 40.

**Options:** A) name the selector truthfully (packed-package/credential compatibility), rely on the new unit/E2E tests for the device flow, and define the production-security gate as “no new findings; the three accepted gaps unchanged; exit 40 recorded”; B) add a new device-compatibility selector/harness; C) drop the compatibility and production-security claims.

**Recommendation:** A. It is truthful and preserves “Approved complexity: None”; confidence High. Adding a new selector is a new harness surface not approved.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

## Minor findings

### PF-021: The request-URL sanitizer has no production sink [🟡 MINOR]

**Dimensions:** Scope Creep, Security, Codebase Alignment
**Location:** `03-05-security-operations.md` §Log Redaction (139–145); `99-execution-plan.md` task 5.2.5 (line 226); `07-testing-strategy.md` ST-28 (line 85)
**Related:** PA-118, PA-218, PA-325, PA-416, PA-511

**Evidence:** `packages/server/src/middleware/request-logger.ts:67-73` logs only `requestId`, `method`, `routeTemplate`, `status` and `duration`; it never logs a URL or query. `sanitizeRequestPath` at `:40-47` already masks magic-link and interaction segments. `packages/server/tests/unit/middleware/request-log-privacy.spec.test.ts:39-50` asserts that no raw path is logged.

**Problem:** The new `request-url-sanitizer.ts` has no production call site. If wired into the request logger by adding a URL field, it widens the logged surface and breaks the existing privacy test; if not, it is dead code, contrary to the plan’s own “no dead code” success criterion. ST-28 can pass by testing a synthetic call while no production path is protected. The real exposure is the reverse-proxy access log, which the plan only documents.

**Options:** A) drop the sanitizer and the ST-28 URL clause; keep the structured Pino redaction and the route-only request logger; document the reverse-proxy exposure as operational guidance; B) identify a real URL-bearing sink and wire the sanitizer there, updating the privacy test; C) keep the sanitizer as a standalone utility with no integration.

**Recommendation:** A. It is the smallest design and avoids adding URL logging to a privacy-hardened logger. If a concrete sink exists, B is the only defensible integration; confidence High.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-022: `resolvedOrganizationId` is not exported, the reuse sketch passes the wrong shape, and the hook import risks a cycle [🟡 MINOR]

**Dimensions:** Dependency Issues, Codebase Alignment
**Location:** `03-02-tenant-safe-verification.md` lines 65–74 and 76–95; `99-execution-plan.md` task 2.2.3 (line 108)
**Related:** PA-119, PA-215, PA-323, PA-420

**Evidence:** `packages/server/src/middleware/oidc-client-tenant.ts:67-73` defines `resolvedOrganizationId(organization: unknown)` as a module-private function that reads `Reflect.get(organization, 'id')`. The plan says to reuse it but does not list `oidc-client-tenant.ts` in the Files table. The sketch reads `client.organizationId`; passing the client object to the helper returns `undefined`. `configuration.ts:133` exports `resolveOrgForProviderHook`; putting the hooks in `device-pages.ts` and registering them from `configuration.ts` creates a static import cycle. The `findByUserCode(..., { ignoreSessionBinding: true })` call is an excess property because the type only declares `ignoreExpiration`.

**Problem:** A literal implementation fails typecheck or silently disables the client-organization preference; the cycle is benign only while no top-level evaluation uses the binding. The plan’s “reuse” instruction and its sketch conflict.

**Options:** A) move `resolvedOrganizationId` to a shared `oidc/org-resolution.ts` (or export it), call it with `{ id: client.organizationId }`, drop `ignoreSessionBinding` from `findByUserCode`, and pass the resolver into the hook factory to break the cycle; B) duplicate the helper in `device-pages.ts`; C) use `DeviceCode.find` for session binding.

**Recommendation:** A. It keeps one tested resolution path and removes the cycle; confidence High.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-023: Device edge cases are unspecified (HEAD, purge amplification, slug, migration, normalizer, interval TTL, malformed bodies) [🟡 MINOR]

**Dimensions:** Edge Cases, Security, Codebase Alignment
**Location:** `03-01-provider-protocol.md` migration (81–89) and TTL guard (95–98); `03-02-tenant-safe-verification.md` route table (25–30); `03-05-security-operations.md` keys (62–78) and cleanup (154–160)
**Related:** PA-112, PA-115, PA-116, PA-117, PA-415, PA-417, PA-418, PA-419, PA-421, PA-422

**Evidence and required correction:**
- `@koa/router` auto-routes HEAD to GET; `/device/:uid` is state-changing. Mount the existing `rejectHeadProbe` (`packages/server/src/middleware/reject-head-probe.ts`) on `/device` and `/device/:uid`, as `interactions.ts:365` does.
- `purgeExpired()` is a global `DELETE FROM oidc_payloads`; calling it on every unauthenticated plain GET `/device` is a DB-write amplifier. Call it on approval/login entry only, or throttle it.
- The org slug `device` is allowed (`organizations/slugs.ts:24-55` does not reserve it). `/device/device` breaks the provider mount-path derivation and the resume-cookie path; add `device` to `RESERVED_SLUGS` or strip the exact prefix.
- The unique index build fails if duplicate DeviceCode rows exist; add a duplicate preflight with a clear remediation and use `CONCURRENTLY` if the migration runner supports it.
- The middleware normalizer must copy the provider’s exact two-regex rule (`[a-z]` uppercase, `\W` removal); a naive `.toUpperCase()` maps `ß` to `SS`, while the provider removes it. Add `ß`, `İ` and fullwidth cases.
- The soft-interval key is a last-seen value, not a counter; `checkRateLimit()` cannot read it. Specify `now - last < interval - tolerance` and a TTL of at least the maximum interval (the plan declares tolerance 1 but never the formula or TTL).
- The DeviceCode zero/NaN TTL guard must choose a target; store `now + 900s` for non-finite or `<= 0` values instead of `null` (never expires).
- RD-05 requires counting a malformed POST, but a parser error prevents the post-parser limiter from running. Add a lightweight pre-parser POST `/device` counter or a parser-error increment.

**Options:** A) adopt each small correction above and add the corresponding boundary tests; B) accept the residual edge-case risk and document it; C) handle them in a later hardening phase.

**Recommendation:** A. Each item is small, and several are typecheck/security/gate failures rather than optional polish; confidence High.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-024: The CLI accepts the wrong `verification_uri` path and prints a server-supplied code without terminal-control checks [🟡 MINOR]

**Dimensions:** Edge Cases, Security, Testability
**Location:** `03-04-cli-device-login.md` response table (107) and output (112–122); `07-testing-strategy.md` ST-20 (line 72)
**Related:** PA-414, PA-424

**Evidence:** `packages/cli/src/auth/metadata.ts:41-52` validates the issuer path as exactly `/{orgSlug}`; the provider returns `verification_uri = {issuer}/device` (for example `/acme/device`). A literal `pathname === '/device'` check rejects every real response. `packages/cli/src/auth/id-token-verifier.ts:12-19` already defines `containsTerminalControl` for claims, but `commands/login.ts:100-102` prints the server-supplied `user_code` after only non-empty/length checks.

**Problem:** The path check as written fails the live server. A malicious or compromised server can return ANSI/OSC sequences in the user code that alter the terminal title, clipboard or spoofed output. The provider’s alphabet is fixed, so an allowlist costs nothing.

**Options:** A) compare `verification_uri` to `${new URL(issuer).pathname}/device` (or require the issuer path prefix plus a final `device` segment), and allow only `[BCDFGHJKLMNPQRSTVWXZ-]`/reject control characters before printing; B) use a broad `endsWith('/device')` check; C) print the code raw.

**Recommendation:** A. It is exact and preserves the terminal safety already applied to ID-token claims; confidence High.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

### PF-025: Documentation, task sizing and should-have ownership need a consistency pass [🟡 MINOR]

**Dimensions:** Consistency, Scope Creep, Completeness Gaps
**Location:** `00-index.md` document index (60); Specialist Agents table (124–133); `03-01` Should Have logs; `03-02` scope labels; `03-03` Release Compatibility (150–157); `03-04` output (112–122); `03-05` `X-RateLimit` / operational docs; `99` tasks 3.2.5, 5.2.1, 5.3.5; `07` lines 105, 117
**Related:** PA-312, PA-315, PA-327, PA-514, PA-515, PA-518

**Evidence:** the index says the Ambiguity Register covers P-1–P-16 while it now has P-1–P-19; the Specialist table says “Phase 1 and final phase” while the execution plan also runs the review in Phase 2; task 3.2.5 touches four files and task 5.2.1 bundles six behaviors, exceeding P-16’s 1–3 file/50–150 line guidance; the portability test path `tests/integration/portability/` does not exist (existing tests are `integration/admin/portability-*`); the impl table names `device-audit.impl.test.ts` while the audit lives in `device-pages.ts`; `device-code.ts` is optional with no consumer; ST-10 says “unicode variants” without concrete inputs; ST-19 includes an “older server” that does not exist; ST-30 mixes the pentest matrix with `pnpm docs:build`; RD-04’s expiry hint, RD-05’s operational docs/`X-RateLimit-*`, RD-02’s human-readable scope labels and RD-03’s “Device authorization” terminal label are should-haves with no task; the release note has no owner; there are no per-task `**Task verify**` commands or service start/stop/cleanup notes.

**Problem:** These are individually small, but together they make the plan’s coverage and scope claims untrustworthy, and several will surface as gate failures or missing documentation.

**Options:** A) apply a mechanical consistency pass: correct ranges/phases, split the oversized tasks, use the existing portability directory, rename the audit test, remove `device-code.ts` unless a consumer appears, make ST-10/ST-19/ST-30 concrete, and either task or explicitly accept each should-have; B) leave them to the executor; C) record the should-haves as accepted omissions and fix only the gate-breaking items.

**Recommendation:** A. It is a documentation/planning pass, not a product change; confidence High.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

## Observation

### PF-026: The device ID-token nonce rationale is inaccurate [🔵 OBSERVATION]

**Dimensions:** Edge Cases, Codebase Alignment
**Location:** `03-04-cli-device-login.md` lines 185–186; `00-ambiguity-register.md` P-11/AR-35; `07-testing-strategy.md` ST-22 (line 74)
**Related:** PA-216, PA-425

**Evidence:** the provider’s device authorization endpoint accepts a `nonce` parameter (`consts/param_list.js`; `request_parameters.js:14-47` removes only front-channel params), but `device.js:81-91` never copies it to the DeviceCode, so the issued ID token has no nonce. The conclusion (the device verifier must not require a nonce) is correct for `oidc-provider` 9.13.3; the stated reason (“cannot carry a nonce”) is false.

**Problem:** A future provider version that starts propagating the stored nonce would silently invalidate the rationale. ST-22 tests only “valid without nonce”; it does not test that a supplied nonce is absent from the ID token.

**Options:** A) correct the rationale and add a test that a supplied nonce is accepted by the device authorization endpoint but absent from the ID token; B) reject a nonce in the device authorization request; C) require the nonce if the provider changes.

**Recommendation:** A. It records the actual provider behavior and gives a regression test; confidence High.
**User Decision:** Resolved — User accepted the recommendation (2026-11-25)

---

## Applied resolution plan

The user accepted the recommendations on 2026-11-25. The plan and the RD-02/RD-03/RD-04/RD-05
amendments now implement the following changes; iteration 2 verified them.

| Area | Applied plan change |
|---|---|
| Zero-redirect device-only contract | Store and accept `response_types: []` for device-only clients across the server schema/defaults, provider metadata, SDK, CLI, Admin terminal, portability and docs; gate the existing `validateRedirectUris([])` rejections; add an end-to-end test that creates the client and completes `POST /device/auth` |
| Tenant and limiter path matching | One shared org-prefix-aware path helper that preserves the case-sensitive resume UID; test `/acme/DEVICE`, `/acme/device/`, `/acme/TOKEN/` and mixed-case UIDs |
| Security sequencing | Land the tenant binding and the fixed limits/redaction before `deviceFlow` can be reached, or keep the feature disabled until they land; forbid Phase 3 before Phase 2; add a merge/deploy gate for intermediate phases |
| User-code limiter | Choose the session resolution policy, make the limiter and reset use the same key, reset only after approval and never the per-IP aggregate; decide the Redis fail-open policy explicitly |
| CLI polling | Amend RD-04 or implement the safe retry subset; clamp `Retry-After` to at least the interval; add a terminal branch for every other OAuth error/status |
| Test plan | Move DB/HTTP/time-based cases to the correct project; add a live CLI E2E; make 07 the single ST inventory; update the structure-test counts; gate `pnpm test:ui` and `pnpm harness:test` |
| Audit and redaction | Hash the DeviceCode `jti` in the idempotency key; write once per window; resolve the consent-denial DeviceCode entity; classify `err.cause`; drop the unused request-URL sanitizer unless a real sink exists |
| Scope, locale and terminal | Register the `device` i18n namespace and update both exact-namespace tests; make the terminal accept zero redirects/response types and update the last-redirect guards |

## Verdict

**Iteration 1: ❌ BLOCKED.** The plan could not pass while PF-001–PF-003 were unresolved, and the 16 major findings included certain phase-gate failures (structure-test counts, UI tests not gated, `porta init` exact-grant tests, `device` namespace tests, typecheck on `ignoreSessionBinding`). The central device-only contract was infeasible at the provider, the tenant/limiter path controls did not match the router, and the security controls landed after the feature was enabled.

**Iteration 2: ✅ PASSED WITH NOTES.** All 3 critical and 16 major findings are resolved; 5 of 6 minor findings are resolved; PF-019 remains the user-accepted fail-open risk; the observation is resolved. The final re-check found no new critical or major issue.

**Next step:** start `exec-plan` in `--auto-commit` mode only after the user’s explicit go. Phase 1 lands the provider protocol, DeviceCode storage and tenant binding; no execution has started from this review.
