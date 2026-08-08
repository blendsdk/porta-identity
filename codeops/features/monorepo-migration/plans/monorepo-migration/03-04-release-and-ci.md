# Toolchain and CI: Porta Monorepo Migration

> **Document**: 03-04-release-and-ci.md
> **Parent**: [Index](00-index.md)

## Overview

This component upgrades the approved toolchain after structural parity and makes branch CI install, build, lint, typecheck, and test the migrated monorepo. It explicitly does not change or exercise publishing. (MR-09–MR-13, AR-33)

## Dependency and TypeScript Upgrade

After structural parity, run the approved ncu update across the root and active workspaces and select the latest stable TypeScript 7.x. “Latest” means every third-party dependency selected by the approved ncu command; an incompatibility that cannot be corrected without product behavior change is a blocker requiring user ruling, not a silent version exclusion.

Resolve only compiler/dependency compatibility breakage required to restore the same behavior and tests. Any discovered product defect is logged and deferred. Regenerate the active root Yarn lockfile once. Deferred playground manifests and lockfiles remain untouched. (MR-09, MR-10, AR-12, AR-18, AR-31)

## Build and Test Workflow

Update `Build and Test` to install the root Yarn graph and run the new root/Turbo commands for all active packages and retained tests. Preserve PostgreSQL, Redis, MailHog, Playwright, security, and audit coverage. The workflow runs on migration-branch pushes and pull requests but contains no publish, version, tag, release, deployment, or registry-auth step. (MR-11–MR-13)

Documentation and production Docker are validated at the final parity checkpoint. Existing docs, Docker-publication, and npm-release workflows are not redesigned in this plan; their publishing-safe cutover is a separate follow-on that must complete before merging to production `main`. (MR-15, AR-33)

## Deferred Publishing Follow-on

The follow-on owns every previously accepted release decision: Lockstep, version `1.7.0`, changelogs, release notes, package tarballs, npm provenance/publication, npm admin-GUI deprecation, release credentials, Git tags, GitHub Releases, Docker/docs publication workflow cutover, and partial-publication recovery. None is a completion criterion for structural migration. (AR-11, AR-24–AR-29, AR-33)

## Error Handling

| Error case | Handling strategy | AR ref |
|---|---|---|
| Latest dependency breaks compatibility | make behavior-preserving correction or stop for user ruling; never silently pin | AR-18, AR-31 |
| Migration branch attempts publication | CI contract fails on any publish/version/tag/release step or credential | AR-03, AR-33 |
| Existing test no longer has an owning command | build/test contract and parity inventory fail | AR-21–AR-23 |
| Publishing workflow still references old paths | record for the mandatory post-parity follow-on; do not merge to `main` yet | AR-29, AR-33 |

## Testing Requirements

Implement ST-17 and ST-18 before toolchain/CI changes. Run the full parity set after dependency upgrades and again after branch CI updates.
