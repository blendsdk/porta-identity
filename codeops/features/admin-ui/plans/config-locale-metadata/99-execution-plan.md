# Task T-05: Accept server-owned configuration locale metadata

> **Type**: Task (lightweight) · **Feature**: admin-ui · **CodeOps Artifact Schema**: 1
> **Progress**: 1/2 tasks (50%)
> **Reasoning**: medium — bounded metadata-validation and SDK type correction
> **Last Updated**: 2026-11-01 23:26
> **Scope mode**: strict
> **Commit mode**: ask-commit; no push
> **Phase baseline tree**: 7f8816bd378bcfb4ec0bca71e668d87d1f1680a1

## Objective

Open and edit System Configuration when the server advertises English and Dutch, without
weakening validation or changing the remote server. The installed CLI's own read service reproduced
`invalid-response` for an otherwise complete 18-entry response: `default_locale.allowedValues`
was `["en", "nl"]`, while the UI validator and SDK type allowed only English.

**Smallest viable design:** Keep the existing SDK domain, UI service, controller, draft model and
locale ComboBox. Replace the English-only assumptions with a non-empty, unique list of bounded,
non-empty, terminal-safe strings supplied by the server. Require current/default locale strings to
belong to that list. Retain exact catalog keys, numeric bounds, permission checks, fixed errors,
and no mutation retries. Widen `ConfigEntry.allowedValues` to readonly strings; no shared locale
catalog, new dependency, framework, API, or server change.

## Confirmed scope and acceptance

- User approved the SDK type correction, Admin UI validation fix, regression coverage and narrow
  verification; track the task under `admin-ui` and ask before commits.
- Accept an English-only response and an English/Dutch response, including Dutch current/default
  values. The server, not an additional client-side locale catalog, owns available choices.
- Show advertised choices in the real terminal workspace; a Dutch selection produces one native
  changed-key batch, accepts valid readback and reloads authoritative state.
- Reject missing/empty/non-string/duplicate/oversized/control-containing choices and current or
  default values outside the advertised list. Do not relax the other 17 settings' validation.
- Correct the existing English-only SDK compiler expectation before implementation; preserve all
  unrelated specification assertions. Update the implementation-only French rejection case to
  reject an unadvertised value rather than a server-advertised language.
- No remote mutations, credential use, release/version changes, publishing, global CLI
  installation, or changes to existing Docker resources.

**Planning target:** this standalone bugfix, not a requirements revision.
**Context artifacts:** configuration server catalog/routes, SDK contracts, Admin UI service/state/
workspace/controller and their tests, project quality policy, configuration technical reference.
**Modification set:** this mini-plan and the feature roadmap; focused CLI service/tests, SDK
configuration type/type-contract tests, the CLI file-count inventory in
`repo-tests/monorepo/server-package.spec.test.mjs`, and the configuration technical reference. Portfolio sync
is deferred until integration, as required on a feature branch. No upstream requirement edits.

## Tasks

- [x] T-05.1 Add locale regression specifications and confirm red; implement the focused SDK/UI correction; cover invalid metadata and real workspace selection/save/readback; update technical documentation; pass the narrow local verification and independent correctness/API-surface and input-validation reviews. Completed: 2026-11-01 22:52.
- [!] T-05.2 After an approved verified commit, run the applicable registered packed SDK/CLI compatibility selector from a clean revision with owned test infrastructure and cleanup; record the evidence and finish the task/roadmap. Blocked: both packed `p1-admin` attempts exited setup 30 before producing compatibility evidence; harness startup requires diagnosis.

**Verify:** Start with `pnpm test:changed`. Iterate with the new CLI locale specification and SDK
compiler contracts; then run `pnpm --filter @portaidentity/sdk verify`,
`pnpm --filter @portaidentity/cli verify`, and `pnpm test:structure`. These are the approved
affected-workspace checks; the change does not alter authentication, authorization or the server,
so a full local monorepo/service suite is not warranted. CI's full `pnpm verify` remains required
before merge. The clean-revision packed compatibility gate is additional and must not be claimed
passed before execution. Package-manager invocations use this repository's approved `.npmrc`
while user/global npm configuration is disabled.

## Review and cleanup

The first post-change structure run passed 157/158 contracts; the remaining assertion fixed the
CLI inventory at 104 physical files while the new regression file raised it to 105. The user
explicitly approved changing only that expected count to 105. No runner, shared setup, or test
selection changes are authorized or needed. Both independent correctness/API-surface and
input-validation reviewers reported no findings on the product/test/documentation diff.

Verified evidence for T-05.1:

- Pre-implementation regression: five expected multilingual/UI failures; SDK compiler rejected
  Dutch metadata and the corrected readonly-string contract.
- SDK `verify`: lint, compiler/type contracts, 610 tests and build passed.
- CLI `verify`: lint, typecheck, 1,496 tests and build passed.
- Final `pnpm test:changed`: all 158 structure contracts passed; affected SDK/CLI selections
  passed. No full local monorepo/service run was claimed.
