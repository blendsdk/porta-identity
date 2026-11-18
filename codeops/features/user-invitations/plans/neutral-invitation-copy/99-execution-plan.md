# Task T-04: Neutral invitation body copy

> **Type**: Task (lightweight) · **Feature**: user-invitations · **CodeOps Artifact Schema**: 1
> **Progress**: 3/3 tasks (100%)
> **Reasoning**: medium — two localized strings with template compatibility and escaping checks
> **Status**: Complete — verified locally; CI merge gate pending
> **Baseline**: develop at d3b48fa231438d0eff7b1f793e71de34eed7e6af; clean worktree
> **Phase baseline tree**: e8746e8c0e4c31d3e5827dae2f273906ef8217f8
> **Scope mode**: strict
> **Commit mode**: User-authorized commit, push, PR to develop and merge after successful CI

## Objective

Make the quoted invitation body paragraph neutral in every supported language, without
removing or changing variables passed to templates. Subjects, greetings, instructions,
expiry wording, personal messages and their attribution labels remain unchanged.

**Smallest viable design:** Change only `invitation.description_inviter` in the packaged
English and Dutch `emails.json` files to the existing neutral `description` wording:

| Language | New value |
| --- | --- |
| English | `You've been invited to join {{orgName}}.` |
| Dutch | `U bent uitgenodigd om lid te worden van {{orgName}}.` |

Keep both translation keys and the code that selects them. Preserve `inviterName` in
arguments, interpolation options and template context so custom templates can still use it.
Only the translated description's words change; the old rendered sentence is not preserved.
No new helper, key, dependency, service, migration or source-code mechanism is needed.

## Scope and codebase grounding

- Product modification set: `packages/server/locales/default/{en,nl}/emails.json`
  and `packages/server/tests/unit/auth/invitation-email-localization.spec.test.ts`.
  Workflow evidence: this plan directory and the user-invitations feature roadmap.
- Context only: email-service, email-renderer, i18n, both shipped invitation templates,
  existing unit fixtures, manifests, project policy and architecture documentation.
- `packages/server/src/lib/system-config-catalog.ts:4` defines exactly `en` and `nl`.
- `packages/server/src/auth/email-service.ts:329-383` prepares descriptions and subjects,
  while retaining original inviter and personal-message context.
- Both shipped templates consume the prepared description. They need no modification.
- The existing localization specification supports send, preview and custom templates.
  Its shipped-body inviter escaping assertion must move to a custom-template case,
  retaining equivalent escaping coverage rather than weakening security assertions.
- Tenant-owned templates and translation overrides remain authoritative and untouched.
  Neutral packaged defaults cannot force independently customized wording to change.
- Excluded: email-service/transport code, passed variables, subjects, personal-message
  labels, tenant files, SMTP settings, invitation/authentication logic and public APIs.

## Acceptance and specifications

Write regression specifications before modifying the catalogs.

| Case | Expected result |
| --- | --- |
| Both languages; send and preview; inviter is email, display name or absent | Exact neutral visible description in shipped HTML and plaintext; no inviter in that description |
| HTML representation | Assert the escaped sentence, including `You&#x27;ve` in English; plaintext retains literal `You've` |
| Existing copy and destination | Preserve greeting, organization, account-setup instructions, seven-day expiry and URL |
| Subjects | Preserve existing inviter-specific subject behavior |
| Custom templates | Preserve original inviter, personal message, recipient, branding, locale, expiry and URL values |
| Escaping | Preserve once-only HTML escaping and literal plaintext; verify inviter escaping in a custom template |
| Caller data | Preserve original organization and options |

Keep existing compatibility and security coverage. Do not edit specifications to accommodate
an incorrect implementation. Only the old inviter-bearing description expectation is
superseded by the user's requested behavior.

## Tasks

- [x] T-04.1 Add regression specifications and demonstrate RED for named-inviter neutral body cases before changing catalogs. Preserve compatibility and escaping coverage. Verified 2026-11-18: eight intended named-inviter cases failed; 73 cases passed.
- [x] T-04.2 Replace the two `description_inviter` values and demonstrate GREEN without changing arguments, context fields, subjects, override behavior or security coverage. Verified 2026-11-18: 113 scoped tests and both JSON parser checks passed.
- [x] T-04.3 Run scoped verification, obtain independent whole-task review, resolve required findings, record evidence, sync the feature roadmap and clean task-owned temporary artifacts. Verified 2026-11-18: all declared local gates passed; independent review had no findings; cleanup done.

