## Ambiguity Register: Organization Context and Navigation Plan

> **Status**: ✅ GATE PASSED — all 16 items resolved
> **Last Updated**: 2026-08-28 13:39

|   # | Category                     | Ambiguity / Gap                                                                                                                                     | Options Presented                                                                                                                                                                                | User Decision                                                     | Status      |
| --: | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------- |
|   1 | Technical unknowns / naming  | How should the new organization behavior be split without growing the current 457-line application into a large mixed-responsibility file?          | A: add focused `organization-service.ts` and `organization-dialogs.ts`, while extending existing state, presentation, session, and application files / B: place everything in the existing files | User accepted Option A                                            | ✅ Resolved |
|   2 | UX & presentation            | In what order should the complete organization list appear?                                                                                         | A: preserve the existing SDK/server order / B: sort locally by name                                                                                                                              | User accepted Option A                                            | ✅ Resolved |
|   3 | Behavioral gaps              | Which fixed local error categories may the organization workflows display?                                                                          | A: `Validation failed`, `Not authorized`, `Conflict`, `Service unavailable`, and `Invalid server response` / B: one generic `Operation failed` category                                          | User accepted Option A                                            | ✅ Resolved |
|   4 | Scope ambiguities            | Does the plan implement only approved RD-02 behavior inside the existing CLI?                                                                       | Existing CLI only; no server, SDK, dependency, workspace, workflow, matrix, search, or pagination changes                                                                                        | Pre-resolved by approved RD-02 and its accepted preflight rulings | ✅ Resolved |
|   5 | Integration points           | Which verification boundary applies when server and SDK code remain untouched?                                                                      | Focused CLI specifications/security tests, CLI package verification, repository structure tests, and the existing packed playground journey on Node 24 LTS; no full Porta/server verification    | Pre-resolved by user and RD-02 AC-10                              | ✅ Resolved |
|   6 | Security & compliance        | Where does authorization remain authoritative?                                                                                                      | UserInfo capabilities control advisory affordances; existing Admin API 401/403 decisions remain authoritative; organization selection grants no authority                                        | Pre-resolved by RD-02 OC-04 and Authorization                     | ✅ Resolved |
|   7 | Data & state                 | What organization data is retained and for how long?                                                                                                | Validated `{ id, name, slug, status }` projection in process memory only                                                                                                                         | Pre-resolved by accepted PF-009 and RD-02 State boundaries        | ✅ Resolved |
|   8 | Edge cases                   | How are cancellation, duplicate create, 401 replay, and indeterminate create handled?                                                               | Logical organization-operation cancellation quarantines late results; one SDK 401 refresh replay is allowed; duplicate activation and indeterminate retries are prohibited                       | Pre-resolved by accepted PF-004/PF-005 and RD-02 OC-10            | ✅ Resolved |
|   9 | Testing                      | Where are new end-to-end observations added?                                                                                                        | Extend the existing packed admin-playground journey; add no new harness, workflow, or matrix                                                                                                     | Pre-resolved by accepted PF-008 and RD-02 AC-10                   | ✅ Resolved |
|  10 | Testing / destructive scope  | How does the packed create journey remove the organization it creates?                                                                              | Generate a high-entropy slug, prove it is test-owned, and use the installed packed SDK to destroy exactly that slug in an inner `finally` before playground teardown                             | User accepted the corrected minimal cleanup after preflight       | ✅ Resolved |
|  11 | Testing (runtime)            | How should the older exact stored-session assertion represent newly required capabilities when `/me` contains no capability claims?                 | A: require both booleans to be false / B: omit the capability object conditionally                                                                                                               | AI selected A under delegated auto-design authority               | ✅ Resolved |
|  12 | Internal interface (runtime) | What is the smallest UI-only input for the organization chooser while application code retains network ownership?                                   | A: capabilities plus an optional application-owned list promise / B: give the dialog the organization service                                                                                    | AI selected A under delegated auto-design authority               | ✅ Resolved |
|  13 | Testing (runtime)            | How should retained authentication tests prove identity replacement after identity moves off the landing view?                                      | A: inspect identity through the real Who am I dialog / B: retain identity text on the landing view                                                                                               | AI selected A under delegated auto-design authority               | ✅ Resolved |
|  14 | Internal interface (runtime) | Where should direct application tests and prepared production sessions supply organization operations?                                              | A: add optional `organizations` to the existing `AdminApplicationSession` / B: add a separate top-level application option and dialog-choice test seams                                          | AI selected A under delegated auto-design authority               | ✅ Resolved |
|  15 | Test structure (runtime)     | Where should the large Phase 3 organization-workflow specification block live when adding it to the existing file would make that file 1,060 lines? | A: one focused `application.organization.spec.test.ts` file / B: retain the oversized mixed file                                                                                                 | AI selected A under delegated auto-design authority               | ✅ Resolved |
|  16 | Source structure (runtime)   | How should the application coordinator remain below the source-file limit after adding the approved workflows?                                      | A: extract only the pre-existing native terminal host adapter to `application-runtime.ts` / B: introduce an organization-workflow manager                                                        | AI selected A under delegated auto-design authority               | ✅ Resolved |

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

