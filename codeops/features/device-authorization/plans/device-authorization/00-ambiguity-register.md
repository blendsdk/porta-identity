# Ambiguity Register: Device Authorization Implementation Plan

> **Status**: ✅ GATE PASSED — all 19 items resolved; preflight passed with notes
> **Last Updated**: 2026-11-25 12:10
> **Authority**: Auto-design active — root invocation ID `auto-design-device-authorization-20261125`
> **CodeOps Artifact Schema**: 1

| # | Category | Ambiguity / Gap | Options Considered | Resolution | Status |
|---|---|---|---|---|---|
| P-1 | Scope | Which requirements does this plan implement? | All five RDs / subset / one RD | All five RDs in one plan, per requirements AR-34 | ✅ Resolved — user |
| P-2 | Scope | Where does the work live? | Feature branch in place / worktree / develop | `feat/device-authorization`, created from `develop` | ✅ Resolved — user |
| P-3 | Scope | How many phases? | Five by RD / three grouped | Five phases, one per RD | ✅ Resolved — user |
| P-4 | Technical | What verification policy? | Phase gate + narrow tasks / full verify every task / CI only | `pnpm verify` phase gate; narrow category commands for tasks | ✅ Resolved — user |
| P-5 | Technical | How are specification tests organized? | Separate per layer / one cross-layer file / extend existing only | Separate unit, integration, E2E, UI, pentest, SDK and CLI files | ✅ Resolved — user |
| P-6 | Naming | What is the plan folder name? | `device-authorization` / `device-authorization-v1` | `plans/device-authorization/` inside the feature | ✅ Resolved — AI |
| P-7 | Technical | Where do tenant binding and device limiters sit in the OIDC middleware chain? | New middleware before provider / provider-only hook / DB-only lookup | New `deviceTenantBinding` and `deviceRateLimiter` after body parsing and before the provider; generic token limiter skips the device grant | ✅ Resolved — AI |
| P-8 | Data & state | How are DeviceCode retention, uniqueness and migration handled? | Extended adapter expiry + unique index / no retention / custom generator retry | Migration 039 partial unique index; adapter adds 900s retention for DeviceCode; collision returns 503 | ✅ Resolved — AI |
| P-9 | UX | How are the branded verification forms built? | Porta-owned form from provider action/XSRF / wrap provider form / provider defaults | Porta-owned accessible form using the trusted provider action and XSRF; new `device` templates and locale file | ✅ Resolved — AI |
| P-10 | Integration | How are Admin API, SDK, CLI and Admin terminal grant changes implemented? | Shared constant + conditional schema + `--grant-types` + terminal grant selector / API-only / alias | One full-URN constant per package, empty response types plus conditional redirect schema, `--grant-types`, terminal grant `CheckGroup`, portability/docs | ✅ Resolved — AI |
| P-11 | Security | How is the CLI device ID token verified without a nonce? | Separate device verifier / optional nonce in shared verifier / skip | Separate `verifyDeviceIdToken` sharing claim checks; authorization-code verifier unchanged | ✅ Resolved — AI |
| P-12 | Security | Where are audit, redaction and user-code reset implemented? | Hooks + limiter + successSource reset / single generic event / token handler | `successSource` writes authorized and resets only the primary counter after approval; aborted input writes denied; limiters write rate-limit events; per-IP aggregate never reset; Pino redaction extended | ✅ Resolved — AI |
| P-13 | Process | How is coverage handled when the canonical auditor subagent is unavailable? | Inline four-cluster fallback / skip / use a generic explorer | Inline four-cluster fallback, recorded as a residual limit; specialist review runs separately | ✅ Resolved — AI |
| P-14 | Process | What commit mode applies to execution? | Auto-commit / ask / no-commit | Auto-commit when exec-plan runs; make-plan itself does not commit | ✅ Resolved — user |
| P-15 | Scope | Does the plan require a complexity escalation? | Smaller direct design / larger support surface | No escalation: existing middleware, adapter, templates, migration and test patterns are reused | ✅ Resolved — AI |
| P-16 | Technical | What task granularity and test naming apply? | Small reviewable tasks / large phases / one cross-layer spec | 1–3 files and roughly 50–150 lines per task; 5 phases × 3 sessions; existing `*.spec.test.*` / `*.impl.test.*` conventions | ✅ Resolved — AI |
| P-17 | Security | How are the independent reviewer findings SR-001–SR-018 handled? | Incorporate all / accept some / defer | Incorporate all: shared normalization, path normalization, GET limiter, UID shape, hard-counter order, strict grant predicate, cache headers, custom 503, retention guard, hashed audit idempotency, audit conditions | ✅ Resolved — AI |
| P-18 | Operational | How many concurrent device logins per client+IP does the fixed 180/15min budget support? | One documented flow / per-code budget / raise limit | Document one concurrent flow per client+IP; parallel flows may receive 429 and must back off | ✅ Resolved — AI |
| P-19 | Security | What happens when a token exchange outcome is unknown after the request was sent? | Do not retry; require re-login / retry same code / retry once | Do not retry an ambiguous exchange; surface an indeterminate error and require a new login, because replay revokes the first token set | ✅ Resolved — AI |

