# Testing Strategy: Invitation Localization

> **Parent**: [Index](00-index.md)
> **Authority**: AR #5, #8, #10, #12, #13
> **CodeOps Artifact Schema**: 1

## Testing Overview

This document owns concrete input/output expectations. Derive new immutable specification tests
from these cases and the component specifications, never from the implementation under test.
Keep implementation tests in separate `.impl.test.ts` files. Existing security assertions remain
intact; only the supersession/setup changes named in AR #12 are permitted.

Use actual shipped resources, i18next and Handlebars for content tests. Use real PostgreSQL/SMTP
and browser fixtures where their boundary matters; mock only true external dependencies in unit
cases. Do not read an implementation's returned output or translation resource to construct that
same assertion's expected text. The literals below are prospective oracles, not observed output.

## 🚨 Specification Test Cases

| ID    | Input / scenario                                                                                                                                                                                                          | Expected output / behavior                                                                                                                                                                                                                                                             | Source                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| ST-01 | Inspect shipped `en` and `nl` packs; separately exercise the isolated resource-loss subcases below. | Exactly eleven namespaces per shipped pack, matching leaf keys/placeholders and non-empty strings; formal Dutch review covers every value. Missing shipped content fails completeness. Isolated resource loss follows the independent English fallback oracles below. | R-1, R-8; AR #1, #7, #10; 03-01 §Resources and Configuration |
| ST-02 | Read catalog metadata; submit native `en`/`nl`, then `EN`, `nl-NL`, `de`, empty string, numeric/boolean/null/object/array values. Read stored native `en`/`nl` through the runtime API. | Closed `en`/`nl` metadata and unchanged default `en`; only canonical native choices accepted. Valid runtime values return unchanged without fallback warnings. Invalid API values remain 400; eighteen settings, unrelated bounds, storage/cache/diagnostics and authority remain unchanged. | R-1; AR #9, #12 and its PF-002 supplement |
| ST-03 | Browser `nl-NL;q=0.9,en;q=0.8`, invitation `en`, organization/global `en`; then browser `en-US,nl;q=0.8`, invitation `nl`.                                                                                                | First result `nl`; second result `en`. Equal positive quality retains header order.                                                                                                                                                                                                    | R-4, R-8; AR #2, #11                                |
| ST-04 | Browser `nl;q=0,en;q=0.5`; then Dutch candidates with `q=abc`, `q=2`, or duplicate `q`, followed by valid `en`; then only wildcard/unsupported browser ranges with invitation `nl`.                                       | First two groups select `en`; the last selects `nl` through invitation fallback. Invalid browser candidates do not cause an exception or a new 406 response.                                                                                                                           | R-8; AR #11; 03-01 §Selection API                   |
| ST-05 | Missing browser preference or unsupported `fr-FR`; valid non-conflicting invitation `nl`, organization/global `en`.                                                                                                       | Select `nl` from the stored invitation in both cases.                                                                                                                                                                                                                                  | R-4; AR #2                                          |
| ST-06 | Stored invitation null/unsupported `fr`, organization `nl`; then organization unsupported and global `nl`; finally all candidates unsupported with global `en`.                                                           | Select `nl`, `nl`, then `en`; skipping an invitation candidate must not discard the organization fallback.                                                                                                                                                                             | R-4, R-9; AR #9, #11                                |
| ST-07 | Email/preview input `nl-NL`, organization `en`; unsupported input `fr`, organization `nl`; null input and unsupported organization with global `en`.                                                                      | Select `nl`, `nl`, `en`; browser headers have no influence on any email case. Regional rendering normalization does not alter stored input.                                                                                                                                            | R-2, R-9; AR #9, #11                                |
| ST-08 | Invitation/header candidates containing traversal, separators, malformed tags or whitespace; direct preparation with an unselected unsafe locale.                                                                         | Public resolution skips invalid candidates and continues fallback. Filesystem lookup sees only canonical selected `en`/`nl`; internal unsafe preparation does not read its constructed path. No raw unsafe value is logged or returned.                                                | R-6, R-8; AR #8                                     |
| ST-09 | Delay the first tenant override read with an explicit test barrier, overriding Dutch invitation subject to `Welkom bij {{orgName}}`; send/preview before releasing the barrier; also exercise absent/malformed overrides. | No copy is finalized before preparation completes; afterward subject is `Welkom bij Acme`. Absent/malformed overrides use the default subject without a raw key/error. Literal `$&` interpolation remains literal data.                                                                | R-7; AR #7; 03-01 §Prepared Tenant Translation API  |
| ST-10 | Overlap tenant A Dutch, tenant B Dutch and tenant A English rendering with distinct override copy.                                                                                                                        | Each render receives only its own selected locale/tenant override; no shared language mutation, crossed text or timing-dependent warm-up requirement.                                                                                                                                  | R-7; AR #7                                          |
| ST-11 | Organization `Acme`, recipient `Ada Lovelace`, Dutch selection; render with inviter `Beheerder`, then without an inviter.                                                                                                 | Subjects `Beheerder heeft u uitgenodigd voor Acme` and `U bent uitgenodigd voor Acme`; heading `U bent uitgenodigd!`; greeting `Beste Ada Lovelace,`.                                                                                                                                  | R-2, R-3; AR #6, #10                                |
| ST-12 | Render shipped Dutch HTML and plaintext for a seven-day invitation.                                                                                                                                                       | Action `Uitnodiging accepteren`; expiry `Deze uitnodiging verloopt over 7 dagen.`; HTML instruction `Klik op de onderstaande knop om uw account in te stellen.`; plaintext uses `link` instead of `knop`. English rendering retains its existing subject, action and lifetime wording. | R-3; AR #1, #6, #10                                 |
| ST-13 | Name/organization/message include `&`, quotes, angle brackets and script-shaped text.                                                                                                                                     | HTML escapes untrusted values once and executes no markup; plaintext retains literal characters rather than HTML entities. Personal messages, names and branding are not translated; trusted invitation URL destination is unchanged.                                                  | R-3, R-6; AR #6, #8, #10                            |
| ST-14 | Dutch lifetimes 604800, 86400, 43200, 3600, 300, 60, 61, 86401 seconds.                                                                                                                                                   | `7 dagen`, `1 dag`, `12 uur`, `1 uur`, `5 minuten`, `1 minuut`, `2 minuten`, `1441 minuten`. Corresponding English singular/plural behavior remains unchanged; persisted expiry is untouched.                                                                                          | R-3, R-9; AR #1, #9, #10                            |
| ST-15 | Tenant HTML override only; tenant plaintext override only; custom template references each legacy context variable and hardcodes its own English text.                                                                    | Independent existing lookup/fallback remains. All legacy variables render, including localized `expiresIn` and canonical `locale`; hardcoded tenant text stays unchanged.                                                                                                              | R-7; AR #6                                          |
| ST-16 | Through existing protected preview and real invitation/SMTP fixtures, use matching inputs/inviter/organization; then induce the existing transport/render failure path.                                                   | Preview and sent subject/HTML/text agree apart from the intentionally different token URL. Successful SMTP acceptance reports `sent`/true; failed delivery retains existing `failed`/false semantics and the already-created invitation. No automatic retry.                           | R-2, R-7, R-9; AR #5, #9                            |
| ST-17 | Valid stored Dutch invitation, unsupported browser language, English organization; GET confirmation then password form.                                                                                                   | Both return 200 with `lang="nl"`; confirmation title `U bent uitgenodigd`, form title `Accepteer uw uitnodiging`; GET creates no account and consumes no token.                                                                                                                        | R-4–R-6; AR #2, #8, #10                             |
| ST-18 | Valid stored Dutch invitation, browser `en`, organization `nl`; submit valid matching passwords.                                                                                                                          | Entire valid flow uses English browser preference. Acceptance still preserves the explicit stored account locale `nl`; rendering does not rewrite it to `en`.                                                                                                                          | R-4, R-9; AR #2, #9                                 |
| ST-19 | Valid null/unsupported stored locale and no supported browser preference; organization Dutch, then only global Dutch.                                                                                                     | Confirmation, form and success select Dutch through the remaining chain; no inherited-language snapshot or invitation-row update.                                                                                                                                                      | R-4, R-9; AR #9, #11                                |
| ST-20 | Valid Dutch invitation; complete matching valid-password submission.                                                                                                                                                      | Success heading/title `Uw account is aangemaakt!`, success flash `Uw uitnodiging is geaccepteerd.`; no raw translation keys or English filename-derived document title. Account creation/preassignments/audit remain the existing flow.                                                | R-5, R-6; AR #8, #10                                |
| ST-21 | Valid Dutch invitation: mismatched passwords, 7-character password, then 129-character password.                                                                                                                          | Respective errors `De wachtwoorden komen niet overeen`, `Het wachtwoord moet minimaal 8 tekens bevatten`, `Het wachtwoord mag maximaal 128 tekens bevatten`. No acceptance call; existing password rules and other callers' English errors remain unchanged.                           | R-5; AR #10; 03-03 §Copy, Titles and Validation     |
| ST-22 | Invalid CSRF with Dutch browser preference; valid invitation with an unexpected invalid password reason; valid-flow processing exception.                                                                                 | Existing 403 uses baseline Dutch `De beveiligingscontrole is mislukt. Vernieuw de pagina en probeer het opnieuw.`; unexpected/processing failures use generic `Er is een onverwachte fout opgetreden. Probeer het opnieuw.` without raw errors.                                        | R-5, R-6; AR #8, #10                                |
| ST-23 | Same unsupported browser preference and English organization; unknown, expired, used, foreign-tenant and email-conflicting invitations, including a conflict row containing `nl`.                                         | All generic rejections return the existing 400 baseline-English expired page and equivalent non-sensitive context; no invitation locale, identity, address or token appears. Compare meaningful HTML while excluding only random CSRF/nonce values, never language/text.               | R-6; AR #8                                          |
| ST-24 | Validate a Dutch invitation, then make atomic acceptance return null after the valid locale was selected. Compare to unknown token under the same request/organization.                                                   | Both use the same baseline-English generic rejection/status/title. The late null must not retain the invitation translator or details.                                                                                                                                                 | R-6; AR #8                                          |
| ST-25 | Bad/missing CSRF while a valid Dutch invitation exists.                                                                                                                                                                   | No token lookup, email-conflict lookup, acceptance call or mutation; response authority comes only from baseline request/organization data.                                                                                                                                            | R-6; AR #8                                          |
| ST-26 | Cross-tenant Dutch token, overlapping locale/override renders and malicious displayed names.                                                                                                                              | Existing tenant denial, render isolation and escaped HTML hold together; no foreign data or new sensitive diagnostic output.                                                                                                                                                           | R-6–R-8; AR #7, #8                                  |
| ST-27 | Repeated confirmation/form GET, successful POST and replay POST against real existing fixtures.                                                                                                                           | GET is non-mutating; at most the existing single successful acceptance creates the account. Replay uses the generic rejection contract. No expiry, transaction or delivery-status changes.                                                                                             | R-6, R-9; AR #8, #9                                 |
| ST-28 | Read public config/invitation/custom-UI guidance and maintainer references.                                                                                                                                               | Canonical choices `en`/`nl`, unchanged default `en`, correct browser/email chains and custom-template limitations; adding a language requires source pack plus allowlist/rebuild. No mount-only runtime-install promise.                                                               | R-10; AR #4, #12                                    |
| ST-29 | Read rollout/rollback instructions and verify configuration authority regression cases.                                                                                                                                   | Instructions require all instances upgraded before global `nl`, accept temporary language differences, and restore/confirm `en` before downgrade. Existing exact read/update permissions and 400/403/storage semantics remain; no new deployment automation.                           | R-6, R-10; AR #8, #9                                |
| ST-30 | Real Chromium journey with browser `fr-FR`, stored `nl`, English organization: confirmation, form, mismatch, short password, valid submission; also browser-English override journey. For the short-password step only, remove `minlength` from the two password inputs in the test page and submit matching seven-character passwords through the existing button/form. | Observe the actual POST and its Dutch minimum-length error from ST-21, coherent title and `lang="nl"`, and a still-pending invitation before successful submission. The second journey follows browser English. Production validation attributes, focus, form actions, CSRF, headers and single-use behavior remain unchanged. | R-4–R-6; AR #2, #5, #8, #10; PF-006 |

