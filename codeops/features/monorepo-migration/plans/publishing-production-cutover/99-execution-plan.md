# Task T-02: Publishing and production cutover

> **Type**: Task (lightweight) · **Feature**: monorepo-migration · **CodeOps Artifact Schema**: 1
> **Progress**: 7/8 tasks (88%)
> **Last Updated**: 2026-08-26 11:58
> **Phase baseline tree**: `6ea83f94feef9b8640bb1f56dfaed061d3594481`
> **Scope mode**: strict
> **Expected modification set**: release repository tests and scripts; root/package manifests and
> lockfile; npm, Docker, and documentation workflows; release/operator technical documentation;
> this plan and the feature roadmap.

## Objective

Repair the existing release path without redesigning it. After successful CI for a push to
`main`, use `@blendsdk/lockstep` to publish `@portaidentity/server`, `@portaidentity/sdk`, and
`@portaidentity/cli` together at `1.7.0` with npm provenance. The first coordinated release uses
the existing npm token once because it creates the previously unpublished server package. After
that release, configure all three packages for npm Trusted Publishing and remove the publishing
token so future releases use short-lived GitHub OIDC credentials.

Push `v1.7.0` and its GitHub Release, then let the existing tag-driven Docker workflow publish the
same release as the working `blendsdk/porta` image tags `1.7.0`, `1.7`, `1`, and `latest`. Keep the
independent documentation workflow unchanged.

Merging the verified release change to `main` is the release go/no-go. Preparation and validation
on the feature branch must not publish packages, tags, releases, documentation, or images.

## Tasks

- [x] T-02.1 Write immutable repository-contract specifications first. Cover the three active
      packages, exact `@blendsdk/lockstep@1.3.0` and `npm@11.15.0`, Lockstep ownership of manifests and internal
      ranges, derived SDK/CLI version equality, publishable tarball contents, the exact npm CLI
      floor for Trusted Publishing, successful-`main`-CI release triggering, first-release token
      isolation, subsequent tokenless OIDC publishing, npm provenance, the `v1.7.0` release tag,
      Docker aliases `1.7.0`, `1.7`, `1`, and `latest`, and removal of stale workspace paths. Run
      the new specifications red against the current automation. ✅ (completed: 2026-08-26 10:32)
- [x] T-02.2 Replace Semantic Release with exact `@blendsdk/lockstep@1.3.0`, exact local
      `npm@11.15.0`, and root `release:prepare`, `release:preflight`, and `release:publish` scripts.
      `release:prepare` runs Lockstep versioning with `--no-git-commit`, stamps derived SDK/CLI
      constants, and leaves the complete candidate for normal review and commit. Lockstep remains
      the manifest/internal-range owner. `release:publish` publishes the already-committed packages
      in dependency order with provenance; it never changes package bytes. ✅ (completed:
      2026-08-26 10:37)
- [x] T-02.3 Make each public package tarball release-ready. Correct package repository paths and
      public-publish metadata, include the required runtime files, README, and license, exclude
      secrets and generated development output, and verify packed SDK and CLI behavior reports the
      same version as its manifest. ✅ (completed: 2026-08-26 10:42)
- [x] T-02.4 Repair the existing `.github/workflows/release.yml` topology. Keep its successful-push
      `Build and Test` completion trigger for `main`, check out the triggering
      `workflow_run.head_sha`, install with the frozen lockfile, assert the committed candidate is
      exactly `1.7.0`, run `release:preflight`, and publish it unchanged with the pinned npm CLI.
      During the bounded `1.7.0` bootstrap window only, map `NPM_TOKEN` to `NODE_AUTH_TOKEN` on
      exact-candidate publish/recovery commands; retain `id-token: write` for provenance. The
      durable workflow must work with no npm token so later releases use GitHub OIDC. After all
      packages are observable, create and push `v1.7.0`, create the GitHub Release, and explicitly
      dispatch the Docker workflow with that tag and tested SHA. Grant only required GitHub
      permissions and serialize releases. ✅ (completed: 2026-08-26 10:42)
- [x] T-02.5 Preserve the existing tag-driven Docker release. Ensure a pushed `v1.7.0` tag checks
      out that tag and builds `docker/Dockerfile`. Also accept the release workflow's explicit
      dispatch only when its required semver tag resolves to the supplied tested SHA. Push the
      multi-platform `blendsdk/porta` image as `1.7.0`, `1.7`, `1`, and `latest`, and update its
      Docker Hub description. Remove the competing main-CI/manual `latest` publication. Keep the
      current Docker Hub credential model and independent Pages workflow. ✅ (completed:
      2026-08-26 10:48)
