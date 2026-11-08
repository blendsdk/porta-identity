# Preflight Report: CLI Invitation Automation

> **Status**: ✅ PREFLIGHT PASSED — all 6 findings resolved
> **Iteration**: 2 — bounded all-dimension rescan after fixes
> **Previous Iteration**: 3 major and 3 minor findings; all resolved
> **This Iteration**: 0 new findings; none carried forward
> **Artifact**: Full implementation plan at `codeops/features/cli-automation/plans/invitation-automation/`
> **Baseline commit**: `00d42803e9537a83b53b81398635b1147347cd40`
> **Baseline content manifest SHA-256**: `5780b60cd6c88574476c452aa548ca238d222dba2ac42dd9ec0c421b2d504cc1`
> **Last Updated**: 2026-11-03 16:35
> **Codebase Grounded**: 47 named source files examined, plus direct tests/configuration; all cited source references checked
> **CodeOps Artifact Schema**: 1
> **Mode**: auto-design, policy version 1; strict scope
> **Root invocation ID**: invitation-preflight-20261103

**⚠️ SAME-SESSION REVIEW:** The plan was authored in this session. Fresh independent auditor
contexts cover all 13 dimensions and the four applicable domains. This mitigates, but cannot
eliminate, same-model bias. Human identity/security-domain review remains valuable before merge.

## Scope and authority

The audit target is the nine original plan Markdown documents in the directory above. The report
and its own changing bytes are excluded from the content manifest. Context documents include
project/global guidance, CodeOps policy/layout, the feature roadmap, relevant CLI/SDK/server
source and tests, manifests, public documentation and assurance implementation. Reading context
does not pass or authorize editing it.

The user invoked preflight with `--auto-design` and `--auto-commit`, then explicitly selected
“Approve bounded work” for reviewed technical plan fixes, verification, commit and push. The
modification set is this plan directory plus the existing feature roadmap's derived audit link;
no product source, tests, configuration, sibling plan, portfolio, issue, merge or release change.
The user separately approved three exact read-only tooling paths for pnpm/Git/GitHub; this report
does not transfer that approval to future sessions or expose their contents.

The frozen product baseline is AR-12: CLI-wide non-interactive safe JSON errors while preserving
legacy human output/stdout/exits and the Admin UI; repeatable qualified invitation claims; bounded
UTF-8 email-line input; duplicate collapse; sequential existing SDK calls; conservative unknown
outcomes; no CLI replay/wait; creation distinct from email delivery. Bundles C/D/E remain outside
the target. Minimum design: direct formatter/parser helpers, bounded Node file reads and an SDK
loop. No added API, dependency, framework, queue, worker or persistent report is authorized.

## Codebase context summary

| Area               | Verified context                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack              | TypeScript ESM, yargs 18.1, Vitest 4.1; public SDK; Node fetch; Koa/PostgreSQL server.                                                                     |
| CLI impact         | Grounding auditor read every proposed-modification command module and identified 86 existing handler calls across 22 modules, plus direct-report failures. |
| Authentication     | SDK authentication is lazy and may synthesize status401 locally; AR-17 already handles the uncertainty correctly.                                          |
| Invitation effects | Server transaction commits before email delivery; acknowledged creation is not proof of sent mail. A later invocation can replace a pending link.          |
| Verification       | CLI verify is lint/typecheck/test/build; packed compatibility builds committed HEAD and rejects dirty provenance.                                          |
| Existing CI        | Planning checkpoint run41658425335 completed successfully before this audit. It does not verify unimplemented new behaviour.                               |

## Summary by dimension

Counts identify primary root-cause dimensions; related dimensions remain covered without duplicating
the finding count. Three major and three minor findings were confirmed. All six selected technical
fixes are applied and verified at plan level; none is waived or accepted as risk.

