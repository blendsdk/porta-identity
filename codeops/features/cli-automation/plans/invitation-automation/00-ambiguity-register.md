# Ambiguity Register: CLI Invitation Automation

> **Status**: ✅ GATE PASSED — all 17 items resolved
> **Last Updated**: 2026-11-03 16:35
> **CodeOps Artifact Schema**: 1
> **Mode**: auto-design · policy version 1
> **Root invocation ID**: cli-invitation-automation-20261103-1515
> **Workflow**: make-plan; planning only

## Planning boundaries

| Boundary          | Authority                                                                                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planning target   | Bundle A: GitHub issues #180, #183 and #181, in error-contract → claim-input → bulk-invitation order. User confirmed A → C → D → E across the wider backlog.                                                                                                           |
| Context artifacts | Read-only CLI, SDK, server invitation/validation/rate-limit code, existing tests, project policy and relevant documentation.                                                                                                                                           |
| Modification set  | This new standalone plan folder and new feature roadmap. The user also approved its portfolio row; the roadmap branch-isolation rule defers that row until integration into develop. No product implementation, existing requirements, sibling plans or issue changes. |
| Plan destination  | User selected `codeops/features/cli-automation/plans/invitation-automation/` and a new `cli-automation` feature.                                                                                                                                                       |
| Branch            | `plan/cli-invitation-automation`, created from clean synchronized `develop`.                                                                                                                                                                                           |

## Authority

The user requested `--auto-design` and `--auto-commit` after the first discovery round.
Auto-design delegates implementation mechanisms only within confirmed goals and constraints.
Product behaviour/scope, access/security policy, data ownership/retention, risk acceptance,
public compatibility breaks, credentials, external communication/actions, publication and
material complexity escalation remain user-owned. No new dependencies, generalized frameworks,
server bulk API or infrastructure are approved. Commit permissions do not authorize implementation
outside make-plan. Execution checkpoint behaviour belongs to exec-plan.

## Register