### Resource-Loss and Phase Ownership

ST-01 has three additional Phase 1 subcases using real i18next with isolated fixture resources.
Keep shipped-pack completeness checks separate and restore all resource state in teardown:

1. With Dutch `common` unavailable, Dutch candidate input and English organization/global
   defaults, `resolveLocale` returns `en`.
2. With Dutch `common` available but its invitation namespace absent, selection remains `nl`;
   `getTranslationFunction('nl')('invitation.title')` returns the independent literal
   `Accept your invitation`.
3. With the Dutch invitation namespace present but only its `title` missing, selection remains
   `nl` and the same English title is returned. Never derive expected text from the fixture.

These cases use the existing synchronous translator without tenant overrides; they do not depend
on Phase 2's async preparation companion. No shipped resource file is changed by a test.

ST-07's resolver argument/precedence and normalization assertions belong to Phase 1. Its actual
send/preview entry-point assertions belong to Phase 2. ST-08's public resolver rejection belongs
to Phase 1; its direct unsafe preparation/no-path-read assertion is authored and run red in
Phase 2 before task 2.2.1. This partitions assertions without dropping or deferring their required
coverage past the owning implementation (PF-001, PF-005).

Intermediate implementation tasks run only their explicitly owned assertion groups. All groups
are authored in the phase's specification session and retained in its initial red run and final
complete green run; narrower intermediate selectors do not skip, weaken or relabel the remaining
immutable cases as passed. Keep these groups independently selectable by descriptive test names.

