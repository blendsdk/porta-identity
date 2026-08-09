# Requirements Mapping: Porta Test Assurance Program

> **Parent**: [Plan Index](00-index.md)
> **Requirement Set**: `test-assurance/RD-01` through `test-assurance/RD-07`

## Owning Requirements

| RD                                                                                        | Plan delivery                                                                 |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [RD-01](../../requirements/RD-01-assurance-governance-and-traceability.md)                | Claim schema, oracle rules, evidence state, redaction, gap and defect routing |
| [RD-02](../../requirements/RD-02-harness-foundation-and-fixtures.md)                      | Single-harness lifecycle, projects, deterministic multi-tenant fixtures       |
| [RD-03](../../requirements/RD-03-coverage-attribution-and-ratchets.md)                    | Server-process coverage, exact baselines, reproducibility, staged ratchets    |
| [RD-04](../../requirements/RD-04-functional-contracts-and-compatibility.md)               | Functional audit and packed SDK/CLI live journeys                             |
| [RD-05](../../requirements/RD-05-security-risk-slice-assurance.md)                        | Threat-driven P0/P1 black-box claims                                          |
| [RD-06](../../requirements/RD-06-fault-sensitivity-and-mutation.md)                       | Curated fault catalog, kill evidence, bounded automation pilot                |
| [RD-07](../../requirements/RD-07-continuous-assurance-and-non-functional-requirements.md) | Lanes, reliability, retention, privacy, recovery, and completion gates        |

The RDs remain authoritative. This plan adds no new product behavior and does not copy their full
requirement text.

## Program Acceptance

1. Every Must requirement maps to one or more specification cases in
   [07-testing-strategy.md](07-testing-strategy.md) and an execution task.
2. Critical claim definitions validate, reference existing tests, contain an adversarial case, and
   cannot become `assured` without green verification, a killed fault, and an empty gap list.
3. `yarn verify` stays green and unchanged as the ordinary workspace gate.
4. The harness proves fatal cleanup/reset behavior, deterministic multi-tenant state, and exact
   project ownership before any risk slice is closed.
5. Server-process coverage is reproducible and source-mapped before any ratchet blocks a lane.
6. P0 slices close in order: tenant/RBAC, protocol/token, then human authentication. P1 follows.
7. Packed SDK and CLI artifacts interoperate with the live server from an isolated consumer.
8. Generated evidence contains no raw secrets, credentials, tokens, cookies, or personal data.
9. Confirmed product defects remain separately routed and block only their affected claims/slices.
10. Final verification includes `yarn verify`, the retained harness, artifact validation, and all
    promoted assurance commands; no external scanner or publishing action is required.
