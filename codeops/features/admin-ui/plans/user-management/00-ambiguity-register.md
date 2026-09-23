## Ambiguity Register: RD-03 User Management Implementation Plan

> **Status**: ✅ GATE PASSED — all 10 items resolved
> **Last Updated**: 2026-08-30 01:37
> **Mode**: `--auto-design`
> **Root Invocation ID**: `make-plan-admin-ui-rd03-20260829`

The systematic review covered feature, behavioral, scope, technical, edge-case, integration, data,
security, non-functional, UX, stakeholder, and naming categories. RD-03 and its three-iteration
preflight own the product behavior; this register resolves only plan-local implementation choices.

|   # | Category            | Ambiguity / Gap                                                            | Options Presented                                                               | Decision                                       | Status      |
| --: | ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------- | ----------- |
|   1 | Scope               | Which behavior may this plan implement?                                    | Approved RD-03 only / expand into later Admin UI RDs                            | Approved RD-03 only                            | ✅ Resolved |
|   2 | Technical           | How should the sizeable CLI feature be divided without adding a framework? | Feature-specific modules / grow existing coordinators / generic admin framework | Feature-specific modules                       | ✅ Resolved |
|   3 | Integration         | When should the required SDK corrections land?                             | Correct SDK contracts first / patch around them in the UI                       | Correct SDK contracts first                    | ✅ Resolved |
|   4 | Data & state        | Who owns user view state and late-result rejection?                        | One user workflow controller / application-global cache                         | One user workflow controller                   | ✅ Resolved |
|   5 | UX & presentation   | How should direct JSVision code be separated?                              | Workspace plus modal dialogs / generated screens                                | Workspace plus modal dialogs                   | ✅ Resolved |
|   6 | Testing             | Which completion gates apply?                                              | RD-03 affected-package and compatibility gates / unrelated full server suites   | RD-03 affected-package and compatibility gates | ✅ Resolved |
|   7 | Ordering            | What is the smallest safe execution sequence?                              | SDK → service → UI → wiring → journey/docs / one cross-cutting phase            | Five bounded phases                            | ✅ Resolved |
|   8 | Non-functional      | Is a new numeric coverage target required?                                 | Behavioral ST completion / invented percentage target                           | Behavioral ST completion                       | ✅ Resolved |
|   9 | Behavioral          | How are safe user-operation failures presented?                            | Reuse fixed local categories / expose remote messages                           | Reuse fixed local categories                   | ✅ Resolved |
|  10 | Technical (runtime) | Which exact internal service seam should Phase 2 specifications target?    | One flat user-specific operations boundary / raw SDK calls in the controller    | One flat user-specific operations boundary     | ✅ Resolved |

### Resolution Notes

**AR-1 (scope):** User authority is the approved and preflighted RD-03, including its explicit
exclusions and the direction to avoid overengineering. The modification set is this plan folder and
the existing Admin UI roadmap. Context artifacts may be read but are not changed during planning.
Later RDs, new endpoints, server behavior, import/export, generic UI machinery, dependencies,
workflows, and runtime matrices remain outside this plan.

**AR-2 (module boundary):** Authority: AI — delegated by `--auto-design`. Eligibility: internal
architecture within the approved CLI feature. Objective: keep each responsibility reviewable while
reusing current Admin UI conventions. Decision: add only user-specific `user-state.ts`,
`user-service.ts`, `user-dialogs.ts`, `user-workspace.ts`, and `user-controller.ts`; make thin
integration edits to existing session, presentation, application, runtime, and index modules.
Evidence: `application.ts` is already 705 lines, while RD-02 established separate state, service,
dialogs, presentation, and orchestration boundaries. Rejected alternatives: growing the existing
application further violates the file-size boundary; a generalized admin framework is explicitly
excluded. Strongest counterargument: five files sound larger than one, but each corresponds to a
distinct existing responsibility and avoids a speculative abstraction. Confidence: High.
Hardening: forced reframing found no smaller boundary that keeps the existing coordinator below its
current size and preserves direct JSVision use. Policy version: 1. Root invocation ID:
`make-plan-admin-ui-rd03-20260829`. Reopen triggers: an existing JSVision control proves one module
unnecessary before implementation, or a file approaches 700 lines and needs a purely mechanical
user-specific split.

