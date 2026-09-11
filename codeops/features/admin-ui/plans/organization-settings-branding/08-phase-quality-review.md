# Organization Settings and Branding Phase Quality Review

> **Status**: Phase 3 review complete; accepted corrections verified
> **Last Updated**: 2026-09-11 17:23
> **CodeOps Artifact Schema**: 1

## Phase 1: Admin Asset and SDK Contracts

**Review boundary:** `7c29605bc59aac8ed8d2a5c8e490a77ac930e8dd..7060d7ea`
**Scope mode:** Strict
**Verification before review:** 106 affected server unit tests, 20 PostgreSQL integration tests,
11 SDK tests, 23 CLI tests, all affected package lint/typecheck/build gates, and 97 repository
structure tests passed. Root `yarn verify` was not run under the approved execution boundary.

| ID                        | Severity | Lens        | Finding                                                                      | Minimum correction                                                                                        | Ruling      |
| ------------------------- | -------- | ----------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------- |
| SA-001                    | 🟠 Major | Security    | The 3 MiB upload parser ran before the existing Admin mutation rate limiter  | Move existing Admin CORS and rate-limit middleware before parsing and prove rejected uploads skip parsing | ✅ Accepted |
| RV-001 / SA-002 / API-001 | 🟠 Major | Correctness | The upload route mapped persistence and programming failures to client `400` | Use one narrow validation error and rethrow operational failures to the existing sanitized global handler | ✅ Accepted |
| API-002                   | 🟠 Major | API surface | Missing organizations produced different results across asset operations     | Validate the organization ID and resolve it once through the existing organization service                | ✅ Accepted |
| API-003                   | 🟡 Minor | API surface | Upload-input documentation reversed encoded and decoded terminology          | Describe the field as image bytes encoded as standard base64                                              | ✅ Accepted |

The user accepted all four minimum corrections. They reuse existing middleware, organization
lookup, global error handling, and validation paths. No limiter, error framework, lookup layer,
compatibility shim, or generalized infrastructure is added.

## Bounded Re-review

The single permitted re-review confirmed that all four original findings are closed. It reported
one Minor documentation issue, RR-001: the Admin CORS and rate-limiter module comments still
described their old placement. The comments now state that CORS and rate limiting run before body
parsing and authentication. No further re-review is permitted or required for this comment-only
correction.

## Phase 2: Public Branding Delivery and Auth Rendering

**Review boundary:** `882a3f0b5e14bb9f838d1b2b485e826ba88f451d..d3dab97c`
**Scope mode:** Strict
**Verification before review:** 124 affected server unit tests, 26 PostgreSQL integration tests,
13 end-to-end tests, 7 penetration tests, 19 Playwright tests, all affected server
lint/typecheck/build gates, and 100 repository structure tests passed. Root `yarn verify` was not
run under the approved execution boundary.

| ID                | Severity | Lens                    | Finding                                                                                           | Minimum correction                                                                                  | Ruling         |
| ----------------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------- |
| RV-001 / API-001  | 🟠 Major | Correctness/API surface | Password-reset error pages omitted external branding image origins from the response CSP handoff | Route errors through the existing response helper and add one focused expired-token regression test | ✅ Accepted    |
| RV-002            | 🟡 Minor | Written standards       | Two plan documents retain the superseded effective-branding module path and stale decision count | Align the plan references with the recorded runtime decision                                        | Report only    |
| SA-001            | 🟡 Minor | Security                | The exact upload URI receives the 3 MiB Nginx allowance for methods other than `PUT`              | Method-route the allowance and extend the proxy specification                                       | Report only    |

The user accepted the minimum correction for RV-001/API-001. Commit `8a8868a0` reuses the existing
`renderAndRespond()` helper so password-reset error pages propagate the same validated branding
origins as every other password-reset page. It adds no new abstraction, dependency, middleware,
or compatibility path. The Minor findings are recorded without expanding strict execution scope.

### Phase 2 Bounded Re-review

The single permitted re-review confirmed RV-001/API-001 is closed. The shared response helper now
copies effective branding image sources into Koa state before rendering, and the focused
expired-token regression test verifies the external origin handoff. The fix introduced no new
Critical or Major finding. No further re-review is permitted or required.

## Phase 3: Organization Admin Workspace

**Review boundary:** `cb1ff30a2a3cc116e1b3648885a5e0bb9293a175..working tree`
**Scope mode:** Strict
**Verification before review:** 743 Admin tests, CLI lint/typecheck/build, and 100 repository
structure tests passed. Root `yarn verify` was not run under the approved execution boundary.

| ID         | Severity    | Lens                  | Finding                                                                 | Minimum correction                                                                 | Ruling      |
| ---------- | ----------- | --------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------- |
| P3-RV-001  | 🔴 Critical | Context ownership     | Picker and confirmation continuations could target a replacement org    | Capture and recheck generation plus organization ID around every await             | ✅ Accepted |
| P3-RV-002  | 🟠 Major    | Reconciliation        | A failed authoritative reload could replace ready data with stale state | Return explicit reload outcomes and retain the last authoritative projection       | ✅ Accepted |
| P3-RV-003  | 🟠 Major    | Focus                 | Dialog and picker closure did not reliably return focus to its launcher | Retain launcher meaning and reconcile it to the currently rendered control         | ✅ Accepted |
| P3-RV-004  | 🟠 Major    | Feedback              | Tab feedback omitted required operation states and field-specific errors | Render one existing tab-owned status line for validation and operation outcomes    | ✅ Accepted |
| P3-RV-005  | 🟡 Minor    | Authorization         | Update intents relied only on disabled controls and server authorization | Recheck the current verified capability in the existing controller                 | ✅ Accepted |
| P3-RV-006  | 🟡 Minor    | API surface           | An unused duplicate branding read operation and mocks remained          | Remove the dead operation, type, implementation, and test mocks                     | ✅ Accepted |
| P3-RV-007  | 🟡 Minor    | Specification fixture | Two test inputs used the unsupported `required` 2FA value                | Use the approved `required_email` value without changing observable expectations   | ✅ Accepted |

The user accepted all seven minimum corrections. They add no service, retry mechanism, cache,
framework, or concurrency support.

### Phase 3 Bounded Re-review

The single permitted re-review found three remaining Major gaps: lifecycle mutations inherited
the update capability guard; a callback queued by a removed workspace could capture the replacement
organization; and rerendering could detach a retained launcher before final focus restoration.
The corrections now use the lifecycle-specific suspend capability, bind each workspace callback
to its opening owner, and reconcile launcher meaning to the live rerendered control. Focused tests
cover all three paths. Final verification passed 755 Admin tests, CLI lint/typecheck/build, and 100
repository structure tests. No further re-review is permitted or required.
