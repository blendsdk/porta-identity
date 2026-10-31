# Execution Plan: Tenant Invitation Revocation

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Implements**: user-invitations/T-03
> **Last Updated**: 2026-10-31 21:42
> **Progress**: 30/30 tasks (100%)
> **CodeOps Artifact Schema**: 1

## Implementation Phases

| Phase | Title | Tasks |
| --- | --- | --- |
| 1 | Ownership and tenant revocation | 17 |
| 2 | SDK, documentation and final evidence | 13 |

Total: 30 tasks. Phase 2 follows verified Phase 1. Original goal and minimum design: 00-index; authoritative behavior: 03-01/03-02; immutable outcomes: 07.

> **Execution rule:** This checklist is the sole task-progress authority. Each task occurs once. Mark implemented tasks `[~]` with an actual timestamp, then `[x]` only after its stated verification passes; update Progress and Last Updated immediately after each task. Resume the first `[~]`, otherwise first `[ ]`. On blocker use `[!]` and a concrete same-line reason. Dates come from `date '+%Y-%m-%d %H:%M'`. Do not weaken failing specification/security assertions. Commit/push through git-commit skill per confirmed auto-commit mode; no merge/release.

**Approved commit-deferral window (PF-003):** The user explicitly approved leaving specification/red work uncommitted until the corresponding implementation is green. Intended-red verification means observing and recording the specific expected failures; it can verify a specification task but never authorizes a failed-product commit. Keep specification and implementation tasks separate. Resume auto-commit/push only after the affected specs and required workspace/structure checks pass. Unexpected failures still block; no security assertion is waived.

## Phase 1: Ownership and tenant revocation

> **Phase baseline tree**: fb801cfd2c5b26808e5b532c4cab9f57545c8a8d
> **Lenses**: api-surface, concurrency; dedicated security audit: owasp-web, auth-protocol, tenant-isolation
> **Reasoning**: high — tenant authorization, migration and acceptance races

Scope: strict. Expected modifications are Phase 1's named server source/test/migration paths, directly related invite fixtures, exact structure inventory and these task/evidence documents. No unrelated working changes existed at phase start. Runner paths explicitly approved for #196: repository .npmrc/root .env/server .env (runner reads only), synthetic installer env under the session's invitation-revocation-tests tree, and credentials/TLS/profiles/metadata under /tmp/opencode/porta-ir-20261030 and test-harness/.assurance-runtime; reports under .assurance-results. Never expose or commit their contents.

### Session 1.1 — Specification tests and red

- [x] 1.1.1 [spec-author] Write migration specifications ST-1–2 — `tests/integration/migrations/036-invitation-application-owner.spec.test.ts` per 03-01. ✅ (completed: 2026-10-30 13:12; independent author; both intended failures are missing migration036; commit deferred)
- [x] 1.1.2 [spec-author] Write service/persistence specifications ST-3–4, ST-8–13, ST-17 — `tests/integration/services/invitation-revocation.spec.test.ts` per 03-01. ✅ (completed: 2026-10-30 13:12; independent author; expected red is missing service module; commit deferred)
- [x] 1.1.3 [spec-author] Write real concurrency specifications ST-14–16 — `tests/integration/services/invitation-revocation.concurrency.spec.test.ts` per 03-01. ✅ (completed: 2026-10-30 13:12; independent author; expected red is missing service module; commit deferred)
- [x] 1.1.4 [spec-author] Write endpoint/security specifications ST-5–11, ST-18–19, ST-23 — `tests/pentest/admin-security/tenant-invitation-revocation.spec.test.ts` per 03-02. ✅ (completed: 2026-10-30 13:08; 23 independently authored cases; expected red is missing new tenant-invitations module, with existing DB/setup successful; commit deferred per PF-003)
- [x] 1.1.5 Verify red for new migration/service/route and record each intended failure before production changes; run `pnpm test:changed` first. ✅ (completed: 2026-10-30 13:12; initial changed selection passed157 structure with no selected units; baseline28 invitation units passed; intended missing migration/service/router failures recorded before production changes)

### Session 1.2 — Implementation and green