**AR-3 (SDK first):** Authority: AI — delegated by `--auto-design`. Eligibility: implementation
sequencing and public-contract mechanics already authorized by UM-15. Objective: make the UI depend
on truthful current SDK types rather than local workarounds. Decision: specification-test and fix
the named SDK user contracts first, then update current CLI commands, SDK agent metadata, and the
registered packed P1 cursor consumer before building UI services. Evidence: current
`types/users.ts` omits persisted fields and advertises email update; `domains/users.ts` drops reason
arguments and unwraps history incorrectly; the packed P1 journey requires cursor `pageSize` to map
to server `limit`. Rejected alternative: UI-side casts or a parallel client preserve known drift
and are forbidden by RD-03. Strongest counterargument: SDK work delays visible UI, but it removes
the exact blocker the UI would otherwise duplicate. Confidence: High. Hardening: the final RD-03
preflight independently verified this ordering and contract boundary. Policy version: 1. Root
invocation ID: `make-plan-admin-ui-rd03-20260829`. Reopen triggers: the current server or registered
P1 contract changes before execution.

**AR-4 (state ownership):** Authority: AI — delegated by `--auto-design`. Eligibility: state and
cancellation mechanism inside the approved single-operator behavior. Objective: preserve tenant
isolation and deterministic redraw without persistence or locking machinery. Decision: one
feature-specific controller owns immutable validated list/detail state, modal ownership, and an
operation generation tied to the selected organization plus an explicit application-owned session
epoch. Context changes clear it;
operation cancellation invalidates only the operation and quarantines late results. Evidence:
RD-02 already uses application-owned abort/generation handling, and UM-14 defines the exact clear
versus preserve boundary. Rejected alternative: an application-global cache adds lifecycle and
cross-tenant risk without need. Strongest counterargument: controller extraction adds an interface,
but adding the complete workflow directly to the 705-line application is less maintainable.
Confidence: High. Hardening: no new persistence, polling, lock, merge, or concurrency subsystem is
introduced. Policy version: 1. Root invocation ID: `make-plan-admin-ui-rd03-20260829`. Reopen
triggers: the Admin UI adopts persistent navigation state in a separately approved RD.

**AR-5 (JSVision composition):** Authority: AI — delegated by `--auto-design`. Eligibility: direct
UI composition within approved navigation and interaction behavior. Objective: provide familiar
list/detail navigation with focused dialogs using existing controls. Decision: `user-workspace.ts`
owns list, detail, and history views; `user-dialogs.ts` owns create, invite/preview, edit,
credentials, lifecycle, and purge modals. The existing presentation owns only chrome/menu wiring.
Evidence: organization dialogs already use real JSVision modal helpers and presentation owns the
menu bar; RD-03 prohibits generated screens. Rejected alternative: one generated form/table layer
adds precisely the framework the user rejected. Strongest counterargument: a single large dialog
file may approach the size limit; if so, only a mechanical user-specific split is permitted under
AR-2's reopen trigger. Confidence: High. Hardening: the design contains no reusable entity schema,
renderer, or dependency. Policy version: 1. Root invocation ID:
`make-plan-admin-ui-rd03-20260829`. Reopen triggers: direct implementation exceeds the documented
file-size boundary.

**AR-6 (verification):** User-owned through RD-03 AC-13 and current project guidance. Each phase
uses the narrowest affected package verification for fast feedback; root `yarn verify` remains the
required pre-commit gate. Completion also requires repository structure tests, docs build, the
existing packed Admin UI journey on Node 24 LTS, and a clean committed
`yarn assurance:compat --select p1-admin` result. No separate browser, protocol, or
production-security harness is added while server/auth/protocol behavior remains untouched. Any
such change reopens this entry and activates the applicable registered harness.

