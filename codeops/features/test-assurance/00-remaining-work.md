# Test Assurance: Remaining Work

> **Feature**: Test Assurance
> **Status**: Active backlog
> **Last Updated**: 2026-09-21 01:30
> **CodeOps Artifact Schema**: 1

## Purpose

This document is the durable "remember this" record of the test-assurance defects and gaps that
remain after the low-risk cleanup recorded in
[def-quick-cleanup](plans/def-quick-cleanup/00-index.md). A future session should start here to
decide which items to plan and implement. Each row names the verified current state, exactly what
completion requires, whether a product or security-authority decision is needed, and where the
work lives. It is a backlog, not an evidence artifact: nothing here grants assurance credit.

## Status legend

| Marker                      | Meaning                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Code-fixed, refresh pending | The product defect is fixed with tests, but the live assurance selector must be re-run to close the claim. |
| Partial                     | Part of the recorded gap is fixed; the residual is named.                                                  |
| Open (harness)              | A new or extended assurance capability is required.                                                        |
| Open (design)               | A product or contract decision is required before implementation.                                          |
| Policy-blocked              | A security-authority decision is required; the campaign was previously declined.                           |

## Remaining items

| ID     | Title                                                | Verified state              | What completion requires                                                                                                                                            | Authority                                | Location / selector                                                                                                      |
| ------ | ---------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| DEF-15 | Public product-version disclosure (live refresh)     | Code-fixed, refresh pending | Run the production-exposure selector and admit clean evidence for the absent `Server` version token                                                                 | None                                     | `test-harness/assurance/production-exposure/`; `yarn assurance:harness --project security --profile production-security` |
| DEF-16 | Dependency failure and reconnection (live refresh)   | Code-fixed, refresh pending | Re-run the dependency-interruption cases to confirm bounded responses and no restart requirement                                                                    | None                                     | `production-exposure/live-adapter.ts`; same selector                                                                     |
| DEF-14 | Forwarding-context observation completeness          | Open (harness)              | Implement the cookie-policy and rate-limit direct-peer identity observers                                                                                           | None                                     | `test-harness/assurance/production-exposure/live-adapter.ts:632`; `p1-production-exposure`                               |
| DEF-8  | Delivered-artifact sequential public evidence        | Open (harness)              | Build the ST-46 live adapter for magic-link, password-reset, and invitation sequential-use journeys                                                                 | None                                     | `test-harness/assurance/tests/human-auth-*`; `human-auth-live`                                                           |
| DEF-3  | Advanced protocol consistency campaign               | Open (harness)              | Implement the live concurrency, response-loss, restart, and commit-boundary adapter                                                                                 | None                                     | `test-harness/assurance/tests/protocol-consistency-adapter.ts`; `protocol-specs`                                         |
| DEF-6  | Protocol observation completeness                    | Open (harness)              | Independently establish the consent/session, JWKS-key, side-effect/recovery, and correlated-log subclaims                                                           | None                                     | `test-harness/assurance/tests/oidc-token-cases-live.ts`; `protocol` project                                              |
| DEF-22 | Real command-stage signal observation                | Open (harness)              | Execute real alias and registered-stage signal handling rather than the synthetic process group                                                                     | None                                     | `test-harness/assurance/command-outcomes/`; `assurance-command-signals`                                                  |
| DEF-5  | Protocol control sensitivity campaign                | Open (harness)              | Add disposable protocol source variations to the control-sensitivity registry                                                                                       | Product decision                         | `test-harness/assurance/control-sensitivity/registry.ts`                                                                 |
| DEF-11 | Human-auth control sensitivity campaign              | Open (harness)              | Add disposable human-auth source variations                                                                                                                         | Product decision                         | same registry                                                                                                            |
| DEF-17 | P1 source-variation sensitivity campaign             | Open (harness)              | Add disposable P1 source variations                                                                                                                                 | Product decision                         | same registry                                                                                                            |
| DEF-21 | Manual consent flow incompatible with tenant binding | Open (design)               | Decide whether a manual consent path must exist for same-organization or cross-organization clients; if yes, design a tenant-safe path and reopen the five UI cases | Product ruling                           | `packages/server/src/routes/interactions.ts:1113`; `packages/server/src/middleware/oidc-client-tenant.ts:152`            |
| DEF-23 | Statistical enumeration timing authority             | Policy-blocked              | Approve an enumeration hypothesis, effect-size bound, sample-size/power rule, and noise contract before any timing measurement                                      | Security authority (previously declined) | `test-harness/assurance/tests/human-auth-slice-profile-model.ts:81`                                                      |
| DEF-20 | Mutation pilot and CI promotion                      | Done (no-go)                | Revisit only if a compatible mutation runner is adopted and DEF-22 is closed; promotion stays withheld                                                              | Product decision                         | `test-harness/assurance/mutation/`; `21-ci-promotion-proposal.md`                                                        |

## Resolved by the fast cleanup

| ID               | Resolution                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DEF-4            | Atomic Redis authorization-code consumption; targeted integration suite passed (2026-09-21)                                                                                                                                                      |
| DEF-9            | Persisted TOTP accepted-step replay protection; unit and integration replay suites passed (2026-09-21)                                                                                                                                           |
| DEF-18           | SDK `pageSize` to `limit` mapping plus `nextCursor` cursor-loop alignment; SDK suites passed (2026-09-21)                                                                                                                                        |
| DEF-19           | Administrative session APIs expose `public_id`, never the Redis session key; unit suite passed (2026-09-21)                                                                                                                                      |
| DEF-15 (code)    | `server_tokens off;` in all tracked proxies and deployment examples; structure contract green                                                                                                                                                    |
| DEF-16 (code)    | Bounded `/health` and `/ready` probes, pool-error survival, reconnect regression test; focused suite green                                                                                                                                       |
| DEF-13 (product) | Administrative permission denials now emit one correlated event carrying a protected target digest alongside the actor, action, and result; see the [def-13-admin-denial-digest](plans/def-13-admin-denial-digest/00-index.md) plan              |
| DEF-13           | Live-boundary adapter observes every raw and administrative case; harness run `f84c62c8` passes the P1 suite with the accepted production-exposure exit 40; see the [def-13-live-boundary](plans/def-13-live-boundary/99-execution-plan.md) plan |

## Suggested sequencing

1. **Live refresh first** (DEF-15, DEF-16) — the product fixes are already in place; these close
   existing claims with one selector run.
2. **Forwarding-context observers** (DEF-14) — the remaining P1-related harness work; the P1 live
   adapter itself is complete and registered.
3. **DEF-14 then DEF-8** — both reuse the existing human-auth and production-exposure scaffolding.
4. **DEF-3, DEF-6, DEF-22** — protocol and command-signal campaigns.
5. **DEF-5, DEF-11, DEF-17** — source-variation sensitivity registries.
6. **DEF-21 and DEF-23** — product and security-authority rulings that gate "fully production
   ready".
