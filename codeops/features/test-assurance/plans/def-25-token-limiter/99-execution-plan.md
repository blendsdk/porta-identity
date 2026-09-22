# Execution Plan: DEF-25 Token/Introspection Limiter

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Status**: Complete
> **Last Updated**: 2026-09-23 00:20
> **Progress**: 7/7 tasks (100%)
> **CodeOps Artifact Schema**: 1

## Overview

Mount the OIDC token and introspection rate limiters on the real provider endpoints with a real
client key, prove enforcement with a penetration specification, and close DEF-25 and the DEF-14
rate-limit residual.

## Execution Contract

The task checkboxes below are the single source of truth. Mark the active task `[~]` with the
current date on implementation and update Progress/Last Updated; promote to `[x]` only after its
targeted command passes. A specification RED succeeds only when the named assertion fails while
the existing required lanes stay green.

## Targeted Verification Bindings

| Phase | Required targeted commands |
| ----- | -------------------------- |
| 1 | `yarn workspace @portaidentity/server vitest run --project pentest tests/pentest/infrastructure/forwarded-client-ip-identity.spec.test.ts`; `yarn workspace @portaidentity/server vitest run --project unit tests/unit/middleware/token-rate-limiter.test.ts tests/unit/middleware/introspection-rate-limiter.test.ts`; `yarn test:structure` |
| 2 | `yarn assurance:harness --project security --profile production-security`; `yarn verify` |

---

## Phase 1: Rate limit the real token and introspection endpoints

> **Lenses**: security, correctness

**Reference**: RD-05, ST-53; DEF-25; decisions D1–D4.
**Scope mode**: strict
**Review**: [phase-1-review.md](phase-1-review.md) — 1 major and 6 minor findings, all resolved; fix re-review clean, integration 477 and e2e 127 verified.

**Phase baseline tree**: 6d889b7743353f50d5440a3a309f2ba48fd36c96
- [x] 1.1 [spec-author] Update the penetration specification `packages/server/tests/pentest/infrastructure/forwarded-client-ip-identity.spec.test.ts` to target the real endpoint `/{orgSlug}/token`, keep the shared-budget assertion for spoofed `X-Forwarded-For`, and add an enforcement case that exceeds the limit and requires a `429`. (RED expected: the real path carries no limiter headers today.) ✅ (completed: 2026-09-23 00:05; RED: all 3 cases fail with no `X-RateLimit-*` headers on the real path)
- [x] 1.2 Implement: change `TOKEN_PATH_REGEX`/`INTROSPECTION_PATH_REGEX` to the real paths, add a shared `presentedClientId` helper (body, else HTTP Basic, else `unknown`), and move both limiters from the outer app into the OIDC router after body parsing, before the client-tenant binding (`packages/server/src/server.ts:434-444`, `457-504`). ✅ (completed: 2026-09-23 00:20; regexes match the real paths; `presentedClientId` reads body or HTTP Basic; limiters mounted after the OIDC body parser; spec 3/3 green)
- [x] 1.3 Update `token-rate-limiter.test.ts` and `introspection-rate-limiter.test.ts` for the new paths and the credential-derived key. ✅ (completed: 2026-09-23 00:20; 46/46 limiter unit tests, including Basic-auth key cases)
- [x] 1.4 Verify: focused pentest and unit suites plus `yarn test:structure`. ✅ (completed: 2026-09-23 00:20; pentest 3/3, unit 46/46, structure 126/126)

**Phase gate:** the real token and introspection endpoints enforce their limits, the key is per
client and per IP, a spoofed `X-Forwarded-For` value does not split the budget, and no other route
is affected.

---

## Phase 2: Live evidence and closeout

> **Lenses**: security, integration, documentation

**Reference**: RD-05, ST-53; DEF-25, DEF-14; decision D5.
**Scope mode**: strict

- [x] 2.1 Run `yarn assurance:harness --project security --profile production-security`; require every `st53-*` case to pass with no incomplete case and exit 0, and record the run identifier. ✅ (completed: 2026-09-23 00:55; production-security run `bb4eb111` passed=11 incomplete=0; operational run `197fb0f4` passed=6 incomplete=0; every st53 case passed with no unobserved facts)
- [x] 2.2 Update `00-remaining-work.md` and `00-roadmap.md`: resolve DEF-25, fully close DEF-14 with the live run, and refresh the sequencing. ✅ (completed: 2026-09-23 00:52; DEF-25 and DEF-14 moved to resolved; DEF-14/DEF-25 roadmap rows set to Done)
- [x] 2.3 Full verification: `yarn verify` passes. ✅ (completed: 2026-09-23 01:13; structure 126, SDK 560, CLI 1430, server 3673/477/127/263)

**Phase gate:** the live production-security run observes the rate-limit identity fact as concrete
and exits clean, and the backlog records DEF-25 and DEF-14 as done.
