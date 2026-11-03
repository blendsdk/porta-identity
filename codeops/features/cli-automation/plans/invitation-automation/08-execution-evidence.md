# Invitation automation execution evidence

> **CodeOps Artifact Schema**: 1
> **Invocation**: invitation-execution-20261103
> **Scope**: Bundle A only; strict

## Entry

- Source checkpoint: `4e24f08f9a551a0ee76ce13875d614638d98307f`.
- All nine reviewed plan hashes matched the formal preflight manifest before mutable execution
  state changed. No open material ambiguity or unresolved preflight finding was present.
- Current user confirmation enabled --auto-design and --auto-commit. Technical mechanisms may be
  resolved under policy1; product/scope/security-policy changes, new complexity and risk acceptance
  remain reserved. No merge, publication or issue mutation is authorized.
- The initial `pnpm test:changed` passed158 structure contracts; no product tests were selected.
  This is baseline evidence, not evidence of new functionality.
- Active verification uses existing Node24.20.0. No runtime installation was required.
- Phase1 baseline is the clean committed tree `9e9105feeaa7016c65b65eef6f1fa0555940b2ad`, obtained
  without indexing protected files. Existing Docker identities were recorded before any live work.

## Safety and temporary fixtures

The user granted current read-only tooling access to the exact repository .npmrc/.git/config and
GitHub hosts.yml paths for package configuration and push/CI operations. The user also approved
test-runner loading of root and server-local .env paths, without displaying values or editing them.
The first changed-test command reached root dotenv loading before this additional read was found;
this was disclosed and no values were requested or displayed. Subsequent operations use the current
approval.

Disposable credential/key fixtures are approved only under the task-owned external
`invitation-execution` scratch root and newly task-owned run-ID directories below
`test-harness/.assurance-runtime`. HOME/TMPDIR are isolated; real operator credentials remain out of
scope. These permissions do not transfer to future sessions. Only safe metrics and artifact/source
identities belong in this evidence file, never secret values or raw external errors.

## Phase1

Independent author `ses_e5ddd4959ffeWV5aqBNVZY7oqw` authored91 specification cases without
reading the forbidden implementation. Contract/static review, formatting and syntax-transpile
checks passed. The real formatter/parser/handler are not mocked; public SDK auth is exercised with
external filesystem/HTTP stubs. Shared capture helpers observe console and direct stream writes.

The parent confirmed intended red on Node24.20.0 before implementation:4 files failed,
43 cases failed and8 passed; the formatter and redaction suites additionally failed collection
because error-format.js did not exist. Missing createCli/resolveJsonMode accounts for in-process
parser/direct-path failures; executable JSON failures still exposed default yargs help rather than
the fixed envelope. Already-green human/false-mode executable cases and the Admin rejection prove
compatibility only. These failures establish the missing new behaviour, not a green checkpoint.

Security baseline attempt1 hit the shell's120-second orchestration timeout during setup, before
assertion results. No task-owned test process remained. An unbounded-time background run is now
active against the owned `porta-invitation-execution` PostgreSQL/Redis/MailHog stack; no assertion
was skipped, weakened or retried away.

### Local implementation verification

- All86 conventional shared-handler calls in22 modules were audited: human mode still uses
  exactly two arguments, JSON mode alone supplies a third true argument. Every direct-report
  branch in the owning matrix has a bounded error summary without stdout/exit redesign.
- Full phase specifications passed91/91; after classifier implementation tests,107/107 passed.
  The new ANSI comparison regex needed a single explanatory lint exemption; no oracle changed.
- Initial complete CLI verification passed110 files/1,603 tests plus lint, typecheck and build.
  Public docs build passed; structure passed158/158. Existing tests were not edited.
- Initial affected-module coverage collected28 production files. error-format.ts was100%,
  error-handler.ts87.01%; every conventional command except login met60% glue coverage. index.ts
  was0% because its child-process tests are outside Vitest instrumentation; login.ts was10%.
  Added focused post-green executable/login implementation tests, keeping true external I/O
  boundaries stubbed. The four added cases pass; no coverage policy, threshold or assertion changed.
  The actual CLI test inventory is now111. Full revised coverage/checkpoint checks remain pending.
- Security baseline passed330/330 across47 files on Node24; a post-implementation pentest run is
  active on the same isolated stack. No server source or security assertion changed.

Final local phase1 checks passed on Node24.20.0: complete CLI verify111 files/1,607 tests plus
lint/typecheck/build; structure158/158; post-implementation pentest330/330 across47 files. The
task-owned compose project was removed with its containers, network and database volume. Docker
counts/identities returned exactly to baseline:30 containers,15 networks,76 volumes and92 images.

