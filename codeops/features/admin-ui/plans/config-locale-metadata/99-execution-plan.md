# Task T-05: Accept server-owned configuration locale metadata

> **Type**: Task (lightweight) · **Feature**: admin-ui · **CodeOps Artifact Schema**: 1
> **Progress**: 1/2 tasks (50%)
> **Reasoning**: medium — bounded metadata-validation and SDK type correction
> **Last Updated**: 2026-11-01 22:52
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
- [ ] T-05.2 After an approved verified commit, run the applicable registered packed SDK/CLI compatibility selector from a clean revision with owned test infrastructure and cleanup; record the evidence and finish the task/roadmap.

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
- No remote credentials or Docker resources were accessed for the implementation. Packed
  compatibility remains pending an approved clean checkpoint; T-05.2 is not complete.

Generic independent review is sufficient for this small metadata/type correction; no new
specialist role is warranted. Review input validation and public API compatibility without
expanding the fix. Use only task-owned temporary logs under `$CODEOPS_TMPDIR`, remove them at
handoff, and preserve all pre-existing files and Docker resources. The baseline was a verified
clean worktree, so its existing HEAD tree is the complete baseline without rereading or copying
protected configuration into a temporary Git index.
