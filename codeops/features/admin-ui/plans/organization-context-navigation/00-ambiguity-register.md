## Ambiguity Register: Organization Context and Navigation Plan

> **Status**: ✅ GATE PASSED — all 10 items resolved
> **Last Updated**: 2026-08-28 11:54

|   # | Category                    | Ambiguity / Gap                                                                                                                            | Options Presented                                                                                                                                                                                | User Decision                                                     | Status      |
| --: | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------- |
|   1 | Technical unknowns / naming | How should the new organization behavior be split without growing the current 457-line application into a large mixed-responsibility file? | A: add focused `organization-service.ts` and `organization-dialogs.ts`, while extending existing state, presentation, session, and application files / B: place everything in the existing files | User accepted Option A                                            | ✅ Resolved |
|   2 | UX & presentation           | In what order should the complete organization list appear?                                                                                | A: preserve the existing SDK/server order / B: sort locally by name                                                                                                                              | User accepted Option A                                            | ✅ Resolved |
|   3 | Behavioral gaps             | Which fixed local error categories may the organization workflows display?                                                                 | A: `Validation failed`, `Not authorized`, `Conflict`, `Service unavailable`, and `Invalid server response` / B: one generic `Operation failed` category                                          | User accepted Option A                                            | ✅ Resolved |
|   4 | Scope ambiguities           | Does the plan implement only approved RD-02 behavior inside the existing CLI?                                                              | Existing CLI only; no server, SDK, dependency, workspace, workflow, matrix, search, or pagination changes                                                                                        | Pre-resolved by approved RD-02 and its accepted preflight rulings | ✅ Resolved |
|   5 | Integration points          | Which verification boundary applies when server and SDK code remain untouched?                                                             | Focused CLI specifications/security tests, CLI package verification, repository structure tests, and the existing packed playground journey on Node 24 LTS; no full Porta/server verification    | Pre-resolved by user and RD-02 AC-10                              | ✅ Resolved |
|   6 | Security & compliance       | Where does authorization remain authoritative?                                                                                             | UserInfo capabilities control advisory affordances; existing Admin API 401/403 decisions remain authoritative; organization selection grants no authority                                        | Pre-resolved by RD-02 OC-04 and Authorization                     | ✅ Resolved |
|   7 | Data & state                | What organization data is retained and for how long?                                                                                       | Validated `{ id, name, slug, status }` projection in process memory only                                                                                                                         | Pre-resolved by accepted PF-009 and RD-02 State boundaries        | ✅ Resolved |
|   8 | Edge cases                  | How are cancellation, duplicate create, 401 replay, and indeterminate create handled?                                                      | Logical organization-operation cancellation quarantines late results; one SDK 401 refresh replay is allowed; duplicate activation and indeterminate retries are prohibited                       | Pre-resolved by accepted PF-004/PF-005 and RD-02 OC-10            | ✅ Resolved |
|   9 | Testing                     | Where are new end-to-end observations added?                                                                                               | Extend the existing packed admin-playground journey; add no new harness, workflow, or matrix                                                                                                     | Pre-resolved by accepted PF-008 and RD-02 AC-10                   | ✅ Resolved |
|  10 | Testing / destructive scope | How does the packed create journey remove the organization it creates?                                                                     | Generate a high-entropy slug, prove it is test-owned, and use the installed packed SDK to destroy exactly that slug in an inner `finally` before playground teardown                             | User accepted the corrected minimal cleanup after preflight       | ✅ Resolved |

### Resolution Notes

**AR-1:** Recommendation: Option A. `application.ts` is already 457 lines; two narrow files keep
dialog construction and UI-neutral organization validation/operations separate without creating a
framework or package. User accepted Option A on 2026-08-28.

**AR-2:** Recommendation: Option A. Preserve `organizations.listAll()` order and avoid adding local
sorting behavior that the requirement never requested. User accepted Option A on 2026-08-28.

**AR-3:** Recommendation: Option A. Five allowlisted categories keep errors useful while preventing
raw SDK/server detail from reaching the terminal. User accepted Option A on 2026-08-28.

**AR-4–AR-9:** Imported from the approved and preflighted RD-02 decision record; these items require
no new confirmation unless their meaning changes.

**AR-10:** The original CLI cleanup assumption was invalidated because its dry-run parameter does
not match the server route. The corrected test-only path proves the high-entropy slug is test-owned,
uses a packed Node child with the temporary credential/TLS boundary to delete it once through the
installed packed SDK in an inner `finally`, and verifies absence before playground teardown.
Simultaneous journey and cleanup failures are preserved together. No SDK, server, or product CLI
change is introduced. User approved the minimal correction on 2026-08-28.
