# DEF-14 Phase 1 Review

> **Document**: phase-1-review.md
> **Parent**: [Index](00-index.md)
> **Phase**: 1 — Trusted-hop client IP (product)
> **Reviewed**: 2026-09-21
> **Reviewers**: phase-reviewer (RV), security-auditor (SA), dispatched in parallel on the phase diff

## Findings and rulings

| ID | Severity | Finding | Ruling | Resolution |
| -- | -------- | ------- | ------ | ---------- |
| RV-001 / SA-001 | 🟠 major | A blank or whitespace `TRUST_PROXY_HOPS` coerces to `0`, which Koa treats as "trust the whole header" and silently disables the fix | Fix | `z.preprocess` maps blank/whitespace to `undefined` so the `1` default applies; unit cases added for `''` and whitespace |
| SA-002 | 🟠 major | Only the exact hop count is safe; under-count collapses budgets/audit addresses and over-count reopens spoofing, both silent | Fix | The config comment now states the exact-hop requirement and both failure modes; the operator documentation task covers it |
| RV-002 | 🟡 minor | No upper bound on the hop count | Fix | `.max(10)` added; unit case for `11` |
| SA-003 | 🟡 minor | The comment overstates control; direct reachability and the pre-existing `trustProxy` default mismatch remain | Fix + defer | Comment now states the proxy-append and non-direct-reachability preconditions; the pre-existing default mismatch is logged as DEF-24 |
| SA-004 | 🟡 minor | The oracle proved the leading value is ignored but not that the trailing peer is used | Fix | A second specification case varies only the trailing peer and requires a separate, higher budget |
| RV-003 | 🟡 minor | The plan referenced a non-existent `.test.ts` filename | Fix | Plan and index corrected to `.spec.test.ts` |

No 🔴 critical finding. The reviewers confirmed the core fix is correct for the documented
single-proxy deployment and that `X-Forwarded-Proto`/`ctx.secure` behavior is unchanged.

## Fix verification

| Command | Result |
| ------- | ------ |
| `yarn workspace @portaidentity/server vitest run --project unit tests/unit/config.test.ts` | 27 passed |
| `yarn workspace @portaidentity/server vitest run --project pentest tests/pentest/infrastructure/forwarded-client-ip-identity.spec.test.ts` | 2 passed |
| `yarn test:structure` | 126 passed |

## Notes

- Strengthening the specification with the trailing-peer case is the positive form of the same
  requirement (the resolved identity is the direct peer). It does not weaken the original
  no-budget-split assertion.
- DEF-24 records the pre-existing `TRUST_PROXY` default/documentation mismatch outside this plan's
  scope.
