# Preflight Report: Deferred Invitation Creation

> **Status**: ✅ PASSED — all 13 findings resolved (2 major, 7 minor, 2 observations, 2 resolved during review)
> **Iteration**: 2 (re-scan after accepted fixes)
> **Artifact**: Full implementation plan at `codeops/features/user-invitations/plans/deferred-invitation-creation/`
> **Content hash** (uncommitted): iteration 1 scan-start `bbebee95e8c7645256cfde6913a9915921a30e240a291174af200d1e9f8b9bf9`;
> cascade `0410d23141c08cbd9ac8ac9bfbd1795d47865b545b0277423c59d16c4a581f5e`; iteration 2 `17ba89d57d5256c46dea38d4a285aa6872166fd0e8055afceff3f8b5a155275e`
> **Repository revision**: `8d0035d6` (`develop`)
> **Codebase Grounded**: 40+ source/test/config files examined; ~60 references verified
> **Last Updated**: 2026-09-26 20:18

> ⚠️ **SAME-SESSION REVIEW**: This plan was created in the current session. Same-agent bias risk is
> elevated. Consider a fresh-session audit before execution if the major findings below are
> resolved by the original author rather than an independent reviewer.

## Codebase Context Summary

**Tech Stack:** TypeScript ESM monorepo (Node 22/24), Koa + `oidc-provider`, PostgreSQL, Redis,
Handlebars templates, Zod, vitest, Playwright; Yarn 1 + Turbo.

**Architecture:** Routes (`packages/server/src/routes/`) delegate to service modules
(`users/service.ts`), which use repository functions (`users/repository.ts`) over a `pg` pool and
an optional Redis user cache. Audit writes are best-effort via `writeAuditLog`
(`lib/audit-log.ts`). Token flows live in `auth/token-repository.ts`. Invitations are a token row
joined to `users` for tenant authority. Admin UI logic is in `packages/cli/src/admin/`.

**Key files examined:** `routes/users.ts`, `routes/invitation.ts`, `auth/token-repository.ts`,
`auth/email-service.ts`, `users/service.ts`, `users/repository.ts`, `users/cache.ts`,
`lib/audit-log.ts`, `lib/system-config-catalog.ts`, migrations `005/008/009/019/030`,
`test-harness/assurance/tests/human-auth-recovery-live-adapter.ts`,
`repo-tests/monorepo/global-configuration-docs.spec.test.mjs`, SDK/CLI invite surfaces and their
contract tests.

**Reference Verification:** 58 references mapped — 55 verified, 3 stale (PF-009).

## Summary by Dimension

| # | Dimension | Findings | Highest Severity |
| --- | --- | --- | --- |
| 1 | Ambiguities | 1 | 🟡 |
| 2 | Implicit Assumptions | 0 | — |
| 3 | Logical Contradictions | 0 | — |
| 4 | Completeness Gaps | 2 | 🟠 |
| 5 | Dependency Issues | 0 | — |
| 6 | Feasibility Concerns | 1 | 🟡 |
| 7 | Testability | 2 | 🟡 |
| 8 | Security Blind Spots | 0 | — |
| 9 | Edge Cases | 1 | 🔵 |
| 10 | Scope Creep Indicators | 0 | — |
| 11 | Ordering & Sequencing | 1 | 🟡 |
| 12 | Consistency | 2 | 🟡 |
| 13 | Codebase Alignment | 1 | 🟠 |

## Summary by Severity

| Severity | Count | Status |
| --- | --- | --- |
| CRITICAL | 0 | — |
| MAJOR | 2 | all resolved |
| MINOR | 7 | all resolved |
| OBSERVATION | 2 | all resolved |
| Resolved during review | 2 | PF-003, PF-004 |
| **Total** | **13** | **13 resolved** |

---

## MAJOR

### PF-001: Assurance harness invitation path cannot survive deferred creation 🟠 MAJOR

**Dimension:** 13 — Codebase Alignment (Feasibility / Test Impact)
**Location:** `99-execution-plan.md` task 3.2.5; `03-03-contracts-cli-admin-docs.md` §Testing Requirements
**Codebase Evidence:** `test-harness/assurance/tests/human-auth-recovery-live-adapter.ts:476-484`
(parses `data.userId` into `intendedUserId`), `:682-697` (`observeConsumption` calls
`captureProtected`/`captureDurable` with `intendedUserId` **before** presenting the artifact),
`:638-679` (`presentAccountArtifact` requires the first GET body to contain `name="password"`),
`:1004-1069` (`runInvitation`).