## Verification and execution conditions

**Task verify:** Start with `pnpm test:changed`. Explicitly run
`pnpm --filter @portaidentity/server exec vitest run --project unit tests/unit/auth/invitation-email-localization.spec.test.ts tests/unit/auth/email-service.test.ts tests/unit/auth/email-renderer.test.ts`,
then `pnpm --filter @portaidentity/server lint`,
`pnpm --filter @portaidentity/server typecheck`, and `pnpm test:structure`.
Validate both modified catalogs with a JSON parser.

- User approved PF-001's HTML/plaintext clarification and normal test-command loading of
  `/home/gevik/workdir/github/porta/porta-identity/.env` and
  `/home/gevik/workdir/github/porta/porta-identity/packages/server/.env`.
  Approval does not permit inspecting, displaying, modifying or publishing their contents.
- Execution branch: `fix/neutral-invitation-copy`. The clean worktree made the recorded
  HEAD tree an exact phase-start snapshot without broad restaging of files.
- Project guidance selects narrow local checks for this copy-only change. No protocol,
  authentication, authorization, session or cookie behavior changes; pentest, browser and
  assurance stacks are not selected. Stop and reassess if scope crosses those boundaries.
  CI's full `pnpm verify` remains the merge gate.
- Independent review is required by `codeops/codeops.json`; major findings require user
  rulings. After local completion, the user authorized commit, push, a PR to `develop`,
  CI monitoring and merge only after all checks pass. No release, publication or deployment
  is authorized.
- No test infrastructure is needed. Temporary artifacts belong under `CODEOPS_TMPDIR`.
- Portfolio sync is deferred on this non-integration branch under the roadmap convention.
- Technical-documentation automation requires a relevance check, not speculative changes
  for wording that changes no architecture or public API.

**Domain lenses:** localized web application content and escaping; translation-key and
custom-template compatibility. No persisted-schema migration or invalidation is needed.
Rollback restores the two catalog values.

**Specialist check:** None required; no provider model, interaction, grant, token or JWKS
boundary changes trigger `oidc-provider-reviewer`.

## Execution evidence

- Baseline `pnpm test:changed`: PASS; 179 structure contracts. No affected unit tests were selected, so explicit unit selectors will run as declared.
- RED localization specification: eight failures, exactly the email/display-name inviter cases in English/Dutch and send/preview; 73 other cases passed. No catalogs were changed before this run.
- Specification documentation check: behavioral test names explain the new contract; no new exported entities or planning references in source.
- GREEN explicit email selector: three files, 113 tests passed, including neutral-body, custom-template variable/escaping and unchanged subject assertions.
- Catalog validation: both JSON files parse and each named-inviter description equals its existing neutral description.
- The installed progress helper prints the correct count but exits 1 because it incorrectly requires a full-plan `00-index.md` for this mini-plan. Its JSON confirms only those full-plan metadata complaints. The documented lightweight format requires no such file; no support tooling or extra plan document is added.
- Final `pnpm test:changed`: PASS; 81 localization tests and 179 structure contracts.
- Server lint and typecheck: PASS. Explicit final `pnpm test:structure`: 179 passed, zero failed.
- Independent whole-task review: no findings; compatibility and equivalent inviter escaping coverage confirmed. See `00-quality-review.md`.
- Documentation self-check and `git diff --check`: PASS. No architecture or affected maintainer-documentation content changed.
- No test infrastructure was started. Docker container, network and volume inventories show no resources associated with the task.
- Cleanup after implementation: all task-owned verification logs, review diff and scratch directory removed. Durable plans and review evidence remain intentionally. No commit or push was performed during the implementation-only run.
- Integration follow-up: the user authorized committing and pushing this branch, opening a PR to `develop`, monitoring checks and merging only after successful CI. CI results will be recorded on the PR.
