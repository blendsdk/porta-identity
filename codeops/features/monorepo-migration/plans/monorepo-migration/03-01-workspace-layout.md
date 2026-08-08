# Workspace Layout: Porta Monorepo Migration

> **Document**: 03-01-workspace-layout.md
> **Parent**: [Index](00-index.md)

## Overview

This component establishes the minimal coordinator root and three public workspaces required by MR-01, MR-02, MR-05, MR-06, MR-08, and MR-09.

## Architecture

### Target Tree

```text
porta/
├── package.json                 # private @portaidentity/monorepo
├── yarn.lock                    # only lockfile
├── turbo.json
├── packages/
│   ├── server/                  # @portaidentity/server
│   ├── sdk/                     # @portaidentity/sdk
│   └── cli/                     # @portaidentity/cli → SDK
├── docker/
├── docs/
├── techdocs/
├── repo-tests/monorepo/         # repository-contract specifications
├── test-harness/                # retained OIDC black-box test infrastructure
└── playground*/                 # preserved, excluded legacy playground material
```

### Root Manifest

- `name`, `private`, `version`, `type`, engines, package manager, workspaces, orchestration scripts, and root-only development tools remain at root. (MR-01, AR-17, AR-20)
- Production server dependencies move to `packages/server/package.json`; package-specific build/test tooling stays with its workspace when practical. (MR-02, MR-03)
- Public-package discovery uses `packages/*`; only the three intended directories may contain manifests. Retained harness dependencies are owned by the root install rather than a second active lockfile. (MR-01, MR-02, MR-05, MR-06)

### Turbo Tasks

`turbo.json` uses the current schema and declares only the tasks the repository runs. Build outputs are package `dist/**`; `dev`, test variants, verify, package dry-runs, and other stateful tasks are uncached. Task dependencies use `^build` where consumers require built dependencies. No remote-cache configuration is introduced. (MR-08, AR-17)

### Root Commands

| Command | Contract |
|---|---|
| `yarn build` | Turbo builds all three packages in dependency order |
| `yarn lint` / `yarn typecheck` / `yarn test` | Turbo runs the matching package tasks |
| `yarn verify` | Runs structural contracts, package verification, and server test matrix |
| `yarn deps:check` | `ncu --root --workspaces -x "@portaidentity/*"` |
| `yarn deps:update` | Updates root/workspaces, deletes root install artifacts, reinstalls, then runs `yarn verify` |

The dependency updater is intentionally destructive only to generated `node_modules` and `yarn.lock`; it does not mutate internal package ranges. (MR-09, AR-19)

## Error Handling

| Error case | Handling strategy | AR ref |
|---|---|---|
| Unexpected package manifest below `packages/` | Structure specification fails and names the path | AR-06, AR-10–AR-12 |
| Internal package selected by ncu | Exclusion policy prevents update; structural test checks command | AR-19 |
| Stateful test cached by Turbo | Configuration contract fails; tests remain `cache: false` | AR-17, AR-22 |
| Yarn version mismatch | Root package-manager metadata and CI install fail early | AR-17 |

## Testing Requirements

Implement ST-01 through ST-06 before the workspace layout. Retain existing package tests and use the parity commands in `07-testing-strategy.md`.