**The Problem:** The retained assurance harness is built on two assumptions that deferral removes.
(1) At issuance a real user exists, so `captureDurable`/`captureProtected` can fetch
`GET /users/:userId` for before/after comparison; with deferral that id does not exist, so
`adminUserDigest` throws `public-state-unavailable` (`:498`). (2) The accept-invite link renders the
password form on a single GET; the plan inserts a confirmation page, so the `name="password"` check
fails and the harness never submits. The plan reduces all of this to one task: "Update the
assurance-harness invite consumer to the new response." That understates a redesign of issuance,
presentation, and protected-state capture, and the plan's own success criteria require
`yarn assurance:harness --project security --profile production-security` to pass.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Rework the adapter: issue → follow the `?step=password` confirmation → accept → discover the created user (admin list/search by email) → then capture durable/protected state | Keeps the harness authoritative and end-to-end | Real harness work; needs a stable way to discover the created account |
| B | Split the harness flows: keep invitation steps limited to issuance/delivery/expiry/replay classification and move account-state assertions to after acceptance | Smaller, honest scope | Weakens the "intended consumption" protected-state claim unless re-anchored |
| C | Keep the single-GET assumption by having the accept GET render the form when a token is present (drop confirmation for harness) | Minimal code | Directly conflicts with AR-11 (user-requested confirmation page) |

**Recommendation:** Option A — it is the only option that preserves both the approved confirmation
UX and the harness's security claims; Option C contradicts a user decision and Option B reduces
security coverage. Add explicit tasks and a testable acceptance criterion for the harness.

**Confidence:** High (verified against adapter control flow and plan success criteria).
**Hardening:** Independent challenger confirmed MAJOR.

**User Decision:** Resolved — User accepted recommendation: Option A (2026-09-26).

---

### PF-002: Invitation email path requires a `users` row and writes a user-bound audit row 🟠 MAJOR

**Dimension:** 4 — Completeness Gaps (Codebase Alignment)
**Location:** `03-02-accept-flow-and-routes.md` §Email ("The invitation email and URL are unchanged"); no task in `99-execution-plan.md`
**Codebase Evidence:** `packages/server/src/auth/email-service.ts:31-36` (`EmailUser.id: string`),
`:309-352` (`sendInvitationEmail` reads `user.id` and writes `email.send.invitation` with
`userId: user.id`), `migrations/009_audit_log.sql:8` (`user_id UUID REFERENCES users(id)`),
`lib/audit-log.ts:69-73` (errors swallowed).

**The Problem:** With no user at invite time, `sendInvitationEmail` cannot be called as designed. Its
parameter type requires an `id`, and it records that id as the audit `user_id`, which is a foreign key
to `users`. Passing the invitation id or a placeholder (as the preview route does with the zero UUID at
`routes/users.ts:616-621`) either violates the FK or silently drops the `email.send.invitation` audit
row — a silent loss of the inviter/delivery trail. The plan asserts the email path is unchanged and
assigns no task to `email-service.ts` or its tests.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Make the recipient identity optional for deferred invitations: accept `{ email, givenName?, familyName? }` plus an optional `userId`, and record `userId: null` with `invitationId` in metadata | Truthful audit; no synthetic user ids; email template reuse | Touches `EmailUser`/`sendInvitationEmail` and their tests |
| B | Pass a synthetic user id and accept the missing FK audit row | No email-service change | Silent audit loss; misleading id; breaks identity-system audit expectations |
| C | Defer the email send to a small job that runs after a user exists | Accurate audit binding | Introduces machinery (worker/queue) excluded by AR-17/AR-23 and a complexity escalation |

**Recommendation:** Option A — smallest change that keeps the audit truthful and avoids new
machinery. Add a task for `email-service.ts` and update `email-service.test.ts`.

**Confidence:** High (types and FK verified).
**Hardening:** Independent challenger confirmed MAJOR and noted the failure is a silently missing
audit row, not a crash.

**User Decision:** Resolved — User accepted recommendation: Option A (2026-09-26).

---

### PF-003: Invitation email hardcodes a 7-day lifetime while the default becomes 24h ✅ RESOLVED

