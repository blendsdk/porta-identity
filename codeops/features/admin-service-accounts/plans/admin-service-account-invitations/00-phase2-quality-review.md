# Phase2 Quality Review: Permanent Accounts and Lifecycle

> **Status**: Product review/full root/qualified assurance PASSED — fresh source CI/checkpoint pending
> **Baseline checkpoint**: cbd59bbfc766b1f82a67bf691102f8533e8cc68f
> **Complete baseline tree**: b1e6737b986a52a928bf2de5a7968bc868e01dda
> **Scope**: Strict Phase2 lifecycle and direct existing callers; no native-token acceptance
> **Date**: 2026-11-05

Both independent reviewers inspected the current uncommitted phase diff, new source/tests and
direct callers. No source bytes changed during their review. Generic role packets preserve
independence without adding project-local agents or routing configuration. Reviews are static;
supplied runtime results were not independently rerun.

| Partition | Reviewer | Result |
| --- | --- | --- |
| Correctness, maintainability, standards, concurrency, API | ses_e53995e40ffeaPe64fTdRaQj87 | RV-2-001 Major; RV-2-002 Minor |
| OWASP, authentication protocol, tenant isolation | ses_e5398af8cffeUhY28SndLfViJH | SA-2-001 Major; SA-2-002 Minor |

## Findings and necessary corrections

| Finding | Evidence before correction | Required remedy |
| --- | --- | --- |
| RV-2-001 Major | routes/clients.ts:355,381,396,412,461 omit actorId; bound service calls require it | Forward authenticated actor IDs in the five existing handlers; retain authoritative parent-lock checks |
| RV-2-002 Minor | Client/user mappers omit ServiceAccountManagementError; outer mutation owner converts it to503 | Map authorization denial to the existing sanitized403 envelope |
| SA-2-001 Major | rbac/role-service.ts:50 and routes/roles.ts:37 omit the separate machine role from canonical protection | Include the reserved slug in existing canonical protection sets, never the human permission catalog |
| SA-2-002 Minor | invite-service.ts:218 and invitation.ts:531–548 admit/persist reserved membership outside generic assignment guards | Reject new invitation pre-assignment and exclude reserved canonical membership when old invitations are accepted |

AR-26 records delegated technical authority, exact modification scope, rejected unsafe alternatives,
counterarguments and reopen triggers. These are corrections to approved behavior, not scope
additions. The minor findings are necessary invariant/status corrections rather than optional
enhancements. No finding is waived or dismissed.

## Specification-first remediation

Fresh source-restricted authors produced seven specifications/54 cases covering full createApp
client mutation/denial integration and canonical reserved-role CRUD plus new/old invitation
pre-assignment. Parent reviewed/linted/sealed them before correction:35 intended failures and19
ordinary/existing controls. All54 cases now pass in focused selections. Original Phase2 oracles
and fixtures remain unchanged. AR-27 records the user's exact assertion-order approval for one
new HTTP test, including replayed red and old/new seals. AR-28 records the user's two exact older
specification call-shape approvals. Neither changes a public expected result or security assertion.

Corrected selections pass37 role assertions,15 credential assertions and119 HTTP/client lifecycle
assertions; these overlap and must not be summed. Fresh checks pass158 structure/1,880 affected,
4,417 unit and899 integration assertions, plus server lint/typecheck/build. Corrected-source E2E134,
pentest334 and browser135 pass, with browser retries0. No whole-phase assurance pass is claimed.

## Single scoped re-review — 2026-11-05 19:55

Both original reviewers inspected the exact frozen six-file correction against preserved
pre-correction source, with the new independent regressions and exact authorized older fixture
diff. No third review or renewed whole-phase audit was performed.

| Reviewer | Closure evidence |
| --- | --- |
| ses_e53995e40ffeaPe64fTdRaQj87 | RV-2-001 and RV-2-002 closed: all five handlers forward actor identity, post-lock authority remains, sanitized403 survives transaction rollback |
| ses_e5398af8cffeUhY28SndLfViJH | SA-2-001 and SA-2-002 closed: canonical protection includes the separate role; admission and actual old-invitation assignment exclude the canonical pair |

Neither partition identified a correction-introduced Critical/Major defect. Review was static;
runtime and production-security evidence were not independently rerun or qualified. Reviewers
created no temporary artifacts or infrastructure. Their progress prose is not task authority;
99-execution-plan.md remains the sole source for the current verified count.

## CI execution discovery after the source checkpoint

Source CI42089720974 fails before the new HTTP assertions because Turbo filters the outer test
URL variables while the integration worker does not explicitly populate TEST_DATABASE_URL and
TEST_REDIS_URL. The first full-root rerun reaches the same missing Redis marker in the pentest
worker. AR-30 preserves sealed reset-safety guards and adds only the already-derived integration
URL pair and pentest Redis marker to their existing env blocks. Product source and independent review
closures are unchanged. Full root pnpm verify and fresh CI must qualify this test-runner fix;
the earlier direct category passes are not substituted for those gates. The read-only CI workflow
and Turbo policy remain unchanged.

The final exact three-field runner correction passes full root pnpm verify at2026-11-05 21:06
with both outer TEST URLs absent. Results: SDK610, CLI1,795, server unit4,417/integration899/
E2E134/pentest334, structure158 and all lint/typecheck/build tasks. Fresh source CI remains pending.

The clean0f9cb04b production-security run completes with exit0: all11 exposure cases,7 functional
human-authentication,4 second-factor,17 tenant/admin and5 recovery tests pass. Its schema-validated
artifact identifies the exact source commit/tree, no product/execution failure and no incomplete
case. Correlated-log credit is explicitly false and is not claimed. This is evidence for that
named revision; subsequent test-runner-only changes are not relabeled as this run. All production
source/migration/template/locale bytes remain identical. Run containers/network, the exact unused
run-tagged image and the two user-confirmed anonymous volumes are removed; the approved short
temporary root is removed. Separate active root-verification services are not part of this cleanup.

## Prior runtime evidence — insufficient to close the findings

| Check | Observed result before correction |
| --- | --- |
| New sealed lifecycle/human oracles |240 assertions pass |
| Complete server unit |4,417 pass |
| Complete integration |834 pass |
| Complete E2E |134 pass |
| Complete pentest |334 pass |
| Browser, one worker and zero retries |135 pass |
| Selected feature coverage |521 pass;91.97% statements,86.74% branches,100% functions,99.11% lines |
| Affected tests / structure |1,878 affected and158 structure pass |
| Complete server lint/typecheck/build |Pass |

These selections missed the existing-route caller and reserved pre-assignment surfaces. They
remain dated evidence, not proof of corrected source. Public management routes and native machine
tokens are intentionally not mounted in this phase. Production-security assurance, clean source
checkpoint, documentation and runtime teardown remain pending.