Invocation-only V8 collection includes all28 affected production files; every path appears in
coverage-summary.json. error-format.ts100% and error-handler.ts87.01% exceed80%; cli.ts/index.ts
100%, login.ts80%, and all24 changed command modules exceed60% (minimum66.66%). Configuration and
thresholds are unchanged. The first coverage shortfalls are closed, not waived.

### Independent review and source checkpoint

| Role                                                           | Session                        | Result      |
| -------------------------------------------------------------- | ------------------------------ | ----------- |
| Correctness, maintainability, standards, API surface           | ses_e5db4e627ffeZ8W5YAxJfQBANm | No findings |
| Dedicated security: owasp-web, auth-protocol, tenant-isolation | ses_e5db4e624ffeSYh05GovP7j8Vi | No findings |

Both reviewers inspected the complete43-file phase diff and actual source/tests against the
owning contract. The scoped full-tree snapshot was `c6d4b2b648849bfe24b3880c7f139b200d9bd0eb`,
derived from the clean baseline using only named phase files in a temporary index. Unchanged
protected files were not indexed; the real staging index was not changed. Later changes before
the checkpoint are evidence/checklist updates only. Static reviews did not substitute for live gates.

The user additionally approved Git checkout of the two exact committed example .env templates
into task-owned packed build worktrees and deletion of those copies. The actual root .env is
never copied. No original template or operator credential is changed or displayed.

All local source checks are green. The next commit is an unpublished source checkpoint only;
production-security and packed p1-admin are still pending. Per the explicit provenance-group rule,
tracked updates are frozen from that commit through both runs. Exact source/run identities,
outcomes and cleanup are recorded immediately after the group, not retroactively claimed here.

### Clean-source gate group results

Both registered gates completed against the unchanged committed source
`cebfbe1393fa79755171c155b2ad550740063c2d`, tree
`fa94dc85a5ad690fe361ab93d3b8f65afdfefe33`. Git remained clean before, between and after the runs;
the tracked-write freeze is now released. This record is written after the gate group.

| Gate                                     | Run / artifact identity                                                                                                                                                                              | Outcome                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Initial production-security attempt      | 6177ba3a-1672-43e9-9860-66c89a9322af                                                                                                                                                                 | Exit20 at project:security; retained as failed/unqualified evidence, not credited.                                       |
| Corrected production-security invocation | 8915cea2-7bd4-4451-aec0-da328b69e3a7; `.assurance-results/8915cea2-7bd4-4451-aec0-da328b69e3a7/production-exposure/production-security/observation.json` under test-harness                          | Exit0; exposure11 passed,0 product failures,0 incomplete cases,0 execution failures. Other registered collectors passed. |
| Packed p1-admin                          | Harness7b774696-fe99-4ac2-85d2-f8f7790fafbe; consumer c2d380fd-f213-4a8e-8622-566ea6fcc41b; `.assurance-results/c2d380fd-f213-4a8e-8622-566ea6fcc41b/compat/p1-admin/result.json` under test-harness | Exit0; source revision verified in artifact; archive/content digests match and primaryTreeUnchanged=true.                |

The first attempt used an isolated HOME without a Playwright browser. A direct preflight confirmed
that absence and confirmed successful launch/close of the existing cached Chromium. The corrected
invocation kept HOME isolated and selected that installed browser cache; no browser installation,
source change, skipped assertion or reduced gate was used. The first run's detailed report was
unavailable at the initially expected path, so missing Chromium is an evidence-supported
environment explanation, not a recovered first-run assertion trace. The failed exit is preserved.

The current exposure artifact reports no incomplete cases; it does not consume the historical
three-gap/exit40 allowance. It separately states correlatedLogCredit=false with
`correlated-security-decision-event-unavailable`; this run claims no correlated decision-log credit.
An exit0 case result must not be represented as broader log-observer coverage.

Packed provenance uses Node24.20.0, server image
`sha256:0d551f2ace3f9656bd62d6b754b80f32cc0a5d5034888658a03250201e51a14c`, and fixture digest
`sha256:650429e5d28dad73b5ff12ca767fab378678e1ea82fca76aeea04a10b6b219da`.
Both packages remain1.16.0; this was a local packed consumer, not publication. The adjunct verifies
unchanged administrative contracts, not future claim/bulk flows.

### Cleanup disposition

Owned lifecycle teardown removed the live projects and temporary packed installation/worktree.
Exact supplementary Docker residue cleanup and the final resource comparison are pending below.
Security-run anonymous volume names were captured from the live owner-labelled containers before
teardown; no unrelated volume or image is eligible for removal.