- [x] T-02.6 Add a concise operator note for the first `1.7.0` release. Before merging, confirm the
      existing npm identity, organization membership, visible SDK/CLI access, token metadata, and
      target-version absence; server creation remains a fail-closed live proof and runs first.
      During partial recovery, publish only absent packages from the same committed candidate and
      verified tarball hashes while the bounded bootstrap window remains open. After all three are
      observable, configure each package's npm Trusted
      Publisher for GitHub organization `blendsdk`, repository `porta-identity`, workflow
      `release.yml`, no environment, and `npm publish`; then remove and revoke the npm token. Never
      overwrite or unpublish a version. Cover tag/GitHub Release and Docker reruns,
      plus the separate interactive 2FA step that deprecates all versions of
      `@portaidentity/admin-gui` with the approved retirement message. ✅ (completed:
      2026-08-26 10:50)
- [x] T-02.7 Verify the non-publishing release path with checks scoped to the changed release
      boundary. Run `yarn test:structure`, `yarn release:preflight`, pack/install/version smoke
      checks, workflow parsing and permission checks, `yarn docs:build`, and
      `docker build --file docker/Dockerfile --tag porta-release-preflight .`. Confirm preparation
      creates no commit or tag and that verification leaves registry state unchanged. Do not run
      the application integration, E2E, penetration, or compatibility suites solely to author
      deployment automation; the user explicitly narrowed this gate on 2026-08-26. ⏳
      (completed: 2026-08-26 11:09)
- [~] T-02.8 Present the verified diff and release checklist for explicit approval to integrate.
      Do not push, merge, or mutate `main` from this task without that approval. Once the approved
      change reaches `main`, observe the existing automatic release path and verify all three npm
      packages at `1.7.0`, provenance, `v1.7.0`, the GitHub Release, the four Docker tags and a
      runnable image, and the admin-GUI deprecation. Complete the one-time Trusted Publisher
      configuration and token revocation; record the exact three mappings, GitHub secret absence,
      revoked-token identity/status, supported toolchain, and durable workflow's lack of token
      variables. Record end-to-end tokenless npm acceptance as pending until the next version.
      Stop on any mismatch and use T-02.6 recovery. ⏳ (integration approval pending:
      2026-08-26 11:09)

## Release invariants

- Semantic Release and Lockstep never coexist as release owners.
- Only a successful CI revision from a push to `main` may publish; pull requests and feature
  branches never receive publishing credentials.
- The npm token is exposed only to allowlisted publish/recovery commands during the bounded
  `1.7.0` bootstrap window and is revoked after all packages are observed and Trusted Publishing
  is configured. Subsequent release jobs contain no npm publishing token. Docker
  credentials remain publish-step secrets. No secret value is printed, persisted, or added to an
  artifact.
- Trusted Publishing is configured separately for all three npm packages against the exact public
  repository and `release.yml`; GitHub-hosted release jobs grant `id-token: write` and satisfy the
  current npm CLI and Node version floors.
- Package versions are immutable. Partial recovery uses the same release commit and publishes only
  artifacts that are still absent.
- The Docker image is built from the release tag and must start successfully before cutover is
  considered complete.

## Quality review

- Final reviewer and adversarial auditor rechecks passed on 2026-08-26 11:25.
- Automatic bootstrap fails on every pre-existing `1.7.0` target and directs exact-SHA recovery.
- Privileged tag/manual Docker triggers and post-cutover digest verification remain accepted,
  deliberately simple operator boundaries.
- The first main-branch release attempt passed CI but stopped before publication because npm
  interpreted tarball paths without a `./` prefix as GitHub package shorthands. The recovery fix
  has a red/green repository contract and a successful local `npm publish --dry-run` using the
  exact explicit-local-path form. No npm version, release tag, GitHub Release, or Docker tag was
  created by the failed attempt.

**Verify**: release contract and repository-structure tests; Lockstep/version-sync preparation;
package pack/install/smoke; workflow parsing and permission checks; `yarn docs:build`; and
`docker build --file docker/Dockerfile --tag porta-release-preflight .`. Registry, tag, GitHub
Release, Docker Hub, runnable-image, and deprecation checks occur only after the approved change
reaches `main` and the existing release automation runs.