**Dimension:** 13 — Codebase Alignment (Stale Assumption)
**Codebase Evidence:** `packages/server/src/auth/email-service.ts:287` (`expiresDays: 7`),
`packages/server/templates/default/emails/invitation.hbs:22,24`,
`invitation.txt.hbs:6,8`, `packages/server/tests/unit/auth/email-service.test.ts:231`.

**The Problem:** Originally raised because the plan changed the default TTL to 24h while the email
hardcoded 7 days.
**Resolution:** User reversed AR-12 on 2026-09-26: the 7-day default is kept, so the email text and
its test remain correct. This finding is resolved by the requirement, not by an email change. Doing
nothing is intentional; no dynamic-TTL work is added (the configurable-TTL/e-mail-text mismatch is
pre-existing and outside this feature's scope).

**User Decision:** Resolved — User (2026-09-26): "The 7 days is okay — we don't need to change the
7 days to 24 hours." Keep `invitation_ttl = 604800`; no `email-service.ts` TTL change.

---

## MINOR

### PF-004: Structure test pins the old `invitation_ttl` default ✅ RESOLVED

**Dimension:** 7 — Testability / 13 — Test Impact
**Codebase Evidence:** `repo-tests/monorepo/global-configuration-docs.spec.test.mjs:21`
(`['invitation_ttl', '604800', '300..2592000', 'seconds', 'runtime']`).

**The Problem:** Originally raised because the plan changed the catalog default and docs to `86400`,
which would fail this repository-structure test.
**Resolution:** The AR-12 reversal keeps `604800`, so the structure test, catalog, docs, and migration
seed remain valid. No test, catalog, or docs TTL change is required.

**User Decision:** Resolved — same 2026-09-26 decision as PF-003; omit all TTL-default edits.

### PF-005: Phase 1/Phase 2 boundary is not independently type-safe 🟡 MINOR

**Dimension:** 11 — Ordering & Sequencing / 6 — Feasibility
**Location:** `99-execution-plan.md` Phases 1–2; `03-01-invitation-data-model.md`
**Codebase Evidence:** `auth/token-repository.ts:698` (`insertInvitationToken`), `:731`
(`findValidInvitationToken`); `routes/invitation.ts:276-285` (`setUserPassword(tokenRecord.userId…)`,
`markEmailVerified(tokenRecord.userId)`), `routes/invitation.ts:400` (`applyPreAssignments` reads
`tokenRecord.userId`).

**The Problem:** Phase 1 makes `InvitationTokenRecord.userId` nullable and changes invitation token
storage, but the consumers in `routes/invitation.ts` are only updated in Phase 2. Phase 1/2 verify
commands omit `typecheck`, and vitest strips types, so the tree can be non-compiling across that
boundary until Phase 3.3.3. The first full typecheck then surfaces the break late.
**Recommendation:** Add `yarn workspace @portaidentity/server typecheck` to the Phase 1 and Phase 2
verify commands, or keep the old `insertInvitationToken` signature until Phase 2.
**Confidence:** High (challenger downgraded from MAJOR: caught by later mandatory typecheck; real
phasing hygiene issue).
**User Decision:** Resolved — User accepted recommendation: keep legacy token API in Phase 1, add
`typecheck` to both phase gates (2026-09-26).

### PF-006: Test-update inventory misses three affected unit test files 🟡 MINOR

**Dimension:** 7 — Testability / 13 — Test Impact
**Codebase Evidence:** `packages/sdk/tests/agent/agent.test.ts:55-70` (asserts `users.invite`
returns `InviteUserResult` and lists `userId`), `packages/server/tests/unit/auth/email-service.test.ts:231`
(`expiresDays: 7`), `packages/server/tests/unit/auth/system-config-consumers.spec.test.ts:26,82,278-296`
(mocks `insertInvitationToken` and asserts a `Date` argument).
**The Problem:** These tests will fail `yarn workspace … verify` / `yarn verify` but are not in the
plan's update lists (07 §Test Categories).
**Recommendation:** Add them to the SDK (Phase 3) and server (Phase 1/2) update tasks.
**Confidence:** High.
**User Decision:** Resolved — User accepted recommendation (2026-09-26).

### PF-007: `writeAuditLog({ userId: null })` does not typecheck 🟡 MINOR

**Dimension:** 6 — Feasibility / 12 — Consistency
**Location:** `01-requirements.md` R11; `03-01` acceptance sequence step 6
**Codebase Evidence:** `lib/audit-log.ts:21-23` (`userId?: string`; not `string | null`), `:59`
(`entry.userId ?? null`).
**The Problem:** Requirements say the `user.invited` audit has a "null `user_id`". The TypeScript
API accepts `undefined`, not `null`; an implementer following the wording literally hits a type
error.
**Recommendation:** State "omit `userId`" (the writer stores SQL NULL).
**Confidence:** High.
**User Decision:** Resolved — User accepted recommendation (2026-09-26).

### PF-008: Specification cases are double-assigned and misplaced by test level 🟡 MINOR

**Dimension:** 7 — Testability / 12 — Consistency
**Location:** `99-execution-plan.md` 1.1.3 vs 2.1.3 (ST-16–ST-24 in both) and 1.1.3 vs 2.3 (ST-25/26);
`07-testing-strategy.md` §Test Categories
**The Problem:** Several ST cases appear in more than one phase, and DB-dependent acceptance cases
(ST-16–ST-24) are assigned to a unit route spec file while 07 maps them to the integration file.
This risks duplicate/missing expectations and ambiguous ownership.
**Recommendation:** Assign each ST case to exactly one phase/file in both documents.
**Confidence:** High.
**User Decision:** Resolved — User accepted recommendation (2026-09-26).

### PF-009: `02-current-state.md` describes a design the plan abandoned 🟡 MINOR

**Dimension:** 13 — Codebase Alignment (Consistency)
**Location:** `02-current-state.md:30-31` vs `03-01-invitation-data-model.md:136-171`
**The Problem:** 02 says `users/service.ts` gains a "creation-from-invitation path (or extend
`createUser`)", but 03-01 puts the transaction in a new `users/invitation-service.ts` using
`insertUserWithClient`/`emailExistsWithClient`. The stale sentence will mislead an implementer.
**Recommendation:** Update 02 to match 03-01.
**Confidence:** High.
**User Decision:** Resolved — User accepted recommendation (2026-09-26).

