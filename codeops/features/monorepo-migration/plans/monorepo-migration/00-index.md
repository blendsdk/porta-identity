# Porta Monorepo Migration Implementation Plan

> **Feature**: Repackage Porta as a Turbo/Yarn monorepo without product development
> **Status**: Planning Complete
> **Created**: 2026-08-08
> **Implements**: REQ-MONOREPO (owned by `01-requirements.md`)
> **CodeOps Artifact Schema**: 1

## Overview

This plan moves the production Porta repository into three `@portaidentity` packages, removes the discontinued browser admin GUI, and separates public and developer documentation. It deliberately preserves the existing server, SDK, CLI, API, data, authentication, and deployment behavior.

The work is sequenced around a structural-parity checkpoint. File moves and package boundaries are proven first against the existing dependency set; only then are TypeScript and third-party packages upgraded. Migration commits build and test only; all publishing and release automation work is deferred to a separate follow-on after parity. (AR-33)

## Document Index

| # | Document | Description |
|---|---|---|
| AR | [Ambiguity Register](00-ambiguity-register.md) | Confirmed scope and decisions |
| 00 | [Index](00-index.md) | Overview and navigation |
| 01 | [Requirements](01-requirements.md) | Owning requirements and acceptance criteria |
| 02 | [Current State](02-current-state.md) | Repository evidence, gaps, and risks |
| 03-01 | [Workspace Layout](03-01-workspace-layout.md) | Package boundaries, Turbo, and commands |
| 03-02 | [Server Runtime](03-02-server-runtime.md) | Server package, assets, tests, and Docker |
| 03-03 | [Documentation](03-03-documentation.md) | Public docs and private developer-doc boundary |
| 03-04 | [Toolchain and CI](03-04-release-and-ci.md) | Dependency upgrade and branch build/test workflow |
| 07 | [Testing Strategy](07-testing-strategy.md) | Structural specifications and parity gates |
| 99 | [Execution Plan](99-execution-plan.md) | Ordered task checklist |

## Quick Reference

| Concern | Target |
|---|---|
| Branch | `monorepo-migrate` → pull request → `main` |
| Root | private `@portaidentity/monorepo`, Yarn 1.x, Turbo |
| Packages | `packages/server`, `packages/sdk`, `packages/cli` |
| First release | Deferred follow-on after migration parity |
| Explicit removal now | `packages/porta-admin-gui` workspace only; release-tool replacement is deferred |
| Explicit deferrals | future example selection, TUI admin GUI, product changes |

## Related Files

The execution primarily changes `package.json`, `yarn.lock`, `turbo.json`, `packages/`, `docker/`, `docs/`, `techdocs/`, `.github/workflows/`, and release-support scripts. See the component documents for exact ownership.
