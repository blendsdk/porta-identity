# Porta Test Assurance Program — Implementation Plan

> **Feature**: Independent functional and security assurance for Porta
> **Status**: Planning Complete
> **Created**: 2026-08-09
> **Implements**: test-assurance/RD-01, test-assurance/RD-02, test-assurance/RD-03, test-assurance/RD-04, test-assurance/RD-05, test-assurance/RD-06, test-assurance/RD-07
> **CodeOps Artifact Schema**: 1

## Outcome

This plan turns selected high-risk Porta behaviors into independently specified, black-box claims
with deterministic fixtures, attributable evidence, and demonstrated fault sensitivity. It extends
the retained harness and preserves the ordinary 4,167-test `yarn verify` baseline and existing
publishing/development workflows.

The target is defensible evidence, not an impossible guarantee that no exploit exists. A slice
closes only when its Must claims are exact, green, mutation-sensitive, current for the tested build,
and free of unnamed gaps. Confirmed product defects block the claim and leave this plan for a
separately authorized fix.

## Document Index

| Document                                              | Purpose                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| [Ambiguity Register](00-ambiguity-register.md)        | Plan-local decisions and Zero-Ambiguity Gate               |
| [Requirements](01-requirements.md)                    | Owning RDs and delivery acceptance criteria                |
| [Current State](02-current-state.md)                  | Grounded repository evidence and gaps                      |
| [Assurance Model](03-01-assurance-model.md)           | Claims, oracle hierarchy, evidence, and defect routing     |
| [Harness and Fixtures](03-02-harness-and-fixtures.md) | Project layout, lifecycle, data, and isolation             |
| [Coverage and Faults](03-03-coverage-and-faults.md)   | Process coverage, ratchets, curated faults, mutation pilot |
| [Risk Slices](03-04-risk-slices.md)                   | P0/P1 functional and security audit order                  |
| [Compatibility and CI](03-05-compatibility-and-ci.md) | Packed SDK/CLI journeys and release-safe lanes             |
| [Testing Strategy](07-testing-strategy.md)            | Independent specification cases and verification           |
| [Exact Traceability](08-traceability-matrix.md)       | Per-Must requirement, case, task, and claim mapping        |
| [Execution Plan](99-execution-plan.md)                | Ordered specification-first task checklist                 |

## Phase Summary

| #   | Phase                               | Primary result                                                 |
| --- | ----------------------------------- | -------------------------------------------------------------- |
| 1   | Claim and evidence foundation       | Validated claim catalog that starts with zero assured claims   |
| 2   | Fail-fast harness lifecycle         | Deterministic reset and cleanup with no silent continuation    |
| 3   | Multi-tenant fixtures and projects  | Two-tenant actor matrix and five owned Playwright projects     |
| 4   | Attributed server coverage          | Reproducible, provenance-bound black-box coverage baseline     |
| 5   | Fault and packed-client foundations | Sensitivity and publishable-client tooling before slices       |
| 6   | Tenant/admin authorization          | Real tenant and super-admin authority matrices                 |
| 7   | OIDC and token lifecycle            | ID-token, opaque-token, replay, and protocol evidence          |
| 8   | Human authentication                | Sessions, recovery, invitations, 2FA, timing, and rate limits  |
| 9   | P1 validation and admin data        | Full injection/exposure plus audit/key/session/config surfaces |
| 10  | Mutation and reliability            | Bounded pilot, signal taxonomy, and 100-run evidence           |
| 11  | Roll-up and promotion proposal      | Traceability/docs and non-enforcing CI proposal                |

## Non-Negotiable Boundaries

- Do not delete, skip, soften, or reinterpret existing tests to make this plan green.
- Do not add a production reset endpoint, bypass, fault switch, or test credential path.
- Do not fix product behavior under an assurance task.
- Do not merge server-process coverage with Vitest coverage until equivalence is proven.
- Do not add every assurance campaign to `yarn verify`.
- Do not claim certification or absence of exploits.
- Keep Codex Security, publishing, deployment, and cross-browser expansion outside scope.