### PF-010: New enumeration spec ignores the established security pattern 🟡 MINOR

**Dimension:** 12 — Consistency
**Codebase Evidence:** `packages/server/tests/unit/security/enumeration-resistance-contract.ts`,
`enumeration-resistance-adapter.ts`, `enumeration-resistance.spec.test.ts`
**The Problem:** The server already has a structured enumeration-resistance contract/driver suite. The
plan adds a standalone `invitation-enumeration.spec.test.ts` without relating it to that pattern.
For the narrow rejection-page equality it may be fine, but the divergence should be explicit.
**Recommendation:** Either extend the existing contract for invitation, or note in 07 why a standalone
route-level equality test is sufficient.
**Confidence:** Medium.
**User Decision:** Resolved — User accepted recommendation: keep the standalone spec and add the
rationale note (2026-09-26).

### PF-011: Gated release task is imprecise about the integration mechanism 🟡 MINOR

**Dimension:** 1 — Ambiguities
**Location:** `99-execution-plan.md:253` (7.1.1)
**The Problem:** "Integrate the feature branch into `develop` using the repository's git-commit skill in
push mode, then open the integration merge" mixes two operations; the git-commit skill commits and
pushes and does not perform merges, and the "designated flow" is not named. In a gated phase this
invites drift.
**Recommendation:** Split into explicit steps (push branch; open PR into `develop`; merge per repo
flow) and name the flow.
**Confidence:** Medium.
**User Decision:** Resolved — User accepted recommendation (2026-09-26).

---

## OBSERVATION

### PF-012: Pentest task names a directory, not an attack category/additions 🔵 OBSERVATION

