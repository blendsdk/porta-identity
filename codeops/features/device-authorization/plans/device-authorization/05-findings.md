# Findings Ledger: Device Authorization

> **Parent**: [Index](00-index.md)
> **CodeOps Artifact Schema**: 1

| Finding | Phase | Severity | Area | Ruling |
|---|---|---|---|---|
| RV-001 | 1 | MAJOR | cookie signing defaults | fixed — explicit `signed:false` preserves the pre-feature unsigned contract; resume reads stay signed |
| RV-002 | 1 | MAJOR | resume tests | fixed — underscore/encoded UID, mismatched resume cookie, same-org resume and `expiresWithSession` tests |
| RV-003 | 1 | MAJOR | migration lock | fixed — `.cjs` migration with `noTransaction()` and `CREATE INDEX CONCURRENTLY` |
| RV-004 | 1 | MINOR | interaction organization | fixed — client organization string preferred; unit regression added |
| RV-005 | 1 | MINOR | fixture shapes | fixed — 43-character provider-shaped identifiers |
| RV-006 | 2 | MAJOR | overlong device code bypass | fixed — shared bounded-code predicate; hard counters charged before the bound check |
| RV-007 | 2 | MAJOR | reset IP source | fixed — outer resolved IP carried on the request for the approval reset |
| RV-008 | 2 | MAJOR | cookie-integrity claim | rejected — `app.keys` was added by this feature; `signed:false` restores the `develop` unsigned behavior (verified with `git show develop` and `git show 260b861e`) |
| RV-009 | 2 | MAJOR | CAS test determinism | fixed — adapter-level CAS, completion and pre-approval error-save tests |
| RV-010 | 2 | MINOR | 429 branding/locale | fixed — outer `state.organization` and request IP fallbacks |
| RV-011 | 2 | MINOR | page titles and scope labels | fixed — translated page titles and consent scope labels with raw fallback |
| RV-012 | 2 | MINOR | denial reason/duplicates | fixed — `denied`/`aborted`, NX denial marker, org lookup before marker |
| RV-013 | 2 | MINOR | audit marker failure | fixed — `writeAuditLogStrict` and marker deletion on failure |
| RV-014 | 2 | MINOR | slow_down CORS / 429 headers | fixed — shared CORS helper and 429 budget headers |
| RV-015 | 2 | MINOR | malformed parser double count | fixed — parser sentinel; malformed bodies charged once on `/device`, `/device/auth` and `/token` |
| RV-016 | 2 | MINOR | poll key collision | fixed — `device-poll:client:` namespace; unit regression |
| RV-017 | 2 | MINOR | static device auth path | fixed — removed pass-through; generic 404; integration regression |
| RV-018 | 2 | MINOR | missing impl tests / vacuous test | fixed — limiter/audit unit files; vacuous logger test removed |
| RV-019 | 2 | MINOR | weak assertions/docs/migration test | fixed — status, interaction, audit metadata, docs and `.cjs` contracts |
| SA-001 | 2 | MAJOR | overlong device code bypass | fixed — same shared predicate and hard-counter ordering |
| SA-002 | 2 | MAJOR | reset IP source | fixed — request-carried outer IP |
| SA-003 | 2 | MINOR | 429 branding/locale | fixed — outer organization and locale |
| SA-004 | 2 | MINOR | denial duplicate/fallback | fixed — NX marker, org lookup before marker, strict write |
| SA-005 | 2 | MINOR | audit strict failure | fixed — strict writer |
| SA-006 | 2 | MINOR | slow_down CORS | fixed — shared origin helper |
| SA-007 | 2 | MINOR | poll key collision | fixed — client namespace |
| SA-008 | 2 | MINOR | malformed `/device/auth` and `/token` | fixed — address aggregates charged |
| SA-009 | 2 | MINOR | GET `/device/auth` resume | fixed — pass-through removed, integration regression |
| PF5-001 | 5 | MINOR | harness migration oracle | fixed — the reset oracle now accepts `.sql`, `.cjs` and `.js` migrations, matching node-pg-migrate and migration 039 |
| PF5-002 | 5 | NOTE | stale-authority status codes | verified — client/organization removal returns `invalid_client` 401, user removal or deactivation returns `invalid_grant` 400, and no token set is issued |