**AR-11 (runtime):** Authority: AI — delegated by `--auto-design`. Eligibility: specification
alignment inside the approved ephemeral-capability behavior. Objective: keep one stable
authenticated result shape while ensuring missing claims grant no action. Decision: the existing
stored-session specification now requires both capability booleans to be false when `/me` omits
roles and permissions. Evidence: the approved component contract says authenticated state carries
capabilities and missing claims disable actions; the older exact assertion predated that field.
Rejected alternative: conditionally omitting capabilities would complicate every consumer and
contradict the stable state contract. Strongest counterargument: preserving the old exact shape
would avoid one test edit, but only by making the new field inconsistent. Confidence: High.
Hardening: direct comparison against RD-02 and the Phase 1 component contract converged on one
viable shape. Policy version: 1. Root invocation ID: `ad-20260828-admin-ui-rd02`. Reopen trigger:
the approved authenticated-state contract makes capabilities optional.

**AR-12 (runtime):** Authority: AI — delegated by `--auto-design`. Eligibility: internal dialog
interface design within the approved application/service ownership. Objective: keep dialogs
presentation-only and reuse the existing application operation owner. Decision:
`OrganizationChooserOptions` carries fixed capabilities and an optional application-owned
organization-list promise; an absent promise means listing is unavailable. Evidence: the approved
component split assigns SDK calls/cancellation to the application and rendering to dialogs.
Rejected alternative: injecting the service into the dialog would mix network and modal ownership.
Strongest counterargument: a service-aware dialog needs less application glue, but it duplicates
operation lifecycle behavior. Confidence: High. Hardening: the interface follows the current
`runAbortableDialog()` boundary and adds no layer or dependency. Policy version: 1. Root invocation
ID: `ad-20260828-admin-ui-rd02`. Reopen trigger: JSVision gains a standard asynchronous chooser
contract that already owns cancellation.

**AR-13 (runtime):** Authority: AI — delegated by `--auto-design`. Eligibility: specification
alignment inside the approved identity-dialog behavior. Objective: retain authentication and
replacement evidence without leaking identity onto the organization landing view. Decision: the
existing authentication tests inspect the verified identity through the real Who am I dialog after
the operation completes. Evidence: the approved presentation contract moves identity entirely to
Who am I, while the older assertions inspected the superseded summary. Rejected alternative:
retaining identity on the landing view directly contradicts the approved presentation behavior.
Strongest counterargument: direct landing assertions are shorter, but they test behavior that is no
longer allowed. Confidence: High. Hardening: the corrected checks exercise the same user-visible
dialog path as the navigation specifications and add no test seam. Policy version: 1. Root invocation
ID: `ad-20260828-admin-ui-rd02`. Reopen trigger: identity is explicitly restored to the landing-view
acceptance criteria.

**AR-14 (runtime):** Authority: AI — delegated by `--auto-design`. Eligibility: internal dependency
injection and testing mechanism within the approved application/session boundary. Objective: reuse
the same narrow organization-operations input in prepared production sessions and direct
application tests. Decision: add optional `organizations` to `AdminApplicationSession`; tests use
that same injection and drive the real exported JSVision dialogs, with no separate dialog-choice
test seam. Evidence: current application tests already inject `AdminApplicationSession`, production
preparation returns that same session shape, and the Phase 2 dialogs are usable real interfaces.
Rejected alternative: a separate top-level option plus dialog seams duplicates the injection path
and introduces test-only API. Strongest counterargument: explicit dialog seams can make tests
shorter, but they bypass the modal behavior the specifications need to prove. Confidence: High.
Hardening: reuse of the existing session boundary is the smallest design and adds no layer or
dependency. Policy version: 1. Root invocation ID: `ad-20260828-admin-ui-rd02`. Reopen trigger:
organization operations must be available independently of a prepared or injected application
session.

**AR-15 (runtime):** Authority: AI — delegated by `--auto-design`. Eligibility: internal test-file
organization with no behavioral effect. Objective: keep the specification readable without adding
a helper layer. Decision: move the new organization-workflow block into one focused
`application.organization.spec.test.ts` file and retain the existing application specifications
unchanged. Evidence: the combined file reached 1,060 lines, above the repository's file-size
guidance, while the new block is one independent concern. Rejected alternative: retaining the
oversized mixed file makes review and maintenance harder. Strongest counterargument: a second file
duplicates a few test helpers, but that is smaller than introducing shared test infrastructure.
Confidence: High. Hardening: one concern file is the minimum structural correction; no abstraction
or production change is added. Policy version: 1. Root invocation ID:
`ad-20260828-admin-ui-rd02`. Reopen trigger: the focused file itself exceeds the project limit.

**AR-16 (runtime):** Authority: AI — delegated by `--auto-design`. Eligibility: internal source-file
organization with no behavioral effect. Objective: retain one readable application coordinator
without adding a workflow layer. Decision: extract only the pre-existing native JSVision host
adapter into `application-runtime.ts`; organization orchestration remains in `application.ts`.
Evidence: the coordinator reached 757 lines, while the native adapter is an independent existing
terminal-I/O concern. Rejected alternative: an organization-workflow manager adds an abstraction to
new behavior that is still small enough to remain local. Strongest counterargument: one additional
module adds an import, but it cleanly removes terminal I/O from state coordination. Confidence:
High. Hardening: this is a mechanical move of existing code and introduces no new behavior,
dependency, or framework. Policy version: 1. Root invocation ID:
`ad-20260828-admin-ui-rd02`. Reopen trigger: application orchestration again exceeds the project
limit.
