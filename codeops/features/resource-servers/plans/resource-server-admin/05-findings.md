# Findings: Resource-Server Admin Management

> **Plan**: `resource-servers/plans/resource-server-admin`
> **Last Updated**: 2026-11-09 00:49

## Phase 1 — Server Contract Review

| Finding | Phase | Severity | Area | Ruling |
| --- | --- | --- | --- | --- |
| RV-001 / SA-004 / SR-002 | 1 | MAJOR | resource-server name control characters | fixed; unit and integration cases added |
| RV-002 / SA-003 / SR-001 | 1 | MAJOR | identifier/audience URI normalization | fixed; lowercase scheme, whitespace/control rejection, 23514 mapping |
| SA-001 | 1 | MAJOR | case-variant admin path audit/rate-limit/parser bypass | fixed in shared audit, rate, CORS, body-parser and decision-context gates |
| SA-002 / SR-005 | 1 | MAJOR | missing ST-29 pentest and real-mount coverage | fixed; real-mount pentest covers 401, 404, 403, mixed-case audit, invalid input |
| RV-003 / SA-005 | 1 | MINOR | service-level scope normalization | fixed; normalizeScopes rejects standard and duplicate scopes |
| RV-004 | 1 | MINOR | UUID-shaped resource-server slug ambiguity | fixed; create/update reject with 400 |
| RV-005 | 1 | MINOR | auto-generated slug can be invalid | fixed; explicit 400 and regression test |
| RV-006 | 1 | MINOR | invalid path shape returns 404 instead of 400 | fixed; path schemas validate UUID-or-slug |
| RV-007 | 1 | MINOR | update row type declares absent scopes | fixed; mutation row omits scopes explicitly |
| RV-008 | 1 | MINOR | missing update-conflict and slug-resolution tests | fixed; integration cases added |
| SA-006 / SR-003 | 1 | MINOR | pre-delete token validity proof | fixed for row-survival; full provider issuance accepted residual |
| SR-004 | 1 | MINOR | namespace and distinct-audience delete coverage | fixed; namespace removal and value reuse covered |
| RV2-001 | 1 | MAJOR | server test inventory count stale after new tests | fixed; expectedCount updated to 465; structure gate green |
| SA2-001 | 1 | MINOR | mixed-case security-decision surface classification | fixed; decision-context normalizes the path |
| SA2-002 | 1 | NOTE | stale admin-auth comment about case-sensitive prefix | fixed; comment updated |
| SA2-003 | 1 | MINOR | Unicode format controls in display names | accepted residual — single-operator Admin, terminal display only, no authorization/data impact |
| SR2-001 | 1 | MINOR | synthetic token row does not prove full provider issuance | accepted residual — delete never touches `oidc_payloads`; provider issuance is covered by existing suites |
| SR2-002 | 1 | NOTE | multi-resource authorization is pre-existing | accepted residual — out of this plan's scope |
| SR2-003 | 1 | NOTE | identifier canonicalization is exact-string | accepted behavior; RD-01 and Phase 4 docs require the canonical URI form |
| SR2-004 | 1 | MINOR | real-mount 403 was missing | fixed; no-role admin test added to the pentest suite |

## Review Evidence

| Gate | Result |
| --- | --- |
| Phase 1 targeted unit tests | 27 passed |
| Phase 1 integration spec + impl | 40 passed |
| Phase 1 pentest | 4 passed |
| Server lint / typecheck / build | Passed |
| Structure after inventory update | 179 / 179 passed |
| Scoped re-review | No remaining Critical/Major after RV2-001 fix |
