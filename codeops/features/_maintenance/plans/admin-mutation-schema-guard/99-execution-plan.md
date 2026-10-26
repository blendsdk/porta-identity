# Task T-05: Guard audit schema and diagnose admin mutation failures

> **Type**: Task (security-sensitive maintenance) · **Feature**: _maintenance · **CodeOps Artifact Schema**: 1
> **Progress**: 11/12 tasks (92%)
> **Baseline**: `develop` at `174180bd` (v1.14.0)
> **Evidence**: GitHub issue #199; migration `034_audit_client_actor.sql`; v1.13.0 audit writer; current admin mutation middleware.

## Objective

Prevent administrative writes from failing silently when the running server build and the database audit schema disagree, and make a future failure diagnosable without exposing SQL text, stack traces, request bodies, or secrets.

This does not change the audit ownership, transaction, authorization, or not-null/check constraints. Operators must still align the deployed build and migration level.

## Confirmed root cause

| Fact | Evidence |
| --- | --- |
| Migration 034 is in v1.14.0 | `packages/server/migrations/034_audit_client_actor.sql`; `git tag --contains` |
| v1.14 writes `actor_type`, `actor_client_id`, and `actor_client_name` | `packages/server/src/lib/audit-log.ts` |
| v1.13 writes the old nine-column audit row and omits `actor_type` | `git show v1.13.0:packages/server/src/lib/audit-log.ts` |
| Migration 034 makes `actor_type` `NOT NULL` and adds `audit_log_actor_shape` | migration 034 |
| The generic admin transaction maps every non-public error to an opaque 503 | `packages/server/src/middleware/admin-mutation-audit.ts` |
| Startup only checks `SELECT 1`, not the required audit schema | `packages/server/src/lib/database.ts`, `packages/server/src/index.ts` |

A v1.13 instance against a migrated database violates `actor_type NOT NULL`; a v1.14 instance against an unmigrated database references missing columns. Both roll back the whole admin mutation and return `admin_mutation_unavailable`.

## Decisions

- Fail startup when the audit schema is not current. Do not weaken the audit constraints or add a compatibility trigger.
- Log only safe structured fields for a failed admin mutation: request ID, method, route template, error name, known SQLSTATE, and a bounded failure class. Never log SQL text, stack traces, request bodies, tokens, cookies, or PII.
- Keep the public 503 response generic.
- Add a deployment procedure for migration 034 that stops old instances before applying it.
- Do not attempt a production data backfill or bypass the audit transaction.

## Phase 0 — Evidence

- [x] **0.1** Record the source and migration mismatch from issue #199 and confirm that current startup and middleware behavior matches the report.

## Phase 1 — Specification tests first

- [x] **1.1** Add `packages/server/tests/unit/lib/audit-schema.spec.test.ts` covering complete schema, missing/old columns, nullable `actor_type`, and missing shape constraint. Confirm red.
- [x] **1.2** Add `packages/server/tests/integration/admin/admin-mutation-audit.guard.spec.test.ts` covering a successful generic admin mutation: one `admin.mutation.committed` row with `actor_type = 'user'` and actor attribution.
- [x] **1.3** In the same integration file, force an audit insert failure and assert 503, rollback, and one sanitized structured error log with request ID, method, route template, error name, and bounded failure class, without SQL text/stack/body. Confirm red.
- [x] **1.4** Add an integration assertion that `assertAuditSchema()` passes on the migrated test database. Confirm red before implementation.

## Phase 2 — Implementation

- [x] **2.1** Add `packages/server/src/lib/audit-schema.ts` with a pure schema assessment and a database guard. Call it in `packages/server/src/index.ts` immediately after the database connection and before accepting requests.
- [x] **2.2** Add sanitized failure classification and logging to `packages/server/src/middleware/admin-mutation-audit.ts`; preserve the existing 503 body and transaction rollback.
- [x] **2.3** Update `docs/guide/deployment.md` and `techdocs/guides/deployment.md` with the migration 034 mixed-version rollout procedure and non-secret diagnostic queries.

## Phase 3 — Verification

- [x] **3.1** Run the new unit and integration tests, then lint and typecheck the server workspace.
- [x] **3.2** Run `pnpm verify` with PostgreSQL, Redis, and MailHog.
- [ ] **3.3** Run `pnpm assurance:harness --project security --profile production-security` because the change touches administrative audit behavior. **Skipped locally at the operator’s request to save time; branch CI does not include this assurance profile. Targeted admin audit tests and full `pnpm verify` passed.**
- [x] **3.4** Independent security/release review completed. Fixed the search-path audit_log resolution, startup stack-log privacy, config/bulk safe diagnostics, deployment/rollback documentation, and negative schema/startup tests.

**Local evidence:** targeted unit tests 22/22, targeted integration tests 14/14, structure 142/142; full `pnpm verify` passed in 15m25s before review hardening. Final branch verification is delegated to CI as requested.

**Verify:** startup rejects a missing migration 034 schema with a safe message; a current schema permits a generic admin mutation and writes one actor-attributed audit row; a forced audit failure returns 503, rolls back, and logs only safe structured context; docs describe the required maintenance window; full verification and production-security assurance pass.

## Stop conditions

| Condition | Action |
| --- | --- |
| The startup guard would make a supported deployment fail without a clear recovery path | Stop; revise the guard or deployment procedure |
| A test requires weakening `actor_type NOT NULL` or `audit_log_actor_shape` | Stop; do not weaken the audit invariant |
| Sanitized logging would include SQL text, stack, body, tokens, cookies, or PII | Stop; reduce the fields |
| Full verification or production-security assurance fails for a reason caused by this change | Fix before merge |
| The failure is only a live schema mismatch and cannot be reproduced in code | Document the operator recovery and keep the source-level guard tests |

## Next steps

1. Write and run the specification/integration tests red.
2. Implement the guard and logging.
3. Update deployment guidance.
4. Run targeted and full verification, production-security assurance, and independent review.
