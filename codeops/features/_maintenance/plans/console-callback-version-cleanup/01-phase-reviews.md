# Phase Reviews: T-01

> **CodeOps Artifact Schema**: 1
> **Scope**: strict
> **Last Updated**: 2026-09-27

## Phase 1 — Issue #141: Console callback URI

**Reviewed diff:** `/tmp/opencode/phase1-review.diff` (baseline tree
`975e8befbf987c4f8c0acb21f7b233fda3ebb57f`; product commits `4d024751`, `de05c182`)
**Reviewers:** correctness-reviewer (`RV-*`), security-auditor (`SA-*`, profiles
`auth-protocol` + `owasp-web`), parallel dispatch
**Verify evidence:** targeted unit 11 passed; targeted integration 3 passed; `yarn test:structure`
138 passed; `yarn docs:build` passed; live probe Console URI 303 and unregistered path 400
`invalid_redirect_uri`.

### Security assessment (SA, no critical/major findings)

- The accepted redirect set grows from three to five fixed loopback paths; no new host, scheme,
  scope, grant, or client metadata change.
- Exact path matching plus PKCE (S256) prevents wildcard/open-redirect abuse; a captured local code
  cannot be exchanged without the verifier.
- `/api/admin/metadata` remains intentionally public and returns only `issuer`, `orgSlug`, and the
  public `clientId` (not a credential); no new public disclosure.

### Findings

| ID              | Severity | Dimension / profile       | Location                                                                                            | Problem                                                                                                                                                                                                                                                                                                                                                                                          | Recommended resolution                                                                                                                                                                                                                                                                                                                                                                                            | User decision |
| --------------- | -------- | ------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| RV-001 = SA-001 | 🟠 MAJOR | correctness / owasp-web   | `docs/cli/bootstrap.md:52`; plan task T-01.4                                                        | The existing-install tip says to take `<client-id>` from `GET /api/admin/metadata` (`clientId`), but `porta client update` requires the internal UUID (`clientId` is the public OIDC id): `packages/cli/src/commands/client.ts:318-322,349-352`, `packages/server/src/routes/clients.ts:337-350`, `packages/server/src/clients/repository.ts:143-148`. Following the documented fix returns 404. | **Option A (recommended):** docs-only correction — take the internal `ID` from `porta client list` (columns `ID` / `Client ID` at `packages/cli/src/commands/client.ts:240-248`), note that metadata `clientId` is the OIDC login identifier, and align the plan task text. **Option B:** make client routes accept the public `client_id` (larger, outside strict scope, needs its own authorization and tests). | ✅ Resolved — User chose Option A (docs-only correction) |
| RV-002          | 🟡 MINOR | correctness / consistency | `docs/api/authentication.md:13-14`                                                                  | The sequence diagram still shows `{ issuer, authorization_endpoint, token_endpoint }` while the page and implementation now show `{ issuer, orgSlug, clientId }` (`packages/server/src/server.ts:240-244`).                                                                                                                                                                                      | Update the diagram reply and the surrounding wording with the RV-001 docs pass.                                                                                                                                                                                                                                                                                                                                   | ✅ Applied with the RV-001 fix |
| RV-003          | 🟡 MINOR | standards (audit trail)   | `codeops/features/_maintenance/plans/console-callback-version-cleanup/99-execution-plan.md:105-130` | Recorded completion timestamps (20:31–20:39) postdate the commit that contains them (`de05c182` at 20:32), so the audit trail is not faithful.                                                                                                                                                                                                                                                   | Rewrite the marks with the actual times from the verify log mtimes; keep timestamps truthful for the remaining phases.                                                                                                                                                                                                                                                                                            | ✅ Corrected to the recorded verify times |

Reviewer verdicts: no other correctness, maintainability, or standards issues in the touched code,
tests, or docs. The integration test intentionally mirrors the init steps and now pins the DB
value; the provider's native loopback matching was verified against
`node_modules/oidc-provider/lib/models/client.js:444-466`.

