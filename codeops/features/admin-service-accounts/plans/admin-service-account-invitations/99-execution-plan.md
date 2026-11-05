# Execution Plan: Admin Service-Account Invitations

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-11-05 12:25
> **Progress**: 11/65 tasks (17%)
> **CodeOps Artifact Schema**: 1

## Execution contract

This checklist alone owns task progress. Mark a finished implementation `[~]` immediately, verify,
then promote to `[x]` with actual timestamps and derive the progress header. Resume `[~]` first.
Blocked tasks use `[!]` and `Blocked: reason`; never mark a failing gate complete or advance a
sibling. Use the git-commit skill in push mode under the user's auto-commit selection; no failing
workspace is staged merely to satisfy cadence (07). Auto-design root bundle-c-20261104 remains
bounded by the approved decisions. Strict scope: no optional additions.

Each phase records a complete phase-start tree before its first task and names its expected
modification set. Independent specification authors receive source-free oracle packets. Correctness
and security reviews run after the phase's verified implementation; critical/major findings require
an authorized resolution and scoped re-review. Documentation-only reviews may omit the security
auditor with that omission recorded. No merged/released claim follows feature-branch commits.

## Phases

| Phase | Deliverable                                                             | Dependency        |
| ----- | ----------------------------------------------------------------------- | ----------------- |
| 1     | Additive schema, strict policy and authoritative persistence primitives | Approved register |
| 2     | Permanent account classification and complete lifecycle guards          | Phase1            |
| 3     | Native token bridge and exact invitation/management routes              | Phase2            |
| 4     | SDK/CLI, documentation and final direct/packed/production/CI evidence   | Phase3            |

Every phase has the three sessions: specification tests/red → implementation/green → implementation
tests/hardening/verification. Target file prefixes are packages/server/src unless otherwise stated.
Verify selections and evidence requirements are owned by07, not copied into every task.

## Phase 1: Policy and storage

> **Phase baseline tree**: 214d2a56df66af8413814e165d79497b98a4d1a3
> **Lenses**: security, concurrency, api-surface
> **Reasoning**: max — permanent identity classification, migration and authority data

**Reference:**03-01; ST-1–7/9–12; AR-15/16/18/20; PF-001.
**Modification set:** migration037; service-accounts types/errors/policy/repository/index; focused
unit/integration/implementation tests; actual repository test inventories; this plan/evidence and
feature roadmap. No public route is mounted.

**Baseline evidence:** Clean worktree at planning checkpoint d2a1c11f; the complete HEAD tree above
is identical to the complete non-ignored worktree. Use that existing tree without rehashing protected
tracked fixtures through the generic snapshot helper's blanket add. No original operator files are
read. Scope mode: strict. All implementation tasks remain not started until their oracle/red gate.

### Session 1.1 — Specifications before code

- [x] 1.1.1 [spec-author] Write immutable parser/allowlist specification — server tests/unit/service-accounts/policy*.spec.test.ts; ST-1–7, without live-reference or durable-replacement claims. ✅ (completed: 2026-11-04 23:00; independent source-restricted author, lint/doc checks passed; three suites observed expected missing-entry red, no individual assertions executed yet; oracle identities sealed; commit waits for coherent green workspace)
- [x] 1.1.2 [spec-author] Write immutable schema/ownership/downgrade specification — server tests/integration/service-accounts/schema*.spec.test.ts; ST-9–12. ✅ (completed: 2026-11-04 23:10; three source-restricted oracles lint/docs passed; real owned PostgreSQL red observed: three failed suites,20 failed tests; missing feature flag/table/reader and guarded absent037; assertions unchanged and identities sealed)
- [x] 1.1.3 Observe and record intended red for both oracle groups without changing expectations. ✅ (completed: 2026-11-04 23:10; combined6-suite red confirms absent planned boundaries on owned PostgreSQL/Redis; all six sealed oracle hashes unchanged; no preimplementation runtime pass claimed)

### Session 1.2 — Implementation and green

