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