| #   | Dimension               | Findings       | Highest severity |
| --- | ----------------------- | -------------- | ---------------- |
| 1   | Ambiguities             | PF-005         | 🟠 Major         |
| 2   | Implicit assumptions    | Related PF-004 | 🟡 Minor         |
| 3   | Logical contradictions  | None           | —                |
| 4   | Completeness gaps       | PF-006         | 🟠 Major         |
| 5   | Dependency issues       | Related PF-001 | 🟠 Major         |
| 6   | Feasibility concerns    | Related PF-003 | 🟡 Minor         |
| 7   | Testability             | PF-002         | 🟡 Minor         |
| 8   | Security blind spots    | None           | —                |
| 9   | Edge cases              | PF-003         | 🟡 Minor         |
| 10  | Scope creep             | None           | —                |
| 11  | Ordering and sequencing | PF-001         | 🟠 Major         |
| 12  | Consistency             | None           | —                |
| 13  | Codebase alignment      | PF-004         | 🟡 Minor         |

## Findings

| Severity       | Count | Disposition  |
| -------------- | ----- | ------------ |
| 🔴 Critical    | 0     | None         |
| 🟠 Major       | 3     | All resolved |
| 🟡 Minor       | 3     | All resolved |
| 🔵 Observation | 0     | None         |

### PF-001: Clean source provenance is not sequenced 🟠 MAJOR

**Dimensions:** 5,11. **Location:** `99-execution-plan.md:30–34,79–81,110–111,141–142`;
`07-testing-strategy.md:124–126,138–140` at the baseline.

The plan requires packed verification from a clean committed source without an explicit preceding
source checkpoint. Immediate task updates also dirty the tree. Using the previous commit would
test the wrong implementation. `test-harness/assurance/scripts/source-provenance.ts:59–65`
rejects all tracked/untracked dirt; `compat/consumer.ts:287–305` builds HEAD and
`compat/command.ts:309–316` checks unchanged provenance. Production-security known-gap admission
also requests clean provenance (`scripts/run-command.ts:741–752`).

**Recommendation / selected resolution:** After applicable pre-commit checks, create a local source checkpoint
with assurance tasks still pending. Keep tracked files unchanged during clean-provenance gates;
then record results, verify/commit evidence, and push only after all required gates and authorized
dispositions. Dirty-tree admission, old-revision evidence and weakened assertions are not viable.

**Decision:** Authority: AI — delegated by --auto-design. Applied in07 and99, including the narrow
tracked-update freeze and pending-state rule for the provenance group. No phase completion or
implementation is claimed. Verified in iteration2.

### PF-002: Coverage goals lack collected evidence 🟡 MINOR

**Dimension:** 7. **Location:** `01-requirements.md:38`; `07-testing-strategy.md:118–129`.

`packages/cli/package.json:17–23` does not collect coverage during verify;
`packages/cli/vitest.config.ts:19–31` excludes the new modules. All listed gates can pass without
measuring the stated 90/80/60 goals.

**Recommendation / selected resolution:** Collect bounded affected-module coverage using invocation-only includes,
existing V8 tooling and an owned external reports directory. Classify modules and record metrics;
do not change persistent coverage policy or add an assurance campaign. Qualification using the
existing parser suite passed34 tests and collected39/39 parser lines, proving the CLI flags work,
not establishing coverage for future code.

**Decision:** Authority: AI — delegated by --auto-design. Applied in01/07/99; verified in iteration2.

### PF-003: Non-regular file rejection can block at open 🟡 MINOR

**Dimensions:** 6,9. **Location:** `03-03-bulk-invitations.md:22–28`; ST-29.

A read-only FIFO open without a writer can block before descriptor stat or bounded reads. The
existing importer uses path stat/readFile (`packages/cli/src/commands/import.ts:24–37`) and is
not a race-safe precedent for this new regular-file-only contract.

**Recommendation / selected resolution:** Use nonblocking read-only open where supported and immediately reject
non-regular opened descriptors before reading; retain a portable precheck without treating it as
the authoritative descriptor check. Explicitly exercise an owned no-writer FIFO with bounded
test completion, exit3 and zero client calls. Path-stat-only and ordinary-open-first approaches
do not establish the approved rejection contract.

**Decision:** Authority: AI — delegated by --auto-design. Applied in03-03, ST-29 and phase3 tasks;
verified in iteration2. Platform implementation must still be qualified during execution.

### PF-004: Mechanical caller migration conflicts with frozen assertions 🟡 MINOR

**Dimensions:** 2,13. **Location:** `03-01-json-errors.md:85`; `99-execution-plan.md:67–72`.

