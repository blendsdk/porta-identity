# Preflight Continuity: Bundle C

> **Status**: Iteration2 passed at plan level; execution not started
> **Target**: codeops/features/admin-service-accounts/plans/admin-service-account-invitations/
> **Target SHA256**: e1910c464e951f060134578d7bbcda79c02ecfc6312f733cd96158073cd9c609
> **Hash rule**: sorted ten original plan Markdown files; filename + NUL + bytes + NUL; exclude audit report/notes
> **Baseline**: develop4b162773; uncommitted new feature on plan/admin-service-account-invitations
> **Scope mode**: strict
> **Mode**: inherited auto-design, policy1, root bundle-c-20261104

## Current checkpoint superseding historical live entries

All five first-scan auditors and the consolidated challenger completed. All seven major and two
minor corrections are recorded in the register/report and owning specs/tasks. Two independent
iteration2 auditors verified closure across all13 dimensions with no new finding.65 tasks/67 ST
cases pass structural/link/inventory validation. Actual product implementation and oracles have
not started. The retained historical status entries below describe earlier checkpoints only.

The user explicitly approved scoped protected-file access via the question tool for test loaders
and package/provenance tools: with V=/tmp/opencode/codeops/runtime-2e64c189-6f5f-4970-9768-0e45862b48a1/bundle-c-execution-a75i1yyg/verification,
V/.env and V/packages/server/.env may be accessed by existing loaders but neither is copied/created;
V/.npmrc and /home/gevik/workdir/github/porta/porta-identity/.npmrc may be read by package tools or
hashed by provenance only. Do not display/log/publish values. This does not approve original .env,
credential stores, TLS/key files, other worktrees' corresponding files or new generated fixtures.
Native permissions still apply. Exact approvals for any further protected paths remain required.

## Codebase context and completed reconnaissance

Porta uses TypeScript ESM, Koa, oidc-provider9.11.2, Zod, PostgreSQL, Redis, Vitest, pnpm/Turbo.
Admin tokens currently use AccessToken/accountId; native ClientCredentials are a distinct opaque
model. A real memory-adapter probe demonstrated native extra persistence and300-second expiry,
not HTTP or production behavior. The hybrid adapter already checks live DB references.

The parent and challengers inspected native opaque/client-credentials/base-token hooks; server
Admin/tenant auth; users types/schemas/service; recovery job/token consumption; client service,
secret lifecycle, routes and cache; canonical permissions/RBAC; transaction/audit and invitation
commit/delivery; server registration/body limit; portability control-plane exclusion; SDK clients
types/domain/auth provider; CLI client command; manifests, test selectors and structure inventory.
Specific source references and diagnostic qualifications are in02 and the register.

Minimum design: one binding table and internal user flag, native token metadata, existing
transaction/audit mechanisms, narrow guards and client subresource/SDK/CLI. No new infrastructure,
dependency, generalized identity/token framework, Admin UI, issue mutation, merge or release.
User explicitly approved lifecycle, limits, interfaces, live-definition semantics, feature roadmap,
standalone requirements and auto-design/auto-commit. Reserved authority remains user-owned.

## Audit partition

| Cluster   | Dimensions                                            | Additional selected-domain scrutiny                           | State                                                                             |
| --------- | ----------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Soundness | 1 Ambiguities;3 Logical Contradictions;12 Consistency | Cross-document ownership and closed user decisions            | Complete: one major transition ambiguity and two minor wire/output clarifications |
| Grounding | 2 Implicit Assumptions;13 Codebase Alignment          | Data/migration and native model compatibility                 | Complete: PF-006/007/009                                                          |
| Delivery  | 4 Completeness;5 Dependencies;11 Ordering             | Distributed/concurrent transaction and phase dependencies     | Complete: PF-001/006/007                                                          |
| Risk      | 6 Feasibility;8 Security;9 Edge Cases                 | Web application, identity and tenant boundaries               | Complete: PF-006/007/008                                                          |
| Fit       | 7 Testability;10 Scope Creep                          | Existing test/assurance tooling and minimum-sufficient design | Complete: two major testability findings; no scope finding                        |

No finding has been ruled on yet. The scan covers all13 dimensions plus the three applicable
domain lenses; no implementation or plan pass is implied. The parent created this artifact in
the same session, so fresh independent auditors counter same-session bias. Auditors are read-only.
Context documents include AGENTS.md, codeops policy/layout, existing source/tests/architecture;
they are not added to the modification set. Keep sibling plans/requirements/portfolio untouched.

## Live dispatch and verification state