A cleanup preparation error was disclosed: the first harness invocation refreshed pre-existing
generated public configuration/library files before their old bytes were captured. Their original
bytes cannot be claimed restored. The user explicitly chose removal of exactly
`test-harness/config.generated.json`, `test-harness/spa/config.json`,
`test-harness/spa/lib/oidc-client-ts.js`, and `test-harness/spa/lib/jwt-decode.js` after teardown.
Only those four ignored generated files may be removed; their directories and other files remain.
They contain public fixture configuration/references or library code, not raw credentials. Later
gate runs must baseline these generated paths before startup and restore that observed state.

The final qualification confirmed all6 packed journeys passed, no prohibited output was observed,
and the primary tree was unchanged. Artifact SHA-256 identities are
`7c0afa460b1cf911d79074f686f12a6c2585f5e642b81027dbedd046d0d71b9c` (packed) and
`be13c04314d971066fa345dc69c7cec965e71307a6f72f9f1026d89b87a25f41` (exposure).
Ignored run artifacts are temporary evidence, not committed deliverables; these durable metrics,
source/run identities and hashes remain after owned artifact cleanup.

Supplemental cleanup removed only task-created anonymous PostgreSQL/Redis volumes and each exact
run-tagged image after the owned lifecycle teardown. For the packed run, its two anonymous-volume
creation times were checked against the owned command log's birth/end interval and baseline; cached
image creation timestamps were not used as runtime ownership evidence. Docker identities again
match the original30 containers,15 networks,76 volumes and92 images. The temporary packed consumer
and build worktree are absent. The four exact user-authorized generated files were removed after
both gates; all their directories and other files remain. This is the user's explicit cleanup
disposition, not a claim to have restored unavailable original file bytes.

### Phase1 completion

Source/evidence checkpoints `cebfbe13` and `0ea671c2` were pushed only after qualification. The
evidence checkpoint re-ran full CLI verification (111 files/1,607 tests plus lint/typecheck/build)
and structure158. Documentation links, actual inventory, unchanged implementation and Docker
identities were checked again. All26 phase1 tasks are now verified; claims and bulk remain pending.

Phase2 re-evaluation confirmed no manifest/lockfile/dependency, SDK or server source change. The
approved claim parser and complete-input encoding check fit the existing parser/user modules
(211/593 lines before phase2), without a catalogue, dependency or serialization framework.
A Node24 probe confirmed finite nested JSON at depth5000 can parse yet fail complete-request
stringification. That is qualification evidence for a runtime-dependent fixture, not a new fixed
depth rejection rule. All public claim/duplicate/pre-client validation and deferred-result rules
remain as approved.

The two task-owned ignored assurance result directories were removed after their safe metrics,
source/run identities and hashes were recorded here. No other result directory was touched.
Public generated files now have an observed absent baseline under the explicit user disposition;
subsequent runs will preserve that state.

Phase1 closing progress commit `387bea5fba9ec2b87213c54247662604e16e91d6` was verified and pushed.
CI run41715631512 on source/evidence checkpoint0ea671c2 passed all6 required jobs: full Verify
Monorepo, UI Tests, OIDC Harness, Public Documentation, Production Docker Build and Production
Dependency Audit. This is evidence for that checkpoint, not a claim about unimplemented later phases.

## Phase2

Independent author `ses_e5ccc1a38ffejc6TbS5VS3HzsX` delivered36 claim specification cases
without reading the parser/user implementation. Contract review confirms real yargs, formatter
and serialization; only external client/HTTP boundaries are mocked. A runtime-qualified nesting
counterexample avoids imposing a fixed depth policy. Parent Node24 phase2 selector confirmed
31 failed/39 passed:34 existing parser cases plus5 new compatibility cases passed. Failures cover
missing helper exports, ordered claim dispatch, safe atomic rejection, empty/negated values,
complete-request encoding and claims on deferred outcomes. Bare/trailing flags already fail as
unknown arguments before registration; these green cases alone do not prove new cardinality.
No claim implementation existed during this red run. Intended-red changes remain uncommitted.

### Claim implementation and local checks

The parser uses the existing UUID shape, first-two-colon splitting, explicit records and a finite
number worklist. It rejects duplicate case-insensitive application/definition pairs before client
creation. The complete prepared request is checked with ordinary JSON.stringify and then passed
unchanged to the existing SDK. No fixed depth rule, custom serializer or claim catalogue was added.

The first green selector had126 passes and one human-mode failure: an intercepted process.exit
was caught by yargs and triggered a second exit. Only new local invitation rejections now print
their bounded human diagnostic, set exitCode3 and return normally; existing shared-handler calls
and legacy role error paths are unchanged. The immutable specifications were not edited. The
corrected claim/parser/user selector passed127/127. Post-green internal edge tests add14 cases;
the focused claim/parser/internal selector passed84/84.

