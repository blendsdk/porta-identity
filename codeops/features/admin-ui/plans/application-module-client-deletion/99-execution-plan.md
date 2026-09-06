# Execution Plan: Record Deletion and Lifecycle Simplification

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-09-06 10:09
> **Progress**: 15/40 tasks (38%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement RD-10 in four specification-first phases. Phase 1 closes the database-backed authority
boundary before Phase 2 mounts or normalizes any Delete route. No task may introduce excluded
machinery from RD-10.

**🚨 Update this document after each completed task.**

| Phase     | Scope                                                              |  Tasks |
| --------- | ------------------------------------------------------------------ | -----: |
| 1         | Session and OIDC live-authority foundation                         |      8 |
| 2         | Lifecycle cutover, atomic deletes, audit, cleanup, and invitations |     13 |
| 3         | SDK and conventional CLI vocabulary/contracts                      |      9 |
| 4         | Five-surface Admin UI, documentation, and final evidence           |     10 |
| **Total** |                                                                    | **40** |

For every phase, record the phase-start tree, write immutable specification tests, observe the
expected-red boundary, implement, add internal tests, and run the phase gate. Mark `[~]` after
implementation and `[x]` only after its stated verification passes. Resume the first `[~]`,
otherwise the first `[ ]`. Use `[!]` only with a concise blocker on the task line.

---

## Phase 1: Session and OIDC Authority Foundation

> **Phase baseline tree**: 213e2cafe125f83795a3eed678f1bda728ea7585
> **Scope mode**: Strict — 03-02; ST-20–ST-24
> **Expected modification set**: Session tracking, OIDC adapter/client/account/RBAC/claim reads,
> named server specifications, evidence, and incremental maintainer docs. No lifecycle status,
> permission, migration, or route cutover occurs in this phase.

### Session 1 — Specification Tests

- [x] 1.1 [spec-author] Add `packages/server/tests/unit/oidc/deleted-authority.spec.test.ts` for Session tracking-before-publication, all three read methods, direct Client lookup, reference validation, and RBAC/claim authority — ST-20–ST-24 ✅ (completed: 2026-09-06 03:34)
- [x] 1.2 [spec-author] Add `packages/server/tests/integration/oidc/deletion-authority.spec.test.ts` for live PostgreSQL Session/client/grant/account authority and unrelated preservation — ST-20–ST-24 ✅ (completed: 2026-09-06 03:39)
- [x] 1.3 Run the two Phase 1 files with `yarn workspace @portaidentity/server test:unit -- tests/unit/oidc/deleted-authority.spec.test.ts` and `yarn workspace @portaidentity/server test:integration -- tests/integration/oidc/deletion-authority.spec.test.ts`; record the expected-red boundary — unit: 22 failed/4 passed; integration: 8 failed/2 passed ✅ (completed: 2026-09-06 03:41)

### Session 2 — Implementation

- [x] 1.4 Make Redis Session publication depend on successful PostgreSQL tracking and make Session reads reject missing, expired, or revoked live tracking — 03-02 §Reliable Session Tracking; ST-20–ST-21 ✅ (completed: 2026-09-06 03:44)
- [x] 1.5 Add the focused post-read validator to `find`, `findByUid`, and `findByUserCode`; make `findForOidc`, OIDC account lookup, RBAC, and claim issuance read PostgreSQL directly — 03-02 §OIDC Post-Read Validator; ST-22–ST-24 ✅ (completed: 2026-09-06 03:48)
- [x] 1.6 Run the Phase 1 specifications and make them green without changing their expectations ✅ (completed: 2026-09-06 03:50)

### Session 3 — Implementation Tests and Gate

- [x] 1.7 Add implementation tests for tracking order/failure, extracted OIDC reference sets, all adapter methods, and direct query behavior ✅ (completed: 2026-09-06 03:51)
- [x] 1.8 Run the two Phase 1 selectors, `yarn test:unit`, `yarn test:integration`, and `yarn test:structure`; update this plan, maintainer authority docs, and the roadmap ✅ (completed: 2026-09-06 04:05)

**Deliverable:** Redis cannot publish an untracked Session and cached server-backed artifacts cannot
bypass live PostgreSQL authority. The existing lifecycle remains coherent until Phase 2 performs one
complete cutover.

---

## Phase 2: Atomic Deletion, Routes, Audit, Cleanup, and Invitations

> **Phase baseline tree**: f6c56a152ea33ef5495d6bb444af316e8ca4bd2d
> **Scope mode**: Strict — 03-01, 03-02 §Affected Authority/PostgreSQL/Detached Cleanup, 03-04
> §Pending Invitations; ST-01–ST-19, ST-25–ST-27, ST-40–ST-41
> **Expected modification set**: deletion repositories/services, mutation/audit wiring, existing
> status contracts, next migration, init permission maps, routes and lifecycle removal, Redis cleanup
> descriptors, both invitation routes, named server specifications, evidence, and security/data/API
> docs

### Session 1 — Specification Tests

- [x] 2.1 [spec-author] Add `packages/server/tests/integration/migrations/record-deletion-lifecycle.spec.test.ts` for retained statuses, module-permission cascade, no-op Down, and init-owned permissions/mappings — ST-01–ST-05 ✅ (completed: 2026-09-06 09:14; expected red: 6 failed/1 passed)
- [x] 2.2 [spec-author] Add `packages/server/tests/unit/routes/record-deletion.spec.test.ts` for lifecycle-route absence, exact authentication/permissions/validation/errors, parent qualification, guards, rollback, retained audit, nullable generic actor, and detached cleanup scheduling/failure — ST-02, ST-06–ST-07, ST-14–ST-18, ST-25 ✅ (completed: 2026-09-06 09:21; expected red: 16 failed/1 passed)
- [x] 2.3 [spec-author] Add `packages/server/tests/integration/admin/record-deletion.spec.test.ts` for all eight cascades, exact affected users, targeted revocation, concurrent last-admin deletes, current-user deletion, audit retention, rollback, and unrelated preservation — ST-06–ST-20, ST-26–ST-27 ✅ (completed: 2026-09-06 09:28; expected red: 11 failed)
- [x] 2.4 [spec-author] Add `packages/server/tests/integration/services/invitation-deleted-preassignments.spec.test.ts` for deployment-global application validation, canonical creation/acceptance, and deleted optional references — ST-40–ST-41 ✅ (completed: 2026-09-06 09:33; expected red: 3 failed/1 passed)
- [x] 2.5 Run the four Phase 2 specification files with their exact 07 commands and record the expected-red boundary — unit: 16 failed/1 passed; integration: 20 failed/2 passed ✅ (completed: 2026-09-06 09:34)

### Session 2 — Implementation

- [x] 2.6 Implement per-domain set-based capture and physical cascade services, including the control-plane organization guard and organization-row-serialized exact-role survivor check — 03-01 §Transaction Sequence/Graphs/Guards; ST-08–ST-16, ST-19 ✅ (completed: 2026-09-06 09:52; 170 affected tests, typecheck, and 96 structure checks passed; deletion integration 4 passed/7 expected red)
- [x] 2.7 Make resource audit, affected-session revocation, protocol cleanup, target deletion, and post-commit descriptor registration atomic; resolve a deleted generic audit actor through a nullable live subquery — 03-01 §Transaction Sequence/Audit; ST-16–ST-18, ST-20, ST-27 ✅ (completed: 2026-09-06 10:09; 436 affected tests, typecheck, and 96 structure checks passed; route spec 4 passed/13 expected red; deletion integration 9 passed/2 expected red)
- [ ] 2.8 Implement one immutable post-commit descriptor and detached `setImmediate` Redis-only pass through existing hooks/adapters, with no wait, retry, identifier logging, or new support machinery — 03-02 §Detached Redis Cleanup; ST-25–ST-26
- [ ] 2.9 Correct invitation creation in `routes/users.ts` and acceptance in `routes/invitation.ts` directly, including deployment-global application validation, without a shared helper or stored-payload rewrite — 03-04 §Pending Invitations; ST-40–ST-41
- [ ] 2.10 Only after Tasks 2.6–2.9 are complete, perform one coherent lifecycle cutover: apply retained status/public types, the lifecycle/module-cascade migration, init-owned delete permissions/mappings, all eight mounted/normalized DELETE routes, and obsolete endpoint/permission removal — 03-01 §Lifecycle/API/Permission/Migration; ST-01–ST-07
- [ ] 2.11 Run the Phase 2 specifications and make them green without changing their expectations

### Session 3 — Implementation Tests and Gate

- [ ] 2.12 Add implementation tests for constraints, foreign keys, init idempotency, set-based query shape, lock order, nullable audit actor lookup, transaction order, descriptor immutability, cursor termination, compare-before-delete, and fixed failure logging
- [ ] 2.13 Run the focused server commands from 07, server unit/integration/E2E/pentest gates, `yarn test:structure`, `yarn assurance:harness --project protocol --profile operational`, and `yarn assurance:harness --project security --profile operational`; update schema/security/data/API techdocs and roadmap

**Deliverable:** every route crosses one complete atomic database boundary and invalidates only
affected server-backed authority without waiting for Redis. Historical audit remains governed by
its existing retention policy.

---

## Phase 3: SDK and Conventional CLI

> **Scope mode**: Strict — 03-03 §SDK Contracts/Conventional CLI/Confirmation; ST-28–ST-31
> **Expected modification set**: SDK domains/types/agent descriptors, conventional CLI parsers/help/
> confirmation, the two named specification files, public docs, and evidence

### Session 1 — Specification Tests

- [ ] 3.1 [spec-author] Add `packages/sdk/tests/resource-deletion-rd10.spec.test.ts` for eight exact paths, bodyless void results, fixed errors, status unions, agent tools, and removed aliases — ST-28–ST-29
- [ ] 3.2 [spec-author] Add `packages/cli/tests/commands/resource-deletion.spec.test.ts` for eight registrations, Keep/Delete-name confirmation, exact one-call dispatch, force rejection, help, and hostile-name safety — ST-29–ST-31
- [ ] 3.3 Run the two exact Phase 3 commands from 07 and record the expected-red boundary

### Session 2 — Implementation

- [ ] 3.4 Replace obsolete SDK lifecycle methods/status unions/agent descriptors with eight thin delete contracts — 03-03 §SDK Contracts; ST-28–ST-29
- [ ] 3.5 Replace conventional Archive/Destroy/Purge/whole-client-Revoke commands and help with eight Delete commands — 03-03 §Conventional CLI; ST-29–ST-30
- [ ] 3.6 Reuse the current CLI presentation boundary for Keep/Delete-name confirmation without a record-delete `--force` bypass — 03-03 §Confirmation Contract; ST-30–ST-31
- [ ] 3.7 Run the Phase 3 specifications and make them green without changing their expectations

### Session 3 — Implementation Tests and Gate

- [ ] 3.8 Add implementation tests for SDK serialization, parser/help wiring, cancellation, safe labels, and exactly-once calls
- [ ] 3.9 Run the focused SDK/CLI commands, `yarn workspace @portaidentity/sdk verify`, `yarn workspace @portaidentity/cli verify`, and `yarn test:structure`; from a clean committed revision run unchanged `yarn assurance:compat --select tenant-admin`; update public API/SDK/CLI docs and roadmap

**Deliverable:** all first-party programmatic and conventional command surfaces use the same Delete
vocabulary and direct confirmation.

---

## Phase 4: Five-Surface Admin UI, Documentation, and Final Evidence

> **Scope mode**: Strict — 03-03 §Embedded Admin UI/UI Scope, 03-04 §Environment/Manual Journey,
> ST-32–ST-39/ST-42
> **Expected modification set**: existing organization/user/application/module/client Admin state,
> services, controllers, dialogs, workspaces, composition, the two named Admin specifications,
> existing compiled PTY coverage, docs, evidence, and roadmap. No role/permission/claim workspace.

### Session 1 — Specification Tests

- [ ] 4.1 [spec-author] Add `packages/cli/tests/admin/resource-deletion-state.spec.test.ts` for the five-surface capability/selection/context/generation oracle, duplicate prevention, reload/navigation, fixed failures, and authentication transition — ST-32–ST-35, ST-39
- [ ] 4.2 [spec-author] Add `packages/cli/tests/admin/resource-deletion-workspace.spec.test.ts` for five warnings, Keep/Escape/focus, measured buttons, Layout DSL placement, blank module row, 80×24, and 48×12 — ST-33, ST-36–ST-38
- [ ] 4.3 Run the exact Admin command from 07 and record the expected-red boundary

### Session 2 — Implementation

- [ ] 4.4 Replace obsolete capabilities/intents/services/controller branches with Delete only on organization, user, application, module, and client surfaces — 03-03 §Embedded Admin UI/UI Scope; ST-32–ST-35, ST-39
- [ ] 4.5 Implement the five resource warnings through the current dialog/presentation patterns, with Keep default, measured labels, safe text, focus, and teardown — 03-03 §Confirmation Contract; ST-33, ST-36–ST-38
- [ ] 4.6 Place Delete with existing JSVision Layout DSL and preserve navigation separation plus the blank module-operation row — 03-03 §Embedded Admin UI; ST-37
- [ ] 4.7 Run the Phase 4 specifications and existing `packages/cli/tests/admin/application.pty.impl.test.ts`; make behavior green without changing specification expectations

### Session 3 — Implementation Tests and Final Gate

- [ ] 4.8 Add implementation tests for capability derivation, mutation ownership, generation races, dialog teardown, focus, measurement, resize, and redraw
- [ ] 4.9 Update public API/SDK/CLI/Admin UI docs and maintainer security/data/migration/playground docs; remove obsolete lifecycle vocabulary
- [ ] 4.10 Run the focused and broader Phase 4 gates from 07 plus all repository-required final gates; separately run `yarn admin:env reset`, `yarn admin:env up`, and `yarn admin` for the five-surface manual oracle; update plan and roadmap only after all evidence qualifies

**Deliverable:** a consistent capability-safe Delete experience on the five existing Admin UI
surfaces, with public-contract, compiled-terminal, security, and manual evidence kept distinct.

---

## Dependencies

```text
Phase 1 live Session/OIDC authority foundation
  -> Phase 2 complete atomic deletion boundary and routes
  -> Phase 3 SDK/conventional CLI
  -> Phase 4 five-surface Admin UI and final evidence
```

## Completion Criteria

- All 40 tasks are `[x]` and ST-01–ST-42 pass unchanged.
- RD-10 lifecycle, deletion, security, audit, and interaction requirements are delivered.
- Removed lifecycle names have no public runtime surface; credential/security revocation remains.
- Redis delay or failure cannot restore database-deleted server-backed authority.
- Historical audit remains accessible only under its configured controls and retention.
- No excluded machinery, compatibility alias, secret, generated artifact, or dead code remains.
