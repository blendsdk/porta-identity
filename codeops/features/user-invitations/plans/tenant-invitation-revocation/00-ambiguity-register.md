# Ambiguity Register: Tenant Invitation Revocation (#196)

> **Status**: ✅ GATE PASSED — all 10 decisions resolved; approved fixture corrections pending verification
> **Last Updated**: 2026-10-30 13:22
> **CodeOps Artifact Schema**: 1

## Planning scope contract

| Boundary | Authorized scope |
| --- | --- |
| Planning target | GitHub #196, user-invitations/T-03: tenant-scoped pending invitation revocation |
| Context artifacts | Existing invitation/localization/tenant-user plans, repository guidance, public API/SDK, migration and security documentation |
| Modification set | This new standalone plan, T-03 in the feature roadmap, and directly affected source, tests, migration and public/maintainer documentation during authorized execution |

Unrelated roadmap cleanup, #180, #184, list/get, CLI/Admin UI changes, merging and releases are not authorized by this plan.

## Decisions

| # | Category | Ambiguity / gap | Options / recommendation | User decision | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Scope / API | Revoke-only versus read surface; target by UUID versus email | Revoke-only: DELETE /api/organizations/:orgId/invitations/:invitationId; SDK users.revokeInvitation({ organizationId, invitationId }) | User selected “Revoke only (Recommended)”; no list/get or CLI/Admin UI | ✅ Resolved |
| 2 | Security / data | Application ownership is not persisted today | Nullable application_id on new invitations; match caller organization/application; unknown ownership is a 204 no-op | User selected “Approve boundary (Recommended)”; any existing authorized actor in that application may revoke; re-invitation behavior unchanged | ✅ Resolved |
| 3 | Naming / scope | Feature placement and plan ownership | user-invitations/T-03 at plans/tenant-invitation-revocation | User selected “Use user-invitations (Recommended)” | ✅ Resolved |
| 4 | Verification / integration | Gates and commit authority | Spec-first, affected checks, structure/pentest/UI regressions, production-security and tenant-admin compatibility; full verify in CI; auto-commit/push feature only | User selected “Confirm (Recommended)”; security failures block; no new infrastructure or waivers | ✅ Resolved |
| 5 | Behavioral / concurrency | Acceptance, revoke, replacement and retry ordering | Existing row locks serialize mutation: revoke first rejects acceptance; acceptance first leaves account unchanged; old UUID cannot affect a replacement; no automatic retries | User selected “Approve contract (Recommended)”; first committed row-lock winner, not request-arrival ordering | ✅ Resolved |
| 6 | Security / audit | Which outcomes produce durable audit and failure behavior | Exactly one user.invite.revoked event per actual live-to-used transition; metadata invitationId/applicationId, existing actor/context fields, no token/hash/email; no-op produces no success event; audit failure rolls back and returns sanitized 500 | User selected “Approve contract (Recommended)”; no-op auditing excluded, storage failures remain errors; no constant-time promise | ✅ Resolved |
| 7 | Data / migration | Ownership deletion and deployment compatibility | Migration 036 nullable UUID FK applications(id) ON DELETE SET NULL; no backfill or token expiry changes; schema first, upgrade every server; older writers safely produce null; rollback app before optional down migration, which loses ownership | User selected “Preserve lifetime (Recommended)” and “Approve contract (Recommended)”; application deletion preserves link lifetime but removes tenant revoke authority | ✅ Resolved |
| 8 | Input / errors / rate limiting | Invalid IDs, foreign IDs, limiter selection | Validate UUID org/id after existing auth; invalid is fixed 400; existing auth 401/403; unknown/foreign-app/null/used/expired UUID is empty 204; reuse tenantUserDeleteRateLimiter (60/hour, Redis unavailable 503) without new bucket | User selected “Approve contract (Recommended)”; fixed shared body {error: 'User request is invalid'}, limiter also covers no-op attempts | ✅ Resolved |
| 9 | Technical / naming / UX | Implementation boundaries, SDK and docs | Small tenant-invitations route and invitation-revocation service; extend token insert input with optional applicationId; SDK input type and Promise<void> method; document tenant-only prefix /api and limitations; no new framework/dependency | User selected “Approve contract (Recommended)”; confirmed complete planning baseline, followed by preflight and implementation | ✅ Resolved |
| 10 | Verification mechanics (runtime) | First green attempt has three endpoint and two acceptance-race failures caused by fixture mechanics | Invalidate fixture client cache after direct SQL app change; preconsume 30 real eligible user deletions before unchanged mixed-budget loop; initialize synthetic response404 like Koa; observe/gate acceptance's actual PG connection rather than wrapper transaction. Preserve every assertion, timeout, real mutation and lock observation. Alternative production cache/limiter/transaction refactors are outside scope and not justified by these failures. | User selected “Approve corrections (Recommended)” after the interrupted question was reissued; exact two new test files only, every assertion/timeout unchanged, no production refactor | ✅ Resolved |

