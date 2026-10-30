# Tenant Invitation Revocation (#196)

> **Feature**: Cancel one tenant application-owned pending invitation
> **Status**: Preflight Passed — ready for execution
> **Created**: 2026-10-30
> **Implements**: user-invitations/T-03
> **CodeOps Artifact Schema**: 1

## Minimum-Sufficient Baseline

**Original goal:** Let an authorized tenant BFF cancel an invitation before it creates an account.
**Smallest viable design:** One nullable ownership column, one authenticated DELETE route, one scoped conditional update and transaction-bound audit, one existing SDK-domain method. Reuse existing row locks, actor authentication, strict delete limiter, transport and test runners (AR #1–9).
**Excluded machinery:** No new framework, dependency, background process, cache, read API, CLI/Admin UI, or generalized invitation subsystem.
**Approved complexity:** None; ordinary schema/route/service changes implement the approved boundary directly.

## Documents

| Document | Purpose |
| --- | --- |
| [Ambiguity register](00-ambiguity-register.md) | Explicit user decisions and planning scope |
| [Requirements](01-requirements.md) | Owning standalone requirements |
| [Current state](02-current-state.md) | Verified code facts and risks |
| [Storage and revocation](03-01-storage-and-revocation.md) | Schema, transaction and ownership contract |
| [API and SDK](03-02-api-and-sdk.md) | HTTP, SDK and documentation contract |
| [Test strategy](07-testing-strategy.md) | Immutable expected outcomes and verification gates |
| [Execution](99-execution-plan.md) | Sole mutable task checklist |

## Specialist Agents

**None** — catalog reviewer plus security-auditor packets cover the bounded PostgreSQL transaction, Koa middleware and SDK operation. Existing row-lock acceptance (`packages/server/src/users/invitation-service.ts:55`) and atomic audit writer (`packages/server/src/lib/audit-log.ts:254`) provide the relevant project invariants. No recurring capability gap justifies a standing agent. Independent reviewers remain mandatory.

## Domain and review lenses

Web application, distributed/concurrent and data/migration lenses apply. Review add-ons: api-surface, concurrency; security audit profiles: owasp-web, auth-protocol, tenant-isolation. Correctness, maintainability and standards are always reviewed. Strict scope; normal decision authority; feature-only auto-commit/push (AR #4).

## Quality checklist

Planning checks passed: complete register; smallest viable design; concrete ST input/output cases; migration/rollback and mixed-writer boundaries; specification-before-implementation ordering; bounded tasks; no invented infrastructure or unchanged sibling edits. Preflight must independently validate these claims before execution. No upstream RD exists; `01-requirements.md` owns requirements.
