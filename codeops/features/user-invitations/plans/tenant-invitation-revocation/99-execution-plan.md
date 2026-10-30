# Execution Plan: Tenant Invitation Revocation

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Implements**: user-invitations/T-03
> **Last Updated**: 2026-10-30 12:25
> **Progress**: 0/30 tasks (0%)
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

> **Phase baseline tree**: recorded by exec-plan before implementation
> **Lenses**: api-surface, concurrency; dedicated security audit: owasp-web, auth-protocol, tenant-isolation
> **Reasoning**: high — tenant authorization, migration and acceptance races

### Session 1.1 — Specification tests and red

- [ ] 1.1.1 [spec-author] Write migration specifications ST-1–2 — `tests/integration/migrations/036-invitation-application-owner.spec.test.ts` per 03-01.
- [ ] 1.1.2 [spec-author] Write service/persistence specifications ST-3–4, ST-8–13, ST-17 — `tests/integration/services/invitation-revocation.spec.test.ts` per 03-01.
- [ ] 1.1.3 [spec-author] Write real concurrency specifications ST-14–16 — `tests/integration/services/invitation-revocation.concurrency.spec.test.ts` per 03-01.
- [ ] 1.1.4 [spec-author] Write endpoint/security specifications ST-5–11, ST-18–19, ST-23 — `tests/pentest/admin-security/tenant-invitation-revocation.spec.test.ts` per 03-02.
- [ ] 1.1.5 Verify red for new migration/service/route and record each intended failure before production changes; run `pnpm test:changed` first.

### Session 1.2 — Implementation and green

- [ ] 1.2.1 Add migration 036 and parameterized ownership insert input — `migrations/036_invitation_application_owner.sql`, `src/auth/token-repository.ts` (AR #2/#7); verify migration cases.
- [ ] 1.2.2 Pass authenticated ownership on invitation creation — `src/users/invite-service.ts` (AR #2); verify ST-3.
- [ ] 1.2.3 Implement scoped atomic revocation/audit — `src/users/invitation-revocation-service.ts` (03-01); verify service specifications.
- [ ] 1.2.4 Implement tenant DELETE route — `src/routes/tenant-invitations.ts` (03-02); verify endpoint/security specifications.
- [ ] 1.2.5 Mount tenant route — `src/server.ts` (03-02); verify no admin-prefix authority and route wiring.
- [ ] 1.2.6 Verify new specifications green, including real race/rollback cases ST-12–17; preserve immutable assertions.

### Session 1.3 — Implementation tests, hardening and review

- [ ] 1.3.1 Add internal failure/empty-result tests — `tests/unit/users/invitation-revocation.impl.test.ts`; verify transaction handling per 03-01.
- [ ] 1.3.2 Add focused route-wiring/error tests — `tests/unit/routes/tenant-invitations.impl.test.ts`; verify per 03-02.
- [ ] 1.3.3 Run affected invitation/acceptance/localization and migration regressions; reconcile actual exact inventories in `repo-tests/monorepo/server-package.spec.test.mjs` (PF-001), never weaken oracle expectations.
- [ ] 1.3.4 Run server lint/typecheck/build, `pnpm test:structure` and `pnpm test:pentest`; record outcomes.
- [ ] 1.3.5 Complete independent correctness/concurrency/API review and dedicated security audit; resolve critical/major findings by authorized ruling before proceeding.
- [ ] 1.3.6 Record Phase 1 results, cleanup owned local resources and checkpoint using git-commit skill in push mode after verification.

Deliverables: ownership storage, scoped mutation/API and ST-1–19/ST-23; independently reviewed, without unrelated auth or replacement changes.
**Verify:** Focused selectors in 07; server checks, `pnpm test:structure`, `pnpm test:pentest`. Full verify deferred to CI (AR #4).

## Phase 2: SDK, documentation and final evidence

> **Phase baseline tree**: recorded by exec-plan before Phase 2
> **Lenses**: api-surface, concurrency; security profiles as Phase 1
> **Reasoning**: high — public SDK contract and security evidence provenance

### Session 2.1 — Specification tests and red

- [ ] 2.1.1 [spec-author] Write SDK runtime/type specifications ST-20–22 — `tests/domains/invitation-revocation.spec.test.ts`, `tests/type-contracts/invitation-revocation.spec.test.ts`; register the latter in existing `tests/type-contracts/tsconfig.json` (PF-002), per 03-02.
- [ ] 2.1.2 [spec-author] Write real-token E2E ST-24 — `server/tests/e2e/api/tenant-invitation-revocation.spec.test.ts` using existing helpers, no new runner.
- [ ] 2.1.3 Verify SDK runtime/type and actual SDK-invoking E2E ST-24 red before the SDK method exists (PF-005); record intended failures without committing them (PF-003).

### Session 2.2 — Implementation and green

- [ ] 2.2.1 Add SDK input type/export and domain method — `sdk/src/types/users.ts`, `sdk/src/types/index.ts`, `sdk/src/domains/users.ts` (03-02); add compatibility-only method stub in `cli/tests/admin/session-wiring.impl.test.ts` (PF-006); verify ST-20–22.
- [ ] 2.2.2 Verify SDK and real-token E2E specifications green, with client-attributed audit and no recipient account.
- [ ] 2.2.3 Document API/SDK consumer flow — `docs/api/users.md`, `docs/guide/sdk-node.md`, `packages/sdk/README.md` (03-02).
- [ ] 2.2.4 Update maintainer security/data-model and existing migration guidance (03-01 rollout); verify links and `pnpm docs:build`.

### Session 2.3 — Hardening, reviews and publication

- [ ] 2.3.1 Add any SDK internal error-path `.impl.test.ts` cases not already covered; reconcile actual exact inventories (PF-001), run affected SDK/server checks and `pnpm test:changed`/structure.
- [ ] 2.3.2 Run applicable invitation UI regression category, pentest and docs gates; record exact outputs.
- [ ] 2.3.3 Complete independent phase/API correctness review and security audit; resolve findings with authorized rulings and keep review evidence.
- [ ] 2.3.4 Create clean committed checkpoint via git-commit skill; run registered production-security harness and tenant-admin compatibility, record commit/tree/run/exit and owned cleanup; block on security failure.
- [ ] 2.3.5 Push feature via git-commit skill in push mode and confirm CI full `pnpm verify` plus all separate branch jobs on exact published revision.
- [ ] 2.3.6 Record final T-03 tracking/cleanup/evidence and completion checkpoint after substantive docs reconciliation; confirm CI on that final pushed HEAD (PF-007). No sibling tracking edits, merge or release.

Deliverables: SDK operation, docs, real-token proof and current registered assurance/compatibility/CI evidence.
**Verify:** SDK checks, focused E2E, `pnpm test:ui`, `pnpm test:pentest`, `pnpm docs:build`, structure and registered commands from 07. CI full verification required.