Frozen `packages/cli/tests/commands/config.spec.test.ts:184–189` and
`key-restart-guidance.spec.test.ts:124–135` require exact two-argument handleError calls. A third
false argument breaks them even though human output is unchanged. Updating only implementation
test signatures does not resolve this collision.

**Recommendation / selected resolution:** Retain two arguments in human/false mode and explicitly supply true in
JSON mode, using the additive default-false signature already planned. Do not alter frozen tests
or add a wrapper abstraction merely to hide call shape.

**Decision:** Authority: AI — delegated by --auto-design. Applied in03-01, ST-7/14 and phase1 tasks;
verified in iteration2. Frozen tests remain unchanged.

### PF-005: Empty claim occurrences can disappear 🟠 MAJOR

**Dimension:** 1. **Location:** `03-02-invitation-claims.md:9,22–35,50–54`; ST-16/18.

The proposed string-array pattern follows `packages/cli/src/commands/user.ts:202–207`. Installed
yargs-parser array consumption (`node_modules/yargs-parser/build/lib/yargs-parser.js:461–501`)
can turn a bare claim into[] and silently drop a trailing empty occurrence. Boolean negation can
produce[false]. A malformed invocation could send without the requested claims or produce an
unclassified TypeError. A public yargs probe confirmed all three cases without files/network.

**Recommendation / selected resolution:** Require a value per occurrence with existing yargs requiresArg;
also validate runtime element types with the local-input discriminator. Specify bare/trailing
missing values as parser failures and non-string post-parse assignments as local validation.
Preserve direct helper undefined/empty input and existing role-parser semantics.

**Decision:** Authority: AI — delegated by --auto-design. Applied in03-02/03-03, new ST-49 and
phase2/3 tasks; verified in iteration2. requiresArg is preferred to nargs:1 because it establishes
presence without unnecessarily restricting grouping of array values. Neither raw-token parsing
nor existing-role grammar changes are authorized.

### PF-006: Local preflight does not prove request encodability 🟠 MAJOR

**Dimension:** 4. **Location:** `03-02-invitation-claims.md:26–29`;
`03-03-bulk-invitations.md:46–51`; ST-20/25.

JSON.parse can accept finite nested values that the SDK cannot JSON.stringify.
`packages/sdk/src/transport/utils.ts:119–123` serializes inside the SDK invocation, after lazy auth
(`transport/node-transport.ts:75–79,123–126`). A deterministic failure then becomes a false unknown
attempt instead of local preflight exit3. A Node22.23.1 probe confirmed depth5000 parses but the
complete invitation wrapper fails encoding. Recursively checking finite values can overflow too.

**Recommendation / selected resolution:** Qualify complete prepared request encodability before client creation,
including wrapper nesting, and convert encoding/traversal failures to bounded local validation.
Use existing JSON.stringify; introduce no arbitrary fixed depth policy, dependency or SDK API.
Add specification cases for actual runtime encoding rejection and nested non-finite values.

**Decision:** Authority: AI — delegated by --auto-design. Applied in03-02/03-03, new ST-50 and
phase2/3 tasks, using validateInvitationEncoding in the existing parser module; verified in
iteration2. The defect is a locally detectable failure escaping preflight, not a claim that the
shared deep value necessarily causes earlier recipient mutations.

## Reconciliation and delegated provenance

One blind challenger, `ses_e5dfcf0aeffe53vKAmcQ6pLrB0`, independently considered the whole batch
without the lead's picks. It converged on all six bounded corrections. The language auditor's
provisional negative-zero candidate was not promoted into the final findings: AR-14 already
selects ordinary JavaScript number semantics and the unchanged SDK. Normative ECMAScript confirms
the observed encoding. No signed-zero promise, serializer or new rejection policy was added.

**Authority for every resolution:** AI — delegated by --auto-design. **Policy version:**1.
**Root invocation ID:** invitation-preflight-20261103. The user separately authorized applying
the bounded fixes and committing/pushing them; delegation alone was not treated as write authority.
All evidence, locations and concrete objectives are stated in the corresponding finding above.