## Coverage Map

> **Coverage**: 4/4 clusters · 12/12 categories · 0 candidates · 1 residual limit · Effort: high→high · Independence: uniform-effort
> **Freshness**: Coverage as of 2026-11-25; artifacts: requirements RDs and README, roadmap, server OIDC/router/adapter code, CLI/SDK/Admin terminal code, techdocs.

| Cluster | Area | Examined | Not examined / limit | Candidates | Notes / limit | Confidence |
|---|---|---|---|---|---|---|
| C1 Product and scope | Feature gaps, scope, UX | All five RDs, requirements README, roadmap | None | 0 | No new scope beyond the approved RDs | High |
| C2 Behavior and edges | Behavior, edge cases, integration | RD acceptance criteria, provider device code verification, CLI login code | None | 0 | Nonce gap already resolved as AR-35 | High |
| C3 Technical and data | Technical, data, naming | `server.ts`, `provider.ts`, adapters, migrations, client validators, SDK/CLI/Admin code | None | 0 | Technical choices delegated to P-7–P-12 | High |
| C4 Risk and stakeholders | Security, non-functional, conflicts | AGENTS.md, security and API techdocs, rate-limiter code | Canonical `preflight-auditor` subagent unavailable | 0 | Inline fallback; independent specialist review completed, SR-001–SR-018 incorporated | High |

**Source note:** none.

## Resolution Notes

**P-1–P-5:** User decisions recorded during the plan kickoff. They implement the approved
requirements set and the repository's local-test policy.

**P-6:** Authority: AI — delegated by `--auto-design`. Eligibility: naming and folder placement
within the confirmed feature. Objective: deterministic plan-path discovery. Decision:
`codeops/features/device-authorization/plans/device-authorization/`. Evidence: nested layout and
existing feature plan conventions. Rejected: version suffix (no second plan yet). Strongest
counterargument: a later v2 would need a new folder; acceptable. Confidence: High. Hardening: not
required; low impact. Policy version: 1. Root invocation:
`auto-design-device-authorization-20261125`. Reopen trigger: a second concurrent plan for this
feature.

**P-7:** Authority: AI — delegated by `--auto-design`. Eligibility: internal middleware and
interface design within RD-01, RD-02 and RD-05; no product or security-policy change. Objective:
enforce tenant binding and fixed device limits before provider processing without changing other
grants. Decision: add `deviceTenantBinding(provider)` and `deviceRateLimiter(provider)` to the OIDC
router after body parsing and before the provider callback; modify the generic token limiter to
skip `grant_type=urn:ietf:params:oauth:grant-type:device_code`. Evidence:
`packages/server/src/server.ts:503-552`, `packages/server/src/oidc/provider.ts:58-71`,
`packages/server/src/oidc/postgres-adapter.ts:121`,
`packages/server/src/middleware/token-rate-limiter.ts:156-207`. Rejected: provider-only hook (too
late for the interaction organization), direct SQL lookup (duplicates normalization), no token
limiter change (breaks normal polling at 30/5 minutes). Strongest counterargument: two middlewares
add request-path complexity; a combined middleware could be smaller. Confidence: High. Hardening:
independent `oidc-provider-reviewer` challenge completed; SR-001–SR-018 incorporated. Policy version: 1. Root invocation:
`auto-design-device-authorization-20261125`. Reopen triggers: provider route order changes, a new
device route, or a rate-limit policy change.

