# Preflight Report: Consent Flag Surfaces

> **Audit target**: `codeops/features/admin-ui/plans/consent-flag-surfaces/` (whole plan)
> **Context documents**: `admin-ui/requirements/RD-04-applications-and-oidc-clients.md`,
> `admin-ui/plans/applications-oidc-clients/`, server/SDK/CLI source under `packages/`
> **Revision audited**: plan tree `d9fd59e466f71c9d8a6835fce115e6abba720f1f` at `d34dc83f` (roadmap `e56d4bd2`)
> **Scope mode**: strict
> **CodeOps Artifact Schema**: 1

> ⚠️ **SAME-SESSION REVIEW** — this plan was authored in the current session. Blind spots are
> possible; every claim below is verified against source with `file:line` evidence.

## Codebase Context Summary

| Claim in plan                                      | Verified reality                                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| SDK `Client`/inputs omit the field                 | `packages/sdk/src/types/clients.ts:62,105,132`                                                                                   |
| SDK `isClient` is a strict conjunction             | `packages/sdk/src/domains/clients.ts:40-75` (`requirePkce` at 68)                                                                |
| SDK create/update forward the input                | `packages/sdk/src/domains/clients.ts:180-196`                                                                                    |
| CLI conditional-spread pattern exists              | `packages/cli/src/commands/client.ts:147,342`                                                                                    |
| CLI `get` prints `requirePkce`                     | `packages/cli/src/commands/client.ts:284`                                                                                        |
| Admin `protocolSection` PKCE switch                | `packages/cli/src/admin/client-workspace.ts:405,424-428,440,457`                                                                 |
| Admin `clientValue` strict allowlist               | `packages/cli/src/admin/client-service.ts:222,252`                                                                               |
| `save-protocol.input` is `UpdateClientInput`       | `packages/cli/src/admin/client-workspace.ts:61-64`; routed at `application-client-features.ts:300-305`                           |
| Portability carries `require_pkce` (snake_case)    | `schema.ts:313`, `types.ts:262`, `repository.ts:614,641`, `plan-support.ts:434`, `import-user-client-writers.ts:161,169,188,196` |
| SDK import type uses snake_case                    | `packages/sdk/src/types/imports.ts:262` (`require_pkce`)                                                                         |
| Portability manifest is strict and version-literal | `schema.ts:315` (`.strict()`), `schema.ts:373` (`version: z.literal('1.0')`)                                                     |

## Findings

| #      | Severity       | Dimension                         | Finding                                                                                                                                                                                                                                                                                                                                                                                | Recommendation                                                                                                                                                                     |
| ------ | -------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PF-001 | 🟠 MAJOR       | Codebase Alignment / Data & state | `03-04` states the portability export key is `requireConsent` (camelCase) and shows a camelCase example. The portability manifest is snake_case and `.strict()` (`schema.ts:315`); the real key is `require_consent`, matching `require_pkce` and the SDK import type (`imports.ts:262`). Following the doc literally adds an unknown key to a strict schema.                          | Correct `03-04` prose, snippet, and example to `require_consent` (snake_case) throughout; remove the "exported payload field: requireConsent" line.                                |
| PF-002 | 🟠 MAJOR       | Completeness / Testability        | ST-7/ST-8 and Phase 1/4 tasks point at `oidc-client-editors.spec.test.ts`, but that file tests secret expiry/Credentials. The Protocol editor and its exact `save-protocol` input assertions live in `oidc-client-detail.spec.test.ts:376-386` and `480-487`. Adding `requireConsent` to the save input breaks both `toContainEqual` assertions, and the plan does not name that file. | Retarget ST-7/ST-8 and Phase 1 task 1.3 / Phase 4 tasks to `oidc-client-detail.spec.test.ts`; add the two input assertions to the update list.                                     |
| PF-003 | 🟡 MINOR       | Consistency                       | `docs/cli/clients.md` is broadly drifted from the real CLI (`--org-id`/`--app-id`, `client show --id`, `--scope`, `--cors-origins`) yet the plan adds one row to it (`5.3`).                                                                                                                                                                                                           | When editing, align the `create`/`get`/`update` sections touched by this task to the real flags (`--org`, `--app`, `client get <client-id>`), or record the drift as out of scope. |
| PF-004 | 🟡 MINOR       | Consistency                       | Usage examples are not runnable: `client create` omits the required `--type`/`--redirect-uris`; `client get`/`update` show `--org`, but `GlobalOptions` has no `org` (`global-options.ts:31-39`) and `client-id` is positional.                                                                                                                                                        | Fix the examples in `00-index.md`: add `--type`/`--redirect-uris`; write `client get <client-id>` and `client update <client-id>`.                                                 |
| PF-005 | 🟡 MINOR       | Codebase Alignment                | `03-03` snippet writes `createSignal(...)`; the real helper is `signal(...)` (`client-workspace.ts:405`).                                                                                                                                                                                                                                                                              | Rename to `signal`.                                                                                                                                                                |
| PF-006 | 🔵 OBSERVATION | Codebase Alignment                | `docs/api/clients.md:68` lists `cors_origins` (real updatable field is `allowedOrigins`); `docs/api/clients.md` create table also drifts. Pre-existing, out of scope.                                                                                                                                                                                                                  | Leave; optionally record as a follow-up.                                                                                                                                           |
| PF-007 | 🟡 MINOR       | Migration & Compatibility         | `03-04` makes `require_consent` required, so a manifest exported before this change (version literal `1.0`) fails to import. Recorded in the error table but with no AR entry.                                                                                                                                                                                                         | Keep required (matches `require_pkce`); add an AR note recording the accepted, loud-failure compatibility consequence.                                                             |

## Iteration 2 — Resolution

All findings resolved in the plan documents (no code changed):

| #      | Status      | Resolution                                                                                                                                                  |
| ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PF-001 | ✅ Resolved | Portability key corrected to `require_consent` in the prose, snippet, JSON example, AC-4, and ST-10.                                                        |
| PF-002 | ✅ Resolved | ST-7/ST-8 and Phase 1 task 1.3 / Phase 4 task 4.4 retargeted to `oidc-client-detail.spec.test.ts`, including the two exact assertions at `376-386,480-487`. |
| PF-003 | ✅ Resolved | The `docs/cli/clients.md` task now aligns the edited sections to the real flags.                                                                            |
| PF-004 | ✅ Resolved | `00-index`/`03-01`/`03-02` examples made runnable (required `--type`/`--redirect-uris`, positional `<client-id>`, real `createPortaClient`).                |
| PF-005 | ✅ Resolved | Snippet uses `signal(...)`.                                                                                                                                 |
| PF-006 | 🔵 Accepted | Pre-existing `docs/api/clients.md` drift, out of scope.                                                                                                     |
| PF-007 | ✅ Resolved | AR-10 records the required-field compatibility consequence.                                                                                                 |

## Verdict

✅ **PREFLIGHT PASSED WITH NOTES — 6 resolved, 1 observation accepted** (PF-006).

Independent challenger was not spawned: the specialized reviewer agents are manual-invocation only,
and every finding is code-grounded with `file:line` evidence.

**Confidence:** High for PF-001/PF-002 (direct source evidence). **Hardening:** in-context
verification only; no independent challenger.
