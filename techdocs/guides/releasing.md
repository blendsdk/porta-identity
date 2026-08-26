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

## Completed 1.7.0 bootstrap

The first server package was published as `1.7.0` to establish the npm package before Trusted
Publishing could be configured. That bootstrap is complete; normal releases must not use an npm
token.

The retained bootstrap evidence is:

- `node_modules/.bin/npm whoami` identifies the expected `@portaidentity` organization owner.
- `node_modules/.bin/npm owner ls @portaidentity/sdk` and
  `node_modules/.bin/npm owner ls @portaidentity/cli` include that account.
- `node_modules/.bin/npm view @portaidentity/server@1.7.0 version` reports the public bootstrap
  package and its provenance predicate is `https://slsa.dev/provenance/v1`.
- all three packages have a GitHub Actions Trusted Publisher for `blendsdk/porta-identity` and
  `release.yml` with publish permission.

The `1.7.0` attempt published only the server package. The coordinated public release resumes at
`1.7.1`; no workflow may overwrite or unpublish the partial version.

## Trusted Publishing cutover

Configure the same Trusted Publisher separately for each package:

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

Normal releases run `yarn release:publish` on a GitHub-hosted runner with `id-token: write`. The
script pins the publish registry to `https://registry.npmjs.org` so Yarn cannot redirect
Lockstep's npm subprocess to its package mirror; npm then exchanges the workflow identity for a
short-lived credential and publishes provenance. The
bootstrap token must remain absent from the workflow and should be revoked after the first
tokenless release succeeds.

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