**P-8:** Authority: AI — delegated by `--auto-design`. Eligibility: persistence mechanism within
RD-01/RD-05. Objective: correct expiry semantics and no user-code misrouting. Decision: add
migration `039_device_authorization_user_code.cjs` with a partial unique index; extend the
PostgreSQL adapter's DeviceCode `expires_at` by 900 seconds while leaving the provider payload `exp`
at 600; map a unique violation to HTTP 503 `temporarily_unavailable`. Evidence:
`packages/server/migrations/010_oidc_adapter.sql:8-26`,
`packages/server/src/oidc/postgres-adapter.ts:65-133`,
`node_modules/oidc-provider/lib/helpers/defaults.js:359`. Rejected: no retention (loses
`expired_token`), no unique index (misrouting risk), retry generation (provider customization).
Strongest counterargument: extended retention increases table size and the collision path is rare;
the row volume is bounded by the short lifetime and fixed limits. Confidence: High. Hardening:
in-context challenge; no independent challenger required beyond the specialist review. Policy
version: 1. Root invocation: `auto-design-device-authorization-20261125`. Reopen triggers: a
provider adapter change or a DeviceCode volume concern.

**P-9:** Authority: AI — delegated by `--auto-design`. Eligibility: template and form rendering
within RD-02. Objective: accessible, branded, localized pages that preserve provider XSRF and field
names. Decision: build a Porta-owned form using the trusted provider action and XSRF value; add
`device` page templates and a `device` locale file. Evidence:
`node_modules/oidc-provider/lib/actions/code_verification.js:15-103`,
`node_modules/oidc-provider/lib/helpers/user_code_form.js`, RD-02. Rejected: wrapping the provider
form (no real label/id), provider defaults (unbranded, external fonts). Strongest counterargument:
extracting XSRF from provider HTML couples to markup; mitigate with the pinned provider version and
a form-contract test. Confidence: High. Hardening: in-context challenge. Policy version: 1. Root
invocation: `auto-design-device-authorization-20261125`. Reopen trigger: provider form helper
changes.

**P-10:** Authority: AI — delegated by `--auto-design`. Eligibility: implementation of the
approved client contract across API, SDK, CLI, Admin terminal, portability and docs. Objective: one
consistent contract with no alias or split surface. Decision: shared full-URN constant per
package; conditional redirect schema; `--grant-types`; Admin terminal grant `CheckGroup`;
portability schema and docs updates. Evidence: RD-03, `clients/validators.ts:46`,
`routes/clients.ts:115`, `packages/sdk/src/types/clients.ts:20`,
`packages/cli/src/admin/client-workspace.ts:399`,
`packages/server/src/portability/schema.ts:303`. Rejected: friendly alias, API-only, separate
device command. Strongest counterargument: the Admin terminal registration change is larger than
the API; AR-16 requires full consistency. Confidence: High. Hardening: in-context challenge. Policy
version: 1. Root invocation: `auto-design-device-authorization-20261125`. Reopen triggers: a new
administration surface or a client contract change.

**P-11:** Authority: AI — delegated by `--auto-design`. Eligibility: CLI security mechanism within
RD-04/AR-35. Objective: verify the device ID token without weakening the authorization-code nonce
check. Decision: add `verifyDeviceIdToken` sharing claim checks, and a `auth/device-flow.ts`
orchestrator; leave `verifyCliIdToken` unchanged. Evidence: RD-04, AR-35,
`packages/cli/src/auth/id-token-verifier.ts:61-104`,
`packages/cli/src/auth/login-coordinator.ts:262-332`. Rejected: optional nonce in the shared
verifier (weakens the code path), skip verification. Strongest counterargument: duplicated claim
logic can drift; mitigate with shared helpers and tests. Confidence: High. Hardening: in-context
challenge. Policy version: 1. Root invocation: `auto-design-device-authorization-20261125`. Reopen
trigger: a provider change that adds a nonce to device authorization.