| Task | Assertions that must pass at this boundary | Assertions owned by a later boundary |
| --- | --- | --- |
| 2.2.1 | Direct companion rejects unsafe preparation without path access (ST-08); direct translator readiness/isolation subcases use delayed override barriers and literal output (ST-09/ST-10) | Actual send/preview wiring and any rendered template output |
| 2.2.2 | Real send/preview locale selection and awaited overrides (ST-07/ST-09/ST-10); subject variants (ST-11); context strings, literal interpolation and lifetime values (ST-11–ST-14), observed through existing custom-template fixtures | Shipped-template heading, greeting, instructions, expiry text and HTML/plaintext escaping |
| 2.2.3 | Shipped HTML/plaintext heading/greeting, action/instructions/expiry, escaping and independent custom-template fallback (rendered ST-11–ST-15) | None of the Phase 2 rendering assertions |
| 2.2.4 | Complete Phase 2 immutable unit/integration suite, including all send/preview and delivery assertions | No partial-suite result substitutes for this gate |
| 3.2.2 | Locale selection and account-locale preservation, CSRF/conflict/late-null ordering, non-mutating GET, tenant/replay authority and unchanged enumeration assertions (authority subcases of ST-17–ST-19/ST-23–ST-27) | Exact localized titles, validation, success and error copy |
| 3.2.3 | Exact localized titles and all presentation copy, including ST-17's titles and ST-20–ST-22 | Complete route/pentest/browser run belongs to 3.2.4 |