Full CLI verify passed113 files/1,657 tests, lint, typecheck and build; structure158/158 passed.
The actual inventory rose111→113 for the independent specification and internal test files.
Public docs build and actual user-invite help checks passed. The maintainer architecture update
describes preparation only; no existing ADR decision or server authority was changed.

An overlapping full-test coverage invocation failed the unchanged Admin PTY SIGINT restoration
case (exit130, missing alternate-screen restoration sequence);1,656 other cases passed. The
ordinary verification's same113-file selection passed that case. The PTY suite compiles the same
dist tree at startup, and two full runs overlapped. This supports an interference investigation,
not a proven root-cause claim. No test was changed or excluded. A controlled full coverage run
without overlapping CLI builds is pending; the first failure is retained as evidence.

The controlled full coverage invocation subsequently passed all1,657 tests with no excluded cases.
Both affected paths are present in coverage-summary.json: parsers.ts100% (business-logic goal90%),
user.ts93.6% (glue goal60%). No coverage configuration or threshold changed. The passing controlled
run closes the current coverage gate but does not erase the earlier PTY observation or establish
its precise root cause. Future complete CLI checks are serialized to avoid overlapping dist builds.

Independent correctness/API and dedicated security reviewers are examining the complete11-file
phase diff from baseline3c7a722f to scoped tree00e941794a3e82dffdb0860b6b2b505eb901a734. The
temporary index was removed and the real index left unchanged; no protected file was indexed.
Current source uses only the approved parser/command extension, with unchanged SDK/server and
dependencies. Generated harness files were confirmed absent before the next live gate group.

Correctness/API reviewer `ses_e5cbcb9b4ffeG6aklzTyu7OJw8` returned no necessary findings.
It independently confirmed the new human diagnostic/exitCode return is valid executable behaviour,
not merely a test workaround. The reviewer retains the unexplained initial PTY observation as a
verification reservation; no causation, risk acceptance or phase-completion credit was granted.

Dedicated security auditor `ses_e5cbc5936ffe3AKxUWIILYb6AC` returned no findings across OWASP web,
authentication protocol and tenant-isolation profiles. It confirmed explicit nested records,
pre-client validation, bounded diagnostics and unchanged server authority. This static audit
does not substitute for penetration tests or the registered clean-source gates; the initial PTY
observation remains recorded, with no risk waiver inferred from either review.

The changed selection passed600 CLI tests and structure158; no SDK/server tests were affected.
Pentest passed330/330 across47 files. Owned compose teardown removed the stack and scratch data;
Docker identities match baseline30 containers/15 networks/76 volumes/92 images. A real human-mode
executable check confirmed local exit3 with one bounded diagnostic, empty stdout and no raw claim
marker or stack. All local claim gates are currently green. The initial unchanged PTY failure
remains an unexplained repeatability observation, not a claim of a fixed defect; no failing source
or weakened assertion is being qualified. Full CI remains mandatory before integration.

### Pending clean-source claim gate group

Correctness/API session ses_e5cbcb9b4ffeG6aklzTyu7OJw8 and dedicated security session
ses_e5cbc5936ffe3AKxUWIILYb6AC returned no findings on the phase2 diff. The initial PTY observation
and controlled verification are both retained above. No product source changed after those reviews.
The next checkpoint is unpublished verified source only. Tracked writes freeze from that commit
through production-security and packed p1-admin; outcomes are recorded only after both runs end.
Generated harness public files have the confirmed absent baseline. Existing cached Chromium,
isolated HOME, distinct empty npm configs and Node24 are retained. No new approval is inferred.

### Clean-source claim gate results

Both registered gates passed against source `63a1f68c374ed759fabcc8cb0e4e4e60b0a072d8` with
Git clean before, between and after the runs. No tracked file changed during the gate group.
The tracked-write freeze is now released; this evidence is recorded immediately afterwards.

| Gate                | Run identity                                                                               | Outcome                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Production-security | 31440cb4-2c5e-4f24-8e69-91065bb434c6                                                       | Exit0; exposure11/11 passed,0 product/execution failures,0 incomplete cases; other registered collectors passed |
| Packed p1-admin     | Harness b34a5423-82bf-4ecf-836a-d83a9558c6a9; consumer2176efc8-379d-4377-9106-e8112ae85e79 | Exit0;6/6 journeys, matching archive/content identities, primaryTreeUnchanged=true, no prohibited output        |

