# Current State: Selective Environment Portability

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

Porta already has authenticated export and import routes, a repeatable-read report exporter, a
transactional but unused provisioning importer, granular Admin permissions, content-safe audit
helpers, request-owned PostgreSQL transactions, post-commit cache cleanup, SDK namespaces, yargs
commands, and a terminal Admin UI with maximized workspaces and JSVision file selection. These are
the patterns reused by the smallest viable design. (AR-1, AR-2)

### Relevant Files

| File                                                | Purpose                                           | Changes Needed                                                           |
| --------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/server/src/routes/exports.ts`             | Entity report download routes                     | Add strict manifest export without removing report downloads             |
| `packages/server/src/routes/imports.ts`             | Legacy provisioning endpoint                      | Replace request and result contract with preview/apply portability       |
| `packages/server/src/server.ts`                     | Body parser and route mounting                    | Exclude import from 100 KiB parser and mount its protected 64 MiB parser |
| `packages/server/src/lib/data-export.ts`            | Bounded CSV/JSON reports                          | Retain report behavior; move portability behavior to its own module      |
| `packages/server/src/lib/data-import.ts`            | 79 KiB legacy schema and mutation engine          | Replace with feature-local direct modules                                |
| `packages/server/src/lib/data-import-plan.ts`       | Legacy dependency plan                            | Replace with strict natural-key plan                                     |
| `packages/server/src/lib/database.ts`               | Request-owned transaction and post-commit effects | Reuse unchanged                                                          |
| `packages/server/src/lib/admin-permissions.ts`      | Permission catalog and seeded Admin roles         | Reuse existing export/import and category permissions                    |
| `packages/sdk/src/domains/exports.ts`               | Raw report downloads                              | Add typed manifest operation                                             |
| `packages/sdk/src/domains/imports.ts`               | Legacy `provision()` call                         | Replace with `preview()` and `apply()`                                   |
| `packages/sdk/src/types/imports.ts`                 | Legacy import types                               | Replace with exact strict manifest/result types                          |
| `packages/cli/src/commands/provision.ts`            | YAML/JSON transformer                             | Remove and replace with direct import/export commands                    |
| `packages/cli/src/admin/presentation.ts`            | Commands, menus, workspace mounting               | Add the Import / Export entry and capability gating                      |
| `packages/cli/src/admin/application.ts`             | Controller and command lifecycle                  | Own one portability controller                                           |
| `packages/cli/src/admin/organization-controller.ts` | Existing JSVision file picker use                 | Reference pattern for open/save selection                                |
| `docs/api/exports.md`, `docs/api/imports.md`        | Existing report/import documentation              | Document the corrected public contracts                                  |
| `docs/cli/provisioning.md`                          | Legacy provisioning guide                         | Replace content with portability workflow                                |

### Code Analysis

- The standard `/api/*` parser is currently mounted before Admin authentication with a 100 KiB
  limit (`packages/server/src/server.ts:150-170`). Import therefore needs a route exclusion plus a
  protected route-local parser to satisfy RD-02; no second server or middleware framework is needed.
- Export currently performs explicit-column queries and an audit write inside `REPEATABLE READ`
  (`packages/server/src/lib/data-export.ts:273-315`). That transaction shape is reusable, while its
  entity report format remains separate.
- Import currently combines Zod schemas, planning, SQL, credentials, and audit in one file
  (`packages/server/src/lib/data-import.ts:1-44`). The direct feature split in AR-2 prevents further
  growth and removes the unused contract without a compatibility adapter.
- The Admin shell already replaces the desktop with a maximized `Window`
  (`packages/cli/src/admin/presentation.ts:273-295`) and already integrates JSVision file dialogs
  through an injectable seam (`packages/cli/src/admin/organization-controller.ts:1-84`).
- Live UserInfo roles are currently reduced to permission booleans
  (`packages/cli/src/admin/session-service.ts:296-340`). The Admin UI needs one exact
  `isSuperAdmin` capability derived from `porta-super-admin` so it can offer environment scope;
  the server remains authoritative.

## Gaps Identified

### Gap 1: Portable graph is incomplete and incorrectly owned

**Current Behavior:** The unused importer treats applications as organization-owned, omits required
round-trip fields and relationships, includes configuration, and uses legacy modes.

**Required Behavior:** RD-02's strict global-application natural-key graph and exact keep/update
semantics.

**Fix Required:** Replace the unused schema, planner, and mutation contract directly. (AR-1, AR-2)

### Gap 2: No selective portability workflow

**Current Behavior:** Report exports download one entity and the CLI transforms provisioning YAML.

**Required Behavior:** One selective versioned JSON manifest shared by API, SDK, CLI, and Admin UI.

**Fix Required:** Add typed export/preview/apply operations and remove the legacy provisioning
surface. (AR-1, AR-4)

### Gap 3: Admin UI has no portability surface

**Current Behavior:** The terminal UI supports organizations, users, applications, and clients only.

**Required Behavior:** One focused full-page Import / Export workspace with safe file operations,
preview gating, result summaries, and one-time secrets.

**Fix Required:** Add one controller/service/workspace family using existing UI patterns. (AR-3)

## Dependencies

### Internal Dependencies

- Existing domain validators, PostgreSQL schemas, and request-owned transaction context.
- Existing audit, cache invalidation, targeted authority cleanup, and client-secret services.
- Existing SDK HTTP transport and CLI authentication.
- Existing JSVision Layout DSL, tabs, full-page windows, and file dialog.

### External Dependencies

- PostgreSQL and Redis already required by Porta.
- No new runtime or development dependency. (AR-2)

## Risks and Concerns

| Risk                               | Likelihood | Impact | Mitigation                                                               |
| ---------------------------------- | ---------- | ------ | ------------------------------------------------------------------------ |
| Cross-organization disclosure      | Low        | High   | Authorize before content/plan creation and scope every SQL query         |
| Partial graph import               | Low        | High   | Validate the full plan, then mutate and audit in one transaction         |
| Secret exposure                    | Low        | High   | Exclude source secrets; return a new secret only after successful commit |
| Schema drift across packages       | Medium     | High   | Immutable contract tests across server and SDK before implementation     |
| Stale cache/authority after update | Medium     | High   | Register targeted cleanup only with `afterDatabaseCommit()`              |
| Oversized or hostile JSON          | Medium     | High   | Protected 64 MiB parser, strict schemas, bounded errors, safe responses  |
| Legacy documentation remains       | Medium     | Medium | Replace provisioning references and validate public docs                 |