| #   | Category                            | Ambiguity / gap                                                                    | Options presented                                                                | Decision / authority                                                                                                                                                                | Status      |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Scope                               | Feature and source requirements                                                    | New CLI automation feature / existing invitation feature                         | User: “New feature (Recommended)”; standalone plan using #180/#183/#181                                                                                                             | ✅ Resolved |
| 2   | Scope / compatibility               | JSON error coverage                                                                | CLI-wide non-interactive commands / invitation-only                              | User: “CLI-wide (Recommended)”; command and argument-validation errors, unchanged human output and exit codes, no interactive Admin UI change                                       | ✅ Resolved |
| 3   | Data / UX                           | Bulk input representation                                                          | Email lines / CSV email column / JSON email array                                | User: “Email lines (Recommended)”; one email per line, no header or per-recipient settings; shared organization/roles/claims/locale/message command options                         | ✅ Resolved |
| 4   | Scope / sequencing                  | Bundle and internal execution order                                                | Previously presented bundles                                                     | User confirmed A → C → D → E; A is errors → claims → bulk; C/D/E outside this plan                                                                                                  | ✅ Resolved |
| 5   | Technical / workflow                | Decision and commit authority                                                      | Normal mode / explicitly requested modes                                         | User: “use --auto-commit and --auto-design and choose the best possible path forward”; eligible technical decisions delegated under policy v1, reserved decisions remain user-owned | ✅ Resolved |
| 6   | Behaviour / edge cases              | File validation, deduplication and recipient dispatch outcomes                     | Bounded product approval batch                                                   | User: “I approve” the final contract table; AR-12 and AR-15                                                                                                                         | ✅ Resolved |
| 7   | Integration / compatibility         | Exact JSON error envelope, source classification and CLI entry-point coverage      | Public contract plus explicit options / process-scoped mode                      | User approved the public contract; mechanism delegated under AR-13                                                                                                                  | ✅ Resolved |
| 8   | Data / validation                   | Claim syntax, JSON parsing, validation and existing server constraints             | Repeated triple and duplicate policy                                             | User approved syntax/value preservation and duplicate rejection; mechanism delegated under AR-14                                                                                    | ✅ Resolved |
| 9   | Technical / verification            | Test selectors, independent review, documentation and plan validation              | Project guidance and scoped phase checks                                         | User approved the stated verification policy; selectors and tooling delegated under AR-16                                                                                           | ✅ Resolved |
| 10  | Scope / naming                      | Feature roadmap and portfolio synchronization                                      | New feature roadmap and portfolio entry                                          | User approved both; branch-isolation rule defers the portfolio write until develop; AR-16                                                                                           | ✅ Resolved |
| 11  | Technical / testing                 | Applicable domain lenses                                                           | Apply only evidence-backed lenses                                                | Authority: AI — delegated by --auto-design; web application, data and migration, distributed and concurrent; see provenance below                                                   | ✅ Resolved |
| 12  | Behaviour / acceptance              | Public automation contract, delivery safety and verification scope                 | One bounded approval batch, recorded below                                       | User: “I approve” the immediately preceding final contract table and verification/roadmap paragraph                                                                                 | ✅ Resolved |
| 13  | Technical / security                | JSON serialization, command integration and failure classification                 | Explicit options / process-scoped output mode                                    | Authority: AI — delegated by --auto-design; explicit options and direct bounded serializers                                                                                         | ✅ Resolved |
| 14  | Technical / validation              | Claim parser implementation and test seams                                         | First-two-colons / unrestricted splitting; direct parser / new dependency        | Authority: AI — delegated by --auto-design; direct parser using existing UUID convention and JSON.parse                                                                             | ✅ Resolved |
| 15  | Technical / data / recovery         | Bulk parser, runner and output representation                                      | Bounded regular-file read and direct sequential loop / generalized job machinery | Authority: AI — delegated by --auto-design; bounded read, pure parser, sequential SDK calls, discriminated results                                                                  | ✅ Resolved |
| 16  | Technical / workflow                | Phase decomposition, artifacts and verification                                    | Three dependency-ordered phases with existing tools / new framework or workflow  | Authority: AI — delegated by --auto-design; existing tooling, independent reviews, no extra machinery                                                                               | ✅ Resolved |
| 17  | Technical / observation correctness | RV-1: SDK authentication errors do not prove HTTP401 or actual invitation dispatch | Conservative SDK-boundary observation / SDK API expansion                        | Authority: AI — delegated by --auto-design; retain auth classification/exit2, omit unproven status and count SDK invocations without claiming HTTP dispatch                         | ✅ Resolved |

## Resolution notes

### AR-1–5 — User decisions

The three discovery answers are exact option selections returned through the question tool.
The workflow-mode instruction is a later explicit user message, not an inferred repository default.
The user subsequently approved the complete product contract in the final answer immediately
preceding “I approve”. All technical decisions below remain bounded by that contract.

### AR-11 — Domain lenses

Authority: AI — delegated by --auto-design

- **Eligibility:** Testing/review mechanisms within the confirmed CLI automation scope; no product or security policy change.
- **Objective:** Expose missing validation, compatibility and partial-delivery cases before implementation is planned.
- **Decision:** Apply web application to existing authenticated HTTP invitation calls and untrusted inputs; data and migration to email-file input, public JSON compatibility and normalization; distributed and concurrent to sequential multi-request delivery, cancellation and unknown outcomes. No database migration is proposed.
- **Evidence:** `packages/cli/src/index.ts:69` (global JSON), `packages/sdk/src/types/users.ts:239` (existing input), `packages/sdk/src/transport/node-transport.ts:81` (existing authentication recovery), `packages/server/migrations/033_invitation_deferred_user_creation.sql:14` (case-insensitive email identity).
- **Rejected alternatives:** Web-only omits file/format compatibility and partial side effects; financial/compiler lenses have no domain evidence here.
- **Strongest counterargument:** A sequential CLI is not a distributed service; only the workflow's real HTTP/commit/delivery failure boundaries require the concurrency lens, not new distributed infrastructure.
- **Confidence:** High within the confirmed input, output and invitation-call scope.
- **Hardening:** Narrowed the concurrency lens to client workflow effects and explicitly excluded extra infrastructure.
- **Policy version:** 1.
- **Root invocation ID:** cli-invitation-automation-20261103-1515.
- **Reopen triggers:** Different input formats, persistence, new execution surfaces or changed token/tenant authority.