Exposure artifact: `test-harness/.assurance-results/31440cb4-2c5e-4f24-8e69-91065bb434c6/production-exposure/production-security/observation.json`,
SHA256 `e6a01ee5e48dc754bf7b11e907487b4ab9cb262dbae6cfd1e7f82af0189fcbb5`.
It explicitly grants no correlated decision-log credit (correlatedLogCredit=false); no broader
observer coverage is claimed. Packed artifact:
`test-harness/.assurance-results/2176efc8-379d-4377-9106-e8112ae85e79/compat/p1-admin/result.json`,
SHA256 `a8e1f57c295040e5451a5735055146591193db318247680862efeb73298a8a2e`.
Its server image is `sha256:c15dc6df6d1478a85af86ea42450ec7fe191656d8576a3d7647c09164cd8f008`.
Packed p1-admin remains unchanged-contract adjunct evidence; the36 specifications prove new claims.

Owned lifecycle teardown completed. A temporary Docker event observer recorded exact owner-labelled
container mounts without reading environment or credentials:40 security starts and5 packed starts,
zero capture errors. Only captured task-created residue volumes and exact run-tagged images were
removed afterwards. Final Docker identities match30 containers/15 networks/76 volumes/92 images.
The four public generated files were removed to restore their observed absent baseline; no user
files or directories were removed. Packed installation/worktree cleanup is owned by the tool.
The initial PTY observation remains retained above; neither gate nor static review erases it.

Claim evidence checkpoint `f0fc3d4d8b2c8e4b4eba310c0dd28efa91ce76da` reverified CLI1,657 tests
plus lint/typecheck/build and structure158, then pushed both source and evidence with remote
confirmation. Phase2 link/inventory/provenance/cleanup checks passed; all10 claim tasks are verified.
Phase3 re-evaluation retains exactly the approved bounded file validation, full pre-client request
preparation, sequential existing SDK calls and uncertainty rules. No server/SDK/dependency or
authorization catalogue change was introduced. The portfolio handoff remains deferred to integration.

Phase2 closeout `8df8f88f06ce925f0970b56fb7ab09879ae14a8b` reverified CLI1,657 tests plus
lint/typecheck/build and structure158 before push. This is the clean phase3 baseline.

## Phase3

Baseline tree `71a38c62bc8ea8e20de7d898697f67d630403784`. The minimum design remains three
focused modules: bounded input/preparation, direct sequential dispatch, and command formatting.
The owning bulk document names internal preparation/loop test seams so independent authors need
no implementation access; these are ordinary function boundaries, not a new SDK/framework surface.
Client-construction failure is tested at the command factory boundary rather than making the
loop construct clients. No bulk implementation precedes specifications and observed red.
Independent author `ses_e5c98a118ffeyoIKUYA6O7Oo8l` is authoring the three concern groups.

CI41724994643 on claim evidencef0fc3d4d was cancelled after the newer closeout push superseded it.
Replacement CI41725618447 on8df8f88f passed all6 jobs: Verify Monorepo, UI Tests, OIDC Harness,
Public Documentation, Production Docker Build and Production Dependency Audit. This qualifies
the phase2 closeout; pending bulk work receives no CI credit from that run.

### Bulk specification qualification

Initial author ses_e5c98a118ffeyoIKUYA6O7Oo8l delivered6 size-bounded test files before any bulk
implementation. It disclosed accidental reads of forbidden SDK transport lines70–91 and auth
lines82–180 during signature exploration. The restriction was breached even though the author
states those implementations were not the oracle. This is not silently credited as fully
independent authentication authorship. No protected credential access was reported.

Fresh author ses_e5c890630ffewFudCqYQVCYgse is independently deriving supplemental authentication
oracles from the approved contracts and public API/test conventions only, without reading the
initial bulk suites or implementation. Existing assertions remain intact; no bulk source is
written until qualification and parent-observed red. Initial file/runner/command oracles are also
reviewed directly against the owning specification. The disclosed breach is retained, not waived.

Fresh author ses_e5c890630ffewFudCqYQVCYgse delivered6 independent public-SDK authentication
oracles in232 lines and attested no implementation or initial bulk-suite reads. These independently
cover missing credentials, refresh400/500/transport failure, a final invitation401 after refresh,
and recovered success continuing to another recipient. Parent contract review passed. All initial
assertions remain; the supplemental suite supplies clean independent auth evidence rather than
claiming the first author's read restriction was satisfied retroactively.

Parent Node24 red across all7 bulk suites:55 failed/7 passed plus4 missing-module collection
failures. Passing cases are six parser rejections that already reject the unregistered command
and one native Linux nonblocking-FIFO qualification; they do not prove command support. Missing
input/runner modules and unregistered command explain intended red. The independent auth suite
also cannot collect until those modules exist. No bulk source existed during this run.

### Bulk implementation and local verification

