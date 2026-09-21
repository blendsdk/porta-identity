# Execution Plan: DEF-14 Forwarding Context

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Status**: Ready
> **Last Updated**: 2026-09-21 23:48
> **Progress**: 9/13 tasks (69%)
> **CodeOps Artifact Schema**: 1

## Overview

Resolve the trusted client IP to the nearest untrusted hop behind the approved proxy, prove it with
a security regression test, then complete the three ST-53 forwarding-context observations and
remove the obsolete forwarding observer continuation. Existing accepted-control behavior, the
single-proxy request path, and every other ST-53/ST-55/ST-56 assertion stay unchanged.

## Execution Contract

The task checkboxes below are the single source of truth. On implementation mark the active task
`[~]` with the current date and update Progress/Last Updated. After its targeted command and
verification pass, promote it to `[x]`. A specification RED succeeds only when the named immutable
assertion fails while the existing required lanes stay green.

## Targeted Verification Bindings

| Phase | Required targeted commands |
| ----- | -------------------------- |
| 1 | `yarn workspace @portaidentity/server vitest run --project pentest tests/pentest/infrastructure/forwarded-client-ip-identity.spec.test.ts`; `yarn workspace @portaidentity/server vitest run --project unit tests/unit/config.test.ts`; `yarn test:structure` |
| 2 | `npx tsx --test test-harness/assurance/tests/assurance-all-aggregate.spec.test.ts test-harness/assurance/tests/assurance-all-aggregate.impl.test.ts test-harness/assurance/tests/production-exposure.impl.test.ts test-harness/assurance/tests/validation-exposure.spec.test.ts` |
| 3 | `yarn assurance:harness --project security --profile operational`; `yarn assurance:harness --project security --profile production-security`; `yarn verify` |

---

## Phase 1: Trusted-hop client IP (product)

> **Lenses**: security, correctness

**Reference**: RD-05, ST-53; DEF-14; decisions D1–D4.
**Phase baseline tree**: 43ffbbcf6480be8082e89e1c21c332d37b6d27fc
**Scope mode**: strict
**Expected modification set**: `packages/server/tests/pentest/infrastructure/forwarded-client-ip-identity.spec.test.ts` (new), `packages/server/src/config/schema.ts`, `packages/server/src/config/index.ts`, `packages/server/src/server.ts`, `packages/server/tests/unit/config.test.ts`, `repo-tests/monorepo/server-package.spec.test.mjs`, this plan.

- [x] 1.1 [spec-author] Write the immutable security specification for forwarding-client-IP identity in `packages/server/tests/pentest/infrastructure/forwarded-client-ip-identity.spec.test.ts`: with `TRUST_PROXY=true` and the default hop count, a spoofed leading `X-Forwarded-For` value must not create a second rate-limit budget. The test server runs without nginx, so model the approved proxy append explicitly: send `X-Forwarded-For: <spoofed>, 203.0.113.99` and vary only the leading value across two token requests. Derive the identity from the token endpoint's `X-RateLimit-Remaining` delta; the resolved identity must be the fixed trailing peer. (RED expected: the current server splits the budget on the leading value.) ✅ (completed: 2026-09-21 20:51; created by spec-test-author)
- [x] 1.2 Run the specification and record the exact RED. ✅ (completed: 2026-09-21 20:51; RED: `expected 29 to be 28` — first=29, second=29, delta 0 because the leading value opened separate budgets)
- [x] 1.3 Implement `trustProxyHops`: add a bounded integer `TRUST_PROXY_HOPS` to `packages/server/src/config/schema.ts` (default `1`, minimum `0`), map it in `packages/server/src/config/index.ts`, and set `app.maxIpsCount = config.trustProxyHops` inside the existing `if (config.trustProxy)` block in `packages/server/src/server.ts:109`. ✅ (completed: 2026-09-21 20:51; spec test green: Test Files 1 passed, Tests 1 passed)
- [x] 1.4 Extend `packages/server/tests/unit/config.test.ts` with `TRUST_PROXY_HOPS` parsing, default, and bounds cases. ✅ (completed: 2026-09-21 20:52; 24/24 unit tests pass)
- [x] 1.5 Update the exact server test-file inventory in `repo-tests/monorepo/server-package.spec.test.mjs` (333 → 334) and run the focused pentest and unit suites plus `yarn test:structure`. ✅ (completed: 2026-09-21 20:52; pentest 1/1, unit 24/24, structure 126/126)

**Review**: [phase-1-review.md](phase-1-review.md) — 2 major and 4 minor findings, all remediated; fix re-review returned no new findings.