- Independent correctness/API-surface review and input-validation audit: no findings. A separate
  read-only correctness addendum confirmed the authorized 104-to-105 inventory change only.
- Documentation self-check and `git diff --check`: passed. The existing terminal workspace,
  controller and SDK runtime domain did not need changes.
- No remote credentials or Docker resources were accessed for the implementation.

Blocked evidence for T-05.2:

- User approved local checkpoint `f627feec` (no push), the registered packed compatibility run,
  and disposable test-only credential/TLS/build files under `test-harness/.assurance-runtime/`.
- Both attempts ran `pnpm assurance:compat --select p1-admin` from the clean checkpoint. An empty
  task-owned HOME and Docker configuration isolated real credentials; user/global npm config was
  disabled. The diagnostic attempt enabled the existing `HARNESS_STREAM_BUILD_OUTPUT=1` option;
  no assertion, source, or harness behavior was changed between attempts.
- Attempt 1 used run `1f5e22d5-0f7b-4d12-b7e7-cb260bb37464`; the diagnostic attempt used
  `ad290117-7d15-47c7-b15d-7418dfe67885`. Both exited 30 during harness setup, without a packed
  compatibility result. Diagnostic output confirms healthy Porta/PostgreSQL/Redis services and
  nginx startup. Existing ignored public fixture/config/library files were refreshed, but no active
  harness readiness record or compatibility artifact was admitted. The exact underlying startup
  cause is unconfirmed; this is not a passed gate or an observed product-assertion failure.
- Owned lifecycle cleanup removed the containers/network/labelled volume/runtime directory. Each
  attempt left its newly built project-labelled image and exactly two anonymous PostgreSQL/Redis
  image-declared data volumes. Only those baseline-absent, unused startup-attributed volumes and
  the exact project-owned images were removed, without force or global pruning.
- Final `docker ps -a`, network, volume and image inventories match the baseline exactly: no added
  or removed resources. No active harness record remains. The four pre-existing ignored files
  `test-harness/config.generated.json`, `test-harness/spa/config.json`, and the two copied libraries
  under `test-harness/spa/lib/` were preserved, not deleted; the harness refreshed them and their
  previous contents were not backed up. They are not part of the source commit.
- Product correction and local checks remain verified in `f627feec`. Compatibility is blocked;
  no further retry or harness-code change is authorized by this mini-plan. A focused follow-up
  diagnosis needs to establish the startup cause before the gate can be rerun.
- The installed progress helper renders the mini-plan's correct checklist count but exits 1 because
  it also expects a full-plan `00-index.md`. The documented single-file lightweight format is
  preserved rather than adding an unauthorized full document set or changing plugin code.
- Independent read-only review of the blocked-status documentation found no issues; security
  re-audit was skipped for that documentation-only diff. Formatting and whitespace checks passed.
- Cleanup is complete: task-owned logs, diff, commit-message file, package caches and isolated
  homes were removed. Final inventories retained exactly 30 containers, 15 networks, 76 volumes
  and 91 images from the pre-run baseline. Product source/tests/reference are unchanged from
  `f627feec`; only the plan and feature-roadmap blocked-status notes remain uncommitted. No push
  or additional commit was made while the compatibility gate was blocked.

## Release preparation continuation

The user subsequently authorized release preparation through the existing PR/CI flow, followed
by the coordinated `Release` workflow with `bump=patch` only after every required gate passes.
Direct edits or pushes to `main` remain excluded. This authorizes renewed diagnosis/reruns of
T-05.2, not weakening assertions or publishing an unverified revision. The user approved GitHub
CLI authentication through its existing credential file, read-only Git repository configuration,
and dotenv's read-only use of the repository `.env`; none may be printed, edited, copied, committed,
or published.

A concrete local invocation defect was identified: the manually supplied long `TMPDIR` produced a
174-byte control-socket path, and a native Unix-socket check rejected it as too long. Using the
approved OS scratch root `/tmp/opencode` produces an 87-byte path. No harness source change is
needed to test this correction. The next clean-revision compatibility attempt will keep its logs,
isolated homes and backups under `$CODEOPS_TMPDIR`, use `/tmp/opencode` for the harness's owned
short socket path, and restore the four known non-secret generated fixture/library files from
pre-run backups. T-05.2 remains blocked until the actual registered check passes and cleanup is
verified; the short-path diagnosis alone does not satisfy it.

Generic independent review is sufficient for this small metadata/type correction; no new
specialist role is warranted. Review input validation and public API compatibility without
expanding the fix. Use only task-owned temporary logs under `$CODEOPS_TMPDIR`, remove them at
handoff, and preserve all pre-existing files and Docker resources. The baseline was a verified
clean worktree, so its existing HEAD tree is the complete baseline without rereading or copying
protected configuration into a temporary Git index.
