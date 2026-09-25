# Automated Release Implementation Plan

> **Feature**: Manual-triggered, otherwise fully automated release (bump, notes, tag, publish, Docker, develop sync)
> **Status**: Planning Complete
> **Created**: 2026-09-25 10:28
> **Implements**: monorepo-migration/T-03
> **CodeOps Artifact Schema**: 1

## Overview

Today a release needs a manual `yarn release:prepare` commit before `main`: Lockstep can bump,
generate the changelog and release notes, commit, and tag, but `release:prepare` deliberately
passes `--no-git-commit` and the workflow never bumps. Publishing itself is already automated by
`.github/workflows/release.yml`, which fires after a successful `Build and Test` on `main`.

This plan removes the last manual step. It replaces the automatic `workflow_run` trigger with a
manual `workflow_dispatch` that performs the whole release in one run: bump (with changelog and
release notes), commit and tag on `main`, npm publish with provenance, GitHub Release, Docker
dispatch, and a safe `develop` sync. The button press is the authorization; nothing else is manual.

The change is release-tooling only. No product source changes.

## Minimum-Sufficient Baseline

**Original goal:** one manual trigger produces a complete, verified release with no manual bump,
notes, tag, or publish work, and keeps `develop` in sync safely.
**Smallest viable design:** rewire the existing `release.yml` to `workflow_dispatch`, let the
already-pinned `@blendsdk/lockstep@1.3.0` do bump + changelog + commit + tag + publish + git push
(as it already supports), push the lightweight tag explicitly, and add a fast-forward-or-cherry-pick
`develop` sync. Reuse the existing idempotency and integrity checks.
**Excluded machinery:** no new dependency, no release service, no notification system, no branch
provisioning, no `docker.yml` change.

## Document Index

| # | Document | Description |
| --- | --- | --- |
| AR | [Ambiguity Register](00-ambiguity-register.md) | Zero-Ambiguity Gate decisions (audit trail) |
| 00 | [Index](00-index.md) | This document — overview and navigation |
| 01 | [Requirements](01-requirements.md) | Requirements, scope, and acceptance criteria |
| 02 | [Current State](02-current-state.md) | Analysis of the existing release path |
| 03 | [Release Workflow](03-01-release-workflow.md) | The new `workflow_dispatch` release job |
| 03 | [Develop Sync](03-02-develop-sync.md) | Safe post-release `develop` synchronization |
| 07 | [Testing Strategy](07-testing-strategy.md) | Spec test cases and verification |
| 99 | [Execution Plan](99-execution-plan.md) | Phases, sessions, and task checklist |

## Quick Reference

### Key Decisions

| Decision | Outcome | AR Ref |
| --- | --- | --- |
| Trigger | Manual `workflow_dispatch` only | AR-2 |
| Bump | `auto` default + `patch/minor/major` override | AR-3 |
| Verification gate | Fast: green `Build and Test` for `main` HEAD | AR-4 |
| Release notes | Lockstep AI via `OPENAI_API_KEY`, safe fallback | AR-5 |
| Tag push | Explicit lightweight-tag push | AR-6 |
| Checkout | `ref: main` for re-run idempotency | AR-7 |
| Develop sync | FF, else cherry-pick, else abort + issue | AR-8 |
| Dry-run | Safe: no external effects | AR-9 |

### Key Files

| File | Change |
| --- | --- |
| `.github/workflows/release.yml` | Rebuilt: `workflow_dispatch`, gate, bump, publish, release, docker, sync |
| `package.json` | `release:publish` drops `--git-push`; `release:prepare` retained |
| `repo-tests/monorepo/release.spec.test.mjs` | New release contract oracle |
| `repo-tests/monorepo/release-hardening.spec.test.mjs` | Push/sync safety oracle |
| `techdocs/guides/releasing.md` | New manual-release operator guide |
| `AGENTS.md` | Release-guidance update |
| `codeops/features/monorepo-migration/00-roadmap.md` | Add and track T-03 |