Five auditors are active: soundness ses_e58f1de88ffedD9MXW7XKiWcwF; grounding
ses_e58f1de2dffeefOd4Jz7WLKB3r; delivery ses_e58f1ddd3ffebpO8KMcpOmcCgT; risk
ses_e58f1ddc2ffePDpJhJ89NYZMnr; fit ses_e58f1ddb4ffeONnj5sBNm9qQUq. Await automatic results;
do not poll. No finding or dimension completion has been inferred from an active dispatch.

Owned scratch: /tmp/opencode/codeops/runtime-2e64c189-6f5f-4970-9768-0e45862b48a1/bundle-c-execution-a75i1yyg.
Its detached verification worktree starts at4b162773, contains temporary copies of only this feature's
known Markdown artifacts, and no copied operator config/credentials. The initial dependency-root
symlink was rejected by pnpm's unsafe task-state check. The planning changed-test command therefore
failed before it could qualify the checkpoint; CLI verification was not reached. Do not call it
green. The owned symlink was removed without following it; frozen offline dependency installation
is running to satisfy the real-directory requirement. No safety option was disabled. Local tests
must be re-run only after that setup succeeds. No container or local service has been started.

## Fit cluster completed

PA-FIT-001 (major): Phase1 ST-12 requires policy replacement before Phase2 writes; Phase2 ST-25
claims usable-token revocation before Phase3 authentication. Allocate assertions to their executable
boundaries without weakening final expectations. PA-FIT-002 (major): packed ST-57 lacks its own
specification-first executable delivery path; existing p1-admin/compatibility selectors are adjunct
only. Reuse consumer preparation/provenance/cleanup for a focused direct feature test, not a new
harness. Pending consolidation and one independent challenger for the whole major batch.

Fit auditor verified existing command syntax: pnpm assurance:compat --select p1-admin and --select
compatibility. It also found source-provenance.ts:77–92 reads root .npmrc; exact protected-path
approval must precede that access. A clean worktree is not a blanket permission exception.

Dependency installation completed successfully. Re-run planning changed selection passed structure158
with no affected unit files. CLI verification then failed because the fresh SDK's declared dist
exports had not been built, not because product source changed. Building that existing workspace
dependency and re-running CLI verification is now active; the complete CLI result is not yet known.
No assertion, source file, safety gate or dependency version was changed for either setup correction.

## Soundness cluster completed

PA-SOUND-001 (major): client deactivation/eligibility-removing update does not explicitly define
the binding/account transition, despite restoration requiring retirement through binding management.
Candidate fixes: atomically enter the existing revoked state, or reject the change until explicit
revocation. Pending the batch challenger and authorized technical resolution.
PA-SOUND-002 (minor): CLI JSON revoke confirmation needs exact field names/types. PA-SOUND-003
(minor): ST-52's lossless human-output wording conflicts with existing replacement sanitization;
preserve ordinary text, sanitize controls, and retain originals through JSON escaping.

Dimensions1/3/12 and7/10 are complete. The other three clusters are still pending; do not infer
their findings or a full verdict. The exact ten-file target is still unchanged.

## Planning baseline verification qualified

After building the SDK's declared dist exports in the clean worktree, CLI verification passed
123 files/1,795 tests plus lint/typecheck/build. The earlier changed selection passed structure158
and found no affected unit tests. These qualify only the unchanged product/planning baseline,
not any unimplemented Bundle C behavior. Both setup failures remain disclosed above. No source,
test expectation, lockfile or safety check was changed to get this baseline green.

## Delivery and risk clusters completed

Full initial report now records PF-001–008: six major/two minor, not ruled or fixed. Duplicate
PA-DELIVERY-001 joins PF-001; outer transaction/audit/delivery PF-006 combines DELIVERY-002 and
RISK-003; credential proof/promotion PF-007 combines DELIVERY-003 and RISK-001. RISK-002 is PF-008,
the direct bulk SQL bypass. Parent inspected the cited outer middleware, invitation result copying,
secret bridge and immutable ordinary-client handoff test and confirmed the causal evidence.

Grounding is the only remaining auditor; do not poll. The consolidated major batch awaits its one
independent challenger. All ten original files still match the first-scan hash. No fix, policy
waiver, product source edit, task completion or pass is implied by draft report persistence.

## Grounding cluster completed — all dimensions returned

PA-GROUND-001 joins credential-generation PF-007; PA-GROUND-002 joins outer-owner PF-006.
PA-GROUND-003 becomes PF-009: deleting the owned account must not erase the surviving client's
permanent no-reassignment boundary. A same-table revoked marker/nullable FK is a candidate, not
permission to retain deleted account PII or create a separate identity registry. Add subsequent
PUT-after-owner-deletion coverage, not merely immediate denial. All13 dimensions and three domain
lenses are complete; seven major/two minor findings await consolidated challenge and rulings.
