# Ambiguity Register: Porta Monorepo Migration

**Gate status:** PASSED
**Confirmed:** 2026-08-08
**Scope mode:** Strict — structural migration only

The user reviewed the proposed decisions and accepted all recommendations. There are no unresolved ambiguities blocking planning or execution.

| ID | Category | Decision | Status |
|---|---|---|---|
| AR-01 | Scope | Migrate the existing project structure to a monorepo without intentionally changing product behavior. Features, enhancements, bug fixes, and unrelated refactors are blocked. | ✅ Resolved |
| AR-02 | Authorized exceptions | The only intentional changes beyond file movement are Turbo, Yarn Classic workspace integration, TypeScript 7, current third-party dependencies, lockstep releases, and removal of the admin GUI. | ✅ Resolved |
| AR-03 | Work isolation | Perform all work on `monorepo-migrate`, branched from production `main`; merge through a pull request only after verification. | ✅ Resolved |
| AR-04 | Feature identity | Use `monorepo-migration` as the CodeOps feature and plan slug. | ✅ Resolved |
| AR-05 | Package scope | Retain the existing npm scope `@portaidentity`. | ✅ Resolved |
| AR-06 | Package names | Publish `@portaidentity/server`, `@portaidentity/sdk`, and `@portaidentity/cli`. | ✅ Resolved |
| AR-07 | Root package | Use private root package `@portaidentity/monorepo`; its target `1.7.0` version is applied by the publishing follow-on per AR-33. | ✅ Resolved |
| AR-08 | Server boundary | Move `src/`, `tests/`, `migrations/`, `templates/`, and `locales/` into `packages/server/` so the server is self-contained. | ✅ Resolved |
| AR-09 | Server executable | Publish the existing infrastructure CLI as `porta-server`; keep Docker's internal `porta` wrapper. Start the daemon with the package start script. Do not introduce a supported JavaScript import API. | ✅ Resolved |
| AR-10 | Existing packages | Rename `packages/porta-sdk` to `packages/sdk` and `packages/porta-cli` to `packages/cli`; avoid speculative shared packages. | ✅ Resolved |
| AR-11 | Admin GUI | Remove the admin GUI source, tests, workspace, build, and release configuration. Deprecate its existing npm package at release cutover with a discontinuation message. | ✅ Resolved |
| AR-12 | Playground | Remove both unsupported v5 playground applications and their playground-only tooling from the active tree. Preserve recovery guidance in unpublished techdocs; Git history remains the archive. Any future example is selected and rebuilt as separately verified work. | ✅ Resolved |
| AR-13 | Public docs | Keep VitePress public docs for system administrators, users, public API, and SDK consumers, published to GitHub Pages. | ✅ Resolved |
| AR-14 | Technical docs | Move developer and architecture material to top-level `techdocs/`; keep it as Markdown and exclude it from the public VitePress site. | ✅ Resolved |
| AR-15 | Deployment | Keep `docker/` at the repository root and preserve existing image, Compose, entrypoint, migration, and runtime behavior. | ✅ Resolved |
| AR-16 | Data behavior | Move existing migrations and runtime assets without adding migrations or changing schemas, seed behavior, templates, or translations. | ✅ Resolved |
| AR-17 | Monorepo tools | Use Turbo with minimal task orchestration, Yarn Classic 1.x, one root lockfile, and no remote cache initially. | ✅ Resolved |
| AR-18 | Upgrade sequencing | Establish and verify structural parity before upgrading dependencies and TypeScript. | ✅ Resolved |
| AR-19 | Dependency commands | Add workspace-aware `deps:check` and `deps:update` commands using `npm-check-updates`, excluding internal `@portaidentity/*` ranges; the update command reinstalls and runs full verification. | ✅ Resolved |
| AR-20 | TypeScript and Node | Use the latest stable TypeScript 7.x. Require Node `>=22.22.2` at the root for the selected tooling; retain the public packages' existing `>=22.0.0` floor unless an upgraded runtime dependency demonstrably requires more. | ✅ Resolved |
| AR-21 | Test placement | Move the root server tests with the server package so their relative imports remain coherent; remove only admin-GUI tests. | ✅ Resolved |
| AR-22 | Verification | Local `yarn verify` covers Turbo packages plus root/server suites. CI additionally verifies browser/docs/Docker/package dry-runs and release readiness. | ✅ Resolved |
| AR-23 | Baseline | Treat the passing 4,178-test baseline and existing admin-GUI lint warnings as the parity reference. | ✅ Resolved |
| AR-24 | Release tooling | Replace Semantic Release with `@blendsdk/lockstep`; do not run both systems. Execution is deferred by AR-33. | ✅ Resolved |
| AR-25 | Lockstep behavior | Version and publish all three public packages together, publish topologically with provenance, maintain per-package changelogs and root release notes, push the tag explicitly, and create a GitHub Release. | ✅ Resolved |
| AR-26 | Release notes | Use OpenAI as the primary release-note provider, Anthropic as fallback, and deterministic notes as the final fallback; send only commit metadata and changed paths. | ✅ Resolved |
| AR-27 | Version synchronization | Replace the broad version-sync script with a small script that updates only derived version constants and documentation; Lockstep owns manifests and internal ranges. | ✅ Resolved |
| AR-28 | First release | Target `1.7.0`; the migration is a minor structural release, not a major product release. | ✅ Resolved |
| AR-29 | Release trigger | Preserve the existing release topology: after successful CI for a push to `main`, run Lockstep release internals. Do not publish from the migration branch or pull request. | ✅ Resolved |
| AR-30 | Compatibility | Preserve the existing public SDK, CLI, server, Docker, API, authentication, and data behavior except for the explicitly approved packaging changes. | ✅ Resolved |
| AR-31 | Defect handling | Defer discovered product defects. Fix only migration blockers or compatibility regressions caused by the migration, and document them as parity work. | ✅ Resolved |
| AR-32 | Repository visibility | CodeOps artifacts and technical docs may be public. Never commit credentials, tokens, passwords, private keys, or security-sensitive operational data. | ✅ Resolved |
| AR-33 | Publishing sequence | Do not design, repair, dry-run, or execute publishing during the structural migration. Migration commits build and test only. Lockstep, versions, changelogs, release notes, npm publication, tags, credentials, and release recovery are a separate follow-on after migration parity. | ✅ Resolved |
| AR-34 | `porta gui` command | Preserve the standalone CLI's `porta gui` command and related documentation if the migrated CLI still builds and tests. Remove it only if it blocks migration parity. Its eventual external-GUI, future-TUI, or removal behavior is deferred until after migration. | ✅ Resolved |

## Gate conclusion

All twelve ambiguity categories were checked: product behavior, users and actors, data, integrations, API and contracts, security, performance and operations, failure handling, testing, deployment, documentation, and scope boundaries. AR-33 subsequently moved publishing to a post-parity follow-on. AR-34 preserved the non-blocking `porta gui` CLI surface while deferring its eventual product direction.