**RV-001 ruling (2026-09-27):** the user chose Option A. The existing-install tip now identifies the
client by the internal UUID from `porta client list --app <app-uuid>` and states that the metadata
`clientId` is the public OIDC identifier. RV-002 and RV-003 were applied in the same follow-up
commit. A single scoped re-review runs on the fix diff.

### Phase 1 re-review (fix diff `4ecbec56`)

| Finding | Verdict | Evidence |
| ------- | ------- | -------- |
| RV-001 = SA-001 | ✅ Fixed | `docs/cli/bootstrap.md:49-57` uses the internal UUID from `porta client list --app <app-uuid>`; metadata `clientId` documented as the OIDC login identifier |
| RV-002 | ✅ Fixed | `docs/api/authentication.md:14` now `{ issuer, orgSlug, clientId }`, matching `packages/server/src/server.ts:240-244` |
| RV-003 | ✅ Fixed | Plan marks match the verify-log mtimes and precede their containing commit |

Re-verified commands: `porta app list` (ID column), `porta client list --app` (ID column),
`porta client update <uuid>` (internal UUID). **No new findings. Phase 1 closes reviewed.**

## Phase 2 — Startup version log

**Reviewed diff:** `/tmp/opencode/phase2-review.diff` (baseline tree
`f9769c2d1d30c52aa8fa95abeeccbfdb4207aeba`; commit `6f519b94`)
**Reviewer:** correctness-reviewer
**Verify evidence:** `node scripts/sync-versions.js --check`; `yarn test:structure` 138 passed;
server typecheck; `yarn docs:build`.

| ID     | Severity | Location                                              | Problem                                                                                                                                                                        | Resolution                                                                                          | Decision    |
| ------ | -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------- |
| RV-001 | 🟡 MINOR | `repo-tests/monorepo/release.spec.test.mjs:86-87`      | The version field and the `'Server started'` message were pinned as two independent file-wide matches, so a regression that moved the field to another log entry would stay green. | Single co-location regex tying `logger.info`, `version: SERVER_VERSION`, and `'Server started'`.     | ✅ Applied  |

All required checks passed: constant drift cannot pass silently; the log field reaches pino output;
no planning-artifact reference leaked into shipped code; the deployment docs claim matches the
public surface. **No critical/major findings; Phase 2 closes reviewed.**

## Phase 3 — Agent cleanup directive

**Reviewed diff:** `/tmp/opencode/phase3-review.diff` (baseline tree
`ffa5eb4b309ba881696147e27b962ace6baa8c9a`; commit `6756bcc4`)
**Reviewer:** correctness-reviewer (docs-only diff; security/perf auditor dispatch skipped per the
profile rule, logged here)
**Verify evidence:** `yarn test:structure` 138 passed.

| ID     | Severity | Location        | Problem                                                                                                              | Resolution                                                                                       | Decision                                  |
| ------ | -------- | --------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| RV-001 | 🟠 MAJOR | `AGENTS.md:166` | Sentence-final qualifier could parse as scoping all nine prohibitions, weakening password/key/stack-trace rules.       | Split into two sentences: absolute list unchanged, then a separate public-fingerprint prohibition. | ✅ Resolved — User chose Option A          |
| RV-002 | 🟡 MINOR | `AGENTS.md:9-13` | "Use the owned commands instead of ad-hoc" conflicted with teardown of task-created volumes/images and scratch stacks. | Owned commands scoped to repository-owned stacks; task-created scratch stacks use `docker compose -p <scratch> down -v`. | ✅ Applied                                 |
| RV-003 | 🟡 MINOR | `99-execution-plan.md:4` | Progress header was still `0/15 tasks (0%)`.                                                                    | Set to `11/15 tasks (73%)` and kept current through Phase 4.                                      | ✅ Applied                                 |
| RV-004 | 🔵       | `AGENTS.md:10`  | "the assurance harness cleanup" was not an executable command.                                                        | Reworded to "the cleanup built into each `yarn assurance:*` run".                                 | ✅ Applied                                 |
| RV-005 | 🔵       | `AGENTS.md` commands table | Prettier column reflow, content identical.                                                                | No action; transparency note.                                                                     | ✅ Noted                                   |
