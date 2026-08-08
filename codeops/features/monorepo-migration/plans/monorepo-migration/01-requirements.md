# Requirements: Porta Monorepo Migration

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Requirement Set**: REQ-MONOREPO

## Feature Overview

Reorganize Porta into a minimal Yarn Classic/Turbo monorepo while retaining its production behavior. The migration creates server, SDK, and CLI package boundaries under the existing npm scope and leaves their publishing cutover to a separate post-parity plan.

## Functional Requirements

### Must Have

- [ ] **MR-01 — Monorepo root:** the repository root is private `@portaidentity/monorepo`, owns the active monorepo Yarn 1.x lockfile, and discovers the three packages plus retained private test infrastructure. Deferred playground lockfiles remain untouched. (AR-07, AR-12, AR-17, AR-33)
- [ ] **MR-02 — Package set:** the only active workspaces are public `@portaidentity/server`, `@portaidentity/sdk`, and `@portaidentity/cli`. (AR-05, AR-06, AR-10)
- [ ] **MR-03 — Server boundary:** server code, server tests, migrations, templates, and locales reside in `packages/server` and work from source, packed npm contents, and the production image. (AR-08, AR-15, AR-16, AR-21)
- [ ] **MR-04 — Runtime compatibility:** existing server startup, infrastructure CLI commands, SDK exports, standalone CLI behavior, API contracts, data schema, authentication, and Docker behavior remain compatible. (AR-09, AR-30, AR-31)
- [ ] **MR-05 — Admin GUI workspace removal:** no admin-GUI source workspace, tests, active root build command, or Docker dependency remains. Publishing configuration cleanup is deferred with AR-33. Preserve `porta gui` and its current documentation when it does not break migrated CLI parity; otherwise remove only the blocking command surface. (AR-11, AR-33, AR-34)
- [ ] **MR-06 — Playground isolation:** existing playground material remains in place but is not a workspace, Turbo task, or verification dependency. (AR-12)
- [ ] **MR-07 — Documentation boundary:** VitePress publishes system-administrator, user, public API, SDK-consumer, and currently retained CLI docs; developer and architecture Markdown lives in `techdocs/` and is absent from the public navigation/build. (AR-13, AR-14, AR-34)
- [ ] **MR-08 — Tool orchestration:** Turbo provides minimal build, typecheck, lint, test, and verify orchestration without remote caching; root commands remain simple Yarn entry points. (AR-17, AR-22)
- [ ] **MR-09 — Dependency maintenance:** workspace-aware dependency check/update commands exclude internal ranges, reinstall from one lockfile, and verify after an update. (AR-18, AR-19)
- [ ] **MR-10 — Toolchain upgrade:** after structural parity, use the latest stable TypeScript 7.x and latest compatible third-party packages, with root Node `>=22.22.2` and existing public runtime floors retained unless required. (AR-18, AR-20)
- [ ] **MR-11 — Build/test branch:** each migration commit can install, build, typecheck, lint, and test the active monorepo without invoking versioning or publication. (AR-22, AR-33)
- [ ] **MR-12 — No publication:** the migration branch and its pull request do not publish npm packages, tags, releases, documentation, or Docker images. Existing publication automation is repaired only in the post-parity follow-on. (AR-03, AR-29, AR-33)
- [ ] **MR-13 — Security hygiene:** no secret or sensitive operational value is committed, packed, or logged. (AR-32, AR-33)

### Should Have

- [ ] **MR-14 — Fast feedback:** structure/package contract tests fail with actionable paths and can run without starting external services. (AR-22)
- [ ] **MR-15 — Final parity evidence:** before the release follow-on begins, all retained tests, documentation build, and production Docker smoke pass against the migrated layout. (AR-22, AR-33)

### Won't Have (Out of Scope)

- New features, bug fixes, behavioral refactors, or API redesign. (AR-01, AR-31)
- Playground selection or repair. (AR-12)
- A new TUI admin GUI. (AR-11)
- A published developer-doc site or second VitePress build. (AR-14)
- Remote Turbo caching, Nx, an `apps/` layer, or speculative shared packages. (AR-10, AR-17)
- Lockstep configuration, changelogs, release notes, version bumps, npm publication, tags, GitHub Releases, npm deprecation, or publishing-workflow repair. (AR-33)

## Technical Requirements

### Performance

- No new runtime service, network hop, or production daemon is introduced; build caching is local only. (AR-17, AR-30)

### Compatibility

- The passing 4,178-test baseline is the parity oracle; removal of the 75 admin-GUI tests is intentional, while all other suites remain represented. (AR-11, AR-21, AR-23)
- Package entry points, module formats, SDK subpath exports, CLI command names, image port, health check, and database migration sequence remain compatible unless explicitly renamed by AR-06/AR-09. (AR-09, AR-30)

### Security

- Existing authentication, authorization, tenant isolation, cryptography, rate limits, non-root image execution, and security tests must not be weakened. (AR-30, AR-31)
- Publication credentials and provenance are outside this migration plan. Existing secrets remain untouched. (AR-32, AR-33)

## Scope Decisions

The owning decisions are AR-01 through AR-32 in the [Ambiguity Register](00-ambiguity-register.md). This document cites them instead of duplicating the option analysis.

## Acceptance Criteria

1. [ ] AC-01: all MR-01 through MR-15 requirements are satisfied or explicitly marked not applicable with user approval.
2. [ ] AC-02: the structural-parity checkpoint passes before any TypeScript/dependency upgrade.
3. [ ] AC-03: final `yarn verify`, VitePress build, and Docker build/smoke pass.
4. [ ] AC-04: repository searches find no active references to old package paths, admin-GUI workspace/release targets, or Semantic Release.
5. [ ] AC-05: existing package versions and derived constants remain synchronized, with no publish/version/tag/release activity from `monorepo-migrate`.
6. [ ] AC-06: deferred playground content is neither modified for compatibility nor included in workspace verification.