## Independent challenge

Read-only challenger `ses_e5e39b598ffeQ7rb2v3BKtAuKf` completed without edits, tests, services or
temporary artifacts. Its technical recommendations are explicit parsed JSON options, a parser
that splits the first two colons, and a sequential runner without CLI-level retries. It found
that whole-file validation, dispatch/stop behaviour, duplicate handling, output contracts and
limits require product approval. SDK-internal 401 refresh is separate from CLI replay.

Reconciliation: converged on direct mechanisms and secret-safe fixed JSON error messages. The
challenger recommended rejecting duplicate emails, but #181's confirmed source explicitly says
duplicate addresses collapse to one live invitation. Rejecting them would change the requested
product. The proposed contract instead deduplicates within one file, preserving first occurrence
and applying case-insensitive comparison consistent with ordinary CITEXT email identity. Running
the command a second time is not idempotent: the existing API replaces pending invitations.
No guarantee of identical JavaScript/PostgreSQL Unicode case-folding is made; supported local
email validation and canonical comparison must be fixed in the component specification.

The installed public yargs API was exercised without files or network requests using synthetic
arguments. Boolean preparse correctly handles flag placement, `--json=true/false`, `--no-json`,
last-flag-wins and `--` termination. `--json=invalid` yields false under the installed parser;
the plan must preserve installed-parser behaviour rather than invent an incompatible mode.
This probe does not prove the full executable failure-hook integration: entry-point specification
tests remain required before implementation.

## AR-12 — Approved product contract

**Authority:** User — “I approve”, responding to the complete public contract and verification
paragraph. This resolution does not approve a new API, dependency or support framework.

| Item                     | Proposal                                                                                                                                                                                                                                                                                                                                                 | Evidence / reason                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Error contract           | One JSON error object on stderr in JSON mode: fixed `code`/`message`, actual HTTP `status` only when available, optional validated `requestId`/`retryAfter`; no raw values, body, cause or stack, including verbose mode. Existing stdout report shapes, human formatting and legacy exit codes remain unchanged.                                        | #180; SDK messages can contain arbitrary response-body text (`packages/sdk/src/errors/index.ts:199`).                       |
| Claim interface          | Repeatable `--claim <application-id>:<claim-definition-id>:<json>` for single and bulk invitation; preserve the JSON value without coercion; reject repeated UUID application/claim pairs.                                                                                                                                                               | #183; existing SDK `unknown` value at `packages/sdk/src/types/users.ts:246`; duplicate policy was not previously specified. |
| Bulk interface           | `porta bulk invite --file <path> --org <id>`, using shared roles/claims/locale/personal-message options. No confirmation prompt, new server endpoint, background job or saved report.                                                                                                                                                                    | #181; existing explicit single-invite command sends without prompting; CLI uses SDK domain calls.                           |
| File contract            | UTF-8, LF/CRLF, one email per line, surrounding whitespace trimmed; ignore blank lines and one initial BOM. Reject empty input, malformed rows, files larger than 1 MiB, or more than 1,000 unique recipients before sending.                                                                                                                            | New public limits and acceptance behaviour need user approval.                                                              |
| Duplicates               | Collapse repeated addresses and case variants within the file; preserve the first occurrence and report duplicate counts. Do not claim repeat-run idempotency.                                                                                                                                                                                           | #181's explicit duplicate-collapse criterion; migration033 uses CITEXT; existing pending invitations are replaced.          |
| Validation / dispatch    | Validate the entire file and all locally checkable shared options before any invite; server validation stays authoritative. Send sequentially in source order.                                                                                                                                                                                           | Prevent known-bad file partial effects; no server-side atomicity or prevalidation endpoint is promised.                     |
| Failure policy           | Continue after 409 conflicts and successful creation responses; stop on other rejected requests, final authentication/authorization failure, rate limiting, transport failure or unknown execution. No CLI wait/retry; report remaining recipients as unattempted. Existing SDK 401 refresh behaviour remains unchanged.                                 | Shared-option errors may also be400/404; uncertain replay can replace a committed invitation (`token-repository.ts:768`).   |
| Delivery / report        | Distinguish invitation creation from sent/failed/unknown delivery. Failed/unknown delivery is not full success, is never retried, and does not prevent processing the next recipient after a successful creation response. Ordered source-line/email results and counts go to the final stdout report; a nonzero summary uses the stderr error contract. | `InviteUserResult.emailDelivery` is independent of HTTP creation success.                                                   |
| Exit policy              | New bulk command uses0 only when every unique recipient is created and delivery is sent; local preflight validation uses3; final authentication/authorization failure uses2; all other partial, rejected, unknown or unattempted outcomes use1. Existing commands keep their exact exit behaviour.                                                       | #181 requires nonzero for any failed record; #180 requires existing-code compatibility.                                     |
| Verification / artifacts | Confirm project-local changed tests first, CLI workspace verification and structure contracts per checkpoint; security gates and registered packed compatibility apply to the relevant invitation/public-contract phases. CI owns full root verification. Author the new feature roadmap and add only its portfolio row.                                 | Project AGENTS.md and package scripts; roadmap sync extends the initially confirmed plan-folder modification set.           |