The direct reader/preparation, sequential runner and command were implemented only after parent
red. All initial and clean supplemental auth specifications passed together. First command green
had147 passes and one human-table failure: numeric cells were not strings under the existing output
helper contract. Converting those cells to strings fixed implementation only; the corrected
phase/legacy selector passed148/148. Twelve post-green internal edge cases increased that selector
to160/160, including real descriptor cleanup after stat/read/close faults and safe runtime guards.

Initial complete workspace verification stopped on source lint: unnecessary regex hyphen escapes
and unsafe throw-from-finally. The equivalent email regex was simplified and descriptor errors are
now retained until after cleanup before throwing, preserving the first read error where applicable.
No assertion changed. Corrected full CLI verify passed121 files/1,793 tests plus lint/typecheck/build;
structure158/158 passed. Public docs build and actual bulk help/limit checks passed. The exact
inventory is121 (seven new specification files, including clean auth qualification, plus one
post-green internal test). Full coverage and pentest remain pending at this recording point.

Full serial coverage passed all1,793 tests with all four affected paths collected: input100%
(support goal80%), runner100% (business-logic goal90%), new command96% and legacy bulk88.63%
(glue goal60%). Configuration/thresholds are unchanged. Independent correctness/API/concurrency
review ses_e5c76d432ffeI5REbNjpOZdZoN and dedicated security audit ses_e5c766706ffeuH2T8VUgn3lARJ
are reviewing the complete20-file phase diff against baseline71a38c62, scoped review tree
c8a75bdcf30a44cc84f20a3e90ec0da8d1d9bd6f. Both packets explicitly include the initial author read
breach and the clean supplemental auth qualification; no silent waiver is requested.

Changed selection passed736 CLI tests plus structure158; pentest passed330/330 across47 files.
Owned compose teardown removed all pentest containers, networks and scratch data. Containers30,
volumes76 and images92 still match the original identities. Two unrelated networks appeared during
concurrent work: `28b1c5da7580 codelableiden-smoke-c629e471d039-command_backend` and
`d53801321c2b codelableiden-smoke-c629e471d039-command_frontend`. They were not created by this task
and were left untouched. Global network identity no longer equals the original baseline; this is
not concealed or "repaired" by removing another task's resources. A new pre-gate baseline records
the observed17 networks, while ownership-labelled checks confirm no pentest resources remain.

Correctness/API/concurrency reviewer ses_e5c76d432ffeI5REbNjpOZdZoN returned no necessary findings.
It independently confirmed that the clean six-case auth suite replaces the affected evidence,
not a retroactive waiver of the initial read breach. Dedicated security review remains pending.

Dedicated security reviewer ses_e5c766706ffeuH2T8VUgn3lARJ found one major issue, normalized as
SA-3-001: human auto-sized table output can multiply one accepted near-mebibyte email width
across1,000 rows, yielding over2 billion characters and failing after side effects. Other security
areas, including clean supplemental auth qualification, had no additional findings. Initial code
verification for command rendering is reopened; final gates are blocked, not waived. A blind
technical challenge and independently authored bounded rendering regression precede any correction.

Runtime AR-18 records an eligible technical correction, not a risk waiver: a single sanitized
unpadded recipient table preserves full values and approved input bounds. Blind challenger
ses_e5c723094ffeQbbXgHGXEfpizV recommended it over a padded-budget fallback; the smaller mechanism
avoids estimation and two paths. Existing count-table/stop helpers and JSON output stay unchanged.

Independent regression author ses_e5c71caf0ffeG5ZeX6SFM1FG74 supplied a safe scaled case before
the fix: one4,096-character local part plus99 short recipients. It reported no implementation
reads, but disclosed using the qualified phase2 claim specification for conventions outside its
narrow phase1-only packet allowance. That extra test-convention read is retained as a dispatch
compliance exception; it is not a bulk implementation read or a weakened oracle. Parent contract
review confirmed the new case derives from full-value and bounded-output requirements.

Parent observed red before changing rendering:1,699,970 output bytes exceeded the fixture's
166,750-byte generous linear ceiling; all preceding value/order/count/exit assertions passed.
After the command-local correction, the immutable regression and existing command suites passed
48/48. A post-green implementation case then exercised exactly1,048,576 raw input bytes and
1,000 unique recipients in a128MiB-heap,15-second isolated child with HTTP blocked and empty HOME.
It preserved full addresses/order/counts, returned the expected lazy-auth stop, and stayed below
the verified1,158,576-byte human-output ceiling. The combined focused selector passed13/13.
Inventory is now123. Full post-fix verification and the mandatory one re-review are pending.

