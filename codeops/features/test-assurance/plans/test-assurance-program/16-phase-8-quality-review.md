# Phase 8 Quality Review

> **Date**: 2026-08-20
> **Phase baseline tree**: `b47843aaf4c8b1273ded8a74c06796844e95d8cd`
> **Reviewed completion commit**: `db4ac6ba`
> **Disposition**: Complete after bounded re-review and residual correction

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

The one bounded correctness/security re-review confirmed SA-802 and RV-802 corrected, but both
reviewers found that SA-801/RV-801 remained partial: broad response labels and global mailbox
counts could still hide body/header differences, wrong-recipient delivery, or session response
regressions. Auto-design accepted the residual as a required correction rather than waiving it.

The residual correction compares secret-free normalized public-body and bounded-header digests,
requires recipient-specific and global MailHog cardinality to agree, and derives every session
response from its completed browser or raw HTTP observation. Focused typecheck, lint, and all 51
human-authentication cases pass. Production-security run
`9e6659f3-ff0d-448a-83a4-8d0b97711673` passed every live block and cleaned its owned stack. Full
`yarn verify` passed after the final correction (233 server files / 3,382 tests, 31 SDK files / 404
tests, and 29 CLI files / 355 tests). Per the quality protocol, no third review was requested.