The table records the approved contract, not a claim of implementation. The user's final
approval follows the duplicate-policy reconciliation above. The final table, rather than the
earlier challenger proposal, is authoritative.

### AR-13 — Error-boundary mechanisms

Authority: AI — delegated by --auto-design

- **Eligibility:** Internal interfaces, safe serialization and compatibility testing implementing AR-2/12; no new exit policy or authentication authority.
- **Objective:** Classify failures without leaking inputs or breaking existing commands.
- **Decision:** Add a small error-format module plus explicit JSON parameters to existing error-handler calls. Add a non-terminating reporting seam for legacy direct-return paths and existing stdout reports. Use public yargs Boolean parsing only for early parser/top-level failure mode; command handlers use their parsed argv. Install the JSON failure hook only in JSON mode, keeping the human parser path unchanged. Fix code/message vocabulary in 03-01; absent HTTP status stays absent. Preserve exact historical branch exits, including existing exit0 validation branches. Do not convert arbitrary Error objects into claimed HTTP or transport rejection.
- **Evidence:** `src/index.ts:119–129`, `src/error-handler.ts:81`, `src/commands/bulk.ts:82–94`, `src/commands/config.ts:174–177`, `src/commands/whoami.ts:41–43` within packages/cli; source probes recorded above.
- **Rejected alternatives:** Process-scoped mode couples tests and the interactive UI; stderr interception changes unrelated output; raw messages/details leak untrusted text; sweeping exit-code fixes violate AR-2.
- **Strongest counterargument:** Explicit integration changes many command modules. Bound the mechanical work into small tasks rather than introduce hidden global state.
- **Confidence:** High for the mechanism; executable-level tests must still qualify parser integration before execution can pass.
- **Hardening:** Independent challenger converged. Retained command-owned stdout reports and legacy path-specific exit behaviour.
- **Policy version:** 1; **Root invocation ID:** cli-invitation-automation-20261103-1515.
- **Reopen triggers:** A command bypasses the proposed seams, incompatible public yargs behaviour, or new output/exit requirements.

### AR-14 — Claim parser

Authority: AI — delegated by --auto-design