- [x] 1.2.1 Add migration 036 and parameterized ownership insert input — `migrations/036_invitation_application_owner.sql`, `src/auth/token-repository.ts` (AR #2/#7); verify migration cases. ✅ (completed: 2026-10-30 13:15; both upgrade/downgrade and SET NULL preservation specifications pass; commit deferred until affected specifications are green)
- [x] 1.2.2 Pass authenticated ownership on invitation creation — `src/users/invite-service.ts` (AR #2); verify ST-3. ✅ (completed: 2026-10-30 13:15; ownership without roles and caller spoof hints proven by independent specification; all12 persistence cases pass; commit deferred)
- [x] 1.2.3 Implement scoped atomic revocation/audit — `src/users/invitation-revocation-service.ts` (03-01); verify service specifications. ✅ (completed: 2026-10-30 13:15; all12 persistence specifications pass including actual audit rollback/acceptance, foreign/null/history no-ops and actor privacy; commit deferred)
- [x] 1.2.4 Implement tenant DELETE route — `src/routes/tenant-invitations.ts` (03-02); verify endpoint/security specifications. ✅ (completed: 2026-10-30 21:50; all23 security cases pass after explicitly approved fixture-only corrections; every assertion and timeout unchanged)
- [x] 1.2.5 Mount tenant route — `src/server.ts` (03-02); verify no admin-prefix authority and route wiring. ✅ (completed: 2026-10-30 21:50; server typecheck and configured full application HTTP mount check pass; missing provider fails closed, no new admin route; initial ad-hoc startup lacked SMTP fixture configuration and did not reach assertions)
- [x] 1.2.6 Verify new specifications green, including real race/rollback cases ST-12–17; preserve immutable assertions. ✅ (completed: 2026-10-30 21:50; all20 migration/persistence/concurrency and23 security cases pass, every assertion/timeout retained after AR #10 fixture correction; no broad production refactor)

### Session 1.3 — Implementation tests, hardening and review

- [x] 1.3.1 Add internal failure/empty-result tests — `tests/unit/users/invitation-revocation.impl.test.ts`; verify transaction handling per 03-01. ✅ (completed: 2026-10-30 21:56; all4 parameterization/no-op/storage/audit client error cases pass; real rollback remains covered by integration specifications)
- [x] 1.3.2 Add focused route-wiring/error tests — `tests/unit/routes/tenant-invitations.impl.test.ts`; verify per 03-02. ✅ (completed: 2026-10-30 21:56; all3 real router/full HTTP application cases pass; ephemeral listener closed)
- [x] 1.3.3 Run affected invitation/acceptance/localization and migration regressions; reconcile actual exact inventories in `repo-tests/monorepo/server-package.spec.test.mjs` (PF-001), never weaken oracle expectations. ✅ (completed: 2026-10-30 21:56; affected452 unit/157 structure and52 invitation integration cases passed; actual385/55 inventory, exact assertions retained)
- [x] 1.3.4 Run server lint/typecheck/build, `pnpm test:structure` and `pnpm test:pentest`; record outcomes. ✅ (completed: 2026-10-30 22:09; server lint/typecheck/build,157 structure,330 pentest across47 files passed; outer120s interrupted attempt retained as incomplete, unchanged background invocation completed exit0)
- [x] 1.3.5 Complete independent correctness/concurrency/API review and dedicated security audit; resolve critical/major findings by authorized ruling before proceeding. ✅ (completed: 2026-10-30 22:05; both independent reviewers reported no findings; sessions/evidence in00-phase1-quality-review; remaining pentest gate still pending)
- [x] 1.3.6 Record Phase 1 results, cleanup owned local resources and checkpoint using git-commit skill in push mode after verification. ✅ (completed: 2026-10-30 22:13; reviews,330 pentest and affected gates recorded; owned resources removed; incremental techdocs/links and final157 structure contracts passed; green checkpoint authorized)

Deliverables: ownership storage, scoped mutation/API and ST-1–19/ST-23; independently reviewed, without unrelated auth or replacement changes.
**Verify:** Focused selectors in 07; server checks, `pnpm test:structure`, `pnpm test:pentest`. Full verify deferred to CI (AR #4).

## Phase 2: SDK, documentation and final evidence

> **Phase baseline tree**: 9f3b7ab4a17da99f00ec034b2e8c0ecc919b1c20
> **Lenses**: api-surface, concurrency; security profiles as Phase 1
> **Reasoning**: high — public SDK contract and security evidence provenance

Phase1 checkpoint2423b938 is pushed and clean. Scope remains strict: named SDK/test/docs changes, approved exact CLI/type/inventory fixtures, final assurance/compatibility/CI and owned cleanup. Baseline backend source is frozen unless an actual regression or authorized review ruling requires correction. Phase2 starts with new specification authors before SDK implementation; AR #10 approved backend fixture changes remain unchanged.

### Session 2.1 — Specification tests and red

- [x] 2.1.1 [spec-author] Write SDK runtime/type specifications ST-20–22 — `tests/domains/invitation-revocation.spec.test.ts`, `tests/type-contracts/invitation-revocation.spec.test.ts`; register the latter in existing `tests/type-contracts/tsconfig.json` (PF-002), per 03-02. ✅ (completed: 2026-10-30 22:24; independent author; intended red is ten missing-method failures plus compiler missing input/method exports; commit deferred)
- [x] 2.1.2 [spec-author] Write real-token E2E ST-24 — `server/tests/e2e/api/tenant-invitation-revocation.spec.test.ts` using existing helpers, no new runner. ✅ (completed: 2026-10-30 22:24; AR #11 approved content-type fixture correction only; after it, real token/invite/email succeeded and failure moved to the missing SDK method; commit deferred)
- [x] 2.1.3 Verify SDK runtime/type and actual SDK-invoking E2E ST-24 red before the SDK method exists (PF-005); record intended failures without committing them (PF-003). ✅ (completed: 2026-10-30 22:24; all three intended reds recorded; E2E credential diagnostics deliberately sanitized, no assertion/timeout change)

### Session 2.2 — Implementation and green

- [x] 2.2.1 Add SDK input type/export and domain method — `sdk/src/types/users.ts`, `sdk/src/types/index.ts`, `sdk/src/domains/users.ts` (03-02); add compatibility-only method stub in `cli/tests/admin/session-wiring.impl.test.ts` (PF-006); verify ST-20–22. ✅ (completed: 2026-10-31 20:25; SDK runtime10/10, compiler typecheck, lint and exact CLI fixture7/7 pass; inventory reconciled to386 server/57 SDK)
- [x] 2.2.2 Verify SDK and real-token E2E specifications green, with client-attributed audit and no recipient account. ✅ (completed: 2026-10-31 20:25; real client-credentials→invite→email→actual SDK revoke→generic GET/CSRF-valid POST rejection, zero accounts, exact client audit metadata; no credential leakage)
- [x] 2.2.3 Document API/SDK consumer flow — `docs/api/users.md`, `docs/guide/sdk-node.md`, `packages/sdk/README.md` (03-02). ✅ (completed: 2026-10-31 20:26; exact authority, idempotent empty204, unowned/admin limitation, acceptance, audit, no-notification, strict limit, error and tenant-prefix guidance added)
- [x] 2.2.4 Update maintainer security/data-model and existing migration guidance (03-01 rollout); verify links and `pnpm docs:build`. ✅ (completed: 2026-10-31 20:26; API/security/data-model and SDK method reconciled; changed links verified; docs build complete)

### Session 2.3 — Hardening, reviews and publication

- [x] 2.3.1 Add any SDK internal error-path `.impl.test.ts` cases not already covered; reconcile actual exact inventories (PF-001), run affected SDK/server checks and `pnpm test:changed`/structure. ✅ (completed: 2026-10-31 20:28; runtime spec already covers error propagation, encoding, no-retry and prefix, so no redundant impl file; inventory386/57; affected452unit/157structure/108+7SDK-CLI and SDK verify604 pass)
- [x] 2.3.2 Run applicable invitation UI regression category, pentest and docs gates; record exact outputs. ✅ (completed: 2026-10-31 20:28; invitation UI11/11, complete pentest330/330 across47 files and docs build passed; pentest rerun on the fixed SDK also330/330)
- [x] 2.3.3 Complete independent phase/API correctness review and security audit; resolve findings with authorized rulings and keep review evidence. ✅ (completed: 2026-10-31 20:59; two minor review fixes; critical SDK dot-segment finding fixed under AR #12 and focused re-review CLEAN; evidence in00-phase2-quality-review)
- [x] 2.3.4 Create clean committed checkpoint via git-commit skill; run registered production-security harness and tenant-admin compatibility, record commit/tree/run/exit and owned cleanup; block on security failure. ✅ (completed: 2026-10-31 21:34; clean checkpoint a7598e3c; production-security run1908ceb0 exit0 with7/7 and exposure11/11 zero failures; tenant-admin compat runaa6bbc5c exit0; owned runner reports removed; no task-owned containers/networks/volumes remain)
- [x] 2.3.5 Push feature via git-commit skill in push mode and confirm CI full `pnpm verify` plus all separate branch jobs on exact published revision. ✅ (completed: 2026-10-31 21:42; [run41239591455](https://github.com/blendsdk/porta-identity/actions/runs/41239591455) passed all6 jobs on5eaa70d9: server unit4174/integration560/E2E134/pentest330, SDK609, CLI1474, UI135, OIDC6, docs/Docker/audit)
- [x] 2.3.6 Record final T-03 tracking/cleanup/evidence and completion checkpoint after substantive docs reconciliation; confirm CI on that final pushed HEAD (PF-007). No sibling tracking edits, merge or release. ✅ (completed: 2026-10-31 21:42; completion record binds product checkpointa7598e3c and CI-verified5eaa70d9; dated test-inventory snapshot predates the feature and was intentionally not rewritten; owned resources/reports removed; evidence-only head CI reported to user)

Deliverables: SDK operation, docs, real-token proof and current registered assurance/compatibility/CI evidence.
**Verify:** SDK checks, focused E2E, `pnpm test:ui`, `pnpm test:pentest`, `pnpm docs:build`, structure and registered commands from 07. CI full verification required.
