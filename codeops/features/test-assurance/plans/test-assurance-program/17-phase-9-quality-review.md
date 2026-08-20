# Phase 9 Quality Review

> **Date**: 2026-08-20
> **Phase baseline tree**: `21560f04704061ba5afa0bf708da79a76a3fd85c`
> **Reviewed completion commit**: `2f568e25`
> **Correction commits**: `c1752c32`, `559c7606`
> **Disposition**: Complete after bounded re-review and residual correction

## Review Result

The mandatory correctness and security reviews found four unique Major defects and one Minor
defect. Auto-design accepted every Major for the smallest complete harness-only correction. No
finding was waived, and the migration constraint prohibited changing the product behaviors exposed
by the corrected checks.

| Finding | Severity | Ruling |
| --- | --- | --- |
| RV-901 / SA-901 | Major | Replace requirement-derived production cookie facts with an exact server-session inventory delta, public logout, and rejected captured-cookie reuse. |
| SA-902 | Major | Configure the harness-owned administrative CORS allowlist and require the exact positive and negative response-header contracts. |
| RV-902 / SA-903 | Major | Compare packed pagination and cardinality against independent fixture totals and the correct raw cursor parameter; retain SDK incompatibility as a product failure. |
| RV-903 / SA-904 | Major | Enforce allowlisted public signing-key schemas and scan all protected credential, cookie, token, private-key, and foreign-tenant classes. |
| SA-905 | Minor | Require the exact immutable case set for each production-exposure profile. |

## Accepted Corrections

The production-exposure adapter now observes configured CORS response fields and independently
proves one new authenticated session, public logout, session removal, and failed reuse of the
captured cookie. Profile admission rejects missing, duplicate, or unexpected cases.

The packed-client adapter now derives fixture cardinality independently, uses the public cursor wire
parameter for the raw control, validates the exact public signing-key field set, and performs
recursive protected-material checks. A further fail-closed correction retains sanitized evidence
when such a check finds a product exposure; it never converts that evidence into a passed journey.

## Corrected Evidence

| Evidence | Result |
| --- | --- |
| Production-security `88482aa5-bcb8-45e4-9cd4-69964d8ac71d` | Exact CORS controls and independent session-cookie lifecycle pass; three forwarding observations remain incomplete; five existing exposure/dependency product failures remain. |
| Operational `eb20d958-800e-4ca0-8e6f-5ff10c6227ab` | Three forwarding observations remain incomplete and three existing exposure/dependency cases remain product failures. |
| Packed P1 `178cc0f3-240e-4d25-9793-b57f1e6c524c` | Four journeys pass; SDK cursor cardinality and session-identifier exposure are product failures; cleanup, provenance, state nonmutation, and redaction admission pass. |

The new product failures are routed through DEF-18 and DEF-19. They are not fixed in this structural
migration. Full `yarn verify` passed after each correction (233 server files / 3,382 tests, 31 SDK
files / 404 tests, and 29 CLI files / 355 tests).

## Re-review

The one bounded correctness re-review was clean. The security re-review found one residual Major:
the packed adapter detected the protected session identifier but persisted that raw value in its
otherwise owner-only evidence. Auto-design accepted the smallest harness-only correction. Session
identities are now transformed into domain-separated, run-scoped SHA-256 digests before evidence
construction, and validation rejects any raw session identity. The transient scanner still checks
the original response so the product exposure remains visible as DEF-19. No third review is
permitted by the quality protocol; focused and full verification plus regenerated clean evidence
own the final correction gate.