- **Eligibility:** Parsing/data structures and input-validation mechanisms within the approved claim interface.
- **Objective:** Forward the exact SDK-representable JSON value without treating claim content as configuration.
- **Decision:** Add parseClaimAssignments to the existing parsers module. Split only the first two colons, trim identifier fields, validate with the existing UUID shape, compare lowercase UUID pairs for duplicates, and preserve first spelling in payloads. Parse the remainder as unknown using JSON.parse; reject non-finite numbers at any depth instead of silently serializing them as null. Follow JavaScript JSON number semantics; no new exact-decimal claim type is introduced. Never merge parsed objects into command options. The server alone checks definition existence, ownership and claim-type rules.
- **Evidence:** `packages/cli/src/parsers.ts:125–179`; `packages/sdk/src/types/users.ts:245–246`; `packages/server/src/users/invite-service.ts:51–66,226–234`.
- **Rejected alternatives:** Splitting every colon corrupts legitimate JSON; a new parsing dependency is unnecessary; coercion or last-wins loses input; importing server internals crosses package boundaries.
- **Strongest counterargument:** Local checks cannot establish server definition/type acceptance. Documentation must explicitly retain server authority and must not advertise it as offline proof.
- **Confidence:** High.
- **Hardening:** Independent challenger converged on the split, unknown typing and nested-data boundary; user approved duplicate rejection.
- **Policy version:** 1; **Root invocation ID:** cli-invitation-automation-20261103-1515.
- **Reopen triggers:** A new claim encoding/type, server contract changes or exact-decimal requirements.

### AR-15 — Bulk mechanisms

Authority: AI — delegated by --auto-design

- **Eligibility:** Algorithms, internal interfaces, failure/recovery and testing within the user-approved public bulk behaviour.
- **Objective:** Bound memory and side effects and report only observed creation/delivery facts.
- **Decision:** Separate bounded input, sequential runner and command wiring into focused modules. Read a regular file through one owned descriptor; enforce the byte limit during the read, not only through an earlier stat; decode UTF-8 strictly and always close it. Match the current server email lexical rule with a small local guard rather than add a runtime dependency. This rule accepts ASCII email spelling; lowercase comparison consequently matches ordinary CITEXT duplicate handling without claiming Unicode equivalence. Preserve the first trimmed spelling and physical line number. Parse locally checkable shared flags once before client creation, retaining authoritative server validation. Use one direct awaited SDK call per unique address, no worker, CLI replay or wait. Treat an exception or malformed success after dispatch conservatively as unknown creation unless a typed4xx establishes rejection.5xx does not prove rollback. Keep acknowledged creation separate from delivery unknown. Report state using the closed schema in03-03, without raw error bodies or claim values. No custom process supervisor, persistent report, resume protocol or signal framework; native CLI termination remains unchanged and does not guarantee a final report after process interruption.
- **Evidence:** `packages/server/migrations/033_invitation_deferred_user_creation.sql:14`; installed `node_modules/zod/v4/core/regexes.js:34`; `packages/sdk/src/transport/node-transport.ts:78–88`; `packages/server/src/users/invite-service.ts:361–395`; `packages/server/src/auth/token-repository.ts:768–785`.
- **Rejected alternatives:** Parallel workers leave more in-flight requests after a stop condition; whole-file streaming dispatch violates prevalidation; retries can replace pending invitations; a server bulk endpoint, queue, resume database or custom runner exceeds scope.
- **Strongest counterargument:** Sequential execution and stop-on-throttle may leave many recipients unattempted. That is the explicitly approved safety/throughput trade-off, not a reason to add hidden retries.
- **Confidence:** High within the approved bounds.
- **Hardening:** Independent challenger converged on the minimal runner and conservative unknown outcomes; duplicate rejection was discarded to preserve #181 and user approval.
- **Policy version:** 1; **Root invocation ID:** cli-invitation-automation-20261103-1515.
- **Reopen triggers:** Throughput targets, non-ASCII email support, atomicity/resumption, or new rate-limit/delivery requirements.

### AR-16 — Delivery and verification mechanisms

Authority: AI — delegated by --auto-design

