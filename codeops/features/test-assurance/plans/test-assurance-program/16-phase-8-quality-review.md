# Phase 8 Quality Review

> **Date**: 2026-08-20
> **Phase baseline tree**: `b47843aaf4c8b1273ded8a74c06796844e95d8cd`
> **Reviewed completion commit**: `db4ac6ba`
> **Disposition**: Corrections implemented; bounded re-review pending

## Review Result

The mandatory correctness and security reviews found three unique Major defects and three Minor
defects. One Major was reported independently by both reviewers. Auto-design accepted every Major
for the smallest complete in-scope correction; none was waived or reclassified.

| Finding | Severity | Ruling |
| --- | --- | --- |
| RV-801 / SA-801 | Major | Replace requirement-derived functional results with concrete live response and public-state observations. Correct the disabled-method status to the independently documented 403 contract. |
| SA-802 | Major | Re-read remaining recovery-code state after the fresh-code control and require exact ordered attempts. |
| RV-802 | Major | Add missing/wrong proof probes from the same-site sibling origin and independently prove the authenticated server session remains usable afterward. |
| RV-803 | Minor | Reported: make session-TTL reset unconditional across restart/session-creation failures. |
| SA-803 | Minor | Reported: bind second-factor evidence to the observed harness profile rather than a caller literal. |
| SA-804 | Minor | Reported: narrow the stale recovery-evidence roadmap dependency. |

## Accepted Correction

The correction keeps the immutable public contracts as the oracle and makes the live adapters
return what the browser, HTTP response, mailbox, session inventory, and administration API
actually observed. It does not add production hooks, timing measurements, source variations,
forced races/crashes, or new product behavior. The public login-method contract already specifies
403 for disabled methods, so aligning the requirements-owned status corrects an oracle defect
rather than accepting current behavior without authority.

The same-site CSRF addition reuses the retained SPA and Porta origins. The different-site loopback
probe remains unchanged. Both same-site missing and wrong proofs must produce no mailbox mutation,
and a fresh silent authorization must prove the server-side session remains usable after the
probes.

## Re-review

Pending one bounded re-review of the correction diff. The correction passed the focused
human-authentication suite (49 passed, 2 live-only skips), all 68 structure tests, assurance
typechecking and linting, the retained production-security live command, and full `yarn verify`
(233 server files / 3,382 tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests).
