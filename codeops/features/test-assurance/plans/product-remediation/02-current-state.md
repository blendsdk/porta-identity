# Current State: Assurance Product Remediation

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing implementation

| Area | Current behavior | Required correction |
| --- | --- | --- |
| Password enumeration | Unknown/ineligible users return before Argon2id and real failure accounting | One Argon2id verification and fixed-shape failure operation for every structurally valid attempt (AR-1) |
| Recovery enumeration | Existing users perform token/config/database/mail work; absent users do not | Public request enqueues one identical bounded job shape and does not await account-specific work (AR-1) |
| Magic-link verification | Global token lookup; route organization is not compared to the token's user; token is consumed before complete authority validation | Persist tenant/interaction authority and validate transactionally before consumption (AR-2) |
| Redis continuation | Separate `GET` then `DEL` is described as atomic | Conditional Lua/`GETDEL`-equivalent consumption bound to tenant and interaction (AR-2) |
| Bulk status | Public docs and loop implementation are partial; module header says atomic; user query is not consistently tenant-scoped | Preserve ordered partial results with independent item transactions and exact tenant predicates (AR-3) |
| Import | One transaction can still commit after processors append `errors[]`; schema accepts password hashes | Prevalidation and atomic rollback on every actual error; reject secret-equivalent fields (AR-3) |
| Export | Entity permission only; role scope accepts application alone; audit exports raw metadata/IP; CSV quoting permits formulas | Dedicated export authority, exact scope, closed fields, bounded cardinality, safe audit details, formula neutralization (AR-3) |
| Request/admin logging | Thrown requests can bypass completion logging; denials return without one complete correlated decision record | One typed terminal decision event with privacy-safe protected references (AR-4) |

## Relevant files

| File | Purpose | Planned change |
| --- | --- | --- |
| `packages/server/src/routes/interactions.ts` | Password and magic-link interaction handlers | Constant-work password path and recovery-job enqueue |
| `packages/server/src/routes/password-reset.ts` | Password-reset request and completion | Recovery-job enqueue and public equivalence |
| `packages/server/src/auth/token-repository.ts` | Recovery token persistence | Tenant/interaction-aware atomic magic-link operations |
| `packages/server/src/auth/magic-link-session.ts` | Redis continuation | Conditional atomic consume |
| `packages/server/src/routes/magic-link.ts` | Public magic-link verification | Pre-consumption tenant/interaction validation |
| `packages/server/src/lib/bulk-operations.ts` | Per-item status changes | Explicit item transactions, tenant predicates, closed outcomes |
| `packages/server/src/lib/data-import.ts` | Manifest import | Planner, prevalidation, atomic error handling, secret rejection |
| `packages/server/src/lib/data-export.ts` | CSV/JSON export | Closed policies, bounds, audit-field safety, CSV hardening |
| `packages/server/src/middleware/*.ts` | Correlation, error, admin decisions | Typed decision context and one terminal event |
| `packages/server/migrations/` | Durable schema | Add token authority, recovery outbox, and audit/outbox support |

## Dependencies

- PostgreSQL remains the durable transaction/outbox authority; Redis remains short-lived
  continuation and cache state; MailHog remains the test mail boundary.
- No new package, hosted service, production test hook, or external queue is required.
- SDK/CLI export type changes must remain synchronized with the server's closed entity set.

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Recovery job loss or duplication | Medium | High | Transactional outbox identity, `SKIP LOCKED`, attempt cap, idempotent token replacement, restart tests |
| Magic-link mismatch consumes a valid artifact | Medium | High | Lock and validate before conditional consumption; explicit nonmutation specs |
| Import compatibility break | Medium | High | Versioned validation, dry-run diagnostics, documented merge/overwrite semantics |
| Security event leaks identifiers | Medium | High | Closed schema, keyed domain-separated references, strict redaction tests |
| Durable audit blocks legitimate mutation | Low | High | Transaction-local audit/outbox write with bounded failure and explicit recovery tests |
