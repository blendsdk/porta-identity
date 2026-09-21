# Execution Plan: DEF-13 Administrative Denial Digest

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Status**: Complete
> **Last Updated**: 2026-09-21 02:49
> **Progress**: 5/5 tasks (100%)
> **CodeOps Artifact Schema**: 1

## Overview

Add the missing protected target digest to administrative permission-denial security events in
strict specification-first order. Existing decision-event behavior, denial responses, and the
penetration assertions remain unchanged.

## Execution Contract

The task checkboxes below are the single source of truth. On implementation mark the active task
`[~]` with the current date and update Progress/Last Updated. After its targeted command and
verification pass, promote it to `[x]`. A specification RED succeeds only when the named immutable
assertion fails while the existing required lanes stay green.

## Targeted Verification Bindings

| Phase | Required targeted commands                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `yarn workspace @portaidentity/server vitest run --project unit tests/unit/security/admin-permission-denial-target.spec.test.ts tests/unit/security/security-decision-boundaries.impl.test.ts` and `yarn test:structure` |

---

## Phase 1: Target digest for administrative denials

> **Lenses**: security, correctness

**Reference**: RD-05, ST-57 through ST-61; DEF-13.

- [x] 1.1 [spec-author] Write the immutable specification for the denial target digest: one correlated event per denial carrying the protected actor reference, the requested permissions, the deny outcome, and a protected target digest; raw identifiers must never appear. (completed 2026-09-21 02:33; added `packages/server/tests/unit/security/admin-permission-denial-target.spec.test.ts`)
- [x] 1.2 Run the specification and record the exact RED for the missing target digest. (completed 2026-09-21 02:34; 3/3 red because `resourceRef` was undefined)
- [x] 1.3 Implement target resolution in `requirePermission`: prefer the acted-on route parameter, fall back to the actor's organization, and record it as a protected resource reference. (completed 2026-09-21 02:34; added the priority-ordered target resolver and the protected resource reference)
- [x] 1.4 Update the exact server test-file inventory count and run the focused suites plus `yarn test:structure`. (completed 2026-09-21 02:42; inventory 333; focused 11/11 green; structure 126/126)
- [x] 1.5 Verification: `yarn workspace @portaidentity/server verify` passes, and the roadmap and remaining-work backlog record the product half as done with the live adapter still open. (completed 2026-09-21 02:49; server verify pass — integration 476, e2e 127, pentest 260, build)

**Phase gate:** administrative permission denials emit one privacy-safe event carrying the actor,
action, target digest, and result, with no raw identifier leakage and no weakened existing
assertion.