| Finding | Eligibility and objective                                                                                 | Rejected alternatives / strongest counterargument                                                                                                                                                                                    | Confidence, hardening and reopen trigger                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PF-001  | Sequencing within existing verification policy; test the actual implemented source with clean provenance. | Dirty/old-source admission fails existing invariants. “Clean green checkpoint” could imply a source commit but leaves the task-write/commit ordering unresolved. An explicit narrow provenance group is required; no gate is waived. | High; challenger converged. Reopen if assurance provenance, task bookkeeping or commit policy changes.                                                           |
| PF-002  | Verification mechanism within existing coverage goals; obtain affected-module evidence.                   | Persistent config changes or a new campaign exceed need. Goals are not a new universal policy; bounded collection is sufficient.                                                                                                     | High; challenger converged; existing flags/provider qualified. Reopen if provider/options or affected-module classification changes.                             |
| PF-003  | File-validation mechanism implementing existing regular-file-only rejection.                              | Path-stat-only has a race; ordinary-open-first can hang before fstat. Platform differences require qualification, not a generalized filesystem layer.                                                                                | High for POSIX defect, medium-high for platform details; challenger converged. Reopen if supported file/open semantics differ.                                   |
| PF-004  | Compatibility-preserving internal call convention; retain frozen specifications.                          | A third false argument is behaviourally equivalent but breaks exact immutable assertions. Editing frozen tests or adding a hiding wrapper is unnecessary.                                                                            | High; challenger converged and both exact assertions verified. Reopen if the frozen boundary legitimately changes under new authority.                           |
| PF-005  | Input-validation/parser mechanism within the approved malformed-input contract.                           | Static string[] types cannot establish runtime values. requiresArg establishes occurrence presence; nargs:1 adds an unnecessary grouping restriction; raw-token parsing is unnecessary.                                              | High; challenger converged; public installed-yargs probe confirms counterexamples and requiresArg behaviour. Reopen if parser semantics or claim syntax changes. |
| PF-006  | Preflight validation mechanism implementing the existing zero-call local-error boundary.                  | Isolated-value checks omit wrapper nesting; fixed depth limits/custom encoding exceed need. Runtime capacities differ, so qualify the failing fixture rather than freeze depth5000.                                                  | High; challenger converged; supported Node22 probe confirms parse/encode separation. Reopen if SDK encoding, request shape or runtime serializer changes.        |

Forced reframing considered more machinery, raw-argument parsing, custom serialization, relaxing
provenance and weakening frozen expectations. None improves correctness within the approved
constraints. The smallest direct fixes remain strongest; no new material support surface, public
compatibility break, security-policy choice or risk acceptance is required.

## Standards grounding and limitations

