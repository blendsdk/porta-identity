# Phase 4 Review: Live boundary adapter

> **Document**: phase-4-review.md
> **Parent**: [Index](00-index.md)
> **Reviewed**: 2026-09-21
> **Scope**: `p1/live-adapter.ts`, the raw and admin requirement catalogs, the harness registration
> **Reviewer**: correctness-reviewer (independent)
> **Verdict**: `FIX REQUIRED`

## Summary

The live suite produces real status, state-digest, and log-correlation evidence, and all 15 raw and
18 admin cases pass against the operational stack (run `f84c62c8`). However, the review found that
several declared security properties are asserted by constants or by echoing the requirement, so the
PASS overstates what was verified. DEF-13 is reopened pending a ruling.

## CRITICAL

| ID  | Finding                                                                                                                                                                                                                                                                                 | Evidence                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| C1  | Forwarded-header security assertions are constants: `configured-public-origin-unchanged` always `true`; `secure-cookie-policy-weakened` and `rate-limit-budget-split-by-spoofed-ip` always `false`. No real cookie, origin, or rate-limit regression can be detected in the ST-53 lane. | `p1/live-adapter.ts` `rawStateObservation`/`rawProhibitedEffect`                                                               |
| C2  | `exposedForbiddenFields` ignores `requirement.forbiddenLogFields` and does not detect private keys, opaque tokens, session cookies, or PII; the admin lane never scans the correlated log. A response that leaks those with an expected status passes.                                  | `p1/live-adapter.ts` `forbiddenFields`; `validation-exposure-case-model.ts:141-157`; `admin-data-case-requirements.ts:134-142` |
| C3  | `pagination-cross-tenant-cursor` sends `?cursor=&limit=2` because `readNextCursor` returns `''`, so cross-tenant cursor isolation is not exercised; the case was relabelled `200`.                                                                                                      | `p1/live-adapter.ts` `readNextCursor`; `admin-data-case-requirements.ts`                                                       |

## MAJOR

| ID  | Finding                                                                                                                                                                                                                                          | Evidence                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| M1  | `rawBodyContract` returns `requirement.expected.bodyContract` by default and `adminExactPublicOutcome` returns `requirement.exactPublicOutcome` when the status matches, so those oracle assertions are tautological given the status assertion. | `p1/live-adapter.ts`                                   |
| M2  | `control.requiredObservations` / `control.reachabilityObservations` are never mapped or asserted; only the control status is checked.                                                                                                            | `p1/live-adapter.ts:157,207`                           |
| M3  | `st54-unsupported-method` dropped `headerContract` and `requiredLogFields` to `[]`, although the server emits a decision for admin-api 405s.                                                                                                     | `validation-exposure-raw-case-requirements.ts:425,433` |
| M4  | `adminDataDenialLogFields` drops `actor-id` for unprivileged denials, accepting an unattributable denial.                                                                                                                                        | `admin-data-case-requirements.ts`; AR-7                |

## MINOR

- `alpha-total-count-excludes-bravo` is mapped to `stateUnchanged`, not a count check; `all-alpha` uses a vacuously true `.every` on an empty page.
- The control body is the requirement constant (`control.expectedResult`), never asserted.
- Admin cases declare `transport: 'raw-http'` but are sent via Playwright's normalizing `api.fetch`.
- `connection-remains-bounded` treats a missing `content-length` as `0`.
- `process.env as Record<string, string>` cast; a redundant `project === 'security'` test; exit-class precedence can relabel a P1 failure; the P1 block runs on a stack whose production exposure already failed.

## What the review confirmed as sound

- Log correlation uses the server-issued `X-Request-Id` and cannot attribute a wrong record; a
  missing record fails loudly.
- No `as any` casts or reachable dead branches.
- The P1 registration is correctly gated to the `security` + `operational` lane.

## Consequence

DEF-13 is reopened. The adapter's PASS now depends on fixes for C1–C3 and rulings on M3/M4. No fix
has been applied yet.