**Dimension:** 4 — Completeness Gaps
**Codebase Evidence:** `packages/server/tests/pentest/` is organized into `admin-security/`,
`auth-bypass/`, `injection/`, `magic-link-attacks/`, `multi-tenant-attacks/`, etc.
**The Problem:** Task 5.1.2 ("Add invitation replay and single-use penetration coverage —
`packages/server/tests/pentest/`") does not say where the tests belong or what they assert.
**Recommendation:** Name a category (for example `auth-bypass` or a new `invitation-attacks/`) and the
assertions (replay, cross-tenant, email-conflict).
**User Decision:** Resolved — User accepted recommendation: `packages/server/tests/pentest/auth-bypass/` with replay, cross-tenant, and email-conflict assertions (2026-09-26).

### PF-013: Concurrent replace could hit the new partial unique index 🔵 OBSERVATION

**Dimension:** 9 — Edge Cases
**Codebase Evidence:** `invitation_tokens` new partial unique index in `03-01` migration; single-operator
Admin UI model in `AGENTS.md`.
**The Problem:** Two simultaneous invites for the same `(organization_id, email)` each mark live rows
used and insert; one hits the unique index. Under the documented single-operator Admin UI this is low
risk, but API/SDK callers could hit a raw conflict.
**Recommendation:** Document the intended outcome (map the unique violation to `409`/replace) or state
that single-operator usage makes it out of scope.
**User Decision:** Resolved — User accepted recommendation: map the unique violation to the invite replace conflict (`409`) and cover it with an implementation test (2026-09-26).

---

## Iteration 2 — Fix Verification and Bounded Re-scan

> **Previous iteration**: 13 findings (2 major, 7 minor, 2 observations, 2 resolved during review)
> **This iteration**: 0 new findings; 1 partial fix reopened and completed
> **Carried forward**: none

### Fix Verification

| Finding | Verified fix |
| --- | --- |
| PF-001 | `99` tasks 3.2.5–3.2.7 cover issuance, confirmation-aware presentation, and post-acceptance account discovery; `03-03` and `07` state the same contract |
| PF-002 | `03-02` §Email defines the optional recipient id and `userId`-free audit; `99` task 2.2.2 + test task 2.3.2 |
| PF-003/PF-004 | 7-day default retained everywhere; no executable 24h/`86400` remains |
| PF-005 | `03-01` phasing note; `99` 1.2.2 keeps the legacy API; `typecheck` added to 1.3.3 and 2.3.8; 2.3.7 removes legacy after the test migration |
| PF-006 | `agent.test.ts`, `email-service.test.ts`, `system-config-consumers.spec.test.ts` added to `07` and `99` tasks |
| PF-007 | R11 and `03-02` step 7 now say "omits `userId`" |
| PF-008 | Each ST case is assigned exactly once; ST-33 is explicitly owned by the existing suites |
| PF-009 | `02` changes table now points at `users/invitation-service.ts` |
| PF-010 | `07` records why the focused invitation spec does not use the `enumeration-resistance-*` driver |
| PF-011 | `99` Phase 7 split into push, pull request, green check, authorized `main` integration, authorized release, and artifact verification |
| PF-012 | `99` 5.1.2 names `packages/server/tests/pentest/auth-bypass/` with replay, cross-tenant, and email-conflict assertions |
| PF-013 | `03-01`/`03-02` map the concurrent unique violation to `409`; ST-34 and `99` 1.3.1/2.1.1/2.2.1 cover it |

### Regression Found and Corrected in This Iteration

| Item | Detail |
| --- | --- |
| PF-005 (reopened) | The first fix moved legacy removal into Step 2.2, before the existing tests that mock the removed API were migrated (`invitation.test.ts`, `users.test.ts`, `system-config-consumers.spec.test.ts`, `invitation-enhanced.test.ts`, `invitation-deleted-preassignments.spec.test.ts`). Corrected: removal is now task 2.3.7, after the test migration in 2.3.1–2.3.6. The bounded re-scan confirms no other regression. |

### Remaining 🟡/🔵

None. All 13 findings are resolved.

---

## Verdict (iteration 2)

✅ **PREFLIGHT PASSED** — all 13 findings resolved (2 MAJOR, 7 MINOR, 2 OBSERVATION, plus PF-003 and
PF-004 resolved during review). No CRITICAL security, data-loss, or tenant-isolation defect was
found: token hashing, single-use transactional consume, org-scoped authority, CSRF, and
enumeration-safe rejections remain correctly specified.

Plan state: 68 tasks across 7 phases; every phase gate includes tests and (Phases 1–3) typecheck;
spec-first ordering preserved; 7-day TTL retained; migration 033 is schema-only.

The roadmap row advances to `Plan Preflighted` (🔬). A pass is bound to content hash
`17ba89d57d5256c46dea38d4a285aa6872166fd0e8055afceff3f8b5a155275e`; any later edit to the plan
invalidates it and requires a targeted re-check of the changed sections.