The one mandatory scoped re-review completed: base reviewer ses_e5c76d432ffeI5REbNjpOZdZoN found
no necessary fix regressions; dedicated security auditor ses_e5c766706ffeuH2T8VUgn3lARJ closed
SA-3-001 with no new necessary findings. Both independently confirmed full values, sanitization
before delimiters, unchanged JSON/counts/exits/input limits and removal of width amplification.
They reviewed scoped fix treeee1da1f50ec7667d0b6a6ff0020631ce10179d09. The convention-read exception
remains disclosed; no implementation-tainted regression oracle was evident. This closes the
finding, not full post-fix verification or final assurance. The findings ledger records fixed,
not accepted risk. No third review pass is claimed or required by this closure.

Post-fix serial local gates passed: CLI123 files/1,795 tests plus lint/typecheck/build;
structure158; full coverage1,795 tests with input100%, runner100%, new command96.29%, legacy
bulk88.63%; docs build; changed738 CLI tests plus structure158. Both exact-size and scaled human
regressions passed in the complete runs. Post-fix pentest is still pending before the unpublished
source checkpoint. No source change after the scoped re-review is claimed.

Post-fix pentest passed330/330 across47 files. Owned compose teardown and label-scoped absence
checks passed. The pre-assurance machine baseline is30 containers/17 networks/76 volumes/92 images;
the two unrelated concurrent networks remain preserved. The four public generated harness files
were confirmed absent before final live runs. All post-fix local checks and independent review
closure are now verified. No major/critical finding or open material decision remains.

### Pending final clean-source gate group

The next commit is unpublished verified bulk source, not phase completion. Tracked writes freeze
from that commit through registered production-security and packed p1-admin on the same source.
Exact run/source/artifact identities, outcome taxonomy, correlated-log limitations and owned
cleanup will be recorded immediately after both runs finish. No merge, release or issue mutation
is authorized. Existing resource/credential boundaries remain in force.

### Final clean-source gate results

Both final gates passed on unchanged committed source
`de4ff08ecbb34043dbd6b1c39e99739d4268e72c`. Git was clean before, between and after the runs.
Tracked-write freeze is now released; these results are recorded after the group, not claimed
before execution. The final registered gates received no risk waiver or reduced selection.

| Gate                | Run identity                                                                               | Result                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Production-security | 15279381-1270-43b4-bbec-a9e89af2ee92                                                       | Exit0; exposure11/11,0 product/execution failures,0 incomplete cases; other registered collectors passed |
| Packed p1-admin     | Harness3d1283c2-34ab-4469-9f5a-9a36a97f5fec; consumer b6bae187-d0cf-4461-aa34-89e7a99716ae | Exit0;6/6 journeys, matching archive content, unchanged primary tree, no prohibited output               |

Exposure artifact: `test-harness/.assurance-results/15279381-1270-43b4-bbec-a9e89af2ee92/production-exposure/production-security/observation.json`;
SHA256 `7235373e20897ea8349294b2a0286afaea14ca14e020b23e9470feec595f8733`.
It explicitly has correlatedLogCredit=false; no correlated decision-log credit is claimed.
Packed artifact: `test-harness/.assurance-results/b6bae187-d0cf-4461-aa34-89e7a99716ae/compat/p1-admin/result.json`;
SHA256 `e1826aeea313bfa3a1c38c0ae59b67d22bdd7b98a32507d532c962cd278a1116`.
Packed server image: `sha256:44ad9fed45e4ff63dba479fd08654d836771d4bf0febc2a6b536800b5fcd3ff2`.
The packed selector remains unchanged-contract adjunct evidence; feature specifications supply
the new bulk behaviour evidence, including authenticated public-SDK boundaries.

Owned lifecycle teardown and supplementary exact event-captured residue cleanup passed:40
security container starts and5 packed starts were captured with zero capture errors. Only owned
volume identities and exact run-tagged images were removed. Packed installation/worktree is
absent. All Docker identities match the immediate pre-gate baseline:30 containers/17 networks/
76 volumes/92 images, preserving the two unrelated concurrent networks. The four public generated
files were removed to restore their observed absent baseline, leaving directories/other files
untouched. Temporary result files remain only until final safe metrics/hashes are recorded and
verified; they are not committed deliverables.

## Final acceptance and handoff

Source `de4ff08e` and assurance evidence `86463a97` are pushed; the remote ref was confirmed.
The evidence checkpoint reverified all 1,795 CLI tests, lint/typecheck/build and 158 structure
checks. Both final temporary result directories were removed only after their recorded SHA256
hashes and 11/11 exposure or 6/6 journey metrics were revalidated. Safe metrics, limitations,
source identities and hashes above remain the durable evidence, not the deleted raw artifacts.

### Requirements and specification coverage