**AR-7 (sequence):** Authority: AI — delegated by `--auto-design`. Eligibility: implementation
sequencing. Objective: keep red/green evidence and commits bounded to one concern. Decision: five
phases—SDK/current-consumer corrections; validated user service/state; workspace/dialogs;
application/session integration; packed journey/docs/final gates. Evidence: the first four phases
form a strict dependency chain and the final phase consumes the installed result. Rejected
alternative: one cross-cutting phase would touch SDK, CLI UI, orchestration, tests, and docs at once.
Strongest counterargument: more phases create more checkpoints, but they remain small and enable
focused verification. Confidence: High. Hardening: no phase exists solely for an abstraction or
future feature. Policy version: 1. Root invocation ID: `make-plan-admin-ui-rd03-20260829`. Reopen
triggers: an execution task cannot be independently verified in its assigned phase.

**AR-8 (coverage):** Authority: AI — delegated by `--auto-design`. Eligibility: testing strategy
inside existing project policy. Objective: prove every approved behavior without inventing an
unowned metric. Decision: completion is all concrete ST cases plus focused implementation,
package, structure, compatibility, and packed journey gates; no new percentage target is added.
Evidence: the repository defines verification commands but no RD-03 coverage percentage, while the
RD enumerates security and edge cases explicitly. Rejected alternative: a new numeric threshold is
not grounded in project configuration. Strongest counterargument: percentages can expose untested
lines, but they do not replace the required behavioral oracle and would expand assurance scope.
Confidence: High. Hardening: coverage tooling remains available if later execution evidence proves
a concrete gap. Policy version: 1. Root invocation ID: `make-plan-admin-ui-rd03-20260829`. Reopen
triggers: governing project policy adds a mandatory coverage threshold.

**AR-9 (failure presentation):** Authority: AI — delegated by `--auto-design`. Eligibility: safe
failure projection within UM-03 and UM-13. Objective: keep terminal output bounded and useful
without exposing remote details. Decision: extend the existing fixed local failure vocabulary only
with user-specific categories needed by RD-03; UI labels remain concise and control-free, while raw
response bodies and exception messages never enter state. Evidence: organization operations already
map SDK errors to fixed validation, unauthorized, conflict, unavailable, invalid-response, and
session-invalid results. Rejected alternative: exposing server messages violates the approved
terminal-injection and information-disclosure boundary. Strongest counterargument: fixed messages
provide less diagnosis, but detailed remote errors are unsafe in this terminal surface. Confidence:
High. Hardening: the server remains authoritative and logs are not copied into the UI. Policy
version: 1. Root invocation ID: `make-plan-admin-ui-rd03-20260829`. Reopen triggers: an approved
diagnostics feature defines a separate sanitized detail channel.

**AR-10 (runtime service seam):** Authority: AI — delegated by `--auto-design`. Eligibility:
internal interface design inside the approved user service boundary. Objective: make Phase 2
specifications independent of SDK response shapes while keeping Phase 4 orchestration simple.
Decision: expose one `createAdminUserOperations()` factory with flat user-specific list, detail,
history, preview, create, invite, update, credential, lifecycle, and purge methods. Every method
receives the selected organization UUID exactly once; local create/invite/password inputs exclude
SDK organization and assignment fields; reads and mutations use separate fixed result unions.
Evidence: `organization-service.ts` already uses one lazy operations factory and fixed results, and
the approved plan explicitly forbids a second organization source, service locator, cache, or UI
framework. Rejected alternatives: raw SDK calls in the controller would bypass the required
validation boundary; multiple per-action service classes would add unnecessary structure.
Strongest counterargument: one interface has many methods, but it directly reflects the already
approved operations and avoids extra layers. Confidence: High. Hardening: the choice was reduced to
the current organization-service pattern and introduces no dependency, persistence, retry, or
generalized abstraction. Policy version: 1. Root invocation ID:
`exec-plan-admin-ui-rd03-20260830`. Reopen triggers: an approved operation cannot be expressed
without a second organization source or the interface exceeds the existing file-size boundary.