Direct preparation subcases do not replace ST-09/ST-10's actual email callers. Context fixtures
reuse the existing tenant-template override mechanism and real Handlebars; do not export a new
production test seam or mock the context producer. Apply necessary existing-test initialization
or mocks with the dependency-changing task, before running its regressions; later hardening
tasks recheck those adaptations.

## Test Mapping

All paths below are under `packages/server/tests/` unless explicitly repository-relative.
Use small parameterized cases and split by these concerns, not one large test file.

| Specification file                                                                          | Cases                                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `unit/auth/invitation-locales.spec.test.ts`                                                 | Phase 1: ST-01–ST-06 (including resource-loss subcases), resolver-only ST-07/ST-08 |
| Existing catalog/API specifications named in AR #12                                         | ST-02, ST-29                                                             |
| `unit/auth/invitation-email-localization.spec.test.ts`                                      | Phase 2: send/preview ST-07, direct-preparation ST-08, ST-09–ST-15 |
| `integration/services/invitation-localization.spec.test.ts`                                 | ST-16, relevant ST-07/ST-09/ST-15                                        |
| `unit/routes/invitation-localization.spec.test.ts`                                          | ST-17–ST-27                                                              |
| `pentest/auth-bypass/invitation-localization.spec.test.ts`                                  | ST-23–ST-27 alongside unchanged security baselines                       |
| `ui/flows/invitation-localization.spec.test.ts`                                             | ST-30; real E2E browser coverage through the existing Playwright project |
| `repo-tests/monorepo/invitation-localization.spec.test.mjs` and existing documentation spec | ST-28–ST-29                                                              |

