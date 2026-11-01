# Task T-05: Accept server-owned configuration locale metadata

> **Type**: Task (lightweight) · **Feature**: admin-ui · **CodeOps Artifact Schema**: 1
> **Progress**: 2/2 tasks (100%)
> **Reasoning**: medium — bounded metadata-validation and SDK type correction
> **Last Updated**: 2026-11-02 00:07
> **Scope mode**: strict
> **Commit mode**: initially ask-commit/no push; user subsequently authorized gated release-preparation commits and pushes
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
- [x] T-05.2 After an approved verified commit, run the applicable registered packed SDK/CLI compatibility selector from a clean revision with owned test infrastructure and cleanup; record the evidence and finish the task/roadmap. Completed: 2026-11-02 00:07; all six packed journeys, independent evidence review, generated-file restoration and exact Docker/evidence cleanup passed.

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

Historical blocked evidence for T-05.2 (superseded by the successful continuation below):

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

## Successful compatibility continuation

`pnpm assurance:compat --select p1-admin` passed with exit 0 on clean source revision
`21f69279100832eb777faeee8ec0be2a101b51a6`, using Node v24.20.0 and the original unchanged
registered selector. The harness run was `c035774f-3e3f-4ebb-9b99-0586b99e2c36`; the admitted result
run was `b9eecbab-6765-4625-a719-ef5d4f016465`.

Invocation corrections, not product/harness changes, resolved the execution blockers:

- Use `/tmp/opencode` for the existing lifecycle socket directory, keeping the generated path at
  87 bytes instead of the rejected 174-byte task-nested path.
- Use the documented Node 24 runtime for the P1 evidence schema. A temporary official Node
  v24.20.0 executable was extracted only after its archive's SHA-256 matched the official checksum.
- Use two distinct empty user/global npm configuration files. The earlier choice of `/dev/null`
  for both was directly reproduced as npm's `double-loading config` error; with distinct files,
  the pinned npm 11.15.0 startup check passed. Both the short-socket Node 22 run
  `9128f9d0-4038-44f0-b4a4-17187722948d` and the first Node 24 run
  `4ac311b5-ba09-4232-8fa3-0b18a0ebc77f` retained their setup-30 outcomes. No assertion was weakened
  or removed and no product failure was converted to a pass.

The failed admitted result runs `3aab9920-8cb4-49e7-bb61-1c51c04563a5` and
`3f6d16de-6cf3-4470-b817-c1c1a9fd062a` both explicitly recorded `stage: preparation`, exit 30 and
empty consumer residue. Node 24 is a separately documented schema requirement; these failed
preparation artifacts are not evidence that either invocation reached schema validation.

All six packed journeys passed, matching independent raw HTTP 200 results: SDK tenant-user
pagination, CLI user pagination/search, CLI audit filtering, SDK signing-key listing, SDK filtered
session pagination and CLI configuration listing.

| Provenance              | Verified value                                                            |
| ----------------------- | ------------------------------------------------------------------------- |
| Node executable SHA-256 | `89af8424dd53e560b1933f87ba650d8bf57c83ca5a04600eefb31f416aabbae7`        |
| Server image            | `sha256:3edf78e97d05b77032983e9f05ac8e60dc989f085e3be9b13168acdd874aa91c` |
| Public fixture digest   | `sha256:650429e5d28dad73b5ff12ca767fab378678e1ea82fca76aeea04a10b6b219da` |
| SDK archive SHA-256     | `c4ca5e6af65999b4da54996315b21c662ed05e588ddc47164156e4da7e4bd15a`        |
| CLI archive SHA-256     | `6a4fae36d3307e3ad23ab4afba23bc542296ac08f9f9203fcea04dfd313a9091`        |

The admitted artifact confirms unchanged primary source, installed-content/archive equality,
no prohibited resolution, all temporary credential/home/consumer/cache removal flags true, and
`residuePaths: []`. The four known generated public files were backed up before the continuation
runs and restored with their original bytes and metadata. Final Docker container/network/volume/
image inventories match the pre-run baseline exactly; only owned leftover images and anonymous
PostgreSQL/Redis volumes were removed after normal lifecycle cleanup.

PR #215's run `41359235134` on the same source revision passed all six jobs: Verify Monorepo,
UI Tests, OIDC Harness, Public Documentation, Production Docker Build and Production Dependency
Audit. Earlier push run `41358664102` failed UI setup with `EADDRINUSE` on port 49200 before browser
assertions ran; its failed job `125004118249` is retained as infrastructure evidence, not hidden or
represented as a product assertion failure. No code or assertion changed before the successful
PR run.

Finishing this branch does not authorize releasing the 66 unrelated commits then ahead on
`develop`. The user has not selected between a full develop promotion and an isolated UI hotfix;
that release-content decision remains separate from this completed implementation and its gates.

Independent read-only correctness review matched the closeout notes to the admitted result and
reported no findings. A security re-audit was skipped for this documentation-only closeout;
the unchanged product correction retains its earlier no-findings input-validation audit.
Technical-documentation closeout found no new architecture, endpoint, storage, dependency or
integration surface: the existing configuration reference already describes the corrected
server-owned metadata contract, so no new ADR, diagram or sidebar entry is needed.

Final closeout validation passed all 158 repository structure contracts and documentation/diff
checks. The three task-owned sanitized compatibility result directories were removed after their
identifiers, dispositions and passing provenance were recorded here; the owned lifecycle removed
all known short socket directories. Final source changes after `21f69279` are limited to this
evidence and the feature-roadmap completion state. CI on the resulting documentation checkpoint
must still be green before PR merge; no test, verification gate or release permission is waived.