Test paths below are relative to `packages/cli/tests/`. The complete 1,795-test CLI run includes
every listed oracle; detailed red/green provenance and qualifications remain in the phase records.

| Requirements                                             | Cases                       | Verified evidence                                                                                                                                                                                                       |
| -------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1–R3: classified safe errors and compatibility          | ST-1–15,47                  | `json-errors.spec.test.ts`, `json-errors-entry.spec.test.ts`, `security/json-error-redaction.spec.test.ts`, `commands/json-errors-legacy.spec.test.ts`; phase1 full local/review/security/packed and closing six-job CI |
| R4: exact JSON claim assignments and atomic local checks | ST-16–23,49–50              | `commands/user-invite-claims.spec.test.ts`, parser tests and `invitation-claims.impl.test.ts`; phase2 full gates and six-job CI41725618447                                                                              |
| R5–R6: shared input, file limits and complete preflight  | ST-24–30,40,46,49–50        | `bulk-invite-input.spec.test.ts`, `bulk-invite-file.spec.test.ts`, `commands/bulk-invite-preflight.spec.test.ts`; real FIFO, strict bytes/UTF-8, growth, literal paths, exact limits and pre-client encoding            |
| R7–R8: sequential dispatch and conservative uncertainty  | ST-31–38,42–44,48           | `bulk-invite.spec.test.ts`, both auth suites and command specs; clean six-case replacement auth oracles, no retry/wait, observed 403 versus opaque auth, SDK refresh recovery                                           |
| R9–R10: delivery, complete reports and exits             | ST-39,41,43–45              | `commands/bulk-invite.spec.test.ts`; exact fields/counts/stop metadata, construction failure and auth exit priority; rendering specifications plus bounded-child maximum-input regression                               |
| R11: public and maintainer documentation                 | ST-42 plus help/docs checks | `docs/cli/overview.md`, `docs/cli/users.md`, CLI README and `techdocs/architecture/api-design.md`; docs build and executable help passed                                                                                |
| R12: specification-first and review/assurance policy     | ST-1–50; all three phases   | Parent-observed red before implementation, retained assertions, independent base/security reviews, major fixed/re-audit closed, bounded coverage goals, pentest330 and same-source final gates                          |

These grouped rows cover every ST identifier 1–50. Shared cases49/50 apply to both single and
bulk commands. Supplemental auth evidence replaces affected independence credit; the initial
forbidden read and rendering author's convention-read exception remain disclosed. Historical PTY
and first-gate evidence limits are not erased. No assertion or security policy was weakened.

### Technical-documentation impact review

The review scanned all 17 technical-document sections and read the complete ADR log, comparing
the changed CLI boundary with the unchanged server, SDK, schema, dependencies and infrastructure.
The existing architecture diagrams, data model, integration, deployment, configuration and
security-authority descriptions need no Bundle A structural change. API-design now documents
the closed CLI error boundary, pre-client claim preparation, bounded reader, sequential loop,
unknown outcomes and lossless unpadded rendering. Public examples remain in public CLI docs.

No ADR decision is superseded. The direct functions and HTTP SDK boundary retain ADR-006/008;
independent bounded evidence retains ADR-014's local/on-demand status, without CI promotion;
application-qualified authority remains unchanged under ADR-015/017. No new service, storage,
protocol, auth mechanism or framework warrants another architecture decision. Historical unrelated
documentation is not silently rewritten or treated as newly verified by this feature-impact pass.

### Integration and CI boundary

The feature roadmap can derive Done from the completed execution checklist. Its portfolio cascade
is deferred to integration into `develop` under AR-10/16; sibling state remains untouched. Bundles
C → D → E are outside this completed plan. No merge, release, publishing or issue mutation occurred.

The closing documentation/checklist checkpoint must pass CLI verify and structure before push.
Its own latest six-job Build and Test run must then finish successfully, including full
`pnpm verify`, UI, OIDC harness, public docs, production Docker build and dependency audit. Earlier
or superseded CI cannot qualify it. That final run is observed after push; this commit does not
invent its future identity or outcome. Final session completion also requires deletion of the
entire owned execution scratch root after all tools and CI end, and a last Docker/resource check.

CI run41716894371 on closing checkpoint387bea5f also passed all6 required jobs, including
full Verify Monorepo. This confirms the published phase1 closeout, not pending claim/bulk work.

Baseline tree `3c7a722f0d4f35a27d19d97947105ab9d695b388` is the clean phase1 closeout tree.
Independent specification authorship precedes any claim implementation. Scope remains the
approved repeatable qualified JSON input, duplicate rejection, finite-number worklist and
complete-request encoding validation before client creation. No claim catalogue, new dependency,
SDK/server policy change or new serialization framework is authorized.
