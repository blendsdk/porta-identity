# Current State: Porta Monorepo Migration

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The root currently acts as both private workspace coordinator and the server package. Its manifest contains server dependencies, scripts, and a `porta` binary while three workspaces contain the SDK, standalone CLI, and admin GUI. CI separately invokes root and workspace commands; Semantic Release publishes only workspace packages.

The repository baseline is healthy: `yarn install --frozen-lockfile` and `yarn verify` pass with 4,178 tests. The known admin-GUI lint output is 30 warnings and zero errors.

### Relevant Files

| File | Current evidence | Change needed |
|---|---|---|
| `package.json:1-139` | Root is `porta`, server scripts/deps live here, explicit workspace list | Convert to private coordinator and Turbo entry points |
| `packages/porta-sdk/package.json:1-55` | SDK is already `@portaidentity/sdk` with four exports | Move directory and retain public contract |
| `packages/porta-cli/package.json:1-50` | CLI depends on SDK and exposes `porta` | Move directory and retain public contract |
| `packages/porta-admin-gui/package.json:1-85` | Public React/Koa GUI package | Remove completely per MR-05 |
| `src/cli/index.ts:3-118` | Infrastructure-only server CLI | Move with server and expose as `porta-server` |
| `src/lib/migrator.ts:23-24` | Migration path derives from `process.cwd()` | Make package-root resolution stable |
| `src/auth/i18n.ts:38` | Locale path derives from `process.cwd()` | Make package-root resolution stable |
| `src/auth/template-engine.ts:34-35` | Page-template path derives from `process.cwd()` | Make package-root resolution stable |
| `src/auth/email-renderer.ts:28-29` | Email-template path derives from `process.cwd()` | Make package-root resolution stable |
| `docker/Dockerfile:18-90` | Stubs old workspaces and copies root server outputs/assets | Build/copy `packages/server` while retaining `/app` runtime layout |
| `docker/entrypoint.sh:69-77` | Runs migrations then `dist/index.js` | Preserve observable behavior and paths |
| `.releaserc.json:1-54` | Semantic Release owns versions and three workspace publishes | Preserve during migration; replace in publishing follow-on |
| `.github/workflows/release.yml:14-57` | Releases after successful push CI on `main` | Preserve trigger, replace internals |
| `scripts/sync-versions.js:37-115` | Mutates manifests, internal ranges, and constants | Replace with derived-constants-only script |
| `docs/implementation-details/` | 12 developer/architecture Markdown files inside public docs | Move to `techdocs/` and unlink publicly |

## Gaps Identified

### Gap 1: Root and server ownership are conflated

**Current behavior:** root scripts and dependencies compile and run the server.
**Required behavior:** MR-01–MR-04 make root orchestration-only and server self-contained.
**Fix required:** move the server tree/configuration and create its package manifest before simplifying root.

### Gap 2: Runtime assets depend on the caller's working directory

**Current behavior:** migrations, locales, and templates use `process.cwd()`.
**Required behavior:** MR-03 requires installed and Docker package layouts to locate their own shipped assets.
**Fix required:** centralize package-root asset resolution while retaining Docker override/mount paths.

### Gap 3: Verification encodes the old topology

**Current behavior:** root and each package are invoked explicitly, including admin GUI.
**Required behavior:** MR-05, MR-08, and MR-14 require workspace discovery and fast structural contracts.
**Fix required:** add Turbo pipeline/tasks and update CI commands after parity.

### Gap 4: Public and technical docs are mixed

**Current behavior:** developer material sits below the VitePress source root.
**Required behavior:** MR-07 separates audiences.
**Fix required:** move technical Markdown and update all links/navigation.

### Gap 5: Release ownership is split and incomplete (deferred)

**Current behavior:** Semantic Release stamps four manifests but publishes only SDK, CLI, and GUI; the server is private.
**Required behavior:** the migration branch builds and tests without publishing.
**Fix required:** none in this plan. Preserve the current release files for the post-parity publishing follow-on. (AR-33)

## Dependencies

### Internal Dependencies

- `@portaidentity/cli` consumes `@portaidentity/sdk`; Turbo and Lockstep must respect this edge.
- Docker consumes the server's compiled output and runtime assets.
- public docs describe npm package paths, CLI commands, Docker paths, and API behavior.
- the later publishing follow-on will consume manifests, derived constants, and the root lockfile.

### External Dependencies

- Node 22, Yarn Classic, Turbo, TypeScript, and npm-check-updates.
- PostgreSQL, Redis, MailHog, Playwright, Docker/BuildKit, npm registry, GitHub Actions/Pages/Releases.

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Asset paths fail outside repo root | High | High | MR-03 contract tests plus npm-pack and Docker smoke |
| Massive file move obscures semantic edits | Medium | High | move-only tasks first; review diffs with rename detection |
| Dependency upgrades hide parity regression | High | High | mandatory structural checkpoint before MR-10 |
| Turbo caches stateful integration suites | Medium | High | disable caching for stateful/test/verify tasks |
| Publishing work distracts from parity | Medium | High | AR-33 defers the entire release cutover to a follow-on |
| Technical docs leak back into Pages | Medium | Medium | docs boundary contract and VitePress build inspection |
| Playground edits consume migration time | Medium | Medium | explicit path exclusion and diff audit |