- **Eligibility:** Test strategy, sequencing, artifact organization and review mechanisms within the approved workflow.
- **Objective:** Produce an executable, specification-first plan without weakening project gates or expanding implementation.
- **Decision:** Three phases own JSON errors, claim support and bulk invitation respectively. Every phase orders independent specification authorship → intended red → implementation → green → implementation tests → verification/review. The standalone plan implements cli-automation/T-01; its01-requirements is the owning requirements document, so no synthetic upstream RD is added. A new feature task row remains Backlog while execution is0/N; it links the full standalone plan, not a mini-plan. Portfolio synchronization waits until develop under the branch-isolation rule. Use the existing CLI test runner, root structure contracts and registered p1-admin compatibility adjunct. No compatibility claim about the new invitation flows comes from p1-admin alone: explicit new command tests own those behaviours. Invocation and cleanup guidance must carry the known Node24/short-socket/distinct-empty-npm-config requirements. Before execution capture the exact checkpoint provenance and obtain any required current path approvals; never infer secret-file authority from this plan. Generic dynamic review packets cover the bounded TypeScript/CLI work; no new specialist is needed. Existing coverage goals remain90% business logic,80% support and60% glue without changing the project coverage configuration.
- **Evidence:** Project AGENTS.md; `packages/cli/package.json:15–24`; `packages/cli/vitest.config.ts:10–16`; `test-harness/assurance/compat/command.ts:38–49`; `repo-tests/monorepo/server-package.spec.test.mjs:433`; roadmap branch-isolation protocol; prior compatibility evidence in the approved locale-fix closeout.
- **Rejected alternatives:** Root full verification as the routine local gate conflicts with project policy; weakening frozen tests or generating a new harness is forbidden; project-wide roadmap rewrites exceed the modification set.
- **Strongest counterargument:** Broad error-handler integration needs more than invitation-only tests. The phase1 matrix therefore includes entry failures, all command callers, direct-return failures and diagnostic stdout reports.
- **Confidence:** High for planning; no implementation/test pass is claimed.
- **Hardening:** The independent challenge identified existing helper tests that swallow parser errors; real entry-point specs are required. All12 categories were scanned below.
- **Policy version:** 1; **Root invocation ID:** cli-invitation-automation-20261103-1515.
- **Reopen triggers:** New dependencies/infrastructure, changed quality policy, absent verification tooling, a new protected path, or evidence that the selected registered adjunct cannot run.

### AR-17 — Post-authoring review correction

Authority: AI — delegated by --auto-design

- **Eligibility:** Observation/error-classification correctness within the approved truthful-error contract; no authentication policy or SDK API change and no accepted risk.
- **Objective:** Never fabricate an HTTP response or mutation rejection from an overloaded SDK error class.
- **Decision:** A bare PortaAuthenticationError emits AUTHENTICATION_REQUIRED and the existing auth exit, but no HTTP status. Only a boundary that directly observed a response can supply its status. Missing credentials and refresh failures arise lazily inside users.invite; after invoking that opaque method, an authentication exception establishes an authentication stop, not whether the invitation HTTP call ran. The current row is conservatively unknown, stopReason is authentication, remaining rows unattempted, exit2. `attempted` counts SDK method invocations, not HTTP dispatches; it includes this row. Failure before invoking the method remains unattempted. Never infer origin from message/body/code text or modify SDK contracts.
- **Evidence:** `packages/sdk/src/auth/cli-auth.ts:86–92,214–223,260–265` synthesizes the class; `packages/sdk/src/transport/node-transport.ts:75–85` resolves auth before request and may refresh; `packages/sdk/src/domains/users.ts:161–167` hides that boundary.
- **Rejected alternatives:** Assuming every auth class is an observed401 fabricates status; treating every such row as a known HTTP rejection fabricates dispatch; a new SDK provenance API expands scope; parsing the message is brittle and leaks details.
- **Strongest counterargument:** Some local failures have actually made zero invitation requests, while a genuine401 may prove rejection. The current SDK interface does not expose that distinction reliably; conservative unknown is more truthful than false precision and never causes replay.
- **Confidence:** High for the bounded correction.
- **Hardening:** Independent reviewer RV-1 identified the ambiguity; source verified directly. Correcting specs and adding public-SDK-boundary cases closes the finding without risk acceptance. RV-2's count wording is editorial only.
- **Policy version:** 1; **Root invocation ID:** cli-invitation-automation-20261103-1515.
- **Reopen triggers:** Public SDK gains a reliable observed-response/dispatch discriminator, or approved public outcome requirements change.