## Evidence and independent challenge

- Branch: feat/196-tenant-invitation-revocation from origin/develop at released 4e305086.
- Invitation UUID already returned: packages/server/src/users/invite-service.ts:389.
- Ownership absent from persisted invitation: packages/server/src/auth/token-repository.ts:779.
- Existing acceptance row lock: packages/server/src/auth/token-repository.ts:854; account creation/consume transaction in packages/server/src/users/invitation-service.ts:55–90.
- Existing re-invitation remains organization/email-wide: packages/server/src/auth/token-repository.ts:770; migration 033 unique index unchanged.
- Existing durable mutation audit: packages/server/src/lib/audit-log.ts:254; strict delete limiter: packages/server/src/middleware/tenant-user-rate-limiter.ts:40–90.
- Independent challenger session ses_e73764596ffey7eBfVUQ6g5XdW converged on UUID-only, nullable column, application match, legacy fail-closed and transaction-bound audit. It explicitly warned not to broaden the application-isolation claim to existing re-invitation behavior.
- Detailed-contract challenger ses_e737043d2ffe9GiudjkhBZkQO6 converged; clarified first committed lock winner, audit-failure errors rather than false success, and preserved application-deletion lifetime. Both residual policy questions were then explicitly confirmed by the user.
- Active lenses: web application; distributed/concurrent; data/migration. Sensitive tags: authorization, tenant isolation, invitation authority and durable mutation auditing.

## Systematic review

### Runtime item 10 evidence

On 2026-10-30, new migration2/2 and persistence12/12 passed. Endpoint20/23 passed; expected403 received204 after cached client was changed only in PostgreSQL; shared-budget expected429 received204 because unknown-user404 runs before delete limiter; unmatched router fixture expected404 observed default200. Concurrency4/6 passed; two acceptance cases could not observe blocking because acceptance uses its own connection, while the fixture recorded the outer runDatabaseTransaction backend.

Independent challenger `ses_e733f303bffekINr33Uk09vtVr` verified all diagnoses against actual source/test/Koa code and converged on fixture-only corrections, not weakened assertions or broader production changes. Relevant evidence: tenant-users.ts:318–326; clients/service.ts:304–314 and cache.ts:131; invitation-service.ts:53–90; synthetic Koa response defaults must mirror application.handleRequest's404 initialization. Driver instrumentation must forward real SQL unchanged, capture actual PIDs, gate COMMIT only for the intended operation and release/restore in finally. No failed outcome has been relabeled as passed.

The challenger also noted inherited best-effort client-cache invalidation under Redis failure; no such failure was reproduced here. This plan reuses existing authentication and does not claim to prove failure-safe live client authority or authorize an unrelated authentication-cache redesign.

The twelve categories were checked. AR #1–9 cover identified semantic choices. No extra support surface, external dependency, infrastructure, workload, performance target, stakeholder conflict or new presentation surface is proposed. Existing expired-invitation rendering and existing production error handling are reused; no new translated copy is required. Gate confirmation must include all rows, including the pending detailed contract.