- [x] 1.2.1 Add migration037 with permanent internal classification, binding constraints and safe downgrade refusal — migrations/037_service_account_invitations.sql. ✅ (requalified: 2026-11-05 11:55; old SQL reproduced both committed-writer losses and higher-isolation unsafe success; corrected transaction-held binding→users fence and isolation refusal pass274 selected assertions with unchanged immutable oracles; scoped security re-review still blocks phase completion)
- [x] 1.2.2 Define documented feature types, fixed domain errors and public entry — service-accounts/types.ts, errors.ts, index.ts. ✅ (completed: 2026-11-05 11:14; focused lint, server typecheck/build and documentation check pass; public projection excludes stored authorization version)
- [x] 1.2.3 Implement strict bounded target/input/assignment validation — service-accounts/policy.ts. ✅ (completed: 2026-11-05 11:17;236 policy assertions across3 sealed independent suites pass; lint/typecheck/build/docs pass; no oracle expectation changed)
- [x] 1.2.4 Add authoritative binding reads and stable lock primitives — service-accounts/repository.ts. ✅ (completed: 2026-11-05 11:20; all261 assertions across6 policy/schema/reader/migration suites pass; fixed corrupt-storage denial, ownerless reads and transaction visibility verified; lint/typecheck/build/docs pass; lock races remain explicit implementation-test work)
- [x] 1.2.5 Verify policy/schema oracles green, actual test inventories and affected workspace checks. ✅ (completed: 2026-11-05 11:20; pnpm test:changed passes structure158 and236 affected policy assertions; server lint/typecheck/build pass; combined261 independent unit/integration assertions green; physical inventory392 preserves all386 old files)

### Session 1.3 — Hardening and checkpoint

- [x] 1.3.1 Add implementation tests for corrupt storage/error paths and migration rollback — focused *.impl.test.ts files. ✅ (completed: 2026-11-05 11:33;10 real PostgreSQL implementation cases plus261 immutable assertions pass; feature coverage96.55% statements/94.44% branches/100% functions/97.4% lines; repository alone90% statements/89.65% branches/92.3% lines; structure158 and server lint/typecheck/build pass; physical inventory394)
- [x] 1.3.2 Run phase verification and independent correctness/security/migration review; resolve findings under the active policy. ✅ (completed: 2026-11-05 12:11; correctness/concurrency/API partition no findings; security Major SA-1-001 reproduced/fixed under challenged AR-23 and independently closed in the one scoped re-review at b67f25fb;274 selected assertions,4,417 server unit assertions, structure158, server lint/typecheck/build pass; fix-run runtime resources removed and exact Docker baseline restored)
- [x] 1.3.3 Record qualified phase evidence, incremental technical-doc impact and verified feature checkpoint. ✅ (completed: 2026-11-05 12:25; independent code/security review qualified, SA-1-001 closed at b67f25fb; maintainer data model/ADR-018 local links, Mermaid parser and docs build pass; final structure158 pass; all Phase1 runtime services and56 completed temporary files removed, ongoing-feature verification worktree/dependencies explicitly retained; no whole-feature acceptance implied)

**Verify:**07 Phase1 selections, server lint/typecheck/build, structure and migration up/down on an
owned scratch database. Public feature remains inaccessible. Review before Phase2.

## Phase 2: Noninteractive owned accounts and lifecycle

> **Phase baseline tree**: record at phase entry
> **Lenses**: security, concurrency, api-surface
> **Reasoning**: max — shared login/recovery and credential-promotion boundaries

**Reference:**03-02; ST-8/13–28/55/56/61/64–66; AR-15/18/19/20; PF-001/003/008/009.
**Modification set:** service-accounts writes/service; users authoritative guards; focused
auth/recovery/token-consumption/password/OIDC account guards; RBAC guards and fresh init; client
mutation/secret guards; lib/bulk-operations.ts classified-user denial predicates; focused tests,
actual inventories, evidence/docs. No unrelated refactor.

### Session 2.1 — Specifications before code

- [ ] 2.1.1 [spec-author] Write lifecycle/live-reference/rollback/secret-promotion and owner-deletion oracles — focused server service-accounts specs; ST-8/13–18/25/27/28/61/65/66. ST-25 proves version invariants only; usable-token outcomes belong to Phase3 ST-62.
- [ ] 2.1.2 [spec-author] Write human authentication/recovery/artifact, generic-role and mixed bulk-mutation denial oracles — ST-19–24/26/55/56/64.
- [ ] 2.1.3 Observe and record intended red for lifecycle and human-boundary specifications.

### Session 2.2 — Implementation and green

