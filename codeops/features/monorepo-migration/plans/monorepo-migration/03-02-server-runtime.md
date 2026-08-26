# Server Runtime: Porta Monorepo Migration

> **Document**: 03-02-server-runtime.md
> **Parent**: [Index](00-index.md)

## Overview

This component moves the root server into a public, self-contained `@portaidentity/server` package while preserving runtime behavior under source execution, npm installation, and Docker. It governs MR-03, MR-04, and the server portion of MR-15.

## Package Contents

`packages/server/` owns its manifest, TypeScript/ESLint/Vitest configuration, `src/`, `tests/`, `migrations/`, `templates/`, `locales/`, README, and build output. Its package boundary includes compiled JavaScript/declarations/maps and required runtime assets while excluding tests, local environment files, and credentials. Publishing-specific tarball/changelog rules are deferred. The package exposes `porta-server` at `dist/cli/index.js` and uses `dist/index.js` for `start`. (MR-03, MR-13, AR-33)

## Runtime Asset Resolution

Create one internal runtime-path module that resolves the package root from the compiled module location, not the shell's working directory. Migrator, seed command, i18n, page templates, and email templates consume it. The default installed layout is:

```text
@portaidentity/server/
├── dist/
├── migrations/
├── templates/
└── locales/
```

Docker copies the same contents to `/app`, so existing `/app/templates`, `/app/locales`, and `/app/migrations` mounts remain valid. No external input is accepted as an arbitrary package root, avoiding a new path-traversal surface. (MR-03, MR-04, MR-13)

## Docker Integration

The multi-stage build installs the root workspace graph, builds `@portaidentity/server`, and copies only production dependencies, server output, assets, manifest, and entrypoint into the runtime image. The image remains Node 22 Alpine, non-root `porta`, port 3000, `tini`, and the existing health check. `/usr/local/bin/porta` continues to invoke the moved infrastructure CLI; `entrypoint.sh` still conditionally migrates and then starts the server. (MR-04, AR-09, AR-15)

## Test Relocation

Move the pre-existing behavioral test directories into `packages/server/tests/` with their Vitest and Playwright configuration. Root repository contracts live separately at `repo-tests/monorepo/`. Since both server `src/` and behavioral tests move by the same prefix, relative imports remain stable. Update only root-absolute/config/script references required by the move. Existing unit, integration, E2E, pentest, UI, OIDC harness, and provisioning-smoke semantics remain unchanged. (MR-04, AR-21, AR-23)

## Error Handling

| Error case | Handling strategy | AR ref |
|---|---|---|
| Runtime asset omitted from the package build/layout | package-content specification fails | AR-08, AR-16 |
| Asset or seed lookup depends on invocation directory | execute contract from a temporary unrelated cwd | AR-08, AR-16, AR-30 |
| Docker CLI path points to old root output | image smoke invokes `porta --help` and migration status path | AR-09, AR-15 |
| Product test changes during move | compare suite inventory/counts to baseline, excluding only GUI | AR-11, AR-23, AR-31 |

## Testing Requirements

Implement ST-07 through ST-12 before server-runtime changes. Structurally update the retained test harness and provisioning smoke test, then run the full parity set before and after dependency upgrades.
