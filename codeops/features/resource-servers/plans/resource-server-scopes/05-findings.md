# Findings: Resource-Server Scopes and Audience

> **Plan**: `resource-servers/plans/resource-server-scopes`
> **Last Updated**: 2026-11-07

## Review Findings

| ID | Severity | Area | Finding | Ruling |
| --- | --- | --- | --- | --- |
| F1 | MAJOR | verification | The first implementation proved only resolver and callback behavior; no real provider request or adversarial cross-application case existed, and fixtures used `audience = identifier`. | Fixed: E2E and pentest cases use two applications, a distinct audience, a real client-credentials request, introspection, cross-application rejection, unregistered-scope rejection and the no-resource path. |
| F2 | MINOR | migration coverage | Migration 038 had no schema test and the truncate helper did not list the new tables. | Fixed: a 038 schema spec covers default audience, collision, URI/length/scope constraints, cascade and down/up; truncate lists both tables explicitly. |
| F3 / SA-3 | MINOR | documentation | Docs claimed resource-bound tokens retain userinfo access and described the allowed scope set as the issued scope set. | Fixed: docs now state that issued tokens carry only requested/granted scopes and that audience-bearing tokens are for their resource server; userinfo needs a no-resource authorization. |
| F4 | MINOR | audience default | Docs promised an identifier default that the schema did not implement. | Fixed: a BEFORE INSERT/UPDATE trigger supplies the identifier when audience is omitted. |
| F5 | MINOR | schema validation | SQL accepted over-2,048-character and some URL-invalid values. | Fixed: length constraints added; the service keeps full URL validation. SQL-seeded rows must satisfy the service model. |
| F6 | MINOR | migration-test order | The global integration setup disabled migration order checks to tolerate targeted reversal. | Fixed: the global check is restored; migration specs repair only their two ledger rows after ensuring both schemas are applied. |
| SA-1 | MINOR | audience namespace | One row's audience could equal another resource's identifier, allowing an audience collision; a read-then-write trigger was not concurrency-safe. | Fixed: a `resource_server_namespace` primary key enforces the shared namespace for concurrent writers; schema tests cover collisions and the default. |
| SA-2 | MINOR | verification | The first E2E/pentest set did not prove registered-but-unrequested scope minimization or the reverse wrong-owner direction. | Partially fixed: distinct scopes are registered and only one requested; the owner client also requests another application's registered resource; the no-resource audience is asserted absent. Authorization-code, refresh resource-switch and `/me` cases remain residual because interactive login belongs to the browser harness. |

## Verification

| Gate | Result |
| --- | --- |
| Focused resolver/config | 13 passed |
| Focused integration | 4 resolver cases passed |
| Migration/038 schema specs | 18 passed; 038 schema suite 6 passed including concurrency |
| New E2E / pentest | 5 / 2 passed; full E2E 139 and pentest 336 |
| Server unit | 4,445 passed |
| Server integration | 1,105 passed + 68 skipped only when the long suite hit a local Redis timeout; the skipped file passes 68/68 alone |
| Server E2E | 139 passed |
| Server pentest | 336 passed |
| Structure / docs build | 158 / passed |
| Independent review | F1–F6 and SA-1/SA-3 closed; SA-2 residual verification recorded |
| CI | PR #222 all six jobs passed |
| Production-security assurance | Exit 0; 33 cases + 11 exposure passes, 0 incomplete |

## Notes

- The repository remains application-global; resource servers have no organization column. This matches
  the confirmed per-application model and the existing application/role ownership.
- No Admin management API is included. Rows are deployment data until a later surface reuses the
  resolver and validation.
- The no-resource path is unchanged and continues to serve userinfo.