**Phase gate:** a spoofed leading `X-Forwarded-For` value leaves the resolved client IP and the
rate-limit key unchanged for the approved single proxy, single-entry traffic is unaffected, and no
existing assertion is weakened.

---

## Phase 2: ST-53 forwarding observers (harness)

> **Lenses**: security, integration

**Reference**: RD-05, ST-53; DEF-14; decisions D5–D8.

- [x] 2.1 [spec-author] Update the immutable aggregate oracle first: `assurance-all-aggregate.spec.test.ts` and `assurance-all-aggregate-requirements.ts` must expect an empty known-incomplete collector registry and no `forwarding-context-observer-incomplete` gap. (RED expected: the registry still registers the forwarding continuation.) ✅ (completed: 2026-09-21 22:30; RED: impl test `expected [] but got 2 entries` at registry assertion, and the aggregate spec fails `ASSURANCE_ALL_ITEMS_INVALID` because the executable registry still lists 7 known gaps vs the frozen 6)
- [x] 2.2 Implement `observeForwardedContext` in `test-harness/assurance/production-exposure/live-adapter.ts` and route the `forwarded-host`, `forwarded-proto`, and `forwarded-client-ip` families through it. Observations: `configured-public-origin-unchanged` (tenant discovery `issuer` equal before and after and equal to the configured origin), `cookie-policy-unchanged` (`_csrf` cookie still `Secure; HttpOnly; SameSite=Lax` with no `Domain`), `rate-limit-key-uses-direct-peer-not-spoofed-value` (two token requests that each send a single spoofed `X-Forwarded-For` value share one `X-RateLimit-Remaining` counter, because nginx appends the peer and the hop count keeps the last entry), and derive `rate-limit-budget-split-by-spoofed-ip` as its negation. ✅ (completed: 2026-09-21 22:34; added `forwarded-context-observers.ts` and split low-level helpers into `live-request-primitives.ts`; adapter back to 668 lines)
- [x] 2.3 Remove the forwarding registration from `test-harness/assurance/aggregate/registry.ts` (empty `aggregateKnownIncompleteCollectors`, drop the `forwarding-context-observer-incomplete` gap and the now-unused constant) and update `test-harness/assurance/aggregate/index.ts` exports accordingly. ✅ (completed: 2026-09-21 22:34; `index.ts` already re-exports the now-empty list; the admission gate is kept and now denies by default)
- [x] 2.4 Update `assurance-all-aggregate.impl.test.ts` (and any other fixture) to the empty-registry expectation and run the focused harness suites. ✅ (completed: 2026-09-21 22:34; updated the registry digest binding, repurposed the stale continuation test to fail-closed, focused suites 43/43, typecheck and lint clean)

**Review**: [phase-2-review.md](phase-2-review.md) — 1 critical, 2 major, and 4 minor findings; all remediated. The fix re-review confirmed the six original findings resolved and raised SA-007: the general token/introspection rate limiter is mounted on the wrong path, so the real token endpoint is not throttled. That product defect is recorded as DEF-25 and blocks only the ST-53 rate-limit identity fact.

**Phase gate:** the ST-53 origin and cookie facts are observed as concrete through attack-driven
probes; the rate-limit identity fact reports `unobserved` honestly because the real token endpoint
has no active limiter (DEF-25), so the case stays incomplete and does not manufacture assurance.
The aggregate no longer admits a forwarding continuation.

---

## Phase 3: Live verification, documentation, and closeout

> **Lenses**: security, documentation, integration

**Reference**: RD-05; DEF-14; decisions D1–D8.

- [ ] 3.1 Run `yarn assurance:harness --project security --profile operational` and `--profile production-security`; require that each `st53-*` case reports the origin and cookie facts as observed, no observed forwarding prohibited effect, and only the rate-limit identity fact unobserved (blocked by DEF-25) with exit 40; record the run identifiers.
- [ ] 3.2 Document `TRUST_PROXY_HOPS` in `docs/guide/environment.md`, `docs/guide/deployment.md`, and `.env.example`, stating that the value is the number of trusted proxy hops and defaults to `1`.
- [ ] 3.3 Update `codeops/features/test-assurance/00-remaining-work.md` and `00-roadmap.md` to record DEF-14 as resolved with the live run identifiers.
- [ ] 3.4 Full verification: `yarn verify` passes and the roadmap and remaining-work backlog record DEF-14 as done.

**Phase gate:** the forwarding-context claim is observed end-to-end with concrete evidence, the
new setting is documented, and the backlog no longer lists DEF-14.