**P-12:** Authority: AI — delegated by `--auto-design`. Eligibility: audit and rate-limit event
placement within RD-05. Objective: one audit event per outcome and no secret leakage. Decision:
authorized in `successSource`; denied in the aborted/denied input state; rate-limit events in the
limiters; only the primary user-code counter reset in `successSource` after approval, never the
per-IP aggregate; Pino paths extended. Evidence:
RD-05, `packages/server/src/lib/audit-log.ts:36-58`,
`packages/server/src/routes/interactions.ts:1209-1215` (existing event style),
`packages/server/src/lib/logger.ts:63-89`. Rejected: one generic security event, token-handler
audit (too late and lacks the user). Strongest counterargument: hook-based audit may miss an edge
path; tests cover approval, denial and abort. Confidence: High. Hardening: in-context challenge.
Policy version: 1. Root invocation: `auto-design-device-authorization-20261125`. Reopen trigger: a
new device outcome or audit schema change.

**P-13:** Authority: AI — delegated by `--auto-design`. Eligibility: process fallback, not product
behavior. Objective: run the coverage hunt without the canonical auditor subagent. Decision:
inline four-cluster fallback, recorded as a residual limit; the independent
`oidc-provider-reviewer` challenge runs separately. Evidence: available subagents are `explore`,
`general`, and `oidc-provider-reviewer`; no `preflight-auditor`. Rejected: skip the hunt, or use a
generic explorer as a substitute auditor. Strongest counterargument: inline review is less
independent; the specialist challenge and later preflight provide the independence layer.
Confidence: Medium. Hardening: specialist review completed; findings incorporated. Policy version: 1. Root invocation:
`auto-design-device-authorization-20261125`. Reopen trigger: `preflight-auditor` becomes available.

**P-14:** User directive: `--auto-commit` applies when `exec-plan` runs. `make-plan` does not
commit; it only records the mode for the execution instruction.

**P-15:** Authority: AI — delegated by `--auto-design`. Eligibility: minimum-sufficient design.
Objective: avoid a new service or support surface. Decision: no complexity escalation. Evidence:
RD-01–RD-05 reuse the provider feature, existing adapter, templates, middleware, rate limiter,
audit and test infrastructure. Rejected: separate device service, custom protocol implementation,
new global settings, new application type. Strongest counterargument: the unique-index migration
and new middleware are support surfaces; both are direct controls through existing patterns, not a
new subsystem. Confidence: High. Hardening: in-context challenge. Policy version: 1. Root
invocation: `auto-design-device-authorization-20261125`. Reopen trigger: any new dependency,
service, worker or configuration surface.

**P-16:** Authority: AI — delegated by `--auto-design`. Eligibility: planning granularity and test
organization. Objective: reviewable tasks and traceable ST cases. Decision: 1–3 files and 50–150
lines per task; five phases, each with spec tests, implementation, and impl tests/hardening
sessions; use the existing test naming conventions per layer. Evidence: quality checklist and
existing test layout. Rejected: one large phase, one cross-layer spec file. Strongest
counterargument: exact file counts may vary; the plan allows a task to split if it exceeds the
guidance. Confidence: High. Hardening: in-context challenge. Policy version: 1. Root invocation:
`auto-design-device-authorization-20261125`. Reopen trigger: a task grows beyond the granularity
limit.

