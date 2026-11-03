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