The post-authoring batch has one technical root cause. Existing03-01/03-03/07 content was marked
stale while AR-17 was open and is reconciled before plan validation. No new user-owned product
decision or material support mechanism was added.

## Semantic gate scan

| Category                | Closure                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| Feature gaps            | AR-1/4/12; only the three issue capabilities are included.                                        |
| Behavioural gaps        | AR-6/12/15; confirmed partial, rejected, acknowledged delivery and uncertain states.              |
| Scope ambiguities       | AR-1–5/10/12; other bundles and new server/worker surfaces remain excluded.                       |
| Technical unknowns      | AR-13–16; minimal direct mechanisms and explicit test seams selected.                             |
| Edge cases              | AR-12/14/15; input bounds, duplicates, invalid JSON, unreadable files and stopping paths covered. |
| Integration points      | AR-7/12/13/15; existing SDK/API authority, stdout/stderr and parser boundary fixed.               |
| Data and state          | AR-3/12/14/15; finite JSON values, ASCII email identity and transient results only.               |
| Security and compliance | AR-2/12–16; no raw secret-bearing errors, no new grant authority, no implicit credential access.  |
| Non-functional gaps     | AR-12/15; fixed input bounds and sequential delivery; no new throughput commitment.               |
| UX and presentation     | AR-12/13/15; command syntax, fixed error categories and ordered reports fixed.                    |
| Stakeholder conflicts   | AR-4/12; safety/compatibility versus throughput explicitly approved.                              |
| Naming and terminology  | AR-1/12–16; feature, public flags and internal component ownership fixed.                         |

No unresolved material item or unnamed deferral remains. The user approved every reserved decision;
the complete delegated provenance above resolves eligible technical items. Portfolio propagation
is a required branch-isolation step at integration, not deferred product behaviour.

## Planning closeout evidence

Independent reviewer `ses_e5e228885ffe7oAOhkIHRlwJPV` reviewed all ten feature Markdown files and
relevant source. RV-1 (major, authentication observation) was corrected through AR-17, not accepted
as risk. RV-2 (minor, ambiguous task-count wording) was corrected editorially. The one scoped
re-review closed both with no blocking residual contradiction. This was not formal preflight.
A separate security re-audit was skipped for this planning-only diff; execution's security gates
and auditors remain mandatory.

Planning validation passed on 2026-11-03:

- All nine required plan documents and the new feature roadmap exist; local links resolve.
- The semantic gate has17 resolved entries with user/delegated authority;48 uniquely numbered
  ST cases and49 unique tasks are present, with phase counts26/10/13 and correct session ordering.
- The standard `codeops_plan.py` targeted JSON check reports lifecycle Ready,49 not started,
  zero verified/blocked and `problems: []`; implementation has not started.
- Markdown formatting and diff-whitespace checks pass.
- Both structure runs passed158/158 contracts; the final run completed after the review fixes.

No product or harness execution, security-result acceptance, release, deployment or issue mutation
is claimed by these planning checks. No services or containers were started. Before any checkpoint,
the final staged diff and exact allowed-file set are checked through the git-commit skill.

## Formal preflight follow-up

The later user invocation explicitly activated auto-design and auto-commit for formal preflight
and approved bounded technical fixes. [00-preflight-report](00-preflight-report.md) owns its
findings, delegated provenance and current verdict under root invocation
`invitation-preflight-20261103`. PF-001–006 refine mechanisms from AR-13–16: clean-source checkpoint
sequencing, bounded coverage evidence, nonblocking descriptor validation, frozen human-call shape,
claim occurrence cardinality and complete-request encoding preflight. Affected specifications,
ST cases and execution tasks were revised together and require the report's rescan before use.
AR-12's approved product contract, AR-17's authentication observation and the historical authoring
evidence above remain unchanged; preflight does not turn that history into product test evidence.
