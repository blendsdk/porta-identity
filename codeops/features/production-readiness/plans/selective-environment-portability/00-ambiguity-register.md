# Ambiguity Register: Selective Environment Portability Plan

> **Status**: ✅ GATE PASSED — all 8 items resolved
> **Last Updated**: 2026-09-13 15:34
> **CodeOps Artifact Schema**: 1

## Planning boundaries

| Boundary          | Confirmed value                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planning target   | `production-readiness/RD-02` selective environment portability                                                                                            |
| Context artifacts | RD-02, its clean preflight report, the production-readiness roadmaps, current server/SDK/CLI/Admin UI source and tests, public docs, and project guidance |
| Modification set  | This plan folder, RD-02, and the production-readiness roadmaps; the user authorized the RD corrections found by plan preflight                            |

## Register

| #    | Category             | Ambiguity / Gap                                                                                                                       | Options Presented                                                                                                                                                                                                                                                                 | User Decision                                                                                                                                                                                                    | Status      |
| ---- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| AR-1 | Scope                | Which approved requirements and exclusions govern the plan?                                                                           | Use the approved RD-02 with only authorized preflight corrections / reopen requirements discovery                                                                                                                                                                                 | Use the approved RD-02 and preserve its exclusions. The user later authorized the plan-preflight corrections recorded in `00-preflight-report.md`; they add no optional product scope.                           | ✅ Resolved |
| AR-2 | Technical            | How should the corrected server implementation replace the 79 KiB legacy importer without retaining one oversized mixed-concern file? | A: direct feature modules for strict schema, export, planning, and apply orchestration / B: continue expanding the existing single importer                                                                                                                                       | User approved A: split by direct feature responsibility; add no framework, dependency, or generalized import subsystem.                                                                                          | ✅ Resolved |
| AR-3 | UX & presentation    | Where should the terminal Admin UI expose portability, and which scope should it initially select?                                    | A: one top-level **Import / Export** menu entry opening one maximized workspace with Export and Import tabs; prefer the selected organization when present, otherwise environment scope only for a super-admin / B: separate menu commands and workspaces with no initial scope   | User approved A: use one maximized tabbed workspace and the stated initial-scope rule.                                                                                                                           | ✅ Resolved |
| AR-4 | Naming & terminology | What exact conventional CLI selection flags should the export command expose?                                                         | A: mutually exclusive `--organization <slug>` / `--environment`, repeatable `--category`, and mutually exclusive repeatable `--application` / `--all-applications` / B: one encoded `--scope` value and comma-delimited lists                                                     | User approved A: use the separate repeatable flags and yargs validation.                                                                                                                                         | ✅ Resolved |
| AR-5 | UX & presentation    | What server-created filename should portability export suggest?                                                                       | A: `porta-manifest-<UTC timestamp>.json` / B: scope-specific names containing the selected organization slug                                                                                                                                                                      | User approved A: use `porta-manifest-<UTC timestamp>.json`.                                                                                                                                                      | ✅ Resolved |
| AR-6 | Technical            | Which final verification boundary governs implementation?                                                                             | A: focused server/SDK/CLI/Admin UI tests while iterating, affected workspace verification plus `yarn test:structure`, applicable security assurance, and final `yarn verify`; run `yarn test:ui` only if browser OIDC behavior changes / B: focused workspace tests only          | User approved A: use the RD-02 and project-guidance verification boundary.                                                                                                                                       | ✅ Resolved |
| AR-7 | UX & presentation    | How do the new conventional CLI commands interact with the existing global `--json` output mode?                                      | A: honor `--json`; export prints structured file metadata and import prints its structured preview/apply result including committed one-time credentials / B: reject `--json` for portability commands                                                                            | User approved A: retain structured `--json` output and readable terminal output otherwise.                                                                                                                       | ✅ Resolved |
| AR-8 | UX & presentation    | In the Admin UI export flow, does the server export run before or after the save-file dialog?                                         | A: call the server first, then seed the save dialog from its `Content-Disposition` filename; cancelling the dialog still leaves the security audit because protected data reached the Admin UI / B: choose a path first, then call the server, using a locally predicted filename | User approved A: export first, preserve its audit, then offer the authoritative server filename for local save. The user also reconfirmed the target, context, modification set, and absence of scope additions. | ✅ Resolved |

## Resolution Notes

**AR-1:** The upstream requirements register owns the accepted product decisions AR-6–AR-12 and
AR-15–AR-17. The RD-02 preflight report owns its original fifteen accepted corrections. This
plan's preflight report owns the later authorized contract clarifications applied to RD-02. They do
not reopen product scope or add optional machinery.

**AR-2:** The current `packages/server/src/lib/data-import.ts` is about 79 KiB and combines schema,
planning, mutation, credentials, and audit behavior. Option A is a direct responsibility split,
not a generalized import framework or new dependency.

**AR-3:** The current shell mounts full-page workspaces through
`packages/cli/src/admin/presentation.ts` and already has one top-level menu per feature area.

**AR-4:** The current CLI uses yargs command modules and typed options. Both choices are feasible;
Option A lets yargs validate each selection without adding a custom comma parser.

**AR-5:** Both filenames are safe because the server creates them. Option A avoids putting a
user-controlled slug into a response header and keeps one predictable artifact name.

**AR-6:** Option A is the verification contract already approved in RD-02 and matches the
authoritative commands in `AGENTS.md`.

**AR-7:** Export always writes the same manifest file regardless of presentation mode. Import
returns the same server-owned result; `--json` changes only CLI serialization and does not bypass
preview, confirmation, apply validation, or one-time-secret rules. The CLI already declares
`--json` as a global output option, so this preserves the public convention without adding a new
format or parser. Generated credentials retain their one-time result boundary.

**AR-8:** Option A keeps the server-created attachment name authoritative and correctly audits the
fact that protected data reached the client process. Option B avoids a server call after file-dialog
cancellation but duplicates filename creation and cannot use the response name to seed that dialog.
