# Requirements: SDK–Server Contract Truth

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-01](../../requirements/RD-01-sdk-admin-contract-alignment.md) and
> [RD-02](../../requirements/RD-02-gdpr-export-schema-repair.md) — the OWNING requirements docs

## Scope of this plan (delta view)

### In this plan

- RD-01 R1–R2 — slug-validation contract and sort parameter names (AR-2, AR-3)
- RD-01 R3 — history contract for organizations, users, and usersById (AR-4); application/client
  history is deferred to a separate server defect because those routes answer `500`
- RD-01 R4 — ETag exposure on the four SDK writes plus the one-line server emission for user create
  (AR-5, AR-17)
- RD-01 R5–R6 — claim values on the real application-prefixed routes (values are not filtered by
  application); server-aligned definition types (AR-6, AR-7, AR-15)
- RD-01 R7 — effective permissions on `userRoles` (AR-8)
- RD-01 R8 — typed export document (AR-9)
- RD-01 R9 — reserved `new` slug (AR-11)
- RD-01 R10 — CLI `porta user claims --app` plus the `porta app claim` definition surface (AR-12,
  AR-14)
- RD-01 R11–R12 — documentation and changelog migration notes (AR-10, AR-14)
- RD-02 R1–R5 — GDPR export schema repair and real-schema proof (AR-1, AR-16)

### Deferred / out of this plan

- None. All decisions in both RDs are scheduled; no item is deferred.

## Plan-local decisions

| Decision | Chosen | AR Ref |
| --- | --- | --- |
| Plan home and type | Feature `sdk-server-contract-drift`, full plan set | AR-13 |
| Related-drift scope | Full drift closure within the SDK-fixable surfaces (claim values, claim-definition types and CLI); application/client history deferred to a separate server defect | AR-4, AR-14 |
| Verify commands | `yarn verify`, `yarn test:structure`, integration with `yarn docker:up`, and the registered `yarn assurance:compat` tenant-admin selector | AR-16 |

## Acceptance Criteria

Derived from the owning RDs; the plan-local addition is the delivery condition:

1. RD-01 functional acceptance criteria hold, each proven by a test or type-level oracle that fails
   on the pre-change code; documentation criteria are verified by `yarn docs:build` and review.
2. RD-02 acceptance criteria 1–4 hold, including the real-schema export proof.
3. `yarn verify` passes for the whole monorepo, `yarn test:integration` passes with the development
   services running, and the registered `yarn assurance:compat` tenant-admin selector passes from a
   clean committed revision.
4. The three issues (#159, #160, #161) are closed by the delivering pull request.
5. Application/client history is recorded as a separate server defect; no SDK or mock test pins it.
6. No task-created container, database, or installation remains after verification.