- [ ] 2.2.1 Implement atomic provisioning and credential retirement SQL — service-accounts/writes.ts.
- [ ] 2.2.2 Implement validated read/set/revoke/restore orchestration and audit — service-accounts/service.ts and index.ts.
- [ ] 2.2.3 Add authoritative permanent-account lookup/guard without changing ordinary public User projections — users/repository.ts, service.ts, index.ts.
- [ ] 2.2.4 Seed the reserved canonical role consistently and isolate generic role membership — cli/commands/init.ts, lib/admin-permissions.ts, rbac/user-role-service.ts.
- [ ] 2.2.5 Guard bound-client secret generation/revocation and version invalidation under parent locking — clients/secret-service.ts and feature mutation helper.
- [ ] 2.2.6 Guard bound-client configuration/status/delete operations and atomic eligibility-loss revocation; repair does not restore binding authority — clients/service.ts and focused mutation helper; ST-66.
- [ ] 2.2.7 Deny service accounts in password verification and ordinary OIDC account finding — focused auth/account-finder integrations.
- [ ] 2.2.8 Deny service accounts in queued recovery and magic/reset issuance — focused auth recovery integrations.
- [ ] 2.2.9 Guard existing recovery-token consumption and password-setting persistence — auth/token-repository.ts and users/service.ts.
- [ ] 2.2.10 Guard generic service-user profile/lifecycle/credential changes — focused users integrations.
- [ ] 2.2.11 Preserve non-restorable ownerless binding marker during physical account deletion and refuse marker-erasing downgrade — users deletion integration and feature repository; ST-65.
- [ ] 2.2.12 Isolate the reserved service role from human Admin-token authority — middleware/admin-auth.ts; ST-24.
- [ ] 2.2.13 Exclude classified users from both bulk status lock/update SQL while preserving concealed denials and ordinary partial results — lib/bulk-operations.ts; ST-64.
- [ ] 2.2.14 Verify all phase oracles green and preserve ordinary client/user regression behavior; do not claim actual machine-token outcomes before Phase3.

### Session 2.3 — Hardening and checkpoint

- [ ] 2.3.1 Add implementation tests for guard failures, locks, audit rollback and concurrent promotion/credential mutations.
- [ ] 2.3.2 Run relevant unit/integration/E2E/pentest and affected workspace/structure checks; no security assertion waiver.
- [ ] 2.3.3 Run independent correctness/security/concurrency phase review and one scoped re-review for major fixes.
- [ ] 2.3.4 Update incremental technical docs, record qualified human-boundary assurance and verified source checkpoint.

**Verify:**07 Phase2 selections plus mandatory security/browser gates where affected. Public feature
routes still remain unmounted until the next phase's complete authentication path is ready.

## Phase 3: Native machine invitation and management routes

> **Phase baseline tree**: record at phase entry
> **Lenses**: security, concurrency, api-surface
> **Reasoning**: max — native OAuth, tenant isolation, revocation and durable side effects

**Reference:**03-03/03-04 server contract; ST-29–46/62/63/67; AR-15/16/18/19; PF-006/007.
**Modification set:** focused service-accounts native-token/authorization/limiter code; provider
configuration; Admin provider/middleware opt-in; extracted real invitation router and management
subresource; middleware/client-secret-hash.ts proof handoff; middleware/admin-mutation-audit.ts
outer actor/commit ownership; server registration; invitation audit/result finalization;
focused tests/inventories/evidence/docs.

### Session 3.1 — Specifications before code

- [ ] 3.1.1 [spec-author] Write real native-token/issuer/metadata/lifetime, usable-token rotation/revocation and modern/legacy credential-proof barrier oracles — ST-29–32/36/37/43/45/62/63; preserve ordinary-client handoff tests.
- [ ] 3.1.2 [spec-author] Write invitation/allowlist/counter/audit/transaction-ordering oracles through the full createApp envelope, including final-audit rollback and truthful post-commit delivery — ST-33–42/44/67.
- [ ] 3.1.3 [spec-author] Write exact management-route response/error/ownership oracles — ST-46 and relevant ST-13–18.
- [ ] 3.1.4 Observe intended red against existing native/Admin boundaries and preserve oracle independence.

### Session 3.2 — Implementation and green

- [ ] 3.2.1 Preserve exact proven modern/legacy secret ID in raw-request-keyed trusted state and revalidate ownership/status/expiry under parent lock at feature issuance — middleware/client-secret-hash.ts and service-accounts/credential-proof.ts; ST-63.
- [ ] 3.2.2 Implement native extra metadata and bounded TTL/issuer integration without widening ordinary token behavior — service-accounts/tokens.ts and oidc/configuration.ts.
- [ ] 3.2.3 Implement typed native machine identity lookup and explicit invitation-only Admin middleware opt-in — focused service-accounts auth and middleware/admin-auth.ts.
- [ ] 3.2.4 Implement authoritative transaction-bound allowlist/version/account/role checks — service-accounts/authorization.ts.
- [ ] 3.2.5 Implement strict client-wide invitation limiting and complete finite/native-encoding validation — focused service-accounts limiter/input helpers.
- [ ] 3.2.6 Extract/register the real invitation POST with dedicated opt-in while preserving human behavior and denying preview/other routes — routes/admin-invitations.ts, routes/users.ts, server.ts.
- [ ] 3.2.7 Add trusted exact-operation machine audit attribution to the retained outer transaction owner and finalize delivery results after its actual commit/SMTP effects — middleware/admin-mutation-audit.ts and focused invitation result integration; ST-67.
- [ ] 3.2.8 Add machine/account/binding attribution through existing invitation/audit contracts — users/invite-service.ts and lib/audit-log.ts.
- [ ] 3.2.9 Add human Super Admin-only binding subresource and fixed error handling — routes/client-service-account.ts and routes/clients.ts.
- [ ] 3.2.10 Verify all phase oracles green and retain exact token classes, tenant boundaries, credential-proof retirement and outer-commit delivery semantics.