Implementation test files are `unit/auth/invitation-locales.impl.test.ts`,
`unit/auth/invitation-email-localization.impl.test.ts` and
`unit/routes/invitation-localization.impl.test.ts`. They cover internal preparation failures,
literal interpolation, branch/error dispatch and regression setup. They do not redefine oracles.
The existing password unit tests also retain English/policy coverage while asserting the new
internal reason. No new Vitest E2E harness is needed: ST-16 plus ST-30 cover real delivery and
end-to-end acceptance on existing infrastructure (AR #5, #13).

The existing catalog/API mapping also includes `unit/lib/system-config-runtime.spec.test.ts`
under the precise PF-002 supplement. Keep the physical inventory current with each test-file
addition. The browser matcher change is exactly the PF-004 supplement; it preserves existing
`.spec.ts` files and includes `.spec.test.ts` specifications, without a new runner or shared setup.

The Phase 2 regression selector also includes the existing
`integration/services/email.service.test.ts`. Initialize real i18n with file-local awaited
`beforeAll` setup there, retaining its SMTP, English-copy and expiry assertions (PF-007).

## Fixtures and Hygiene

Use unique invitation addresses and the existing tenant/SMTP/browser helpers. Fixture locale and
template trees, barriers, logs and reports belong under the executing session's `CODEOPS_TMPDIR`;
read/copy only known non-secret shipped resources. Never alter an operator's overrides or follow
protected symlinks. All fixture cleanup uses `finally`/teardown and preserves foreign resources.
Use explicit test barriers, not sleep/retry-based evidence (AR #5, #7).

Before executing runners, obtain any required **current-conversation exact-path approval** for
`/home/gevik/workdir/github/porta/porta-identity/.env` when test/Compose configuration loads it.
The assurance provenance checksum also reads
`/home/gevik/workdir/github/porta/porta-identity/.npmrc`; obtain approval for that read separately.
Resolve any package-local `.env` and harness-owned temporary credential paths before access.
These paths describe the current checkout; re-resolve and obtain approval for the actual exact
paths if execution uses another worktree. Historical approval does not transfer automatically.
Do not print its content, infer approval from this document, change permissions, or invent a
different runner to bypass a denial. Stop if another protected path would be accessed without
approval. No such file is needed for plan validation.

## Verification Commands

The user confirmed this policy in AR #5. Commands are from the repository manifests/guidance;
run from the root, with service lifecycle and protected-file approval resolved first.

| Gate                                 | Command / selector                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Local starting point                 | `pnpm test:changed`                                                                                                                         |
| Focused unit red/green               | `pnpm --filter @portaidentity/server exec vitest run --project unit <explicit relevant test paths>`                                         |
| Focused integration                  | `pnpm --filter @portaidentity/server exec vitest run --project integration tests/integration/services/invitation-localization.spec.test.ts tests/integration/services/email.service.test.ts` |
| Server checks                        | `pnpm --filter @portaidentity/server lint`, `pnpm --filter @portaidentity/server typecheck`, `pnpm --filter @portaidentity/server build`    |
| Structure / operator docs            | `pnpm test:structure`, `pnpm docs:build`                                                                                                    |
| UI iteration / complete browser gate | `pnpm --filter @portaidentity/server test:ui --grep 'Invitation'` / `pnpm test:ui`                                                          |
| Security gate                        | `pnpm test:pentest`                                                                                                                         |
| Registered assurance gate            | `pnpm assurance:harness --project security --profile production-security`                                                                   |
| Full merge gate, CI only             | `pnpm verify` and the existing separate UI/OIDC/docs/Docker/audit jobs                                                                      |

For the unit selector, replace the angle-bracket notation with the explicit files in the test
mapping and AR #12; it is explanatory notation, not a shell command to paste unchanged. JSON
resource batches can first be validated by parsing the exact added files and running their
existing spec selector. Do not create a validator framework or claim translated semantics from
key parity alone; the Dutch copy receives human/independent review.

Every red task records the expected behavioral failures, plus any pre-existing passing cases.
Import/configuration failures alone are not behavioral red evidence. Every green task repairs
implementation, never its immutable expected output. Before each commit, run affected workspace
checks and structure contracts; no blanket local full verification is authorized (AR #5, #12).

For the new async companion, a missing export must not prevent every specification from being
collected. Use a per-case prospective-interface check through the existing module namespace;
exercise existing email entry points independently for behavioral red evidence. Do not add a
production stub, new runner or implementation logic during specification authoring.

### Clean-Revision Assurance Checkpoint

Before task 3.3.4 runs, record its pending/running state and complete earlier required checks.
Under the active execution commit mode, obtain an authorized commit containing the candidate
product/tests/docs and current progress. Confirm `git status --porcelain=v1 --untracked-files=all`
is empty; record the candidate commit and tree identities. This is a local checkpoint, not push,
merge, release or deployment authority.

Keep that worktree unchanged throughout the harness run, including evidence collection and owned
cleanup. Keep interim notes outside the repository under `CODEOPS_TMPDIR`. After the runner exits
and cleanup finishes, update the task/roadmap with the result tied to the original candidate
commit/tree, then use the active commit mode for those evidence edits. The later evidence commit
does not replace the revision actually tested. A failed assertion stays failed.

If `--no-commit`, a deferred commit, unrelated changes, or missing permission prevents this clean
checkpoint, mark the gate blocked and ask for the minimum necessary authorization. Do not stash,
discard, commit unrelated work, weaken provenance, or create another verification worktree
automatically. This explicit boundary reconciles progress recording with clean-source admission
(PF-003).

The registered security harness must retain its outcome taxonomy. Existing accepted incomplete
observers and exit 40 are not a full pass; failed assertions, new gaps or changed observer sets
block completion unless separately resolved under policy. Never retry-away an assertion or
weaken a test. Retain run/revision/cleanup evidence, not secrets.

Use owned `pnpm docker:down`/harness lifecycle commands for resources the execution started. Drop
owned scratch databases, remove owned images/installations, and confirm final container/network/
volume inventories. Never prune or remove pre-existing resources. If cleanup fails, record the
exact recovery action. No services or product tests run during plan creation.