**P-17:** Authority: AI — delegated by `--auto-design`. Eligibility: security corrections within
the approved RD-01–RD-05 behavior; no product scope expansion. Objective: close the independent
review findings without weakening the approved contract. Decision: incorporate SR-001–SR-018:
shared normalization and fail-closed lookup; case/trailing-slash path normalization; GET-with-code
counts against the user-code budget and the limiter runs before tenant binding; provider-shaped UID
bounds; hard counters increment before the soft interval check; a shared token-path predicate;
`Cache-Control: no-store` on early responses; strict grant predicate before counters; a custom
503 `temporarily_unavailable` error; retention on every DeviceCode upsert with a zero-TTL guard;
hashed audit idempotency (no raw URL sanitizer); audit only on actual device aborts with bounded
reasons; and audit-before-render. Evidence: `oidc-provider-reviewer` findings
SR-001–SR-018. Rejected: leaving the GET path unthrottled, relying on Pino redaction alone,
`TemporarilyUnavailable` without a statusCode override, and inferred user intent on server aborts.
Strongest counterargument: several corrections add code to an already broad phase; they are direct
security controls through existing patterns, not a new subsystem. Confidence: High. Hardening:
independent review completed. Policy version: 1. Root invocation:
`auto-design-device-authorization-20261125`. Reopen triggers: a provider error-class change, a route
ordering change, or a new audit outcome.

**P-18:** Authority: AI — delegated by `--auto-design`. Eligibility: operational envelope within
the fixed AR-6/AR-36 limits. Objective: state what the 180/15-minute client+IP budget supports.
Decision: one concurrent device login per client+IP at the advertised interval. Parallel flows may
receive 429 and must back off; no per-code budget or limit change is introduced. Evidence: RD-05
AC-7 is singular and the approved budget is 180/15 minutes. Rejected: a per-code hard budget
(changes an approved limit), raising the limit (contradicts AR-6). Strongest counterargument: some
operators may run parallel CLI logins; document the limitation and revisit only with a new user
decision. Confidence: High. Hardening: in-context challenge. Policy version: 1. Root invocation:
`auto-design-device-authorization-20261125`. Reopen trigger: a requirement for concurrent device
logins.

**P-19:** Authority: AI — delegated by `--auto-design`. Eligibility: failure/recovery design within
RD-04. Objective: avoid a CLI retry that revokes a successfully issued first token set. Decision:
after a token request has been sent, an ambiguous network timeout or 5xx is terminal for that
device code; the CLI reports an indeterminate outcome and requires a new login. Safe polling
responses (`authorization_pending`, `slow_down`, `429`) still continue within the deadline.
Evidence: `grant_source.js` replay handling revokes the grant; the provider consumes the device
code on success. Rejected: retrying the same exchange (self-revocation), treating the timeout as
`authorization_pending` (incorrect). Strongest counterargument: a transient network failure forces
a new login even when no token was issued; this is the safe trade-off for a single-use credential.
Confidence: High. Hardening: independent review finding SR-012. Policy version: 1. Root invocation:
`auto-design-device-authorization-20261125`. Reopen trigger: a provider change that makes token
exchange idempotent.

## Preflight Resolutions

The preflight iteration 1 report ([00-preflight-report.md](00-preflight-report.md)) blocked the plan
and the user accepted its recommendations on 2026-11-25. The plan-level resolutions are:

| PF | Resolution | Authority |
|---|---|---|
| PF-001 | Device-only clients store `responseTypes: []` and `redirectUris: []`; all client surfaces updated | User accepted |
| PF-002 | One shared org/path helper; resume UID case preserved | User accepted |
| PF-003 | Tenant binding and fixed controls before client enablement; Phase 3 requires Phase 2 | User accepted |
| PF-004 | User-code key resolves the provider session UID from the signed cookie | User accepted |
| PF-005 | Approval resets only the primary counter; the per-IP aggregate is never reset (RD-05 amendment) | User accepted |
| PF-006 | No-retry after a dispatched token exchange; 429 clamp and unknown-error branch (RD-04 amendment) | User accepted |
| PF-014 | Durable conditional confirmation write | User accepted Option A |
| PF-019 | Keep the approved fail-open Redis policy; residual risk recorded | User accepted Option B |
| PF-021 | Remove the unused request-URL sanitizer | User accepted |
| PF-025 | Documentation/task-size/consistency pass | User accepted |

The plan authoring gate was open; the preflight gate passed with notes.

## Final Confirmation

The user decisions P-1–P-5 and P-14 are recorded from the plan kickoff. Auto-design resolved the
eligible technical and process items P-6–P-13 and P-15–P-19, including the independent review
corrections SR-001–SR-018. The preflight resolutions above are applied; the plan authoring gate is
open and the preflight passed with notes; execution is pending.