### Session 3.3 — Hardening and checkpoint

- [ ] 3.3.1 Add implementation error/corrupt-metadata/lock/counter tests and verify real overlapping commit/revocation cases.
- [ ] 3.3.2 Run affected checks, full applicable pentest and production-security/protocol selections from clean source; record direct versus adjunct evidence.
- [ ] 3.3.3 Run independent correctness/security/concurrency review and required scoped fixes/re-review.
- [ ] 3.3.4 Update incremental architecture docs and record the verified native/Admin source checkpoint and cleanup.

**Verify:**07 Phase3 selections and mandatory assurance gates. Do not credit the model diagnostic
or ordinary packed journey as direct proof of new machine invitation authority.

## Phase 4: SDK, CLI and completion qualification

> **Phase baseline tree**: record at phase entry
> **Lenses**: security, api-surface, concurrency
> **Reasoning**: max — public compatibility, complete package provenance and final acceptance

**Reference:**03-04; ST-47–60; AR-16/19/20.
**Modification set:** SDK client-service-account types/guards/methods/barrels; conventional CLI
focused command/parser/reader registration; focused SDK/CLI specs/implementation tests; actual
inventories; public/technical docs; registered existing assurance extensions only where required;
this feature roadmap/evidence. Portfolio remains deferred; no release/merge/issue mutations.

### Session 4.1 — Specifications before code

- [ ] 4.1.1 [spec-author] Write SDK exact request/response/traversal/type contract oracles — ST-47/48/54.
- [ ] 4.1.2 [spec-author] Write CLI input/output/authentication/error/compatibility oracles — ST-49–54/59.
- [ ] 4.1.3 [spec-author] Write the direct packed machine journey/evidence oracle before its driver — test-harness/assurance/tests/service-account-packed.spec.test.ts; ST-57 and03-04, independently observing durable invitation and post-revocation denial.
- [ ] 4.1.4 Observe intended red without changing existing SDK/CLI behavior or frozen expectations.

### Session 4.2 — Implementation and green

- [ ] 4.2.1 Add SDK public binding/input types and exports — sdk/src/types/client-service-accounts.ts and barrels.
- [ ] 4.2.2 Add guarded client get/set/revoke methods and safe path handling — sdk/src/domains/clients.ts and focused helper.
- [ ] 4.2.3 Add bounded UTF-8 policy input/pre-client validation — focused CLI service-account input module.
- [ ] 4.2.4 Add direct conventional CLI get/set/revoke, safe JSON/human output and client registration — cli/src/commands/client-service-account.ts and client.ts.
- [ ] 4.2.5 Deliver the focused packed SDK machine journey and evidence collector/validator within the existing compatibility selector, preserving credential-isolation evidence and cleanup — assurance/compat/service-account-invitations-live.ts, service-account-invitations.ts and command.ts; ST-57.
- [ ] 4.2.6 Verify all SDK/CLI/packed-driver oracles green, actual inventories and affected workspace checks.

### Session 4.3 — Hardening and final evidence

- [ ] 4.3.1 Add implementation tests and bounded maximum-input/output/security regression coverage.
- [ ] 4.3.2 Update public API/SDK/CLI help and maintainer security/data/API docs, including safe rollout and credential replacement.
- [ ] 4.3.3 Run independent correctness/API/concurrency review plus security audit; resolve necessary findings and scoped re-review.
- [ ] 4.3.4 Qualify clean-source direct machine invitation, production-security and registered packed SDK/CLI compatibility evidence; record exact provenance and limitations.
- [ ] 4.3.5 Confirm final full CI, acceptance coverage, feature roadmap/docs, resource teardown and no merge/release/issue-state claim.

**Verify:**07 Phase4 selections, affected SDK/CLI checks and structure, docs build, direct new-feature
journey, pentest/production profile, registered packed checks and latest full CI. Delete all owned
scratch/resources before declaring completion; preserve unrelated concurrent work.

## Completion

All tasks must be verified, every requirement/ST covered by named evidence, no unresolved major
finding, no weakened oracle, no unsafe cast/new support framework, and no owned test residue.
Post-completion technical-documentation review and optional project-guidance refresh follow the
exec-plan protocol. Final source must pass its own CI; earlier green revisions cannot qualify it.