- [RFC8259 §6](https://www.rfc-editor.org/rfc/rfc8259#section-6) explicitly permits limits on
  accepted numeric range/precision; §9 permits parser size/depth limits. This plan retains normal
  JavaScript numeric semantics and adds no fixed depth policy. §12 warns against eval-based parsing;
  the existing JSON.parse/JSON.stringify boundary remains.
- [ECMAScript SerializeJSONProperty](https://tc39.es/ecma262/multipage/structured-data.html#sec-serializejsonproperty)
  specifies finite Number conversion through ToString; [Number::toString](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-tostring)
  returns the string0 for either signed zero. Standard text and a public runtime probe agree.
- [Node24 TextDecoder](https://nodejs.org/docs/latest-v24.x/api/util.html#new-textdecoderencoding-options)
  documents fatal decoding errors and ignoreBOM's behaviour. Only one initial file BOM may be
  removed; interior BOM rejection precedes generic trimming. No new RFC-wide email-validity claim
  is made: the local grammar deliberately matches the current server's installed Zod grammar.
- This planning-only run does not execute new specification cases, packed compatibility or live
  security gates. Existing runtime probes and parser tests qualify mechanisms, not product success.
- [POSIX open, O_NONBLOCK](https://pubs.opengroup.org/onlinepubs/9799919799/functions/open.html)
  states that read-only FIFO open returns without delay when O_NONBLOCK is set, and blocks until
  a writer opens it when the flag is clear. This grounds PF-003 without claiming unsupported
  platform behaviour.

## Independent coverage and iteration2 verification

| Review                 | Independent session            | Coverage / result                                                         |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| Soundness              | ses_e5e0ea292ffeXTrcgcFtLW4sql | Dimensions1/3/12; no findings.                                            |
| Grounding              | ses_e5e0ea269ffe436TBFuAc5oErF | Dimensions2/13; PF-004.                                                   |
| Delivery               | ses_e5e0ea270ffexoKunO8UuEFYBI | Dimensions4/5/11; PF-001.                                                 |
| Risk                   | ses_e5e0ea26fffe79Wr77uvAtjtsP | Dimensions6/8/9; PF-003.                                                  |
| Fit                    | ses_e5e0ea267ffeoAyrC7TyD1nAml | Dimensions7/10; PF-002.                                                   |
| Language semantics     | ses_e5e0ded1bffecMELjYm0GCgGHT | Narrow command grammar/encoding lens; PF-005/006.                         |
| Web application        | ses_e5e0ded11ffemePOj0RFWw1yZH | Authenticated actor/resource/HTTP boundaries; no findings.                |
| Distributed/concurrent | ses_e5e0ded10ffeQdLCvyWhIg15qY | Ordering, partial commit, delivery and replay; no findings.               |
| Data/migration         | ses_e5e0ded0dfferhWVHKL3feVCBU | Identity, formats, mixed-version compatibility and recovery; no findings. |
| Blind challenge        | ses_e5dfcf0aeffe53vKAmcQ6pLrB0 | Converged on all six within-contract technical corrections.               |
| Scoped fix re-review   | ses_e5e0ea270ffexoKunO8UuEFYBI | PF-001–006 resolved; no residual necessary contradiction.                 |

The language lens supplements authoring AR-11 because the concrete claim grammar, runtime argv
types and request encoding warrant narrow language-semantic checks. It does not add compiler
functionality or machinery. Financial-system analysis has no evidence-backed application here.

The lead's bounded second iteration rechecked all13 dimensions in the unchanged audit target:

| Dimensions                                     | Rescan result                                                                                                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1/3/12 — ambiguity, contradiction, consistency | Missing-value versus local-validation boundaries are explicit; all output/exit and unknown-state rules still agree.                                                                                |
| 2/13 — assumptions and alignment               | Public yargs probes, actual SDK stringify, exact frozen assertions, existing V8 flags and provenance source ground the revised mechanisms. Planned helper stays in the existing parser module.     |
| 4/5/11 — completeness, dependencies, ordering  | ST-49/50 have spec-first owners in both paths; the shared encoding helper precedes bulk reuse; local source commit precedes unchanged-source gates and evidence push.                              |
| 6/8/9 — feasibility, security, edges           | Supported nonblocking open precedes descriptor validation; no-writer FIFO is explicit; full-request local encoding and fixed safe diagnostics precede client creation. No security policy changed. |
| 7/10 — testability and fit                     | Coverage evidence names real affected files; new cases have concrete outcomes and runtime-qualified fixtures. No added API/dependency/framework or adjacent feature is planned.                    |

All10 codebase-alignment subchecks were covered: existing/planned references, observed behaviours,
architecture, impact, reuse, frozen tests, real dependencies, naming/import conventions, bounded
scope, and mixed-version/rollback semantics. No unresolved material ambiguity remains. No third
iteration is needed. Adversarial checks challenged provenance assumed during authoring, malformed
parser inputs, runtime encoding limits and external-standard semantics rather than confirming
the original design by inspection alone.

### Named source inventory

The47 source files counted above comprise these independently examined paths; tests/configuration
and migrations are additional context, not inflated into that count:

- `packages/cli/src/`: index.ts, error-handler.ts, parsers.ts, client-factory.ts, global-options.ts,
  output.ts; `commands/`: user.ts, user-role.ts, user-claim.ts, org.ts, app.ts, app-role.ts,
  app-permission.ts, app-claim.ts, app-module.ts, client.ts, client-secret.ts, keys.ts, sessions.ts,
  audit.ts, stats.ts, config.ts, bulk.ts, exports.ts, export.ts, import.ts, login.ts, health.ts,
  whoami.ts, doctor.ts, admin.ts, completion.ts, logout.ts, version.ts.
- `packages/sdk/src/`: index.ts, types/users.ts, errors/index.ts, domains/users.ts,
  transport/node-transport.ts, auth/cli-auth.ts.
- `packages/server/src/`: users/invite-service.ts, routes/users.ts, auth/token-repository.ts.
- `test-harness/assurance/`: compat/command.ts, compat/consumer.ts, scripts/run-command.ts,
  scripts/source-provenance.ts.

Additional direct evidence includes SDK transport/utils.ts, tenant invitation/auth middleware,
the exact tests cited in findings, CLI/root manifests, CLI Vitest configuration, public CLI docs,
structure inventory and migration033. Those supplemental reads do not expand the modification set.

## Verification evidence and completion boundary

| Check                                          | Result                                                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline artifact identity, links and ordering | Nine original documents;17 resolved authoring decisions;49 unchecked unique tasks, phase counts26/10/13.                                                                |
| Revised artifact shape                         | Ten plan documents including this report;50 uniquely numbered ST cases;49 tasks remain unchecked.                                                                       |
| Standard targeted readiness helper             | Ready;49 not started;0 verified/pending/blocked; problems[].                                                                                                            |
| `pnpm test:changed`                            | Passed158/158 structure checks; no affected server/SDK/CLI product tests selected for this Markdown-only change.                                                        |
| Final `pnpm test:structure`                    | Passed158/158;0 failed/skipped.                                                                                                                                         |
| Existing coverage invocation qualification     | 34 parser tests passed; collected parsers.ts line coverage39/39 (100%) with existing V8 provider and invocation-only includes; no future-module coverage claimed.       |
| Markdown/links/references/task checks          | Passed; source/CLI/SDK/server tests and configuration remain unchanged.                                                                                                 |
| Live security/packed gates                     | Not run for this planning-only audit; mandatory execution tasks remain pending.                                                                                         |
| Owned resources                                | No services, images, networks, volumes or installations created. Owned scratch coverage/logs/continuity are removed at closeout; existing resources are left untouched. |

**Verdict:** ✅ PREFLIGHT PASSED — all6 findings resolved at plan level, with no accepted notes or
unresolved critical/major/minor findings. This is execution readiness, not a guarantee that
implementation will encounter no failures. Specification-first red/green, execution reviews,
security/packed gates and CI full verification remain mandatory.

The feature's T-01 task-lane row remains Backlog because execution is0/49; it links this passing
audit rather than invent a Plan Preflighted stage for a T-row. Portfolio propagation remains
deferred until integration into develop. Product implementation, merge, issue mutation and
publication are not part of this run.

## Reviewed-content identity

The final manifest below covers the nine original target documents by exact filename and SHA-256,
excluding this self-referential report. Consumers must compare every hash before relying on the
pass; a content mismatch requires a targeted recheck. Roadmap text is contextual, not part of the
passed product specification. The baseline commit/manifest above preserves the first scan identity.

**Final content manifest SHA-256:** `7338e5022c5ce1b1e4c88dbcf20ddcbe0ba2e988cb327e8a8eeccb9b79ae8b3d`.
The manifest digest hashes UTF-8 JSON of the filename-to-hash map with sorted keys and compact
separators, excluding the report. No generated manifest file is required.

| Document                     | SHA-256                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `00-ambiguity-register.md`   | `6f49bffe1aee6157396e0a8471c23d1cbf24c5c6ac8295ac1e62660679673f47` |
| `00-index.md`                | `d1aa18ec50e8c5ae25747a8d7935ff3c8303e97236c8fb339c2979b94f7e4a7e` |
| `01-requirements.md`         | `fd20b85bbc71c9f316be463213ffb2954160c10681d86738b592ee64d21e6700` |
| `02-current-state.md`        | `d706b7232d24716355f73d5e43e8331b1010e5533630eea41648ecc166898e42` |
| `03-01-json-errors.md`       | `6496de0a7c15b35303011f6c84b3a5815bab0e26d86477f1a3ebb6dff7feb61e` |
| `03-02-invitation-claims.md` | `4429734519de96176fe5ae70b10ad6cde80aac958a873c8d8572ae520ea4eb36` |
| `03-03-bulk-invitations.md`  | `ab6a8f10e6e53ff7d24cfc9eb04c2aaa40da02ba74bcbc6d6c162f82577ea516` |
| `07-testing-strategy.md`     | `746c08be9f0ebb46ff9211466d50b82febf04418715d1a72c08b6f51cf824ed7` |
| `99-execution-plan.md`       | `03c8e51800aba801bc3be83970026f3ae69ce656f2f4f203b5304220bd305df9` |
