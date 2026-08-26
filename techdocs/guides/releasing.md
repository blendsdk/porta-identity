---
title: Release Operations
---

# Release Operations

> **Last Updated**: 2026-08-26

Porta publishes the server, SDK, CLI, and Docker image with one coordinated semantic version.
Lockstep owns package manifest versions and internal dependency ranges. The SDK and CLI version
constants are derived from the root manifest.

## Normal preparation

Run preparation before the candidate reaches `main`:

```bash
yarn release:prepare
yarn release:preflight
yarn verify
```

`release:prepare` leaves all changes in the working tree and creates no commit or tag. Review and
commit the manifests, derived constants, changelogs, and release notes together. A successful
`Build and Test` run for that exact `main` revision is the only automatic release trigger.

## One-time 1.7.0 bootstrap

The server package does not exist on npm before this coordinated release, so npm Trusted
Publishing cannot be configured for it yet. Keep the existing npm publishing token only for this
bootstrap window.

Before merging, an npm organization owner must confirm:

- `node_modules/.bin/npm whoami` identifies the expected account and the npm website shows that account as an
  owner or maintainer of the `@portaidentity` scope.
- `node_modules/.bin/npm owner ls @portaidentity/sdk` and
  `node_modules/.bin/npm owner ls @portaidentity/cli` include that account; confirm its
  organization role on npmjs.com.
- `node_modules/.bin/npm view @portaidentity/server@1.7.0 version`,
  `node_modules/.bin/npm view @portaidentity/sdk@1.7.0 version`, and
  `node_modules/.bin/npm view @portaidentity/cli@1.7.0 version` all report the target version as
  absent.
- `node_modules/.bin/npm token list --json` identifies the bounded automation token by ID and confirms its package
  access and expiry. Never copy the token value into a log, issue, or release record.
- the GitHub `NPM_TOKEN` secret refers to that same token.

The bootstrap workflow packs all three packages once, prints their SHA-256 hashes, and publishes
the packages in this order: server, SDK, CLI. An automatic rerun stops if any target version
already exists, even when its bytes match. It never overwrites or unpublishes a version.

### Partial recovery

Stop if a publish fails. At the exact release commit, install with the frozen lockfile, build,
run `yarn release:preflight`, and recreate the three tarballs. Compare their SHA-256 hashes with
the hashes in the failed workflow log. Publish only packages whose exact version is still absent,
in server/SDK/CLI order, with `--access public --tag latest --provenance`. Keep
`NODE_AUTH_TOKEN` scoped to those commands only.

Do not create `v1.7.0` until all three `npm view` checks return `1.7.0`. If the tag exists,
verify that it resolves to the tested commit; never move it. Create a missing GitHub Release from
`RELEASE_NOTES.md`, then rerun `docker.yml` with tag `v1.7.0` and the tested SHA.

## Trusted Publishing cutover

After all three packages are visible, configure the same Trusted Publisher separately for each
package:

| Field             | Value            |
| ----------------- | ---------------- |
| Provider          | GitHub Actions   |
| Organization      | `blendsdk`       |
| Repository        | `porta-identity` |
| Workflow filename | `release.yml`    |
| Environment       | none             |
| Allowed action    | `npm publish`    |

With an interactive npm session protected by account 2FA, npm 11.15.0 can save each mapping:

```bash
node_modules/.bin/npm trust github @portaidentity/server --repo blendsdk/porta-identity --file release.yml --allow-publish --yes
node_modules/.bin/npm trust github @portaidentity/sdk --repo blendsdk/porta-identity --file release.yml --allow-publish --yes
node_modules/.bin/npm trust github @portaidentity/cli --repo blendsdk/porta-identity --file release.yml --allow-publish --yes
```

npm does not validate the mapping when it is saved. Record the three settings as readiness
evidence; the first end-to-end tokenless acceptance proof occurs on the next version.

Remove the bootstrap block and every `NPM_TOKEN` reference from `release.yml`, delete the GitHub
secret, revoke the identified npm token with `node_modules/.bin/npm token revoke <token-id>`, and
confirm `node_modules/.bin/npm token list --json` no longer contains it. Future releases run `yarn release:publish` on a
GitHub-hosted runner with `id-token: write`; npm exchanges the workflow identity for a short-lived
credential and publishes provenance.

## Docker acceptance

The release workflow dispatches `docker.yml` because a tag pushed with `GITHUB_TOKEN` does not
start another workflow. The Docker workflow independently verifies that the semantic tag resolves
to the supplied tested SHA, then publishes one multi-platform image digest as `1.7.0`, `1.7`,
`1`, and `latest`.

Confirm that all four Docker Hub tags resolve to the expected digest. Start `1.7.0` with the same
required PostgreSQL, Redis, issuer, cookie, SMTP, and signing-key configuration used in production,
then require its `/health` endpoint to become healthy before cutover:

```bash
docker pull blendsdk/porta:1.7.0
docker inspect blendsdk/porta:1.7.0 --format '{{json .Config.Healthcheck.Test}}'
```

Deprecate all versions of `@portaidentity/admin-gui` in a separate interactive 2FA-authenticated
step. Use the explicitly approved retirement message and verify the registry warning; do not
unpublish the package.

## npm references

- [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- [Deprecating packages](https://docs.npmjs.com/deprecating-and-undeprecating-packages-or-package-versions/)
